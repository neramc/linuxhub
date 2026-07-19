# design/ — High-fidelity design comps (ADR-0012)

The **design source of truth** for Linuxhub, replacing the Stitch/Figma stage.
Built strictly from `packages/ui` design tokens (`design.css` imports
`tokens.css` directly) against the per-screen briefs in `prompts/stitch/`.

## How to review

Open `design/index.html` in a browser (no server needed), or any screen in
`design/screens/` directly. Every page:

- **Light/dark** — toggle with the floating button in the bottom corner
  (or append `?dark` / `?light` to the URL).
- **Responsive** — resize the window; mobile → wide breakpoints are live.
- **RTL** — toggle with the second floating button (or `?rtl`). Layouts
  mirror via logical CSS properties.
- **States** — each screen ends with a framed "Design spec — states"
  annex showing loading / empty / error, plus screen-specific notes.
- The floating review buttons are **not part of the design** (`?bare`
  hides them).

## What's a placeholder

- **Distro logos** render as neutral initial-tiles tinted with each brand's
  hue. Production uses official SVGs from `assets/distros/` with attribution
  (`.ai/data-sources.md`) — never bundled here to respect trademarks.
- **Screenshots** are gradient placeholders at the real 16:10 ratio.
- **Fonts** fall back to your system sans; production self-hosts Inter
  (with Noto fallbacks) per `.ai/design-system.md`.
- Motion specs (durations, easing, reduced-motion behavior) are written in
  each screen's annex/notes; comps only carry the CSS-cheap transitions.

## Approval

Review all 15 screens in both themes plus mobile width and RTL. When
satisfied, tell Claude Code the design is **approved** — Phase 4
implementation then follows these comps exactly. Change requests before or
after approval: the comp is updated and re-approved first, never redesigned
silently in code (CLAUDE.md).

## Files

```
design/
├─ index.html          # gallery of all screens
├─ shared/design.css   # component styles on top of packages/ui tokens
├─ shared/mock.js      # injected header/footer/drawer + review controls
└─ screens/*.html      # 15 screen comps (one per stitch brief)
```
