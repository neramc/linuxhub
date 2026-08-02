# Design System — Flathub × WinUI 3 (ADR-0017)

> Per-screen design requirements live in `prompts/stitch/*.md`; the
> **high-fidelity design comps** built from them live in `design/`
> (ADR-0012 — Claude Code is the designer). Tokens are implemented in
> `packages/ui` and must match this doc exactly; `design/shared/design.css`
> consumes them directly. Where a brief's Modrinth reference conflicts with
> this doc, **this doc wins** (ADR-0013 → superseded in look by ADR-0017,
> which keeps Flathub's structure and replaces its flat surfaces with
> Fluent materials).

## Design language

**Flathub's information architecture rendered in WinUI 3 (Fluent) materials.**
What Flathub gives us stays: horizontal app cards, boxed lists, the banner
carousel, colored category tiles, a 1176px content column, calm and
content-first. What Fluent gives us is the *material*:

- **Layered surfaces.** The page is a Mica base (`--color-bg`, a soft grey
  carrying a fixed accent wash); content sits on **lighter** card fills
  (`--color-surface`). Cards read by elevation, not by tinting — this is the
  inverse of the old flat scheme and the single biggest visual change.
- **Control strokes.** Every card, control, and field carries a 1px
  translucent stroke whose **bottom edge is darker** (`--color-stroke-lip`),
  the subtle lip that makes WinUI controls feel physical.
- **Real elevation.** Soft, layered shadows: `--shadow-card` at rest,
  `--shadow-card-hover` on hover, `--shadow-flyout` for popovers,
  `--shadow-dialog` for modals.
- **Acrylic chrome.** The sticky header and flyouts blur what scrolls under
  them (`backdrop-filter`), with a solid `@supports` fallback.
- **Rounded rectangles, not pills.** Buttons/inputs are 6px, cards 8px,
  dialogs 12px. Pills survive only where they carry meaning: badges, status
  dots, filter chips.
- **Fluent accent behaviour.** Light theme fills accent surfaces with a deep
  blue and white text; **dark theme inverts it** — a light blue fill with
  near-black text, exactly as WinUI does. `--color-accent-fill` /
  `--color-on-accent` resolve per theme, so components never branch.
- **Fluent selection.** The active nav item carries a short accent bar
  (NavigationView); the mobile drawer uses the vertical variant.
- **Press, don't lift.** Controls dim and shrink ~3% on `:active`
  (motion-preference gated); they never bounce.
- Distro brand color still appears only in logo tiles and banner tints.

## Color tokens

Layer model — each row sits visually *above* the one before it.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-bg` | `#f3f3f3` | `#202020` | Mica page base (under everything) |
| `--color-well` | `#eeeeee` | `#272727` | nested well *inside* a card |
| `--color-surface` | `#ffffff` | `#2b2b2b` | card / boxed-list fill |
| `--color-surface-hover` | `#fafafa` | `#323232` | hovered card |
| `--color-surface-raised` | `#ffffff` | `#2d2d2d` | flyouts, dialogs, drawer |
| `--color-control` | `#fdfdfd` | `#333333` | buttons, inputs, pills |
| `--color-control-hover` / `-active` | `#f6f6f6` / `#f0f0f0` | `#3a3a3a` / `#2f2f2f` | control states |
| `--color-subtle-hover` / `-active` | `rgb(0 0 0 /.04)` / `.07` | `rgb(255 255 255 /.06)` / `.04` | reveal fills on any layer |
| `--color-stroke` | `rgb(0 0 0 /.06)` | `rgb(255 255 255 /.08)` | control/card hairline |
| `--color-stroke-lip` | `rgb(0 0 0 /.13)` | `rgb(255 255 255 /.06)` | darker bottom edge |
| `--color-stroke-strong` | `rgb(0 0 0 /.16)` | `rgb(255 255 255 /.16)` | field underline, hovered card |
| `--color-border` | `rgb(0 0 0 /.08)` | `rgb(255 255 255 /.09)` | separators inside a card |
| `--color-text` | `#1a1a1a` | `#ffffff` | primary text |
| `--color-text-muted` | `#5c5c5c` | `#c7c7c7` | secondary text |
| `--color-text-subtle` | `#6e6e6e` | `#a4a4a4` | tertiary/caption |

**Accent ramp** (GNOME blue in Fluent's light3→dark3 structure):
`--color-accent-light3` `#c3dbf7` · `-light2` `#99c1f1` · `-light1` `#62a0ea` ·
`--color-accent` `#3584e4` · `-dark1` `#1c71d8` · `-dark2` `#1a5fb4` ·
`-dark3` `#15487f`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-accent-fill` | `#1a5fb4` (dark2) | `#62a0ea` (light1) | text-bearing accent surfaces |
| `--color-accent-fill-hover` | `#1c71d8` | `#99c1f1` | hovered accent |
| `--color-accent-fill-active` | `#15487f` | `#3584e4` | pressed accent |
| `--color-on-accent` | `#ffffff` | `#06182b` | text on accent (theme-inverted) |
| `--color-accent-soft` | `#e8f1fc` | `#1c3348` | selected row tint |
| `--color-accent-text` | `#1a5fb4` | `#99c1f1` | accent text on soft tint |
| `--color-link` | `#1a5fb4` | `#99c1f1` | inline links |
| `--color-success` / `-text` | `#26a269` / `#156b41` | `#2ec27e` / `#78e9a8` | active, verified |
| `--color-warning` / `-text` | `#c78a00` / `#7a5200` | `#e5a50a` / `#f9c440` | EOL-soon, untranslated |
| `--color-danger` / `-text` | `#c01c28` / `#8f1521` | `#f66151` / `#ff9186` | errors, discontinued |

The `-text` variants are the AA-safe colors for text *on* the matching 15%
tint. Every pair is axe-verified at WCAG 2 AA on the five gate pages.

**Materials:** `--mica-tint` (accent at 7%/12%, fixed radial wash behind the
page), `--acrylic-fill` and `--acrylic-flyout` (72%/82% layer opacity) with
`--acrylic-blur: blur(30px) saturate(140%)`, `--scrim` for dialog smoke.

## Typography

Fluent's ramp, with 16px kept as the prose body size for web readability.
`Segoe UI Variable` renders natively on Windows; Inter carries everywhere
else. Headings use the Display optical face.

| Token | Value | Fluent role |
|---|---|---|
| `--font-sans` | `"Segoe UI Variable Text", "Segoe UI", Inter, "Noto Sans", system-ui` | body/UI |
| `--font-display` | `"Segoe UI Variable Display", "Segoe UI", Inter, …` | h1–h3 |
| `--font-mono` | `"Cascadia Code", "JetBrains Mono", ui-monospace` | code, checksums |
| `--text-xs` | 12px / lh 1.34 | caption |
| `--text-sm` | 14px / lh 1.43 | body, control labels |
| `--text-base` | 16px / lh 1.6 | prose body |
| `--text-lg` | 18px / lh 1.5 | body large |
| `--text-xl` | 20px / lh 1.4 | subtitle |
| `--text-2xl` | 28px / lh 1.29 | title |
| `--text-3xl` | 40px / lh 1.2 | title large (page h1) |
| `--text-4xl` | 52px / lh 1.08 | display (banner only) |

`--weight-strong: 600` (Fluent SemiBold) carries **all** emphasis — headings,
card titles, button labels. 700 is not used. Large text takes
`--tracking-tight: -0.015em`. Left-aligned, never justified; logical
properties only (RTL mirrors free).

## Spacing, radius, elevation

4px grid: `--space-1..8` = 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64.

| Radius | Value | Use |
|---|---|---|
| `--radius-xs` | 4px | segmented tabs, small chips |
| `--radius-sm` | 6px | buttons, inputs, icon buttons, nav items |
| `--radius-md` | 8px | cards, boxed lists, tiles |
| `--radius-lg` | 12px | dialogs, banner tiles, sheets |
| `--radius-xl` | 16px | large logo tiles, hero frames |
| `--radius-full` | 9999px | badges, status dots, filter chips, avatars |

| Elevation | Value (light) | Use |
|---|---|---|
| `--shadow-control` | `0 1px 1px rgb(0 0 0 /.04)` | buttons, pills, fields |
| `--shadow-card` | `0 1px 2px /.05, 0 2px 4px /.03` | cards, boxed lists, tiles |
| `--shadow-card-hover` | `0 2px 4px /.06, 0 6px 14px /.07` | hovered card |
| `--shadow-flyout` | `0 8px 16px rgb(0 0 0 /.14)` | popovers, banner arrows |
| `--shadow-dialog` | `0 32px 64px /.19, 0 2px 21px /.14` | dialogs, drawer, sheet |

Dark theme uses the same structure at higher opacity (.14–.37).
Content max width: `--content-max-width: 1176px`.

## Motion

Fluent timings: fast 150ms (fades) / base 250ms (point-to-point) / slow
350ms (sheets, drawer). `--ease-out: cubic-bezier(0, 0, 0, 1)` is Fluent's
strong decelerate and is the default; `--ease-standard` for reversible
moves, `--ease-emphasized` for entrances.

Hover = fill + stroke + elevation change. Press = dim **and** a ~3% shrink
(`scale(0.97)` controls, `0.995` cards), gated behind
`prefers-reduced-motion: no-preference`. Route changes cross-fade via View
Transitions. No staggered reveals, no bounce. `prefers-reduced-motion`
disables everything non-essential (global kill-switch in tokens.css +
`motion.ts` helper).

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

Keyboard-complete; **Fluent focus visual** — a 2px `--focus-outer` ring
(near-black on light, white on dark) at 2px offset, drawn *inside* clipping
containers (`.boxed`, `.vfiles`, flyouts) so it is never cut off; text
fields additionally show the accent underline. AA contrast;
44px touch targets; RTL-mirrored (`ar`, `he`, `fa`, `ckb`);
reduced-motion variants; axe-clean.

## Reference

Two references, one system. **flathub.org** sets the structure: home banner +
category tiles + section grids; app page (icon/title/install button,
carousel, metadata tiles, links list). **WinUI 3 / Fluent 2** sets the
material: layered Mica/card/flyout surfaces, control strokes with a bottom
lip, soft elevation, acrylic chrome, the Segoe UI Variable ramp, the accent
that inverts between themes, and the selection indicator bar.

When the two disagree, structure follows Flathub and surface follows Fluent.
When in doubt, remove decoration — Fluent's depth is subtle by design.
