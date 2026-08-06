# API Catalog — `/api/v1`

The public API is served by the SvelteKit BFF (`apps/web`) and mirrored 1:1 by
the internal Hono Worker (`apps/api`, prefix `/v1`, internal-token-gated).
All schemas are Zod definitions in `packages/shared` — this doc and those
schemas must stay synchronized.

> ⚠️ **This is the target API.** The shipped Phase 4 frontend consumes
> different shapes (pre-formatted numbers, composed English strings,
> presentation baked into payloads). `.ai/frontend-contract.md` documents the
> gap field by field and lists the open questions to settle before moving any
> endpoint. Read it before implementing from this catalog.

## Implemented so far (tasks 5.3, 5.6)

Twelve endpoints are live on the Worker: **#1, #2, #3, #12, #14, #15, #21,
#22, #32 (+#34 folded in), #35, #37, #41**. They return facts only — no composed English, no
pre-formatted numbers, no presentation (ADR-0020). The BFF still serves the
Phase 4 shapes from `data.ts` for most routes; task 5.4 moves it over, endpoint
by endpoint. **#14, #15 and #21 are proxied end to end** — those three have no
snapshot to fall back to, because `data.ts` never carried an artifact path, a
size or a checksum. With no Worker configured, #14 answers an empty matrix and
the page keeps its placeholder section.

Two conventions were settled while building them:

- **`meta.total` is a real `COUNT(*)`**, issued alongside the page query in one
  `db.batch()`. The worked example below flagged this as undecided; a total
  that is really the page length makes pagination lie.
- **`POST /downloads/resolve` returns no `instructions` string**, despite the
  catalog below listing one. That would be composed English in a payload, which
  ADR-0020 keeps out; the page has the checksum and composes the verify steps
  through `@linuxhub/i18n`. The response adds `mirror_choice`
  (`requested|country|fallback|origin`) so the UI can say how the mirror was
  picked instead of implying it measured something.
- **A bad internal token answers `404`, not `403`.** The error taxonomy has no
  auth code, and an internal surface should not confirm it exists to a caller
  that cannot already reach it. The Worker logs the real reason, so a
  misconfigured token stays diagnosable.

## Conventions

### Envelope

```jsonc
// success
{ "ok": true, "data": { … }, "meta": { "page": 1, "limit": 24, "total": 312, "next_cursor": null } }
// error
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "distro not found", "details": {}, "request_id": "req_…" } }
```

`meta` appears only on paginated/list responses.

### Pagination

`?page=` + `?limit=` (default 24, max 100) for browse lists;
`?cursor=` + `?limit=` for feeds (`releases/recent`). Responses always include
`meta` with whichever scheme applies.

### Errors

| HTTP | code |
|---|---|
| 400 | `VALIDATION_ERROR` (details: zod issues) |
| 403 | `CAPTCHA_FAILED` |
| 404 | `NOT_FOUND` |
| 429 | `RATE_LIMITED` (+ `Retry-After` header) |
| 502 | `UPSTREAM_ERROR` |
| 500 | `INTERNAL` |

### Caching & versioning

GET responses set `ETag` + `Cache-Control` (see `.ai/frontend-rules.md`).
Breaking changes require a new version prefix (`/api/v2`); additive changes
are allowed in place. `?locale=` selects content language where relevant
(validated against the registry, falls back to `en`).

## Endpoints (61)

### Distros

| # | Endpoint | Notes |
|---|---|---|
| 1 | `GET /api/v1/distros` | list; filters `category, tag, family, desktop, arch, based_on, status, q`; sort `popularity, name, latest_release, newest`; paginated |
| 2 | `GET /api/v1/distros/:slug` | detail: profile, family, links, badges, latest release summary |
| 3 | `GET /api/v1/distros/:slug/releases` | all releases; filter `channel` |
| 4 | `GET /api/v1/distros/:slug/releases/:version` | single release detail |
| 5 | `GET /api/v1/distros/:slug/editions` | GNOME/KDE/Xfce/minimal/server… |
| 6 | `GET /api/v1/distros/:slug/screenshots` | ordered gallery with captions |
| 7 | `GET /api/v1/distros/:slug/requirements` | min/recommended system requirements |
| 8 | `GET /api/v1/distros/:slug/related` | same family + shared tags heuristic |
| 9 | `GET /api/v1/distros/:slug/content/:doc` | `doc ∈ description\|install\|usage`; `?locale=`; returns compiled MDX + frontmatter + `translated: bool` |
| 10 | `GET /api/v1/distros/:slug/changelog` | release notes summaries, newest first |

### Releases / versions

| # | Endpoint | Notes |
|---|---|---|
| 11 | `GET /api/v1/releases/latest` | latest stable per distro (paginated) |
| 12 | `GET /api/v1/releases/recent` | cross-distro recent releases, cursor-paginated |
| 13 | `GET /api/v1/distros/:slug/releases/:version/artifacts` | artifacts: edition × arch × format, size, sha256 |

### Downloads / mirrors

| # | Endpoint | Notes |
|---|---|---|
| 14 | `GET /api/v1/distros/:slug/download-options` | full selection matrix for the selector (versions → editions → archs → formats → mirror availability) |
| 15 | `POST /api/v1/downloads/resolve` | body `{slug, version, edition, arch, format, mirror}` → `{url, size, sha256, sig_url, instructions}`; KV-cached; rate-limited |
| 16 | `GET /api/v1/mirrors` | all mirrors; filter `country, protocol` |
| 17 | `GET /api/v1/mirrors/nearest?country=` | geo-ranked list (country → region → global) |
| 18 | `GET /api/v1/artifacts/:id/checksums` | sha256 (+ others if published) + verify instructions |
| 19 | `GET /api/v1/artifacts/:id/torrent` | torrent file URL |
| 20 | `GET /api/v1/artifacts/:id/magnet` | magnet URI |
| 21 | `POST /api/v1/downloads/track` | count a download click; rate-limited; no body beyond `{artifact_id, mirror_id}` |

### Search

| # | Endpoint | Notes |
|---|---|---|
| 22 | `GET /api/v1/search?q=` | fuzzy over names/aliases/summaries across locales; facet filters as in #1 |
| 23 | `GET /api/v1/search/suggest?q=` | autocomplete (≤10); rate-limited |
| 24 | `GET /api/v1/search/filters` | available facets + counts (drives filter UI) |

### Categories / tags / taxonomy

| # | Endpoint | Notes |
|---|---|---|
| 25 | `GET /api/v1/categories` | all categories + counts |
| 26 | `GET /api/v1/categories/:slug` | category detail |
| 27 | `GET /api/v1/categories/:slug/distros` | paginated distros in category |
| 28 | `GET /api/v1/tags` | all tags + counts |
| 29 | `GET /api/v1/tags/:slug/distros` | paginated distros with tag |
| 30 | `GET /api/v1/families` | base families (Debian/Arch/RPM/…) → derivative counts |
| 31 | `GET /api/v1/desktops` | desktop environments → distros offering them |

### Rankings / Hall of Fame

| # | Endpoint | Notes |
|---|---|---|
| 32 | `GET /api/v1/rankings?period=week\|month\|year\|all` | popularity ranking snapshot |
| 33 | `GET /api/v1/rankings/trending` | short-window momentum |
| 34 | `GET /api/v1/rankings/rising` | biggest rank movers |
| 35 | `GET /api/v1/hall-of-fame` | curated entries + cited rationale |
| 36 | `GET /api/v1/rankings/by-category/:slug` | ranking within a category |
| 37 | `GET /api/v1/distros/:slug/rank-history` | sparkline series (period snapshots) |

### Stats / meta

| # | Endpoint | Notes |
|---|---|---|
| 38 | `GET /api/v1/stats/overview` | totals: distros, releases, mirrors, downloads tracked |
| 39 | `GET /api/v1/stats/distro/:slug` | per-distro downloads/views series |
| 40 | `GET /api/v1/stats/downloads` | aggregate download counts by period |
| 41 | `GET /api/v1/health` | liveness: `{ok, db, kv, version}` (no auth) |
| 42 | `GET /api/v1/meta` | API build/version, docs link |

### i18n

| # | Endpoint | Notes |
|---|---|---|
| 43 | `GET /api/v1/locales` | locale registry (BCP-47, label, rtl) |
| 44 | `GET /api/v1/geo/locale` | resolve preferred locale from request geo (KV-cached) |
| 45 | `GET /api/v1/i18n/:locale` | UI message bundle (only if served dynamically) |

### Discovery / comparison

| # | Endpoint | Notes |
|---|---|---|
| 46 | `GET /api/v1/compare?slugs=a,b,c` | side-by-side specs (max 4 slugs) |
| 47 | `GET /api/v1/recommend?based_on=slug` | similar-distro recommendations |
| 48 | `GET /api/v1/random` | one random active distro |
| 49 | `GET /api/v1/quiz` | "which distro?" question set |
| 50 | `POST /api/v1/quiz/result` | answers → scored recommendations |

### Community (write — hCaptcha-gated, rate-limited)

| # | Endpoint | Notes |
|---|---|---|
| 51 | `POST /api/v1/suggest-distro` | `{name, homepage, reason, captcha_token}` |
| 52 | `POST /api/v1/report` | broken mirror/link `{kind, target_id, detail, captcha_token}` |
| 53 | `POST /api/v1/feedback` | `{topic, message, captcha_token}` |
| 54 | `POST /api/v1/mirrors/report-status` | `{mirror_id, status, detail, captcha_token}` |

### Feeds / integrations

| # | Endpoint | Notes |
|---|---|---|
| 55 | ✅ `GET /api/v1/feeds/releases.rss` | recent releases, RSS 2.0. Served by the BFF from the same rows as `releases/recent`, so a feed cannot disagree with the page |
| 56 | ✅ `GET /api/v1/feeds/releases.atom` | recent releases, Atom |
| 57 | `GET /api/v1/badges/:slug` | shields-style SVG badge (latest version) |
| 58 | `GET /api/v1/opensearch.xml` | OpenSearch description |
| 59 | ✅ `GET /sitemap.xml` | served by the web app directly, alongside `GET /robots.txt`. Only locales with a message catalog are listed: a locale with none renders English behind a translated URL, and telling a crawler otherwise is the same class of claim as a hand-typed fact |
| 60 | `GET /api/v1/distros/:slug/badges/downloads` | SVG badge (download count) |
| 61 | `GET /api/v1/stats/languages` | content translation coverage per locale |

## Key schemas (canonical shapes — Zod in `packages/shared`)

```ts
Distro        { slug, name, summary, family, based_on, homepage,
                status: 'active'|'discontinued', logo: string,
                categories: string[], tags: string[], desktops: string[],
                latest_release: Release | null, downloads: number,
                rank: number | null, trend: number | null }
Release       { version, channel: 'stable'|'beta'|'rolling', lts: boolean,
                codename, latest_point, released_at, eol_at,
                eol: boolean,        // derived from eol_at < today, never stored
                notes_url, source_url, fetched_at }
Edition       { id, name, desktop?: string, kind: 'desktop'|'server'|'minimal'|'other' }
Artifact      { id, edition_id, arch: 'x86_64'|'aarch64'|'riscv64'|string,
                format: 'iso'|'torrent'|'magnet'|'checksum'|'signature',
                size: number, sha256?: string, sig_url?: string }
Mirror        { id, country, region, base_url, protocol: 'https'|'http'|'ftp'|'rsync',
                sponsor?, healthy: boolean }
DownloadResolution { url, size, sha256?, sig_url?, mirror: Mirror, instructions: string }
RankingEntry  { rank, slug, name, score, delta }
RankHistoryPoint { snapshot_at, rank, score }   // a series; the client draws it
```

Canonical Zod definitions live in `packages/shared/src/schemas.ts`, imported by
the Worker and the BFF so the two cannot disagree.

Adding/changing an endpoint = update this doc + `packages/shared` schemas +
both route layers in the **same commit**.
