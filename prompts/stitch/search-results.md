# Stitch Brief — Search Results (+ autocomplete & command palette)

*(Use together with `_foundation.md`.)*

## Purpose
Fast fuzzy search over names/aliases/summaries across locales. Three
surfaces share one visual language: inline autocomplete (under any
SearchInput), the full results page, and the keyboard **CommandPalette** (⌘K).

## Layout
**Autocomplete dropdown** (under SearchInput): surface-raised, radius 10,
modal shadow; up to 10 rows — logo 24px, name with **matched substring
bolded**, family Badge; footer row "Search for 'ubu' →" going to the full
page. Keyboard: ↑↓ + Enter.

**Results page:** header "12 results for 'arch'" (lg/600) + SearchInput
(pre-filled, focused); slim FacetChip row (category/family/desktop quick
filters — not the full rail); results as **list rows** (not cards): logo
40px, name (base/600) with match highlight, one-line summary (sm muted,
highlight there too), family Badge + downloads right-aligned. Desktop rows
max-width ~800px centered. Pagination below.

**CommandPalette (⌘K):** centered overlay 560px, top-anchored at ~20vh;
input on top, results identical anatomy to autocomplete; footer hint bar
(↑↓ navigate · ↵ open · esc close). Scrim blurs page slightly.

## Components
SearchInput, CommandPalette, FacetChip, Badge, Pagination, SkeletonRow,
EmptyState, ErrorState.

## Content & states
- Loading: 5 SkeletonRows (page); palette shows a subtle inline pulse.
- Empty: EmptyState "No matches for 'xyz'" + suggestions: check spelling,
  browse Explore, suggest this distro (link to Contribute).
- Error: ErrorState with retry (page); palette shows a compact inline error.

## Interaction & motion
Dropdown fades+drops 4px (fast); highlight follows arrow keys; palette
opens with slow fade+scale-from-98%; result rows have no lift — selection
is a full-row accent-soft highlight. Reduced motion: fades only.

## Accessibility
Combobox pattern: aria-expanded, aria-activedescendant, results as a
listbox; result count announced politely. Palette traps focus, Esc closes,
restores focus to the trigger. Highlighted match uses bold, not color alone.

## Reference
Modrinth search-as-you-type responsiveness; Raycast/Linear-style palette
restraint, kept in Flathub calm.
