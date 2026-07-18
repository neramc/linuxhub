# Stitch Brief — Explore / Browse (grid + filters)

*(Use together with `_foundation.md`.)*

## Purpose
The main catalog: a Flathub-style card grid with powerful but unintimidating
facet filtering and sorting. Users skim dozens of distros fast and narrow
with facets.

## Layout
- **Desktop 1024+:** persistent left **FilterRail** (260px) + **CardGrid**
  (3-col; 4-col at wide 1440+). Above the grid: result count ("312 distros"),
  active FacetChips (dismissible), and **SortSelect** (popularity / name /
  latest release / newest) right-aligned.
- **Tablet 640+:** collapsible FilterRail (toggle button with active-filter
  count badge); 2-col grid.
- **Mobile:** "Filters" button opens **FilterSheet** (bottom sheet, ~85vh,
  drag handle, sticky "Show 41 results" apply button); 1-col grid.

**FilterRail facets** (collapsible groups, checkboxes with counts):
Category, Tag, Family (Debian/Arch/RPM/SUSE/independent…), Desktop
environment, Architecture, Based on, Status (active/discontinued).

**DistroCard** (the canonical card — designed once, reused everywhere):
logo (48px, neutral surface), name (lg/600), one-line summary (sm, muted,
truncated), footer row: family Badge + download count (xs muted). 16px
radius, resting shadow, hover lift.

Pagination: numbered **Pagination** at the grid bottom (page/limit model).

## Components
FilterRail, FilterSheet, FacetChip, SortSelect, CardGrid, DistroCard, Badge,
Pagination, SkeletonCard, EmptyState, ErrorState, Button.

## Content & states
- Loading: grid of 12 SkeletonCards; rail renders instantly.
- Empty (no matches): EmptyState — friendly illustration-light message
  ("No distros match these filters"), button clearing all facets.
- Error: ErrorState with retry replacing the grid only; rail stays usable.
- Filters reflect in chips immediately; count updates live.

## Interaction & motion
Grid stagger-reveal on load and on filter change (30ms/card, cap 12);
checkbox → chip appears with a fast fade+scale; card hover lift (base);
sheet slides up (slow easing) with scrim fade. Reduced motion: instant
swaps, fade-only sheet.

## Accessibility
Rail is a labeled `filters` region; groups are expandable buttons with
aria-expanded; result-count updates announced politely. Sheet traps focus,
Esc closes, returns focus to the Filters button. Grid is a list semantically;
cards are single links.

## Reference
Flathub app grid + category filtering for calm density; Modrinth search page
for facet-chip behavior and result-count feedback.
