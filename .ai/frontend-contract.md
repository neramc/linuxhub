# Frontend ↔ Backend Contract

> **Read before writing any Phase 5 endpoint.** `.ai/api.md` is the *target*
> API. This doc is what the shipped frontend **actually consumes today**. They
> do not match, and the difference is the single biggest way to break Phase 4
> while doing Phase 5.
>
> Derived from the code on 2026-07-20. When you change a route or a page's
> `load`, update this file in the same commit.

## Why this file exists

The BFF routes in `apps/web/src/routes/api/v1/*` currently read
`apps/web/src/lib/server/data.ts` directly and return shapes that grew from
the UI's needs, not from `.ai/api.md`. Task 5.4 ("point the BFF at the
Worker") swaps the data source underneath ~15 screens at once. If the Worker
returns `.ai/api.md` shapes and the pages expect these shapes, everything
breaks simultaneously and the failure is hard to localise.

**So: reconcile the two contracts deliberately, before 5.4.** The reconciled
shape belongs in `packages/shared` as Zod schemas, which then constrain both
sides.

## The mismatch, field by field

`Distro` — the type every list, card, and search result uses.

| Field | Shipped frontend (`data.ts`) | `.ai/api.md` canonical | Resolution needed |
|---|---|---|---|
| `slug`, `name`, `summary` | ✅ same | ✅ same | — |
| `family` | `"debian"` | `"debian"` | — |
| `familyLine` | `"Debian family · Ubuntu-based"` | ✖ absent | display string; derive from `family` + `based_on` |
| `color` | `"#e95420"` | ✖ absent | brand colour; **decide where it lives** (see below) |
| `initials` | `"U"` | ✖ absent | logo-tile fallback; derivable from `name` |
| `logo` | `"/distros/ubuntu.svg"` | `logo: string` | same idea; align on absolute vs. rooted path |
| `downloads` | **`"1.2M"` (string)** | **`number`** | ⚠️ formatting belongs on the client (`Intl.NumberFormat`, locale-aware) — the API must return a number |
| `rank` | `number` | `rank?` optional | — |
| `trend` | `number` (rank delta) | ✖ absent | comes from `rankings` snapshots |
| `categories` | `string[]` | `string[]` | — |
| `tags`, `desktops`, `homepage`, `status`, `latest_release` | ✖ absent | ✅ present | frontend gains them; additive, safe |

**Decide and record as an ADR:** `color` and `initials` are presentation data
with no upstream source. Three defensible options — pick one, don't drift:

1. columns on `distros` (simple, one source of truth, needs seeding);
2. a frontend-side lookup keyed by slug (keeps the API purely factual);
3. derive `initials` from `name`, store only `color`.

## What each BFF route returns today

| Route | Returns | Consumed by | Target (`.ai/api.md`) | D1 source |
|---|---|---|---|---|
| `GET /api/v1/distros` | `Distro[]` + `meta{page,limit,total}`; query `sort` (`popularity\|trending\|name`), `category` | explore, home | #1 | `distros` + `distro_taxonomy` + `rankings` |
| `GET /api/v1/distros/:slug` | `{ distro: Distro, detail: DetailPayload }` | distro detail | #2 (+ #5, #7, #8, #14 folded in) | many — see below |
| `GET /api/v1/rankings` | `{ entries: RankRow[], movers: RankRow[] }` | rankings | #32, #34 | `rankings` |
| `GET /api/v1/releases/recent` | `RecentRelease[]` + `meta{next_cursor}` | home | #12 | `releases` |
| `GET /api/v1/search?q=` | `Distro[]` + `meta{total}` | search, ⌘K palette | #22 | `distros` (LIKE → FTS5) |
| `GET /api/v1/hall-of-fame` | `HallEntry[]` | hall of fame | #35 | `hall_of_fame` |
| `GET /api/v1/quiz` | `QuizQuestion[]` | quiz | #49 | editorial — needs a home |
| `GET /api/v1/health` | `{service,status,version}` | — | #41 | — |

Two loaders bypass the BFF and import `data.ts` **values** directly:

- `compare/+page.server.ts` — `DISTROS`, `SPECS` → needs #46
- `+page.server.ts` (home) — `BANNERS`, `getDistro` → needs a banners source

Every other loader imports **types only** and fetches the BFF properly. Those
type imports are the ones to repoint at `packages/shared` once the Zod
schemas exist — a mechanical change, and a good first commit in 5.4.

### `RankRow`

```ts
{ rank, slug, name, familyLine, color, initials, logo, trend, spark }
```

`spark` is a pre-rendered SVG polyline `points` string, generated
deterministically from the slug in the mock. Real implementation: build it
from `rank-history` (#37) — either server-side into the same string, or ship
the series and let the client draw it. **Decide once**; the rankings page
currently renders the string verbatim.

### `RecentRelease`

```ts
{ slug, title: "Fedora 44", subtitle: "Stable release" | "Long-term support release", date: "2026-04-28" }
```

`title` and `subtitle` are pre-composed English strings — **an i18n bug in
waiting.** The API should return `{ slug, version, channel, released_at }`
and let the page compose the label through `@linuxhub/i18n`. Fix this when
the endpoint moves to the Worker.

### `DetailPayload` — the biggest surface

Returned by `getDetailFor()` and consumed by
`routes/[[locale=locale]]/distro/[slug]/+page.svelte`:

```ts
{
  summary: string
  homepage: string
  badges: { family: string; active: boolean; translated: boolean }
  meta: Array<{ icon: string; value: string; labelKey?: MessageKey; label?: string }>
  editions: string[]            // ["Workstation (GNOME)", "KDE Plasma spin", …]
  architectures: string[]       // ["x86_64", "aarch64"]
  formats: string[]             // [".iso", ".iso.torrent", "Checksum", "GPG signature"]
  versions: Version[]
  mirrors: DetailMirror[]
  requirements: Array<{ row: string; min: string; rec: string }>
  fetchedAt: string             // ISO — provenance line
  sources: string[]             // provenance line
  related: Distro[]
}

Version      { version: string; channel: "release"|"beta"|"eol"|"rolling";
               line: string; note: string; date: string; size?: string; downloads?: string }
DetailMirror { flag: string | null; name: string; note: string;
               healthy: boolean; auto: boolean }
```

Per-field mapping for the Worker:

| Field | Comes from | Notes |
|---|---|---|
| `summary`, `homepage` | `distros` | — |
| `badges.family` | derived from `family` + `based_on` | display string |
| `badges.active` | `distros.status = 'active'` | — |
| `badges.translated` | **already overridden by the page** from the loaded MDX doc | the API value is ignored; drop it |
| `meta[]` | composed | ⚠️ presentation, not data — see below |
| `editions` | `editions` table | currently `string[]`; the table has `{name, desktop, kind}` |
| `architectures`, `formats` | `artifacts` | currently hardcoded for every distro |
| `versions[]` | `releases` | `channel` values differ: frontend `release\|beta\|eol\|rolling` vs. schema `stable\|lts\|beta\|rolling`. **Reconcile** — `eol` is derived from `eol_at < today`, and `lts` is a flag, not a channel |
| `versions[].line`, `.note` | composed English strings | same i18n bug as `RecentRelease` |
| `versions[].size`, `.downloads` | `artifacts.size`, counters | optional today, always absent |
| `mirrors[]` | `mirrors` + `artifact_mirrors` | `flag` is an emoji built from `country`; `auto` marks the synthetic "nearest" row |
| `requirements` | ⚠️ **one shared table for every distro** — factually wrong and user-visible | per-distro, from official install docs |
| `fetchedAt`, `sources` | `ingest_log` | keep — the provenance line is a product feature |
| `related` | joined in the BFF today (same family, then rank) | #8 |

**`meta[]` is presentation, not data.** It is an ordered array of tiles with
icon names and i18n keys — the API should return facts
(`downloads`, `latest_version`, `rank`, `default_desktop`, `architectures`)
and let the page build the tiles. Moving this to the client also fixes the
`label` strings that are currently hardcoded English (`"Default desktop"`,
`` `Latest · ${date}` ``).

## Recurring themes

Three problems show up across the whole surface. Fix them as the endpoints
move rather than porting them:

1. **Pre-composed English strings** (`title`, `subtitle`, `line`, `note`,
   `label`, `familyLine`) defeat i18n. The API returns data; the page
   composes text through `@linuxhub/i18n`.
2. **Pre-formatted numbers** (`downloads: "1.2M"`) defeat locale formatting.
   The API returns numbers; the page formats with `Intl`.
3. **Presentation baked into payloads** (`meta[]`, `spark`, `flag`, `initials`)
   couples the API to one UI. Return facts; derive presentation client-side.

## Suggested sequence for 5.4 (avoids the big-bang break)

1. ✅ Done in 5.3 — the reconciled Zod schemas are in
   `packages/shared/src/schemas.ts`, imported by both sides, so a shape drift
   fails at the type level instead of silently at runtime.
2. Move **one** endpoint at a time, cheapest first:
   `health` → `releases/recent` → `search` → `distros` → `distros/:slug`.
   **Stop there.** `rankings`, `hall-of-fame` and `quiz` are not ready: the
   first two read tables that are legitimately empty (no download signals until
   5.6; question 4 above unsettled), and `quiz` has no endpoint at all. Moving
   them would replace working editorial screens with blank ones.
3. After each move run the e2e suite — it covers every screen that consumes
   these routes, so a broken shape fails a named test rather than silently
   rendering an empty page.
4. Keep the envelope `{ ok, data, meta }` identical throughout.
5. `compare` and the home loader still import `data.ts` **values** — give
   them endpoints (#46 for compare, a banners source for home) before
   deleting the file.

## Open questions — three answered, one still open

Per golden rule 3 these are architecture, so each is settled with an ADR
rather than implicitly in code.

1. ✅ **`color` and `initials` — frontend, not the API** (ADR-0020, owner
   approved 2026-08-04). `initials` derives from `name`; brand `color` becomes
   a slug-keyed lookup in `packages/ui`, cited against
   `assets/distros/ATTRIBUTION.md`. No D1 column.
2. ✅ **`spark` — the client draws it** (ADR-0020). `GET /v1/distros/:slug/
   rank-history` returns a `{ snapshot_at, rank, score }` series; the API never
   ships a rendered points string.
3. ✅ **`channel` — `stable|beta|rolling` plus an `lts` flag, `eol` derived**
   (ADR-0019). The frontend's `release|beta|eol|rolling` are display states the
   page computes, not storage.
4. ⬜ **Still open:** do the editorial sets (`QUIZ`, `HALL_OF_FAME`, banner
   copy, category assignment) live in D1 or in `content/` as MDX? Nothing in
   5.1–5.3 depends on it; settle it in 5.7. `hall_of_fame` exists as a table
   and `GET /v1/hall-of-fame` reads it, but it stays empty until this is
   decided — **so 5.4 must not repoint the BFF's hall-of-fame route yet.**

**Already settled — do not reopen:** the BFF **always** proxies the Worker and
never touches D1/KV directly (`.ai/architecture.md` §"Layers and
responsibilities", decided in Phase 0). It holds under Vercel, where a
function cannot bind D1 anyway.
