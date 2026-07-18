# Content — Distro MDX Docs

## What exists per distro

```
content/distros/<slug>/<locale>/
├─ description.md   # what it is, who it's for, philosophy, editions
├─ install.md       # how to get it installed (paraphrased, cited)
└─ usage.md         # first steps, package management, updating, help channels
```

Format: **mdsvex** (`.md` with frontmatter; Svelte components allowed but use
sparingly — content must survive as plain markdown). `en` is always authored
first; other locales follow the progressive strategy in `.ai/i18n.md`.

## Authoring rules (binding)

1. **Never copy official documentation verbatim.** Read the official docs,
   then write our own concise version in our own words. This is both a
   copyright requirement and a product choice (consistent voice).
2. **Cite sources.** Every doc lists the official pages it was written from
   in frontmatter `sources`; the rendered page links to official docs.
3. Keep it accurate and current — recheck on each release ingest; update
   `last_reviewed` when verified.
4. Neutral, helpful tone. No marketing superlatives, no editorializing about
   distro rivalries. State facts; let users decide.
5. Commands shown must be real and tested against the current stable release
   where feasible; wrap in fenced code blocks with the right language tag.
6. Keep each doc scannable: intro paragraph → short sections with headings →
   links out for deep detail. Target 300–800 words per doc.

## Frontmatter schema (Zod-validated at build)

```yaml
---
title: "Fedora Workstation"        # localized
summary: "A polished, fast-moving desktop distro sponsored by Red Hat."
distro: fedora                     # slug, must match directory
doc: description                   # description | install | usage
locale: en                         # BCP-47, must match directory
official_links:
  homepage: https://fedoraproject.org
  docs: https://docs.fedoraproject.org
sources:                           # pages this content was paraphrased from
  - https://docs.fedoraproject.org/en-US/fedora/latest/
last_reviewed: 2026-07-18          # ISO date; bump when re-verified
translated: true                   # false for machine-draft placeholders
---
```

The build registers every doc into D1 `content_index` (slug, doc, locale,
source_urls, reviewed_at) so the API can report coverage and serve fallbacks.

## Review checklist (before a doc merges)

- [ ] Paraphrased — no sentence lifted from official docs; spot-check phrases.
- [ ] `sources` present and are official (project-owned) URLs.
- [ ] Commands/paths verified against the current stable release.
- [ ] Frontmatter validates; slug/doc/locale match the path.
- [ ] Links work; external links open official sites.
- [ ] Tone neutral; no copied trademarks misuse; logos referenced per
      `.ai/data-sources.md` licensing.
- [ ] `last_reviewed` set to the verification date.

## Rendering

Served via `GET /api/v1/distros/:slug/content/:doc?locale=` (compiled +
frontmatter + `translated` flag) and rendered in the distro detail
`ContentTabs`. Missing locale → English + "untranslated" badge. Headings get
anchor links; code blocks get the `CopyButton`.
