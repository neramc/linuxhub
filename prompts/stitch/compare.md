# Stitch Brief — Compare

*(Use together with `_foundation.md`.)*

## Purpose
Side-by-side comparison of 2–4 distros (family, release model, desktop
options, architectures, requirements, popularity). Decision-support: the
differences should pop, the sameness should recede.

## Layout
1. **Picker bar** — 2–4 slots as cards: filled slot = logo + name + remove ×;
   empty slot = dashed-border "Add a distro" opening an inline SearchInput
   dropdown (same anatomy as search autocomplete). Sticky on scroll
   (condensed to logos when stuck).
2. **CompareTable** — first column: attribute labels (500 weight); one
   column per distro (equal width, min 200px). Row groups with subheads:
   Overview (family, based on, status, first release) · Release model
   (channel, cadence, latest version + date) · Desktops offered (glyph
   chips) · Architectures (pills) · System requirements (min/rec) ·
   Popularity (rank + RankSparkline + downloads).
   **Difference emphasis:** cells whose value differs from the row's others
   get accent-soft background; identical rows render muted. A "differences
   only" toggle Chip above the table hides identical rows.
3. Row hover highlights the full row across columns. Table scrolls
   horizontally inside its own container on overflow (never the page).
4. **Mobile:** columns become swipeable panes with a sticky attribute
   label column (first column pinned); or stacked per-attribute rows at
   <400px — design the pinned-column pattern as primary.
5. Footer: "Download" primary Button per column + link to each detail page.

## Components
CompareTable, SearchInput, Chip, Badge, Button, RankSparkline, SkeletonRow,
EmptyState, ErrorState, Tooltip.

## Content & states
- Loading: table skeleton preserving column count.
- Empty (0–1 slots filled): friendly EmptyState explaining "pick at least
  two" with popular pairing suggestions (Ubuntu vs Fedora, Arch vs Debian).
- Error: per-column ErrorState (one distro failing doesn't kill the table).

## Interaction & motion
Adding a distro animates its column in with a base slide+fade; removing
collapses it; the differences toggle cross-fades rows. Reduced motion:
instant column swaps.

## Accessibility
Real table semantics with row/column headers; difference highlighting is
paired with a dot marker (not color alone); picker slots are buttons with
clear labels; horizontal scroll region is keyboard-operable and announced.
RTL mirrors column order.

## Reference
Modrinth's version-comparison density; classic spec-sheet tables done with
Flathub's whitespace and calm borders.
