# Project — Linuxhub

## Vision

Linuxhub is a modern, fast, multilingual catalog for browsing *almost every*
Linux distribution. It pairs **Flathub-style clean, content-first browsing**
with a **Modrinth-style guided download experience**: pick a version → edition
→ architecture → file format → country mirror, and get a direct download with
checksum and verification instructions — without leaving the page. It works on
every device (fully responsive) and in ~57 locales.

## Primary users

1. **Newcomers** choosing a first distro — need guidance (categories, the
   distro-finder quiz, comparisons, plain-language descriptions).
2. **Enthusiasts** comparing releases — need dense, accurate release/edition/
   architecture data, changelogs, rank history.
3. **Downloaders** who want a fast, trustworthy download — need the right
   mirror (geo-ranked), checksums, signatures, torrents/magnets.

## Core features (v1)

- **Explore/browse:** Flathub-style card grid with facet filters (category,
  tag, family, desktop environment, architecture, based-on, status) and sort
  (popularity, name, latest release, newest).
- **Distro detail:** hero (logo, name, family, badges) → MDX content tabs
  (description / install / usage, per locale) → download panel → screenshots →
  system requirements → related distros.
- **Download flow (Modrinth-style):** guided selector resolving to a direct
  URL via `POST /api/v1/downloads/resolve`; persists last selection; shows file
  size, checksum, mirror sponsor; click tracking.
- **Search:** fast fuzzy search over names/aliases/summaries across locales,
  autocomplete, facet filters, keyboard command palette.
- **Taxonomy:** categories, tags, families (Debian/Arch/RPM/independent),
  desktop environments.
- **Rankings & Hall of Fame:** week/month/year/all popularity from our own
  signals, trending, rising movers, editorially curated Hall of Fame, per-distro
  rank history sparkline.
- **Discovery extras:** compare view, distro-finder quiz, random distro,
  recommendations, recently-updated feed, RSS/Atom, shareable SVG badges,
  dark/light theme (`icons/light.svg` / `icons/dark.svg`).
- **Community (anonymous, captcha-gated):** suggest a distro, report a broken
  mirror/link, feedback, mirror status reports.
- **i18n:** ~57 locales, locale-prefixed routes, geo-based initial locale,
  RTL support (`ar`, `he`, `fa`, `ckb`), English fallback.

## Non-goals (v1)

- Hosting ISO files ourselves (we link to official mirrors only).
- User accounts / authentication.
- Comments or forums.

Contributions stay anonymous + captcha-gated. These remain out of scope unless
a later roadmap item explicitly promotes them (see `.ai/roadmap.md`).

## Glossary

| Term | Meaning |
|---|---|
| **Distro** | A Linux distribution (e.g. Fedora, Arch). Identified by a URL-safe `slug`. |
| **Family** | Lineage root: Debian, Arch, RPM/Fedora, SUSE, Gentoo, Slackware, independent… |
| **Release** | A published version of a distro (version string + channel + dates). |
| **Channel** | Release track: `stable`, `lts`, `beta`, `rolling`. |
| **Edition** | A variant of a release: GNOME, KDE, Xfce, minimal, server, … |
| **Artifact** | A downloadable file: arch + format + size + sha256 (+ signature URL). |
| **Format** | Artifact kind: `.iso`, `.iso.torrent`, magnet link, checksum file, signature. |
| **Mirror** | A download host with country/region, protocol, sponsor. |
| **BFF** | The SvelteKit `/api` layer — the public API surface, proxying/caching the Worker. |
| **Ingest** | Scheduled fetching of release/mirror data from official sources into D1/KV. |
| **SSOT** | Single source of truth: `.ai/` > `docs/` > `prompts/` > code. |
| **Hall of Fame** | Editorially curated list of historically significant distros with cited rationale. |

## Design language

Modern, spacious, card-based — a blend of **Flathub** (calm, clean,
content-first) and **Modrinth** (playful micro-interactions, smooth
transitions, confident color accents). Final visuals come from Google Stitch;
see `.ai/design-system.md` and `prompts/stitch/`.

## Constraints

- Long-term project: correctness, consistency, and documentation always beat speed.
- All content paraphrased from official sources with attribution — never copied.
- All crawling robots.txt-compliant; official APIs preferred.
- No secrets in the repo.
