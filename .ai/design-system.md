# Design System

> Per-screen design requirements live in `prompts/stitch/*.md`; the
> **high-fidelity design comps** built from them live in `design/`
> (ADR-0012 — Claude Code is the designer). Tokens are implemented in
> `packages/ui` and must match this doc exactly; `design/shared/design.css`
> consumes them directly.

## Design language

Modern, spacious, card-based. A deliberate blend:

- **Flathub** — calm restraint, generous whitespace, content-first hierarchy,
  soft large-radius cards, quiet neutral surfaces that let app (here: distro)
  branding provide the color.
- **Modrinth** — playful micro-interactions, smooth route transitions,
  confident green-leaning accent, dense-but-legible data rows for
  versions/files, dark-mode-first comfort.

Linuxhub sits between: Flathub's calm layout + Modrinth's liveliness and
confident accent. Distro brand colors/logos supply vibrancy inside cards; the
shell stays neutral.

## Color tokens

Neutral scale + one confident accent + semantic colors. All pairs must meet
WCAG AA (4.5:1 body text, 3:1 large text/UI).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-bg` | `#fafafa` | `#101214` | page background |
| `--color-surface` | `#ffffff` | `#16191d` | cards, panels |
| `--color-surface-raised` | `#ffffff` | `#1d2126` | modals, popovers, hover-lift |
| `--color-border` | `#e4e7eb` | `#2a2f36` | hairlines, dividers |
| `--color-text` | `#17191c` | `#e8eaed` | primary text |
| `--color-text-muted` | `#5c6470` | `#9aa3ad` | secondary text |
| `--color-accent` | `#1793d1` → hover `#0f7fb8` | `#31a8e0` → hover `#5cbce8` | links, primary buttons, focus |
| `--color-accent-contrast` | `#ffffff` | `#0b1014` | text on accent |
| `--color-success` | `#1a7f37` | `#3fb950` | verified checksum, active status |
| `--color-warning` | `#9a6700` | `#d29922` | EOL-soon, untranslated badge |
| `--color-danger` | `#cf222e` | `#f85149` | broken mirror, errors, discontinued |
| `--color-accent-soft` | `#e8f4fb` | `#12303f` | tinted chips/backgrounds |

Accent is a Linux-blue family (distinct from Flathub's blue-gray and
Modrinth's green). Stitch may fine-tune hues; the final values approved in
Figma get written back here (same-change rule).

## Typography

| Token | Value |
|---|---|
| `--font-sans` | `"Inter", "Noto Sans", system-ui, sans-serif` (Noto fallbacks cover CJK/Arabic/Indic) |
| `--font-mono` | `"JetBrains Mono", ui-monospace, monospace` (checksums, terminal snippets) |
| `--text-xs` | 0.75rem / lh 1.4 |
| `--text-sm` | 0.875rem / lh 1.5 |
| `--text-base` | 1rem / lh 1.6 |
| `--text-lg` | 1.125rem / lh 1.5 |
| `--text-xl` | 1.375rem / lh 1.4 |
| `--text-2xl` | 1.75rem / lh 1.3 |
| `--text-3xl` | 2.25rem / lh 1.2 |
| `--text-4xl` | 3rem / lh 1.1 (hero only) |

Weights: 400 body, 500 UI labels, 600 headings, 700 hero. Never justify text;
RTL mirrors alignment automatically (logical properties only).

## Spacing, radius, elevation

4px base grid: `--space-1` 4px, `-2` 8px, `-3` 12px, `-4` 16px, `-5` 24px,
`-6` 32px, `-7` 48px, `-8` 64px.

| Radius | Value | Use |
|---|---|---|
| `--radius-sm` | 6px | chips, inputs |
| `--radius-md` | 10px | buttons, small cards |
| `--radius-lg` | 16px | distro cards, panels (Flathub-soft) |
| `--radius-full` | 9999px | pills, avatars |

Elevation (dark mode uses lighter surface + subtle border instead of heavy shadow):

| Token | Light |
|---|---|
| `--shadow-1` | `0 1px 2px rgb(0 0 0 / .06)` — resting card |
| `--shadow-2` | `0 4px 12px rgb(0 0 0 / .08)` — hover lift |
| `--shadow-3` | `0 12px 32px rgb(0 0 0 / .14)` — modal/popover |

## Motion

Blend Flathub's calm with Modrinth's liveliness. **Always honor
`prefers-reduced-motion: reduce`** — disable all non-essential motion.

| Token | Value | Use |
|---|---|---|
| `--motion-fast` | 120ms, ease-out | hover states, toggles |
| `--motion-base` | 200ms, ease-out | card lift, dropdowns, tab switches |
| `--motion-slow` | 320ms, cubic-bezier(.22,1,.36,1) | route transitions, modals |
| `--motion-spring` | spring(1, 80, 12) equivalent | button press, favorite toggle |

Patterns: subtle page/route cross-fade + 8px slide; card hover = translateY(-2px)
+ `--shadow-2`; skeleton loaders (never spinners for content areas); staggered
grid reveal (30ms/card, first 12 cards only); download-selector steps slide
horizontally.

## Breakpoints

| Name | Min width | Grid |
|---|---|---|
| mobile | 0 | 1-col cards, bottom-sheet filters, hamburger nav |
| tablet | 640px | 2-col cards, collapsible filter rail |
| desktop | 1024px | 3-col cards + persistent filter rail |
| wide | 1440px | 4-col cards, max content width 1320px centered |

## Iconography & imagery

- Site icons: `icons/light.svg` / `icons/dark.svg` (theme-switched).
- UI glyphs: single consistent SVG icon set, 1.5px stroke, 20/24px grid.
- Distro logos: real official brand SVGs from `assets/distros/<slug>.svg`,
  rendered on neutral surface, never recolored or distorted (see `.ai/data-sources.md`).
- Screenshots: 16:10 cards, lazy-loaded, LQIP blur placeholder.

## Component inventory

Shell: `AppHeader` (logo, nav, search trigger, language switcher, theme toggle),
`AppFooter`, `MobileNav` (bottom sheet), `CommandPalette` (⌘K search),
`LocaleSwitcher`, `ThemeToggle`.

Browse: `DistroCard` (logo, name, summary, family badge, download count),
`CardGrid` (responsive + stagger reveal), `FilterRail` / `FilterSheet`,
`FacetChip`, `SortSelect`, `SearchInput` (+ autocomplete listbox), `Pagination`.

Distro detail: `DistroHero` (logo, name, family, badges, quick actions),
`ContentTabs` (description/install/usage MDX), `DownloadPanel`,
`DownloadSelector` (stepper: version → edition → arch → format → mirror),
`ChecksumBlock` (mono, copy button), `ScreenshotGallery`, `RequirementsTable`,
`RelatedDistros`, `RankSparkline`, `ReleaseTimeline`.

Rankings/discovery: `RankingList` (numbered rows, movement arrows),
`TrendBadge`, `HallOfFameCard` (editorial, rationale), `CompareTable`,
`QuizStepper`, `RandomButton`.

Feedback/system: `Badge`, `Button` (primary/secondary/ghost/danger), `Chip`,
`Tabs`, `Modal`, `Tooltip`, `Toast`, `SkeletonCard`/`SkeletonRow`,
`EmptyState`, `ErrorState`, `CaptchaGate` (hCaptcha wrapper), `CopyButton`.

Every screen composes **only** these components; new components require an
update to this inventory first (see `.ai/component-rules.md`).

## States (every screen must design these)

Loading (skeletons), empty (friendly EmptyState + suggested action), error
(ErrorState + retry), offline-tolerant where cheap. Untranslated content shows
a `warning` badge ("English fallback").

## Accessibility baseline

Keyboard-complete, visible focus ring (2px accent, 2px offset), WCAG AA
contrast, touch targets ≥44px, RTL-mirrored layouts (`ar`, `he`, `fa`, `ckb`),
reduced-motion variant of every animation, axe-clean.

## References for Stitch

- Flathub: home page hierarchy, app grid, category rows, calm detail page.
- Modrinth: version/file table density, download flow, hover feedback,
  dark theme balance, badge language.
- This doc + the per-screen brief in `prompts/stitch/` = complete input.
  Stitch must not invent new tokens, components, APIs, or data.
