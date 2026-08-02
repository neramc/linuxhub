# Frontend Rules — `apps/web` (SvelteKit on Vercel)

## Framework & conventions

- SvelteKit with **Svelte 5 runes** (`$state`, `$derived`, `$props`,
  `$effect`), TypeScript strict, `@sveltejs/adapter-vercel`.
- Biome for lint/format. No ESLint/Prettier.
- Svelte snippets over slots in new code; no legacy reactive statements.

## Routing

```
src/routes/
├─ [[locale=locale]]/            # optional locale prefix, matcher-validated
│  ├─ +layout.svelte             # shell: header, footer, theme, dir=rtl
│  ├─ +page.svelte               # Home
│  ├─ explore/+page.svelte       # browse grid + filters
│  ├─ distro/[slug]/+page.svelte # detail (MDX tabs + download panel)
│  ├─ rankings/+page.svelte
│  ├─ hall-of-fame/+page.svelte
│  ├─ category/[slug]/+page.svelte
│  ├─ tag/[slug]/+page.svelte
│  ├─ search/+page.svelte
│  ├─ compare/+page.svelte
│  ├─ quiz/+page.svelte
│  ├─ contribute/+page.svelte    # suggest/report/feedback (captcha-gated)
│  └─ about/+page.svelte
├─ api/v1/[...]/+server.ts       # BFF endpoints (NOT locale-prefixed)
├─ sitemap.xml/+server.ts
└─ +error.svelte                 # 404/error page (designed screen)
```

- Locale segment is validated by a param matcher against the registry in
  `packages/i18n`. Unknown locale → 404. No prefix → geo/cookie redirect once
  (see `.ai/i18n.md`).
- `/api` routes are locale-independent; content language comes from `?locale=`.

## BFF conventions (`/api/v1/*`)

- The BFF is the **only** public API. It validates input with shared Zod
  schemas from `packages/shared`, forwards to the Worker with the internal
  service token (`INTERNAL_API_TOKEN` env), and returns the standard envelope
  from `.ai/api.md` unchanged.
- Caching: set `Cache-Control: public, s-maxage=<ttl>, stale-while-revalidate`
  per endpoint class (list 60s, detail 300s, rankings 600s, search 30s) and
  `ETag`. Write endpoints: `no-store`.
- Never add business logic in the BFF beyond validation, caching, and shaping
  web-native outputs (sitemap, OpenSearch, feeds passthrough).

## Data loading

- All page data loads in `+page.ts` / `+page.server.ts` `load` via `fetch` to
  the BFF — components never fetch.
- Use SvelteKit streaming for below-the-fold data (screenshots, related,
  rank history) so the hero renders fast.
- Client-side navigation reuses cached `load` results; invalidate with
  `depends('app:distros')` keys.
- Mutations (suggest/report/feedback/track) go through form actions or typed
  `fetch` wrappers in `src/lib/api.ts` — one wrapper per endpoint, sharing Zod
  types.

## State

- Server is the source of truth; keep client state minimal.
- Cross-cutting client state (theme, locale choice, last download selection,
  command palette open) lives in small rune-based stores in `src/lib/state/`,
  persisted to `localStorage` where it should survive reload (theme, download
  selection) with SSR-safe guards.
- URL is state for browse: filters/sort/page live in query params so results
  are shareable; `load` reads them.

## i18n usage

- All UI strings via Paraglide messages (`packages/i18n`) — **zero hardcoded
  strings** in markup. Message ids: `m.explore_title()`.
- `dir="rtl"` set in the root layout for RTL locales; only logical CSS
  properties (enforced by Biome rule where possible + review).
- Dates/numbers via `Intl.*` with the active locale.
- Untranslated MDX shows the English fallback + "untranslated" badge.

## Images & icons

- Distro logos: inline `<img src="/assets/distros/{slug}.svg">` with fixed
  dimensions to avoid CLS; `loading="lazy"` off-screen.
- Screenshots: lazy, `srcset`, LQIP blur-up, 16:10 container reserves space.
- Site icon swaps with theme (`icons/light.svg` / `icons/dark.svg`).
- UI glyph set is a single sprite/module in `packages/ui` — no ad-hoc SVGs.

## Theme & motion

- Dark/light via `data-theme` on `<html>`, defaulting to
  `prefers-color-scheme`, user override persisted.
- All motion uses tokens from `packages/ui/src/tokens.css`; every animation goes
  through the shared `motion` helper which no-ops under
  `prefers-reduced-motion: reduce`.
- View transitions for route changes where supported; graceful fallback.

## Performance budget

- Explore + Distro pages: Lighthouse ≥90 perf/a11y/best-practices/SEO.
- JS per route ≤ 150KB gzipped; no client-side data waterfalls; fonts
  self-hosted with `font-display: swap`.

## Error handling

- BFF/API failures render the designed `ErrorState` with retry — never a blank
  page. `+error.svelte` covers route-level errors (404 uses the designed 404).
- Report `request_id` from the error envelope for debuggability.

## Implementation discipline

Frontend implementation starts only after the Stitch design is **approved**
(Phase 3 gate). Build exactly to the approved Figma + `design-system.md`
tokens. Deviations route back through Stitch — never redesign in code.
