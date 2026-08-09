# Data Sources & Ingestion Registry

> Every source used by `packages/ingest` MUST have a row here **before** its
> fetcher is written, with robots/ToS verified at that time (not assumed).
> Columns marked *verify* are filled during Phase 5 implementation.

## Source registry

| Source | What we take | Access | robots/ToS status *(verify)* | Cadence |
|---|---|---|---|---|
| **endoflife.date API** (`/api/<product>.json`) | release cycles, release dates, EOL dates, LTS flags | public JSON API, explicitly for programmatic use | **verified 2026-07-19** — public API, MIT-licensed site, no auth | 6 h — **Worker cron** |
| Official distro release pages / JSON endpoints (per distro) | versions, dates, artifacts, checksums | official API/page | per-distro row below | 6 h |
| Repology API | cross-distro version tracking | public API | pending verification | daily |
| GitHub Releases API | releases for GitHub-hosted distros | official API (token, rate-limited) | pending verification | 6 h |
| GitLab Releases API | releases for GitLab-hosted distros | official API | pending verification | 6 h |
| **Fedora MirrorManager** (`mirrors.fedoraproject.org/mirrorlist`) | Fedora mirror list | official API | **verified 2026-07-19** — official mirror-list endpoint. ⚠️ Returns **per-repo directories** (`…/releases/44/Everything/x86_64/os/`), not mirror roots: these rows are stored with `serves_artifacts = 0` and are never a download base (ADR-0024) | daily — **Worker cron** |
| **Fedora download redirector** (`download.fedoraproject.org`) | the base Fedora artifact paths are relative to; 302s to a nearby mirror | official redirector | **verified 2026-08-05** — a `HEAD` of a resolved ISO path follows to a mirror and answers 200 with the published size | stored by the artifacts cron |
| openSUSE download redirector (mirrorbrain) | openSUSE mirrors/artifacts | official endpoint | pending verification | daily |
| Ubuntu/Debian cdimage + mirror lists | ISO paths, mirror lists | official pages/manifests | pending verification | daily |
| **Arch mirror status** (`archlinux.org/mirrors/status/json/`) | Arch mirrors + health scores | official JSON | **verified 2026-07-19** — official status JSON endpoint | daily — **Worker cron** |
| **Arch release snapshots** (`archlinux.org/releng/releases/json/`) | monthly ISO snapshots: version, date, sha256, iso path, torrent, magnet, PGP fingerprint | official JSON | **verified 2026-08-05** — 200, no `robots.txt` rule covers the path | 6 h — **Worker cron** |
| **Fedora releases index** (`fedoraproject.org/releases.json`) | the full artifact matrix: variant, arch, absolute link, sha256, **size** | official JSON | **verified 2026-08-05** — 200, no `robots.txt` rule covers the path | 6 h — **Worker cron** |
| **Ubuntu checksums** (`releases.ubuntu.com/<version>/SHA256SUMS`) | sha256 per ISO; edition, arch and point release are encoded in the filename | official plain text | **verified 2026-08-05 — allowed** (`robots.txt` disallows only `.pool`). **Wired 2026-08-09.** Publishes no sizes, so each ISO costs one paced HEAD. `releases.ubuntu.com` is itself the download base (`serves_artifacts = 1`) | 6 h — **Worker cron** |
| Debian checksums (`cdimage.debian.org/debian-cd/current/<arch>/iso-cd/SHA256SUMS`) | sha256 per ISO; edition and arch encoded in the filename | official plain text | **verified 2026-08-05 — allowed**, not yet wired. Same no-size caveat as Ubuntu | daily (when adopted) |
| **Wikidata entity data** (`www.wikidata.org/wiki/Special:EntityData/<QID>.json`) | lineage (P144 *based on*), inception (P571), type (P31/P279) | official entity endpoint, CC0 | **verified 2026-08-04 — ALLOWED.** `robots.txt` disallows `/wiki/Special:` but carves this back out with `Allow: /wiki/Special:EntityData/*.`, which matches only the format-suffixed form. The extensionless `/wiki/Special:EntityData/Q381` stays disallowed | weekly (not yet wired — see below) |
| ~~Wikidata SPARQL~~ (`query.wikidata.org/sparql`) | — | — | **verified 2026-08-04 — DISALLOWED.** `query.wikidata.org/robots.txt` is four lines: `Disallow: /sparql`. **Not used**, per the binding rule that a source whose terms forbid our use is not used | — |
| ~~Wikidata / Wikipedia search APIs~~ (`/w/api.php`, `en.wikipedia.org/api/rest_v1/`) | — | — | **verified 2026-08-04 — DISALLOWED** by `Disallow: /w/` and `Disallow: /api/` respectively. **Not used** | — |
| Wikimedia Commons | distro logo SVGs (license-permitting) | official API (`Special:FilePath`) | **in use** — per-file license rows in `assets/distros/ATTRIBUTION.md` | on demand |

### Ingestion pipeline

Two callers, one set of fetchers. `packages/ingest/src/sources/*` holds the
normalizers; only the transport differs, so a fix to how a payload is read
lands in both places at once.

| Caller | Transport | Writes | Purpose |
|---|---|---|---|
| **Worker cron** (`apps/api/src/cron`) | native `fetch`, KV-backed conditional requests | D1 + KV | production ingestion (task 5.2) |
| `bun packages/ingest/src/live.ts` | curl (this container's proxy breaks Bun's fetch) | `apps/web/src/lib/server/live-data.json`, committed | the Phase 4 BFF snapshot; an offline fallback and a way to eyeball a source |

Cron schedules are declared in `apps/api/wrangler.toml` and dispatched by cron
expression in `src/cron/index.ts`. Every pass is idempotent (upserts on natural
keys) and isolates per-source failures, so one source being down never costs
another its refresh. Each source writes an `ingest_log` row per run, and every
ingested row carries its own `source_url` + `fetched_at` (ADR-0019).

**Which distro identity comes from where.** `distros` rows are seeded from
`packages/ingest/src/content-index.json`, generated from the authored MDX
frontmatter by `bun packages/ingest/src/content-index.ts`. Name, summary and
homepage are therefore the values a human reviewed and cited in `sources`, with
a `last_reviewed` date — nothing about a distro is asserted without a
resolvable citation. `packages/ingest/src/registry.ts` holds only *pointers*
(which upstream serves which distro), never facts. Regenerate the index in the
same commit as any frontmatter change.

**Ranking signals:** our own only (page views, download clicks tracked via
`downloads/track`, release recency). Any external ranking source is
supplementary, used only if its terms allow, and must be added here first.

## Per-distro rows

Added as each distro is onboarded (Phase 5+), one row per distro:

| Distro (slug) | Release source | Mirror source | robots/ToS | Logo source + license | Notes |
|---|---|---|---|---|---|
| ubuntu | endoflife.date `ubuntu` + **releases.ubuntu.com/`<version>`/SHA256SUMS** for artifacts | releases.ubuntu.com is itself the download base | verified | Commons — see ATTRIBUTION.md | LTS flags from API; edition/arch/point release parsed from the ISO filename, sizes by HEAD |
| fedora | endoflife.date `fedora` + **fedoraproject.org/releases.json** for artifacts | mirrors.fedoraproject.org | verified | Commons — see ATTRIBUTION.md | releases.json carries variant, arch, sha256 and size |
| linux-mint | endoflife.date `linuxmint` | — (Phase 5) | verified | Commons — see ATTRIBUTION.md | |
| arch | **archlinux.org releng snapshots** (verified 2026-08-05) | archlinux.org mirror status | verified | Commons — see ATTRIBUTION.md | rolling; monthly ISO snapshots carry sha256, torrent and magnet |
| debian | endoflife.date `debian` | — (Phase 5) | verified | Commons — see ATTRIBUTION.md | |
| opensuse | endoflife.date `opensuse` | — (Phase 5) | verified | Commons — see ATTRIBUTION.md | |
| manjaro | rolling (no cycles) | — (Phase 5) | verified | Commons — see ATTRIBUTION.md | rolling; registry kind `rolling` |
| pop-os | endoflife.date `pop-os` | — (Phase 5) | verified | Commons — see ATTRIBUTION.md | |
| nixos | endoflife.date `nixos` | — (Phase 5) | verified | Commons — see ATTRIBUTION.md | |
| zorin | none found | — (Phase 5) | n/a | Commons — see ATTRIBUTION.md | registry kind `unsourced` — fixed-cadence but no machine-readable source, so no release rows |
| elementary | none found | — (Phase 5) | n/a | Commons — see ATTRIBUTION.md | registry kind `unsourced` — fixed-cadence but no machine-readable source, so no release rows |
| endeavouros | rolling (no cycles) | — (Phase 5) | verified | Commons — see ATTRIBUTION.md | rolling; registry kind `rolling` |

## Replacing the placeholder data in `data.ts` (binding, Phase 5)

`apps/web/src/lib/server/data.ts` still holds invented values from the
frontend build-out. **Every factual field below must be replaced by data
fetched from an official API, feed, or structured source and stored with its
`source_url` + `fetched_at`.** Nothing factual ships hand-typed.

Three categories, and the distinction matters:

| Category | Rule |
|---|---|
| **Facts** (versions, dates, editions, desktops, package managers, requirements) | Fetch from official APIs / feeds / Wikidata. Never hand-maintain. |
| **Popularity** (downloads, rank, trend) | **Our own signals only** — view counters and download clicks in KV, aggregated into D1. Scraping DistroWatch or any third-party popularity chart is forbidden (see "Ranking signals" above). |
| **Editorial** (quiz weights, Hall of Fame entries, banner copy, category assignment) | Stays authored by us, but every claim carries a resolvable source URL and a `last_reviewed` date, like the MDX docs do. |

Per-symbol plan:

| Symbol in `data.ts` | Field(s) | Replace with |
|---|---|---|
| `DISTROS` | `downloads`, `rank`, `trend` | our own telemetry → `rankings` table (`.ai/database.md`) |
| `DISTROS` | `based_on`, `family`, `familyLine` | Wikidata **entity data** (P144 *based on*) — blocked on QIDs, see below. `categories` stay editorial in the taxonomy tables |
| `SPECS` | `latest`, `releaseModel` | endoflife.date — **already ingested**, just derive it instead of hand-typing |
| `SPECS` | `desktop`, `pkg`, `minMem` | Wikidata entity data where the claims exist, official docs otherwise. **Not SPARQL** — that endpoint is robots-disallowed |
| `EDITIONS` | all | official release APIs — Bodhi (Fedora), Launchpad (Ubuntu series), cdimage/mirror manifests (Debian), per-distro download endpoints |
| `REQUIREMENTS` | all | official install docs per distro, paraphrased and cited (currently one shared table for every distro — that is wrong and visible to users) |
| `RECENT_RELEASES` | all | already live from endoflife.date; **join the announcement feeds below** so each entry links to the real release note |
| `HOMEPAGES` | all | keep, but verify with a scheduled liveness check |
| `BANNERS` | `slug` rotation | derive from live release recency; the tagline stays editorial |
| `HALL_OF_FAME`, `QUIZ` | all | stay editorial; move out of `data.ts` into content or D1 so the file can be deleted |

`data.ts` is deleted once every symbol above has a home. Until then it is the
list of work remaining, not a data store to extend.

## Wikidata lineage — blocked, and precisely on what

Investigated 2026-08-04 while attempting task 5.3b. Recording it here so nobody
spends the same hour twice.

**Every programmatic way to look up a QID is robots-disallowed** — SPARQL
(`/sparql`), the Wikidata action API (`/w/`), and Wikipedia's REST API
(`/api/`). The one permitted endpoint,
`Special:EntityData/<QID>.json`, requires the QID as input. So the lookup step
cannot be automated inside our own crawler policy; only the fetch step can.

The data itself is good once you have the QID — verified against the live
endpoint:

```
Q381      Ubuntu  → P144 (based on) = Q7715973,  P571 (inception) = 2004-10-20
Q7715973  Debian  → P144            = Q3251801
Q48267    Fedora Linux → P144       = Q220182
```

**What is needed to unblock it: nine QIDs, looked up by a human in a browser**
(wikidata.org, search the distro, copy the Q-number) and pasted into
`packages/ingest/src/registry.ts` as pointers. That is legitimate — a QID is an
identifier, the same class of value as the endoflife.date product slug already
in that file, not a fact we are asserting.

Confirmed so far: `ubuntu` **Q381**, `debian` **Q7715973**, `fedora` **Q48267**.
Still needed: `arch`, `linux-mint`, `opensuse`, `manjaro`, `pop-os`, `nixos`,
`zorin`, `elementary`, `endeavouros`.

Do not guess them. Nine of twelve guessed QIDs resolved to entirely unrelated
entities — a bridge in Paris, an Indian political party, a Swedish baptismal
font — and each would have silently written wrong lineage into the catalog. Any
QID added here must be verified by fetching it and checking the label matches.

**This does not block task 5.4.** The shipped Explore page filters by
`category` only; there is no family facet. `family`/`based_on` feed the
`familyLine` display string in the command palette, the rankings rows and the
compare table — which degrade to the family being unknown, not to a broken page.

One design question to settle when it is unblocked: `family` today uses a
*packaging* vocabulary (`debian|rpm|arch|suse|independent`) that was invented
during the frontend build-out. P144 gives a *derivation* chain instead, whose
root would make Fedora's family `fedora` rather than `rpm`. Deriving family
from the sourced chain is honest but loses the RPM grouping; keeping the
packaging vocabulary needs its own sourced signal or an explicitly editorial,
cited taxonomy. Decide it with an ADR, not in code.

## Announcement feeds (RSS/Atom)

Verified reachable 2026-07-20 with the ingest User-Agent; no host disallows
these paths in `robots.txt`. Use them for release-announcement links, the
"recently updated" feed, and a future news surface — **not** as a version
source (endoflife.date and the official release APIs are authoritative there).

| Distro | Feed | Status |
|---|---|---|
| arch | `https://archlinux.org/feeds/news/` | ✅ 200 |
| fedora | `https://fedoramagazine.org/feed/` | ✅ 200 |
| ubuntu | `https://ubuntu.com/blog/feed` | ✅ 200 |
| debian | `https://www.debian.org/News/news.rdf` | ✅ 200 |
| linux-mint | `https://blog.linuxmint.com/?feed=rss2` | ✅ 200 |
| opensuse | `https://news.opensuse.org/feed.xml` | ✅ 200 |
| manjaro | `https://forum.manjaro.org/c/announcements/stable-updates.rss` | ✅ 200 |
| nixos | `https://nixos.org/blog/announcements-rss.xml` | ✅ 200 |
| zorin | `https://blog.zorin.com/feed/` | ✅ 200 |
| elementary | `https://blog.elementary.io/feed.xml` | ✅ 200 |
| endeavouros | `https://endeavouros.com/feed/` | ✅ 200 |
| pop-os | `https://system76.com/blog/rss.xml` | ✅ 200 (release-specific feed still to be found; `github.com/pop-os/iso/releases.atom` was 403 through this container's proxy — retry from the Worker) |

Additional verified structured sources: `query.wikidata.org/sparql`
(CC0, SPARQL), `api.launchpad.net/1.0/ubuntu/series` (Ubuntu series/EOL),
`bodhi.fedoraproject.org/releases/` (Fedora releases + state).
Add a registry row above before writing a fetcher for any of them.

## Crawler policy (summary — full rules in `.ai/security.md`)

- Official APIs preferred; HTML scraping only within `robots.txt`.
- UA: `linuxhub-ingest/<version> (+https://<site>/about#crawler)`.
- ≤1 req/sec/host, conditional requests, exponential backoff, KV caching.
- Every fetch logged to `ingest_log` with `source_url` + `fetched_at`.
- A source whose terms forbid our use is **not used** — link out instead.

## Logos & trademarks

- Real official brand SVGs only, from each project's press/brand kit or
  Wikimedia Commons, stored at `assets/distros/<slug>.svg`.
- `assets/distros/ATTRIBUTION.md` lists, per logo: source URL, license,
  trademark notes, retrieval date. Maintained in the same commit as the asset.
- Respect trademark/brand guidelines (no recoloring, no distortion). If a
  project forbids logo redistribution, do not bundle it — render a neutral
  placeholder and link out.

## Refresh cadence (Cron Triggers — see `.ai/backend-rules.md`)

| Schedule | Work |
|---|---|
| hourly | rolling/high-frequency release checks |
| every 6 h | standard release + artifact refresh |
| daily | mirror lists + health, download-counter flush to D1, metadata |
| weekly | rankings snapshot, Wikidata metadata, logo/license audit |
