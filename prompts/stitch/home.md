# Stitch Brief — Home / Landing

*(Use together with `_foundation.md`.)*

## Purpose
First impression + fastest paths in: search, explore, and "help me choose".
Communicates scale (hundreds of distros, all mirrors, every language) without
clutter. Flathub-calm hero; Modrinth-lively rows underneath.

## Layout
1. **AppHeader** (see global-nav brief) — transparent over hero, solid on scroll.
2. **Hero** — 4xl headline ("Every Linux, one place" tone), one-line
   subhead (muted), and a large centered **SearchInput** (pill, prominent,
   with keyboard-shortcut hint "⌘K"). Below: three quiet stat chips
   (distros · downloads served · languages). No background illustration
   heavier than a subtle tint/gradient of accent-soft.
3. **Featured rows** (Flathub-style horizontal sections, each with title +
   "See all →" link): "Trending this week" (DistroCard row + TrendBadge),
   "Recently released" (compact cards with version + date), "Categories"
   (grid of category tiles with icon + count).
4. **"Not sure where to start?"** band — accent-soft background, short copy,
   two Buttons: primary → distro-finder quiz, secondary → Explore.
5. **Hall of Fame teaser** — 3 HallOfFameCards, link to full page.
6. **AppFooter**.

Breakpoints: mobile stacks everything 1-col, rows become horizontal snap
scroll; tablet 2-col category tiles; desktop full rows (4 cards visible);
wide max-width 1320 centered.

## Components
AppHeader, SearchInput, DistroCard, TrendBadge, HallOfFameCard, Button,
Chip, CardGrid (row variant), SkeletonCard, AppFooter.

## Content & states
- Loading: skeleton hero stats + SkeletonCard rows (no spinners).
- Empty (a row has no data): hide the row entirely — never an empty rail.
- Error (rows fail): quiet inline ErrorState per row with retry; hero +
  search always render.

## Interaction & motion
Hero search focuses with a soft glow (fast); rows stagger-reveal on scroll
into view (30ms/card, first 12); card hover lift; "See all" arrow nudges 2px
on hover. Reduced motion: fades only, no slides/stagger.

## Accessibility
Search is the first tab stop after skip-link + header. Rows are labeled
regions with headings. Horizontal scrollers keyboard-navigable with visible
focus. AA contrast over the hero tint.

## Reference
Flathub home (calm hero + curated rows) for structure; Modrinth home for the
lively trending row + badge language.
