# Stitch Brief — Category / Tag Page

*(Use together with `_foundation.md`.)*

## Purpose
Landing page for one taxonomy node — a category (e.g. "For beginners",
"Server", "Gaming") or a tag (e.g. "rolling-release", "immutable") — showing
its distros with the same grid language as Explore. One design serves both;
tags render a slightly plainer header.

## Layout
1. **Taxonomy header** — accent-soft tinted band (subtle): category icon
   (24px stroke glyph), name (2xl/600), description (base muted, max 60ch),
   count Chip ("38 distros"). Tag variant: no icon, "#tag-name" styling on a
   plain background.
2. **Sibling rail** — horizontal Chip scroller of other categories/tags for
   lateral discovery (current one highlighted, accent-soft).
3. **CardGrid** of DistroCards — identical to Explore (3-col desktop, 2 tablet,
   1 mobile) with SortSelect (popularity default) and Pagination. No full
   FilterRail here — a single "Refine in Explore →" ghost Button links to
   Explore with this facet pre-applied.

## Components
Chip, Badge, CardGrid, DistroCard, SortSelect, Pagination, Button,
SkeletonCard, EmptyState, ErrorState.

## Content & states
- Loading: header instant (from route), grid SkeletonCards.
- Empty (tag with no distros): EmptyState "Nothing tagged yet" + button to
  Explore.
- Error: grid ErrorState with retry; header and sibling rail stay.

## Interaction & motion
Grid stagger-reveal (30ms/card, cap 12); sibling chips scroll with snap and
edge-fade hints; card hover lift. Reduced motion: fades only.

## Accessibility
Header is the h1; sibling rail is a labeled nav, keyboard-scrollable with
visible focus; the tinted band keeps AA contrast for description text.

## Reference
Flathub category pages (tinted headers, same-grid consistency); Modrinth tag
chips for the sibling rail.
