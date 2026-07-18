# Stitch Brief — Hall of Fame

*(Use together with `_foundation.md`.)*

## Purpose
An editorial, museum-like page honoring historically significant distros
(e.g. Slackware, Debian, Red Hat Linux, Mandrake). Distinct mood from
rankings: timeless, curated, story-driven — not a leaderboard.

## Layout
1. Header: title (3xl/700) + short curatorial intro paragraph (lg, muted,
   max 60ch) explaining inclusion criteria and that rationales cite sources.
2. **HallOfFameCard** grid (desktop 2-col, wide 3-col, mobile 1-col) —
   larger than DistroCard: logo 64px, name (xl/600), era line (sm muted,
   "1993 — present"), 2–3 sentence rationale (base), "why it matters"
   citations as small footnote links, status Badge if discontinued.
   Optional slim "inducted 2026" caption. Cards feel like plaques: extra
   padding (24), 16 radius, hairline border, minimal shadow.
3. Ordering is editorial (no numbers, no scores). A quiet timeline strip at
   top (decade markers) may anchor the era context — optional, keep subtle.
4. Footer band: link to Rankings ("Looking for what's popular now?").

## Components
HallOfFameCard, Badge, Chip, SkeletonCard, EmptyState, ErrorState, Button.

## Content & states
- Loading: 4 large SkeletonCards.
- Empty: not expected in production; still design the EmptyState
  ("Curation in progress").
- Error: full-width ErrorState with retry.

## Interaction & motion
Cards reveal with a slow, dignified fade+rise stagger on scroll into view;
hover is a border-color deepen + minimal lift (less playful than elsewhere —
this page is reverent). Citation footnotes open in tooltips on hover/focus.
Reduced motion: fade only.

## Accessibility
Each card is an article with a heading; citations are real links with
descriptive text. Timeline strip (if used) is decorative and aria-hidden.
AA contrast on all muted era text.

## Reference
Flathub's calm editorial tone pushed further toward a museum plaque
aesthetic; typography-led, restrained color.
