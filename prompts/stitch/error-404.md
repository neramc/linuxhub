# Stitch Brief — 404 / Error Page

*(Use together with `_foundation.md`.)*

## Purpose
Dead ends that keep people in the product. Two variants sharing one layout:
**404** (not found — light, a touch witty) and **500** (something broke —
apologetic, steady). Terminal-flavored humor is on-brand if restrained.

## Layout
Centered composition (max 480px), vertically centered in the viewport minus
header/footer:
1. Small monospace flourish (xs, muted): 404 → `$ linuxhub: page not found`,
   500 → `$ linuxhub: unexpected error` — a single quiet mono line, not a
   fake terminal window.
2. Big "404" / "500" numerals (4xl/700, low-contrast tint — decorative).
3. Headline (xl/600): 404 "This page drifted out of the repo." /
   500 "Something broke on our side."
4. One supporting line (base muted): 404 offers help; 500 says it's logged +
   shows an opaque request id in mono (with CopyButton) for reporting.
5. Actions: primary Button "Back to home"; 404 adds a **SearchInput**
   ("Looking for a distro?") and a **RandomButton** ("Surprise me") — the
   playful escape hatch; 500 adds ghost "Try again".
6. AppHeader + AppFooter render normally around it.

## Components
Button, RandomButton, SearchInput, CopyButton, AppHeader, AppFooter.

## Content & states
This page *is* the error state. Design both variants in both themes. The
500 variant must not depend on any data loading (it renders when everything
else failed).

## Interaction & motion
Numerals settle with one slow fade+rise on entry; RandomButton has the
springiest press in the product (small dice-roll wiggle). Reduced motion:
static entry, no wiggle.

## Accessibility
Headline is the h1 and receives focus on navigation so the error is
announced; request id is selectable text with a labeled copy button; humor
never replaces the plain statement of what happened.

## Reference
Modrinth's playful-but-tidy error tone; keep Flathub calm — one flourish
maximum.
