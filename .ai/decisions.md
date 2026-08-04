# Decisions (ADR Log)

> Append-only. Every meaningful decision gets an entry: context → decision →
> consequences. Newest at the bottom. Reversing a decision = new ADR
> referencing the old one, never editing history.

---

## ADR-0001 — Monorepo on Bun workspaces
**Date:** 2026-07-18 · **Status:** accepted
**Context:** Single repo for web, api, shared packages, content, prompts.
**Decision:** Bun workspaces as package manager / script runner / test
toolchain; optional turbo/bunfig task orchestration added later if needed.
**Consequences:** Fast installs/tests; one lockfile; deployed runtimes still
differ from Bun (see ADR-0002).

## ADR-0002 — Deployed runtimes: Vercel (web) + Cloudflare Workers (api)
**Date:** 2026-07-18 · **Status:** accepted
**Context:** Bun is the dev toolchain, but production runtimes are fixed by
the deployment targets.
**Decision:** `apps/web` runs on Vercel via `@sveltejs/adapter-vercel`;
`apps/api` runs on the Workers runtime (workerd) via Wrangler. Backend code is
written against Web-standard APIs + D1/KV bindings only — no Bun/Node-only
APIs in `apps/api`.
**Consequences:** Local dev uses `wrangler dev` for parity; CI must test
against a Workers-compatible environment (Miniflare pool for Vitest).

## ADR-0003 — SvelteKit `/api` routes as the public BFF
**Date:** 2026-07-18 · **Status:** accepted
**Context:** We need a public API surface, caching, and web-native outputs
without exposing the Worker directly.
**Decision:** All public traffic hits SvelteKit `/api/v1/*`, which validates,
proxies to the internal-token-gated Worker, and caches. The Worker is never
public except `/v1/health`.
**Consequences:** Two thin route layers sharing Zod schemas from
`packages/shared`; endpoint changes touch doc + schemas + both layers in one
commit.

## ADR-0004 — mdsvex for MDX-style content (not true `.mdx`)
**Date:** 2026-07-18 · **Status:** accepted
**Context:** True `.mdx` is React-oriented; we're on SvelteKit.
**Decision:** Use **mdsvex** (`.md`/`.svx` + frontmatter + Svelte components)
for `content/distros/**`. If strict `.mdx` interop is ever required, add a
compatible loader as a new ADR.
**Consequences:** Content stays portable markdown; frontmatter schema is
Zod-validated at build (see `.ai/content.md`).

## ADR-0005 — Paraglide (inlang) for i18n
**Date:** 2026-07-18 · **Status:** accepted
**Context:** ~57 locales, type safety, and minimal bundle overhead needed.
**Decision:** Paraglide for SvelteKit; locale-prefixed routes; registry in
`packages/i18n`; English fallback; RTL for `ar`, `he`, `fa`, `ckb`.
**Consequences:** Tree-shaken messages per locale; no hardcoded UI strings
(review blocker); geo redirect once with cookie override (see `.ai/i18n.md`).

## ADR-0006 — Biome for lint + format
**Date:** 2026-07-18 · **Status:** accepted
**Context:** Bun-friendly toolchain; want one fast tool.
**Decision:** Biome replaces ESLint + Prettier across the monorepo
(`biome.json` at root).
**Consequences:** Some Svelte-specific lint rules may need supplementing later;
if so, record as a new ADR rather than ad hoc additions.

## ADR-0007 — hCaptcha only on community write endpoints
**Date:** 2026-07-18 · **Status:** accepted
**Context:** Anonymous contributions need abuse protection; browsing must
stay frictionless.
**Decision:** hCaptcha on `suggest-distro`, `report`, `feedback`,
`mirrors/report-status` only, verified server-side. Reads and download
resolution are protected by KV rate limiting instead.
**Consequences:** See limits in `.ai/security.md`; captcha secret is a
Wrangler secret.

## ADR-0008 — Rankings computed from our own signals
**Date:** 2026-07-18 · **Status:** accepted
**Context:** External popularity sources have restrictive terms and dubious
methodology.
**Decision:** Rankings derive from our own signals (page views, tracked
download clicks, release recency), snapshotted weekly to D1. External signals
only as supplements, only with permitted terms, and only after registration in
`.ai/data-sources.md`.
**Consequences:** Rankings start cold and mature with traffic; methodology is
transparent and documentable on the site.

## ADR-0009 — D1 as source of truth; KV strictly rebuildable
**Date:** 2026-07-18 · **Status:** accepted
**Context:** Two storage systems invite drift.
**Decision:** D1 holds all durable data. KV holds only caches and counters
that can be rebuilt or are flushed to D1 (download counters flushed daily).
Cache invalidation via per-distro generation keys, not purges.
**Consequences:** Losing KV loses nothing durable; schema and keyspace are
documented together in `.ai/database.md`.

## ADR-0010 — Search starts with SQL LIKE, FTS5 as upgrade path
**Date:** 2026-07-18 · **Status:** accepted
**Context:** Catalog size at MVP (~30–100 distros) doesn't justify search
infrastructure.
**Decision:** Implement search over `name || aliases || summary` with LIKE +
ranking heuristics; adopt D1 FTS5 when measurements show need (new ADR).
**Consequences:** Simple, fast enough at our scale; fuzzy behavior handled by
alias lists and normalization in the search service.

## ADR-0011 — Internal packages ship TypeScript source (no build step)
**Date:** 2026-07-18 · **Status:** accepted
**Context:** `packages/shared|ui|i18n|ingest` are consumed only by the two
apps; a compile step would add build orchestration for no runtime benefit.
**Decision:** Internal packages expose `./src/index.ts` directly via
`exports`/`types`. Vite (web) and Wrangler's esbuild (api) bundle TS sources;
each package still typechecks itself (`tsc --noEmit`).
**Consequences:** No dist/ artifacts or watch pipelines; if a package is ever
published externally, add a build then (new ADR).

## ADR-0012 — Claude Code assumes the designer role; HTML design comps replace Stitch/Figma
**Date:** 2026-07-19 · **Status:** accepted
**Context:** The master brief assigned UI design to Google Stitch (human-run,
Figma export). The project owner has explicitly asked Claude Code to produce
the designs itself instead, based on the existing briefs.
**Decision:** Claude Code takes over the designer role. The design source of
truth becomes **high-fidelity HTML/CSS comps in `design/`**, built strictly
from `packages/ui` tokens and the `prompts/stitch/*` briefs (which remain the
design requirements). Responsive behavior, light/dark themes, and RTL are
demonstrated live in the comps rather than as separate static frames. The
approval gate is unchanged: the human reviews the comps and marks the design
approved before Phase 4 implementation begins.
**Consequences:** `prompts/stitch/` briefs stay as the per-screen design
requirements; `design/` holds the deliverable; distro logos appear as neutral
placeholder tiles in comps (official SVGs only enter via
`assets/distros` + ATTRIBUTION per `.ai/data-sources.md`); "never redesign an
approved screen in code" now means: change the comp + get re-approval first.

## ADR-0013 — Design language pivot: Flathub clone (drop the Modrinth blend)
**Date:** 2026-07-19 · **Status:** accepted
**Context:** The owner reviewed the first comp set (Flathub+Modrinth blend)
and rejected it as feeling generic/AI-generated; the direction requested is
a faithful **Flathub-style** look.
**Decision:** The visual language becomes a Flathub/GNOME (libadwaita-like)
clone: flat gray cards with no borders or shadows (hover = surface darken),
horizontal app-style cards (logo left), pill-shaped flat buttons, GNOME blue
accent `#3584e4`, boxed-list rows with hairline separators, modest type
scale, narrower content width (1176px), calm motion (fades/tints only — no
lifts, no gradients, no stat-chip/marketing bands). Light `#ffffff`/dark
`#242424` libadwaita-style themes. `.ai/design-system.md` +
`packages/ui/tokens.css` are rewritten to these values and `design/` comps
are rebuilt from scratch.
**Consequences:** Modrinth references in the per-screen briefs are void
where they conflict; briefs remain valid for structure/states/a11y.
Rankings/download flows adopt the boxed-list pattern rather than
Modrinth-style density.

## ADR-0014 — Amendments: Modrinth-style downloads + colorful Flathub home
**Date:** 2026-07-19 · **Status:** accepted
**Context:** Owner review of the Flathub-clone comps: the download flow
should feel like Modrinth's dense version list, and the home should be as
colorful as Flathub's (gradient category tiles, saturated banners); mobile
needed a pass with a no-breakage guarantee across device widths.
**Decision:** Within the Flathub-clone system (ADR-0013): (a) the download
surface becomes a **Modrinth-style version table** — filter dropdowns
(edition/arch/format) above dense version rows with channel-colored badges
(release=green, beta=orange), per-row round download buttons, and an
expandable files/mirror area with checksum; (b) home gains a **banner
carousel** with saturated brand-gradient tiles and a **gradient category
tile grid** (each category its own hue pair, white text); (c) the header
gets a mobile search button and compact <400px treatment, and every comp
must pass an automated horizontal-overflow check at 320/375/768/1024/1440.
**Consequences:** Component inventory gains VersionTable, BannerCarousel,
CategoryTile; the five-step wizard is replaced by filters + version table
(mirror choice folds into the expanded row).

## ADR-0015 — Committed live-data snapshot via ingest CLI (pre-Phase 5)
**Date:** 2026-07-19 · **Status:** accepted
**Context:** The owner requires real distro data — releases, EOL dates, and
mirror lists — on the detail pages now, but the Hono/D1 backend and its Cron
ingestion only land in Phase 5. Fabricated release data is worse than none.
**Decision:** Add `packages/ingest/src/live.ts`, a Bun CLI that fetches three
verified public/official sources (endoflife.date API for release cycles and
EOL; archlinux.org mirror-status JSON; mirrors.fedoraproject.org mirrorlist)
and writes a committed snapshot `apps/web/src/lib/server/live-data.json`. The
mock BFF derives version tables, mirror lists, and the home "recently
updated" feed from it; the detail page surfaces `fetched_at` + sources as a
provenance line. Rolling distros (arch, endeavouros, manjaro) get an explicit
`rolling` channel row; distros without a usable API (zorin, elementary) fall
back to curated SPECS. Distro logos are official SVGs from Wikimedia Commons
with per-file license rows in `assets/distros/ATTRIBUTION.md`.
**Consequences:** Builds and deploys stay network-free; data freshness equals
snapshot recency until Phase 5 replaces the CLI with Workers Cron Triggers
writing the same shapes into D1/KV. The CLI transport uses curl via
`Bun.spawn` (environment proxy constraint); Workers code will use `fetch`.

## ADR-0016 — Hand-rolled Paraglide-compatible i18n runtime + locale routing
**Date:** 2026-07-20 · **Status:** accepted
**Context:** `.ai/i18n.md` specifies Paraglide (inlang) with locale-prefixed
routes, geo/cookie redirect, and RTL. The full inlang toolchain (project
file, compiler, vite plugin) is heavyweight to introduce mid-milestone, and
call sites already use property-style `m.key` from `packages/i18n`.
**Decision:** Implement the specified behavior with a small runtime in
`packages/i18n` instead of the inlang compiler, keeping the catalog keys
Paraglide-shaped: per-locale catalogs (`en` complete, `ko` authored; others
fall back), a Proxy-based `m` resolving through the registry's fallback
chain, `localizeHref`/`splitLocale` helpers, and a country→locale geo table.
Routing per spec: routes live under `[[locale=locale]]` with a param
matcher; `hooks.server.ts` does the one-time geo/cookie redirect
(`x-vercel-ip-country`, Accept-Language tiebreaker, `lh-locale` cookie),
canonicalizes `/en/*` → `/*`, sets `<html lang dir>` via placeholder
transform, and binds the per-request locale in AsyncLocalStorage so
concurrent SSR renders can't leak locales. Locale switching is a full
navigation (`data-sveltekit-reload`), so a document has exactly one locale.
**Consequences:** Call sites keep `m.key` property access (frontend-rules'
`m.key()` function style arrives only if the inlang compiler is adopted
later — the swap stays mechanical). New locale = one `messages.<code>.ts`
file. Content docs remain progressively translated per `.ai/i18n.md`; the
detail page derives its English-fallback badge from the loaded doc.

## ADR-0017 — Flathub × WinUI 3 (Fluent) visual system
**Date:** 2026-07-20 · **Status:** accepted
**Context:** Owner review of the implemented Phase 4 UI: the flat
libadwaita-style surfaces from ADR-0013 read as dated. The request was to
redesign toward "Flathub + WinUI 3" and apply it to every component.
**Decision:** Keep Flathub's information architecture wholesale (horizontal
app cards, boxed lists, banner carousel, colored category tiles, 1176px
column, calm content-first tone) and replace the *material* with WinUI 3
(Fluent): a Mica page base with a fixed accent wash, lighter card fills that
read by elevation rather than tint, 1px control strokes with a darker bottom
lip, layered shadows (control/card/flyout/dialog), acrylic header and
flyouts, 6px controls / 8px cards / 12px dialogs with pills kept only for
badges and chips, the Fluent type ramp on Segoe UI Variable (Inter
fallback) with SemiBold carrying all emphasis, Fluent motion (150/250/350ms
on a strong decelerate) with press-shrink instead of lift, the Fluent focus
visual (high-contrast ring, drawn inside clipping containers), and the
NavigationView selection bar. The accent inverts per theme exactly as WinUI
does: a deep blue fill with white text in light, a light blue fill with
near-black text in dark, resolved through `--color-accent-fill` /
`--color-on-accent` so components never branch on theme.
**Consequences:** ADR-0013's "flat surfaces, no borders, no shadows, pill
buttons" clauses are superseded; its Flathub structure clauses stand.
ADR-0014's Modrinth download table and colorful home survive, restyled as
Fluent surfaces. `--color-surface` inverts meaning (now lighter than the
page), so nested fills moved to `--color-well` and reveal fills to
`--color-subtle-*`. Tokens renamed: `--color-accent-contrast` →
`--color-on-accent`, `--color-accent-strong*` → `--color-accent-fill*`.
Verified: axe WCAG 2 AA clean on the five gate pages, 17/17 e2e green, and
no horizontal overflow across 12 routes × 5 widths including RTL.

## ADR-0018 — Acrylic material system (amends ADR-0017)
**Date:** 2026-07-20 · **Status:** accepted
**Context:** ADR-0017 introduced acrylic but only on the header and the
locale flyout, and without grain — so it read as a plain blur rather than
Fluent's acrylic. Owner asked for more of the acrylic feel.
**Decision:** Make acrylic a first-class material with all four Fluent
ingredients — tint, blur **and saturation boost** (40px/180%), an inline-SVG
`feTurbulence` **grain**, and the smoke scrim (now blurred) behind dialogs —
and apply it to every surface that overlays content: header, locale flyout,
mobile drawer, bottom sheet, dialogs (command palette included), and the
banner arrows. Tint opacity is tiered by how much text a surface owns
(header 70% → flyouts/panes 85% → dialogs 90%), the rule being that content
behind acrylic must read as colour and shape, never as competing text. The
Mica base gains a second radial wash and its own lighter grain
(`--mica-noise`). The toast is excluded: its inverted fill needs full
opacity.
**Consequences:** All acrylic lives in a single `@supports (backdrop-filter)`
block; unsupported browsers keep the solid fills declared on each rule, so
the effect is purely additive. Grain is an inline data URI, so it adds no
request and works offline. Verified: axe WCAG 2 AA clean, 17/17 e2e green,
no overflow across 12 routes × 5 widths.

## ADR-0019 — D1 schema: per-value provenance, LTS as a flag, per-distro mirrors
**Date:** 2026-08-04 · **Status:** accepted
**Context:** Phase 5.1 turned the schema sketch in `.ai/database.md` into real
migrations. Writing it out surfaced four places where the sketch could not
hold the data the verified sources actually return, or could not enforce a
rule the project treats as binding.
**Decision:**
1. **Per-value provenance.** `distros`, `releases`, `artifacts` and `mirrors`
   each carry `source_url` + `fetched_at`. `ingest_log` records a *run* and so
   can never answer "where did this row come from"; the sourcing rule in
   `.ai/data-sources.md` is about values, so the columns belong on the values.
2. **`lts` is a flag, not a channel; `eol` is derived, not stored.**
   `channel ∈ stable|beta|rolling` plus `lts INTEGER`. endoflife.date reports
   LTS as a boolean per cycle — a cycle is stable *and* long-term-supported —
   so the documented four-value enum would have destroyed information. `eol` is
   computed from `eol_at < today` at read time, so no row goes quietly stale as
   dates pass. This answers open question 3 in `.ai/frontend-contract.md`; the
   frontend's `release|beta|eol|rolling` values are display states derived from
   `channel` + `lts` + `eol_at`, not storage.
3. **Mirrors belong to a distro.** `mirrors.distro_id` added and
   `UNIQUE(base_url)` relaxed to `UNIQUE(distro_id, base_url)`. Arch's mirror
   network is not Fedora's, one host can mirror several distros, and a mirror
   is known long before any artifact is known to sit on it — the
   `artifact_mirrors` join alone left ingested mirror lists with nowhere to go.
4. **`CHECK` constraints on every closed enum**, and `distros.family` defaults
   to `''` because lineage comes from Wikidata and an empty value is honest
   where a hand-typed one would violate the sourcing rule.
Also: `download_events.mirror_id` is `NOT NULL DEFAULT 0` rather than a
nullable FK, because SQLite treats each `NULL` as distinct in a `UNIQUE`
constraint and the daily counter flush would insert duplicates instead of
accumulating.
**Consequences:** `.ai/database.md` is updated to match in the same commit and
remains the authority. Reads must derive `eol` rather than filter on it, and
`releases.lts` is a separate predicate from `channel`. Migrations `0001_init` …
`0005_indexes` create 15 tables and 9 indexes; verified with
`wrangler d1 migrations apply linuxhub --local`, including a rejected write
proving the `CHECK` constraints bite.

## ADR-0020 — The API returns facts; presentation is derived client-side
**Date:** 2026-08-04 · **Status:** accepted (owner approved)
**Context:** The Phase 4 frontend was built against `data.ts`, which returned
`downloads: "1.2M"`, `familyLine: "Debian family · Ubuntu-based"`,
`title: "Fedora 44"`, a pre-rendered `spark` polyline, `flag` emoji, `color`
and `initials`. `.ai/frontend-contract.md` recorded three recurring problems
in that shape — pre-composed English, pre-formatted numbers, and presentation
baked into payloads — and asked where `color`, `initials` and `spark` should
live before any endpoint moved.
**Decision:** The API returns facts and nothing else.
- `downloads` is a number; the page formats it with `Intl.NumberFormat`, which
  is the only way it can be locale-correct across ~57 locales.
- No composed English anywhere. `familyLine`, release `line`/`note`,
  `RecentRelease.title`/`subtitle` and the `meta[]` tile labels are built by
  the page through `@linuxhub/i18n`. The API returns `family`, `based_on`,
  `version`, `channel`, `lts`, `released_at`, `eol_at`.
- `initials` derives from `name`; brand `color` is a slug-keyed lookup in
  `packages/ui`, cited against `assets/distros/ATTRIBUTION.md`. Neither becomes
  a D1 column: they are presentation with no upstream source, and a hand-seeded
  column would sit badly against the no-hand-typed-values rule.
- `spark` ships as a series (`GET /v1/distros/:slug/rank-history` →
  `{ snapshot_at, rank, score }[]`), drawn by the client. `flag` derives from
  the mirror's country code.
**Consequences:** Answers questions 1 and 2 in `.ai/frontend-contract.md`
(question 3 is ADR-0019's). Task 5.4 must move the formatting and composition
into the pages as each endpoint is repointed — that work is the reason the
sequence there is one endpoint at a time. Endpoint tests assert the *absence*
of `familyLine`, `color`, `initials`, `title` and `subtitle`, so a regression
into presentation-in-payload fails a named test.

## ADR-0021 — Worker tests run against a real D1 via Miniflare
**Date:** 2026-08-04 · **Status:** accepted
**Context:** `.ai/backend-rules.md` called for a "Miniflare/workers-pool
environment" without choosing one. Task 5.3 needed a database for endpoint
tests, and 5.1 had just added CHECK constraints and upsert conflict targets
that only a real SQLite engine enforces.
**Decision:** `apps/api/test/harness.ts` starts Miniflare with an in-memory D1
and the three KV namespaces, applies the files in `migrations/` verbatim, and
hands the bindings to `app.request(path, init, env)`. Miniflare is used
directly rather than `@cloudflare/vitest-pool-workers`: it needs no new
top-level dependency (it already ships with Wrangler), leaves the existing
Vitest setup unchanged, and lets a test drive both a cron pass and an HTTP
request against the same database. Ingestion tests stub the HTTP transport —
a test suite has no business calling an upstream — but never the database.
**Consequences:** Every test also exercises the schema, which is how the
`ON CONFLICT` parse failure in the rankings snapshot and the retry bug in the
ingest HTTP client were both caught before they shipped. Tests run ~1s slower
per suite because workerd starts per context; that is worth it. If Miniflare
ever misbehaves under Bun, the fallback is a `node:sqlite`-backed D1 shim,
which would have to be documented as no longer exercising the real engine.

## ADR-0022 — Keep the hand-rolled i18n runtime for v1; do not adopt the inlang compiler
**Date:** 2026-08-04 · **Status:** accepted (owner delegated the choice)
**Context:** ADR-0016 shipped a small Paraglide-shaped runtime instead of the
inlang toolchain, and left "adopt the real compiler" open as a dependency the
owner should agree to. `.ai/handoff.md` has carried it as an open question ever
since. At deployment time it had to be answered.

Measured before deciding, rather than argued from preference:

| | Today |
|---|---|
| Authored catalogs | **2** (`en`, `ko`) of 59 registry locales |
| Catalog payload | ~19 KB total, both statically imported |
| `m.<key>` call sites | **266** across **15** files |

**Decision:** Keep the hand-rolled runtime through v1.

Adopting the compiler now means converting two TS catalogs to inlang's message
format, adding a project file and a Vite plugin, and rewriting 266 call sites
from `m.key` to `m.key()` across every screen — then re-running the full e2e and
axe gate — immediately before the first deploy. The payoff at two catalogs and
19 KB is indistinguishable from zero. That is risk without benefit, and the
timing is the worst part of it.

**Revisit when a number says to**, not on a date. Two triggers:
1. **authored catalogs reach ~5**, or
2. the message payload becomes a measurable share of the JS bundle in the
   Phase 6 Lighthouse budget.

**Consequences:** Call sites keep property access (`m.key`); ADR-0016's note
that the swap stays mechanical still holds, and 266 sites is the size of it.

The honest limitation this leaves in place: `CATALOGS` in
`packages/i18n/src/runtime.ts` statically imports every authored catalog, so
each one ships to every visitor regardless of their locale. At 59 authored
locales that would be roughly 560 KB of messages sent to everybody — a real
defect, and the *first* thing to fix when the trigger fires. Note that fixing it
does not require the compiler: a dynamic per-locale import solves the same
problem while keeping this runtime. Weigh both options at that point instead of
assuming the compiler is the answer.

`.ai/i18n.md` is updated in this commit to describe what is actually built —
it had been describing Paraglide as the stack since Phase 0.
