# Stitch Brief — Mobile Nav

*(Use together with `_foundation.md`.)*

## Purpose
The <640px navigation shell: compact header + slide-in drawer + the
bottom-sheet pattern reused by filters and the download selector. One-hand
reachability first.

## Layout
**Compact AppHeader (56px, sticky):** hamburger (44px target) · centered
wordmark · search icon (opens full-screen search overlay, see below).

**Drawer (MobileNav):** slides from the start edge (left LTR / right RTL),
~85% width, max 360px, surface background, scrim over content:
1. Header row: wordmark + close ×.
2. Primary links (lg/500, 48px rows): Explore · Rankings · Hall of Fame ·
   Compare · Quiz · About · Contribute; active item = accent-soft pill.
3. Divider.
4. **Utility row:** ThemeToggle (labeled "Theme") and LocaleSwitcher row
   ("Language · 한국어 ▾") opening the locale list as a nested sheet with
   search — same anatomy as the desktop popover, full-height.
5. Footer (xs muted): RSS · GitHub · "data from official sources".

**Full-screen search overlay:** input pinned top with cancel; results list
identical to search autocomplete anatomy; recent searches beneath when empty.

**Bottom sheet (shared pattern):** drag handle, rounded top (16), sticky
action button, ~85vh max with internal scroll — Stitch designs it once here;
filters and the download selector reuse it.

## Components
MobileNav, AppHeader (compact), LocaleSwitcher (sheet variant), ThemeToggle,
SearchInput, FilterSheet (pattern), Badge, Chip, Button.

## Content & states
- Drawer opens instantly (no loading state).
- Search overlay: skeleton rows while querying; empty state with recent
  searches; inline error with retry.
- Design LTR + RTL drawer (edge swaps) and both themes.

## Interaction & motion
Drawer slides in (slow easing) with scrim fade; nested locale sheet pushes
over it (base); sheet dismisses by handle-drag or scrim tap with a soft
spring settle; search overlay fades up (base). Reduced motion: fades only,
no slides/springs.

## Accessibility
Drawer and sheets trap focus, Esc/back closes, focus returns to the opener;
hamburger has aria-expanded + label; drag-dismiss always has a visible
close/cancel equivalent; 44px minimum targets throughout; scrim tap targets
don't overlap content controls.

## Reference
Flathub mobile drawer simplicity; Modrinth mobile filter sheet for the
bottom-sheet mechanics.
