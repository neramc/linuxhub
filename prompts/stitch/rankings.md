# Stitch Brief — Rankings

*(Use together with `_foundation.md`.)*

## Purpose
Popularity standings over week / month / year / all-time, plus Trending and
Rising movers. Data-dense but scannable; movement is the story.

## Layout
1. Page header: title (2xl/600), one-line explanation of methodology (sm
   muted, "based on views, downloads and release activity") linking to About.
2. **Period Tabs** — Week · Month · Year · All time; secondary toggle chips
   for view: "Top" (default) · "Trending" · "Rising".
3. **RankingList** — numbered rows on surface cards (radius 10, tight 12px
   vertical padding): rank number (xl/600, fixed width), logo 32px, name
   (base/500) + family Badge, **RankSparkline** (12-week mini line), score
   (muted), **TrendBadge** with movement (▲3 success / ▼2 danger / — muted).
   Top 3 rows get subtly larger numbers + accent-soft tint — celebratory but
   calm, no podium kitsch.
4. Right rail (desktop only): "Biggest movers this period" compact list +
   link to Hall of Fame.
5. Optional filter: category SortSelect ("All categories") above the list.

Mobile: single column; sparkline hides below 400px width; rail content moves
below the list. Rows stay one-line — truncate names.

## Components
Tabs, Chip, RankingList, TrendBadge, RankSparkline, Badge, SortSelect,
SkeletonRow, EmptyState, ErrorState, Pagination.

## Content & states
- Loading: 10 SkeletonRows preserving the row anatomy.
- Empty (young periods with no data): EmptyState "Not enough data yet —
  check back soon."
- Error: ErrorState with retry replacing the list.

## Interaction & motion
Period switch cross-fades rows (base) with rank numbers counting to their
new values (fast, tabular figures); movement badges pop in with a small
spring; row hover raises surface slightly and reveals a "view distro →"
affordance. Reduced motion: static swap, no counting.

## Accessibility
The list is a real ordered list. Movement is conveyed by text ("+3") not
color alone. Tabs follow the ARIA pattern. Sparklines are decorative
(aria-hidden) with score text carrying the data.

## Reference
Modrinth's project stat rows for density; Flathub's restraint for keeping a
leaderboard calm rather than gamified.
