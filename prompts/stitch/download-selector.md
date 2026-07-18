# Stitch Brief — Download Selector (modal)

*(Use together with `_foundation.md`.)*

## Purpose
The signature interaction: a guided, Modrinth-style stepper that resolves
Version → Edition → Architecture → File format → Mirror into a direct
download with checksum and verify instructions — all inside one modal.

## Layout
**Modal** on surface-raised, radius 16, modal shadow; max-width 560px
desktop; full-screen sheet on mobile. Header: distro logo (24px) + "Download
Fedora" (xl/600) + close. Below: **step indicator** — 5 small dots/labels
(Version · Edition · Arch · Format · Mirror) with done/current/todo states.

**Steps (one visible at a time):**
1. **Version/channel** — radio cards: version number (lg/600) + channel Badge
   (stable/LTS/beta/rolling) + release date (muted). Latest stable preselected.
2. **Edition** — radio cards with tiny desktop-environment glyphs (GNOME,
   KDE, Xfce, minimal, server…).
3. **Architecture** — compact radio pills (x86_64 preselected, aarch64,
   riscv64…).
4. **File format** — radio rows with file size right-aligned: .iso ·
   .iso.torrent · magnet · checksum · signature.
5. **Mirror** — list sorted nearest-first (country flag + mirror name +
   sponsor muted + health dot success/danger); "auto (nearest)" default on top.

**Result panel** (replaces steps after resolve): big primary Button
"Download • 2.1 GB", **ChecksumBlock** (sha256 in mono + CopyButton +
"verify how?" expandable instructions), mirror + sponsor line, secondary
links (torrent, signature). Footer note: "Selection remembered for next time."

Steps auto-advance on selection; back via step dots or back arrow.
Single-option steps are skipped automatically but shown as done.

## Components
Modal, DownloadSelector, Badge, Button, Chip, ChecksumBlock, CopyButton,
Tooltip, SkeletonRow, ErrorState, Toast.

## Content & states
- Loading: options load as 3–4 SkeletonRows per step; resolve shows an
  inline progress state on the button ("Resolving…").
- Empty: a combination with no artifact → the incompatible option is
  disabled with a Tooltip ("Not available for riscv64").
- Error: resolve failure → compact ErrorState in the result area with
  retry + "try another mirror".

## Interaction & motion
Steps slide horizontally (base, ease-out; direction follows forward/back and
mirrors in RTL); step dots fill with a fast tick animation; result panel
enters with slow fade+rise; button press has springy feedback. Reduced
motion: instant step swaps, fade-only result.

## Accessibility
Focus trapped; Esc closes (with confirm only if mid-resolve). Each step is a
labeled radiogroup, arrow-key navigable; auto-advance announced politely.
Step indicator exposes progress ("step 3 of 5"). Checksum copy has a text
label, not icon-only. Touch targets ≥44px.

## Reference
Modrinth version/file download flow (density + clarity of file rows);
platform-picker steppers on Flathub setup pages for tone.
