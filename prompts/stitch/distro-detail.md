# Stitch Brief — Distro Detail (MDX content + download panel)

*(Use together with `_foundation.md`.)*

## Purpose
The heart of the product: everything about one distro (e.g. Fedora) —
description, install and usage docs, screenshots, requirements — with a
Modrinth-grade download panel that never makes the user leave the page.

## Layout
1. **DistroHero** — logo (96px on neutral tile), name (3xl/700), family +
   status Badges, one-line summary, quick actions right-aligned: primary
   Button "Download", ghost buttons (official site ↗, share badge). If the
   viewed locale's content is English fallback, show the warning
   "untranslated" Badge here.
2. **Two-column body (desktop 1024+):**
   - **Main (≈2/3):** **ContentTabs** — Description / Install / Usage.
     Long-form prose typography (base/1.6, headings with anchors, code
     blocks in mono with CopyButton, cited-sources footer). Below tabs:
     **ScreenshotGallery** (16:10 cards, lightbox), **RequirementsTable**
     (min vs recommended columns), **RelatedDistros** (DistroCard row).
   - **Sidebar (≈1/3, sticky):** **DownloadPanel** — latest stable version
     prominent (xl/600 + release date), "Download" primary button opening the
     **DownloadSelector** (see its brief), compact **ReleaseTimeline** (last
     5 releases with channel Badges), **RankSparkline** with current rank,
     download count, links (docs, community).
3. **Tablet:** sidebar drops below hero, above tabs, non-sticky.
   **Mobile:** single column — hero, DownloadPanel (collapsed to the version
   + Download button), tabs, gallery, requirements, related; sticky bottom
   "Download" bar appears after scrolling past the panel.

## Components
DistroHero, Badge, Button, ContentTabs, CopyButton, ScreenshotGallery,
RequirementsTable, RelatedDistros, DistroCard, DownloadPanel,
DownloadSelector (trigger), ReleaseTimeline, RankSparkline, ChecksumBlock,
SkeletonRow, EmptyState, ErrorState, Toast.

## Content & states
- Loading: hero renders first; tabs/panel as SkeletonRows; gallery skeleton
  cards.
- Empty: no screenshots → hide gallery; no related → hide row; missing
  doc tab → EmptyState inside the tab ("Not written yet — read the official
  docs ↗").
- Error: per-section ErrorState with retry; hero + panel independent of tab
  failures.

## Interaction & motion
Tab switch: 200ms cross-fade + underline slide. Sticky sidebar gently
shadows on scroll. Copy actions confirm via Toast + button check morph.
Gallery lightbox: slow fade + scale from thumbnail. Reduced motion: cross-fades
only, no scale/slide.

## Accessibility
Tabs follow the ARIA tabs pattern (arrow keys, automatic activation).
Anchored headings get visible focus. Lightbox traps focus, Esc closes.
Checksums in mono with an explicit "copy" label. RTL: sidebar mirrors to the
left; prose direction follows content locale.

## Reference
Modrinth project page (sidebar version panel, file rows, badge density);
Flathub app page (calm hero, screenshot gallery, content-first prose).
