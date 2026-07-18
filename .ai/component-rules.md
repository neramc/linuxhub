# Component Rules

## Where components live

- `packages/ui` — shared, reusable, design-system components (the inventory in
  `.ai/design-system.md`). Anything used by 2+ routes or expressing a design
  token belongs here.
- `apps/web/src/lib/components` — app-only composition components (route
  shells, page sections) that assemble `packages/ui` parts. No visual
  primitives here.
- Route files compose components; they do not define new visual patterns.

## Naming

- Svelte components: `PascalCase.svelte` (`DistroCard.svelte`).
- One component per file; file name = component name.
- Props/events: `camelCase`; events are verbs (`onselect`, `onresolve`).
- Variant props are unions, not booleans, when >2 variants:
  `variant: 'primary' | 'secondary' | 'ghost' | 'danger'`.
- Boolean props are positive (`disabled`, not `notEnabled`).

## Composition & reuse (anti-duplication)

1. **Before writing any component, check the inventory** in
   `.ai/design-system.md`. If a similar one exists: reuse or extend it.
2. If a needed component is missing, **add it to the inventory first** (same
   change), then implement it in `packages/ui`.
3. Never fork a component to tweak styling — add a variant or token.
4. Styling comes only from design tokens (CSS custom properties from
   `packages/ui/tokens`). No hardcoded colors, sizes, shadows, or durations.
5. Use Svelte 5 runes (`$props()`, `$state`, `$derived`) and snippets for
   slot-like composition. No legacy `export let` / `$:` in new code.
6. Components are presentation-only: data comes in via props; they never fetch.
   Data loading lives in route `load` functions (see `.ai/frontend-rules.md`).

## Accessibility baseline (every component)

- Semantic HTML first; ARIA only to fill real gaps.
- Fully keyboard-operable; focus visible (token focus ring); focus trapped in
  modals and returned on close.
- Labels for every input; `aria-live="polite"` for async results (search,
  download resolution); `role="status"` for toasts.
- Contrast per `.ai/design-system.md`; touch targets ≥44px.
- Use logical properties (`margin-inline-start`, not `margin-left`) so RTL
  mirrors for free. Never encode direction in styles.
- Every animation checks `prefers-reduced-motion` (shared `motion` helper in
  `packages/ui`).

## States

Every data-driven component ships loading / empty / error states (skeletons
per design system, `EmptyState`, `ErrorState`) — designed in Stitch, not
improvised.

## Testing

- `packages/ui` components: Vitest + Testing Library smoke tests (renders,
  variants, keyboard interaction).
- axe checks run in Playwright e2e on composed pages (see quality gates).

## Change control

Visual changes to an approved component route through Stitch (§7 of
CLAUDE.md). Code may fix bugs and a11y issues without redesign, but any
layout/visual change updates the design source first.
