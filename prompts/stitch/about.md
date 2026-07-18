# Stitch Brief — About

*(Use together with `_foundation.md`.)*

## Purpose
Explains what Linuxhub is, how rankings are computed, where data comes from,
content licensing/attribution policy, the crawler policy (with contact
anchor), and how to contribute. Mostly prose — typography does the design.

## Layout
Single centered column (max 68ch) with a slim sticky table-of-contents rail
on desktop (right side; collapses into a "On this page" dropdown on mobile).

Sections (each with anchored h2):
1. **What is Linuxhub** — 2 paragraphs + the three stat chips from Home.
2. **How rankings work** — plain-language method (our own signals: views,
   download clicks, release recency) + a small illustrative RankSparkline.
3. **Where the data comes from** — official APIs/pages, refresh cadence,
   a note that every source is recorded; link style for external sources.
4. **Content & trademarks** — paraphrase-with-citation policy, logo
   attribution, "report an issue" link to Contribute.
5. **Crawler policy** (`#crawler` anchor — our bot's UA links here) —
   robots.txt compliance, rate limits, contact.
6. **Contact / contribute** — buttons to Contribute form + GitHub repo.

Prose: base/1.6, headings 600, generous 48px section spacing, hairline
dividers. Blockquote/list/link styles designed here become the canonical
long-form styles (shared with distro MDX content).

## Components
ContentTabs typography styles (shared prose), Chip, Badge, Button,
RankSparkline (illustrative), AppFooter.

## Content & states
Static content — loading/error states are trivial (instant render), but
design the anchor-highlight state (target section briefly tinted
accent-soft) and the ToC active-section indicator.

## Interaction & motion
ToC tracks scroll position with a sliding indicator (base); anchor jumps
smooth-scroll (disabled under reduced motion); external links get a subtle
↗ affordance.

## Accessibility
Proper heading hierarchy (single h1); ToC is a labeled nav; smooth scroll
honors reduced motion; link text descriptive (no "here").

## Reference
Flathub's about page calm; documentation-quality typography as on modern
docs sites, kept warm.
