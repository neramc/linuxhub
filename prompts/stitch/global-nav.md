# Stitch Brief — Global Nav (AppHeader + language switcher + footer)

*(Use together with `_foundation.md`.)*

## Purpose
The persistent shell on every screen: AppHeader (wordmark, primary nav,
search, locale, theme), and AppFooter. Must scale from `en` to `ta` and
mirror perfectly in RTL. This brief defines the desktop/tablet header;
the mobile drawer is in `mobile-nav.md`.

## Layout — AppHeader (64px, sticky)
Left → right (mirrors in RTL):
1. **Wordmark** — Linuxhub mark (theme-swapped light/dark SVG) + name
   (lg/600); links home.
2. **Primary nav** — Explore · Rankings · Hall of Fame · Compare · Quiz
   (base/500, muted → text on hover, active = text + 2px accent underline).
   At tablet width, overflow items collapse into a "More ▾" menu.
3. Spacer.
4. **Search trigger** — input-shaped button (240px desktop: magnifier +
   "Search distros…" + `⌘K` kbd chip; icon-only at tablet) opening the
   CommandPalette.
5. **LocaleSwitcher** — globe icon + current code ("KO"). Opens a popover
   (surface-raised, radius 10, max-height ~60vh): search field on top, then
   locales as **native labels** ("한국어", "العربية") with BCP-47 code muted;
   current one checked; RTL locales render their label RTL in the list.
   Footnote: "Missing your language? Help translate ↗".
6. **ThemeToggle** — icon button (sun/moon morph), tooltip.

Default: solid surface + hairline bottom border; on Home it starts
transparent over the hero and gains surface + border after ~64px scroll.

## Layout — AppFooter
Muted, 3-column desktop (1-col mobile): ① wordmark + one-liner + theme
credit; ② link columns (Explore, Rankings, About, Contribute, API/feeds:
RSS · Atom · badges); ③ LocaleSwitcher (compact) + "data from official
sources" note. Hairline top border, xs/sm muted text.

## Components
AppHeader, AppFooter, LocaleSwitcher, ThemeToggle, CommandPalette (trigger),
Tooltip, Badge, Chip.

## Content & states
- Locale popover loading: instant (bundled) — but design the searched-empty
  state ("No matching language").
- Active-route state for every nav item; keyboard focus state distinct from
  hover.
- Design LTR and RTL versions of the full header, both themes.

## Interaction & motion
Popovers fade+drop 4px (fast); theme toggle cross-morphs sun/moon (base) and
the page theme cross-fades (slow); nav underline slides between items
(base). Reduced motion: instant swaps, no underline slide.

## Accessibility
Skip-link ("Skip to content") appears on first Tab before the wordmark.
Nav is a labeled landmark; popovers trap focus and close on Esc;
LocaleSwitcher is a listbox with typeahead; locale change announces itself.
The ⌘K hint has a visible-text equivalent for non-keyboard users.

## Reference
Flathub's header restraint; Modrinth's search-forward header behavior;
Wikipedia-grade language switcher ergonomics (native labels, searchable).
