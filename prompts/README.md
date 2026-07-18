# prompts/

AI prompts used by the project.

## `stitch/` — Google Stitch design briefs (Phase 2 output)

Per-screen briefs derived from `.ai/design-system.md`. Each brief states:
purpose, layout per breakpoint, tokens, components to reuse, content/states
(loading/empty/error), interaction + motion, accessibility + reduced-motion
requirements, and the Flathub/Modrinth reference.

**How to use (the human runs Stitch):**

1. In [Google Stitch](https://stitch.withgoogle.com), start a Linuxhub project.
2. For each screen, paste **`_foundation.md` first, then the screen brief**
   into the same prompt — briefs assume the foundation's tokens/components.
3. Generate per breakpoint noted in the brief (mobile + desktop minimum),
   in **both light and dark themes**; iterate with follow-up prompts until it
   matches the brief. Stitch designs layout/visuals/motion only — never
   accept architecture, API, or data-model inventions.
4. Review against `.ai/design-system.md`, export to Figma, and mark the
   design **approved**. Only then does frontend implementation (Phase 4)
   begin. Token values changed during design review must be written back to
   `.ai/design-system.md` + `packages/ui` in the same change.

Suggested order: `global-nav` → `mobile-nav` → `explore` → `distro-detail`
→ `download-selector` → `home` → the rest (search-results, rankings,
category-tag, compare, quiz, hall-of-fame, contribute, about, error-404).
The first five establish the shared components everything else reuses.
