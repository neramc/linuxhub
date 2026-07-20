# Design System — Flathub Clone (ADR-0013)

> Per-screen design requirements live in `prompts/stitch/*.md`; the
> **high-fidelity design comps** built from them live in `design/`
> (ADR-0012 — Claude Code is the designer). Tokens are implemented in
> `packages/ui` and must match this doc exactly; `design/shared/design.css`
> consumes them directly. Where a brief's Modrinth reference conflicts with
> this doc, **this doc wins** (ADR-0013).

## Design language

A faithful **Flathub / GNOME (libadwaita)** clone: calm, flat, content-first.

- **Flat surfaces.** Cards are slightly-tinted rounded rectangles on the page
  background — **no borders, no shadows**. Hover darkens the surface tone.
- **Pill buttons.** Fully rounded, flat fills. One blue primary per view.
- **Horizontal cards.** Logo on the start side, name + one-line summary
  after it — like Flathub app cards. Never vertical marketing cards.
- **Boxed lists.** Grouped rows inside one rounded container with hairline
  separators (libadwaita "boxed list") — used for rankings, releases,
  links, options, settings-like content.
- **Modest scale.** Headings are quiet; no display-size hero type, no
  gradients, no stat chips, no decorative bands.
- Distro brand color appears only in logo tiles and banner tints; the shell
  stays neutral.

## Color tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-bg` | `#ffffff` | `#242424` | page background |
| `--color-surface` | `#f4f4f4` | `#333333` | cards, boxed lists, inputs |
| `--color-surface-hover` | `#ececec` | `#3d3d3d` | hovered card/row |
| `--color-surface-raised` | `#ffffff` | `#383838` | dialogs, popovers |
| `--color-border` | `#e8e8e8` | `#454545` | hairline separators only |
| `--color-text` | `#1c1c1e` | `#ffffff` | primary text |
| `--color-text-muted` | `#5e5e63` | `#b3b3b8` | secondary text |
| `--color-accent` | `#3584e4` | `#3584e4` | primary buttons, selection |
| `--color-accent-hover` | `#1c71d8` | `#4a90e8` | hovered primary |
| `--color-accent-strong` | `#1a5fb4` | `#1a5fb4` | text-bearing accent surfaces (primary buttons, active pills) — WCAG AA vs white (6.3:1), a11y correction 2026-07-20 |
| `--color-accent-strong-hover` | `#1c71d8` | `#1c71d8` | hovered strong accent (4.8:1) |
| `--color-accent-contrast` | `#ffffff` | `#ffffff` | text on accent |
| `--color-link` | `#1c71d8` | `#78aeed` | inline links |
| `--color-accent-soft` | `#e7f0fb` | `#2a3a4d` | selected row tint, focus wash |
| `--color-success` | `#26a269` | `#2ec27e` | active status, verified |
| `--color-warning` | `#c78a00` | `#e5a50a` | EOL-soon, untranslated |
| `--color-danger` | `#c01c28` | `#f66151` | errors, discontinued |

GNOME palette values; all pairs meet WCAG AA (4.5:1 body, 3:1 UI).

## Typography

| Token | Value |
|---|---|
| `--font-sans` | `"Inter", "Noto Sans", system-ui, sans-serif` |
| `--font-mono` | `"JetBrains Mono", ui-monospace, monospace` |
| `--text-xs` | 0.75rem / lh 1.4 |
| `--text-sm` | 0.875rem / lh 1.5 |
| `--text-base` | 1rem / lh 1.6 |
| `--text-lg` | 1.125rem / lh 1.5 |
| `--text-xl` | 1.25rem / lh 1.4 |
| `--text-2xl` | 1.5rem / lh 1.3 |
| `--text-3xl` | 2rem / lh 1.2 |
| `--text-4xl` | 2.5rem / lh 1.1 (banner tile only) |

Weights: 400 body, 500 UI labels, 600 headings, 700 card titles/banner.
Left-aligned, never justified; logical properties only (RTL mirrors free).

## Spacing, radius, elevation

4px grid: `--space-1..8` = 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64.

| Radius | Value | Use |
|---|---|---|
| `--radius-sm` | 8px | inputs, small controls |
| `--radius-md` | 12px | cards, boxed lists, dialogs |
| `--radius-lg` | 18px | banner tiles, screenshot frames |
| `--radius-full` | 9999px | ALL buttons and chips (pills) |

**Elevation: flat.** Cards/lists carry no shadow. Only overlays float:
`--shadow-dialog: 0 4px 24px rgb(0 0 0 / 0.18)` (dialogs, popovers, sheets).

Content max width: `--content-max-width: 1176px`.

## Motion

Calm, functional. fast 120ms / base 200ms / slow 320ms, ease-out.
Hover states are **background-tint changes only** — no lifts, no scale.
Dialogs/sheets: fade + small rise. Carousel: slide. Skeletons shimmer.
No staggered reveals. `prefers-reduced-motion` disables everything
non-essential (global kill-switch in tokens.css + `motion.ts` helper).

## Breakpoints

mobile 0+ (1-col, sheets) · tablet 640+ (2-col cards) · desktop 1024+
(3-col cards, side filters) · wide 1440+ (content capped at 1176px).

## Iconography & imagery

- UI glyphs: single stroke set, 1.5px, 20/24px grid (sprite in comps).
- Distro logos: official SVGs on flat surface, never recolored
  (placeholder initial-tiles in comps per ADR-0012).
- Screenshots 16:10, radius-lg, inside a flat surface band.

## Component inventory

Shell: `AppHeader` (wordmark · wide center search · nav links · locale ·
theme), `AppFooter` (flat, multi-column), `MobileNav` (drawer),
`CommandPalette`, `LocaleSwitcher`, `ThemeToggle`.

Browse: `DistroCard` (horizontal: logo 64 → name/summary), `CardGrid`,
`BannerCarousel` (saturated brand-gradient tiles + dots/arrows, ADR-0014),
`CategoryTile` (gradient hue-pair tiles, white text, ADR-0014),
`CategoryPill`, `FilterList` (flat boxed groups) / `FilterSheet`,
`SortSelect`, `SearchInput`, `Pagination`.

Detail: `DistroHeader` (icon + name + family / Download pill),
`ScreenshotCarousel` (gray band), `MetaTileRow` (downloads · size ·
version · license · arches), `ContentTabs`/prose, `BoxedList` + `Row`
(releases, links), `VersionTable` (Modrinth-style downloads, ADR-0014:
edition/arch/format filter dropdowns → dense version rows with channel
badges + round per-row download buttons → expandable mirror/checksum
area), `ChecksumRow`, `RelatedRow`, `RankSparkline`.

Rankings/discovery: `RankingBoxedList` (numbered rows, hairlines),
`TrendMark`, `HallCard`, `CompareTable`, `QuizStepper`, `RandomButton`.

Feedback/system: `Badge`, `Button` (primary/flat/danger — all pills),
`Chip`, `Tabs` (pill-style switcher), `Dialog`, `Tooltip`, `Toast`,
`Skeleton*`, `EmptyState`, `ErrorState`, `CaptchaGate`, `CopyButton`.

New components require updating this inventory first
(`.ai/component-rules.md`).

## States

Every screen designs loading (skeleton), empty, and error. Untranslated
content shows the warning badge.

## Accessibility baseline

Keyboard-complete; focus ring 2px accent + 2px offset; AA contrast;
44px touch targets; RTL-mirrored (`ar`, `he`, `fa`, `ckb`);
reduced-motion variants; axe-clean.

## Reference

flathub.org is the single visual reference: home banner + category pills +
section grids; app page (icon/title/install pill, carousel, metadata tiles,
links list); flat GNOME dark theme. Match its calm — when in doubt, remove
decoration.
