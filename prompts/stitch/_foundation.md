# Linuxhub Design Foundation (paste this before every screen brief)

You are designing **Linuxhub** — a modern, fast, multilingual catalog for
browsing almost every Linux distribution, with a guided download experience.
Think "Flathub meets Modrinth": Flathub's calm, spacious, content-first
browsing combined with Modrinth's playful micro-interactions, dense-but-legible
data views, and confident accent color.

**Your scope:** layout, responsive behavior, component layout, visual
hierarchy, interaction and motion design. **Do not** invent app architecture,
APIs, data structures, or new features — design exactly the screens and states
each brief describes, using only the tokens and components below.

## Design language

Modern, spacious, card-based. Neutral calm shell; distro brand logos provide
the color inside cards. Confident Linux-blue accent. Generous whitespace,
soft large radii, quiet borders. Dark and light themes are equal citizens —
design both for every screen.

## Color tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| bg | `#fafafa` | `#101214` | page background |
| surface | `#ffffff` | `#16191d` | cards, panels |
| surface-raised | `#ffffff` | `#1d2126` | modals, popovers, hover-lift |
| border | `#e4e7eb` | `#2a2f36` | hairlines, dividers |
| text | `#17191c` | `#e8eaed` | primary text |
| text-muted | `#5c6470` | `#9aa3ad` | secondary text |
| accent | `#1793d1` (hover `#0f7fb8`) | `#31a8e0` (hover `#5cbce8`) | links, primary buttons, focus |
| accent-contrast | `#ffffff` | `#0b1014` | text on accent |
| accent-soft | `#e8f4fb` | `#12303f` | tinted chips/backgrounds |
| success | `#1a7f37` | `#3fb950` | verified checksum, active status |
| warning | `#9a6700` | `#d29922` | EOL-soon, untranslated badge |
| danger | `#cf222e` | `#f85149` | broken mirror, errors, discontinued |

All text/background pairs must meet WCAG AA (4.5:1 body, 3:1 large/UI).

## Typography

Inter (falling back to Noto Sans for CJK/Arabic/Indic); JetBrains Mono for
checksums/terminal snippets. Scale: xs 12px/1.4 · sm 14px/1.5 · base 16px/1.6
· lg 18px/1.5 · xl 22px/1.4 · 2xl 28px/1.3 · 3xl 36px/1.2 · 4xl 48px/1.1
(hero only). Weights: 400 body, 500 UI labels, 600 headings, 700 hero.
Never justify text.

## Spacing, radius, elevation

4px grid: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64. Radii: 6px chips+inputs,
10px buttons+small cards, 16px distro cards+panels, pill 9999px.
Shadows (light): resting `0 1px 2px rgb(0 0 0 / .06)`, hover
`0 4px 12px rgb(0 0 0 / .08)`, modal `0 12px 32px rgb(0 0 0 / .14)`.
Dark mode uses lighter raised surfaces + subtle borders instead of heavy shadow.

## Motion

Fast 120ms ease-out (hovers, toggles) · base 200ms ease-out (card lift,
dropdowns, tabs) · slow 320ms cubic-bezier(.22,1,.36,1) (route transitions,
modals) · springy press feedback on buttons/toggles. Patterns: route
cross-fade + 8px slide; card hover = 2px lift + hover shadow; skeleton loaders
(never spinners for content); staggered grid reveal (30ms/card, first 12);
selector steps slide horizontally. **Always honor reduced-motion: every
animation has a no-motion variant.**

## Breakpoints

mobile 0+ (1-col cards, bottom-sheet filters, hamburger) · tablet 640+
(2-col, collapsible filter rail) · desktop 1024+ (3-col + persistent filter
rail) · wide 1440+ (4-col, content max-width 1320px centered).

## Components (use these names as layer/frame names so they map to code)

AppHeader, AppFooter, MobileNav, CommandPalette, LocaleSwitcher, ThemeToggle,
DistroCard, CardGrid, FilterRail, FilterSheet, FacetChip, SortSelect,
SearchInput, Pagination, DistroHero, ContentTabs, DownloadPanel,
DownloadSelector, ChecksumBlock, ScreenshotGallery, RequirementsTable,
RelatedDistros, RankSparkline, ReleaseTimeline, RankingList, TrendBadge,
HallOfFameCard, CompareTable, QuizStepper, RandomButton, Badge, Button
(primary/secondary/ghost/danger), Chip, Tabs, Modal, Tooltip, Toast,
SkeletonCard, SkeletonRow, EmptyState, ErrorState, CaptchaGate, CopyButton.

Reuse these across screens — never design two different treatments for the
same component.

## Global rules

- Every screen: design **loading (skeleton), empty, and error** states.
- Keyboard-visible focus ring: 2px accent, 2px offset, on every interactive
  element.
- Touch targets ≥44px. Icons: single consistent set, 1.5px stroke, 20/24px.
- The UI ships in ~57 languages including RTL (Arabic, Hebrew, Farsi, Central
  Kurdish): layouts must mirror cleanly — avoid direction-baked compositions;
  leave room for longer strings (German, Tamil).
- Distro logos are official brand SVGs on neutral surfaces — never recolored,
  distorted, or cropped.
- Sample distro content for mocks: Ubuntu, Fedora, Arch Linux, Debian, Linux
  Mint, openSUSE, Manjaro, Pop!_OS, EndeavourOS, Zorin OS, NixOS, elementary OS.
