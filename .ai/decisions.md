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
