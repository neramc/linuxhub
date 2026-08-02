# Data Sources & Ingestion Registry

> Every source used by `packages/ingest` MUST have a row here **before** its
> fetcher is written, with robots/ToS verified at that time (not assumed).
> Columns marked *verify* are filled during Phase 5 implementation.

## Source registry

| Source | What we take | Access | robots/ToS status *(verify)* | Cadence |
|---|---|---|---|---|
| **endoflife.date API** (`/api/<product>.json`) | release cycles, release dates, EOL dates, LTS flags | public JSON API, explicitly for programmatic use | **verified 2026-07-19** — public API, MIT-licensed site, no auth | 6 h *(currently: snapshot CLI)* |
| Official distro release pages / JSON endpoints (per distro) | versions, dates, artifacts, checksums | official API/page | per-distro row below | 6 h |
| Repology API | cross-distro version tracking | public API | pending verification | daily |
| GitHub Releases API | releases for GitHub-hosted distros | official API (token, rate-limited) | pending verification | 6 h |
| GitLab Releases API | releases for GitLab-hosted distros | official API | pending verification | 6 h |
| **Fedora MirrorManager** (`mirrors.fedoraproject.org/mirrorlist`) | Fedora mirror list | official API | **verified 2026-07-19** — official mirror-list endpoint | daily *(currently: snapshot CLI)* |
| openSUSE download redirector (mirrorbrain) | openSUSE mirrors/artifacts | official endpoint | pending verification | daily |
| Ubuntu/Debian cdimage + mirror lists | ISO paths, mirror lists | official pages/manifests | pending verification | daily |
| **Arch mirror status** (`archlinux.org/mirrors/status/json/`) | Arch mirrors + health scores | official JSON | **verified 2026-07-19** — official status JSON endpoint | daily *(currently: snapshot CLI)* |
| Wikidata / Wikipedia | structured metadata (founding year, family, defunct status) | official API (CC BY-SA / CC0 as applicable) | pending verification | weekly |
| Wikimedia Commons | distro logo SVGs (license-permitting) | official API (`Special:FilePath`) | **in use** — per-file license rows in `assets/distros/ATTRIBUTION.md` | on demand |

### Active snapshot pipeline (pre-Phase 5, ADR-0015)

`bun packages/ingest/src/live.ts` fetches the three **verified** sources above
and writes `apps/web/src/lib/server/live-data.json` (committed), which the BFF
serves. Every snapshot records `fetched_at` + source list, and the distro
detail page surfaces them. Phase 5 replaces the CLI with Workers Cron Triggers
writing to D1/KV — same sources, same shapes.

**Ranking signals:** our own only (page views, download clicks tracked via
`downloads/track`, release recency). Any external ranking source is
supplementary, used only if its terms allow, and must be added here first.

## Per-distro rows

Added as each distro is onboarded (Phase 5+), one row per distro:

| Distro (slug) | Release source | Mirror source | robots/ToS | Logo source + license | Notes |
|---|---|---|---|---|---|
| ubuntu | endoflife.date `ubuntu` | — (Phase 5) | verified | Commons — see ATTRIBUTION.md | LTS flags from API |
| fedora | endoflife.date `fedora` | mirrors.fedoraproject.org | verified | Commons — see ATTRIBUTION.md | |
| linux-mint | endoflife.date `linuxmint` | — (Phase 5) | verified | Commons — see ATTRIBUTION.md | |
| arch | rolling (no cycles) | archlinux.org mirror status | verified | Commons — see ATTRIBUTION.md | rolling row |
| debian | endoflife.date `debian` | — (Phase 5) | verified | Commons — see ATTRIBUTION.md | |
| opensuse | endoflife.date `opensuse` | — (Phase 5) | verified | Commons — see ATTRIBUTION.md | |
| manjaro | rolling (no cycles) | — (Phase 5) | verified | Commons — see ATTRIBUTION.md | rolling row |
| pop-os | endoflife.date `pop-os` | — (Phase 5) | verified | Commons — see ATTRIBUTION.md | |
| nixos | endoflife.date `nixos` | — (Phase 5) | verified | Commons — see ATTRIBUTION.md | |
| zorin | curated (no API found) | — (Phase 5) | n/a | Commons — see ATTRIBUTION.md | SPECS fallback |
| elementary | curated (no API found) | — (Phase 5) | n/a | Commons — see ATTRIBUTION.md | SPECS fallback |
| endeavouros | rolling (no cycles) | — (Phase 5) | verified | Commons — see ATTRIBUTION.md | rolling row |

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
| `DISTROS` | `family`, `familyLine`, `categories` | Wikidata (`P31`/`P279` lineage) cross-checked against official docs; taxonomy tables in D1 |
| `SPECS` | `latest`, `releaseModel` | endoflife.date — **already ingested**, just derive it instead of hand-typing |
| `SPECS` | `desktop`, `pkg`, `minMem` | Wikidata SPARQL (`query.wikidata.org/sparql`, CC0) + official docs where Wikidata is thin |
| `EDITIONS` | all | official release APIs — Bodhi (Fedora), Launchpad (Ubuntu series), cdimage/mirror manifests (Debian), per-distro download endpoints |
| `REQUIREMENTS` | all | official install docs per distro, paraphrased and cited (currently one shared table for every distro — that is wrong and visible to users) |
| `RECENT_RELEASES` | all | already live from endoflife.date; **join the announcement feeds below** so each entry links to the real release note |
| `HOMEPAGES` | all | keep, but verify with a scheduled liveness check |
| `BANNERS` | `slug` rotation | derive from live release recency; the tagline stays editorial |
| `HALL_OF_FAME`, `QUIZ` | all | stay editorial; move out of `data.ts` into content or D1 so the file can be deleted |

`data.ts` is deleted once every symbol above has a home. Until then it is the
list of work remaining, not a data store to extend.

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
