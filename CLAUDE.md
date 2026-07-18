# CLAUDE.md — Linuxhub Operating Rules

> This file is the entry point for Claude Code in the `neramc/linuxhub` monorepo.
> It was generated in **Phase 0** from the master brief and is now, together with
> `.ai/`, the repository's single source of truth. When this file and the master
> brief disagree, **this file and `.ai/` win**.

## What Linuxhub is

A modern, fast, multilingual catalog for browsing almost every Linux distribution,
with a Modrinth-style guided download flow (version → edition → architecture →
file format → mirror) and Flathub-style clean, card-based browsing. Fully
responsive, ~57 locales, no user accounts in v1. See `.ai/project.md`.

## Roles

- **Google Stitch** is the *designer*: layout, responsive behavior, component
  layout, design system visuals, interaction/motion design. Exports to Figma.
  Stitch **never** defines architecture, business logic, APIs, or database
  structures.
- **Claude Code** is the *implementation environment*: reads the project docs,
  follows the architecture, builds frontend + backend, writes tests, refactors,
  and keeps documentation synchronized. Claude Code **never** invents
  architecture ad hoc, ignores project rules, duplicates components, or changes
  approved UI without routing the change back through Stitch first.

## Golden rules (non-negotiable)

1. Documentation comes before implementation.
2. Design comes before frontend development.
3. Architecture is never decided during implementation — if it's undefined,
   stop and write the doc first.
4. Every change is documented.
5. Every implementation follows the documentation.
6. Every completed phase is committed independently.
7. Consistency is more important than speed.

## Single Source of Truth — priority order

When information conflicts, follow this order and **stop implementation until
the higher-priority doc is corrected**:

1. `.ai/` — project memory (see index below)
2. `docs/` — human-facing docs, ADRs, runbooks
3. `prompts/` — AI prompts, including Stitch design briefs
4. Source code

## Stage gates

Work proceeds strictly through these stages. Never start a stage until the
previous one is completed **and committed**:

```
Project Documentation → Repository Initialization → Design System → UI Design
→ Frontend Implementation → Backend Implementation → Testing → Deployment
```

Current phase status is tracked in `.ai/roadmap.md`.

## `.ai/` index

| Doc | Contents |
|---|---|
| `.ai/project.md` | Vision, users, scope, non-goals, glossary |
| `.ai/architecture.md` | System diagram, runtime boundaries, caching, data flow |
| `.ai/design-system.md` | Tokens, component inventory, references — **Stitch consumes this** |
| `.ai/component-rules.md` | Naming, composition, reuse, a11y baseline |
| `.ai/frontend-rules.md` | SvelteKit routing, BFF conventions, state, i18n usage |
| `.ai/backend-rules.md` | Hono structure, validation, errors, caching, rate limits, cron |
| `.ai/api.md` | Full endpoint catalog (50+), schemas, pagination, error envelope |
| `.ai/database.md` | D1 schema, migrations plan, KV keyspace + TTLs |
| `.ai/security.md` | hCaptcha, headers/CSP, rate limits, secrets, crawler ethics |
| `.ai/i18n.md` | Locale registry, routing, RTL, geo detection, fallbacks |
| `.ai/content.md` | Distro MDX authoring rules, frontmatter, review checklist |
| `.ai/data-sources.md` | Per-distro sources, robots status, logo licenses, cadence |
| `.ai/roadmap.md` | Phase plan + MVP → v1 → later, current status |
| `.ai/decisions.md` | ADR log — append every meaningful decision |

## Tech stack (fixed — changes require an ADR in `.ai/decisions.md`)

| Layer | Choice |
|---|---|
| Monorepo | Bun workspaces |
| Language | TypeScript (strict) everywhere |
| Frontend | SvelteKit (Svelte 5 runes) → **Vercel** via `@sveltejs/adapter-vercel` |
| Public API | SvelteKit `/api` routes (BFF) proxying + caching the backend |
| Backend | Hono → **Cloudflare Workers** via Wrangler |
| Relational DB | Cloudflare **D1** (SQLite) |
| KV cache | Cloudflare **KV** |
| Captcha | hCaptcha (write endpoints only) |
| Content | mdsvex (MDX-style markdown), per distro per locale |
| Lint/format | Biome |
| Tests | Vitest (unit) + Playwright (e2e) |
| i18n | Paraglide (inlang) for SvelteKit |

**Toolchain nuance — don't get this wrong:** Bun is the package manager, test
runner, and dev toolchain. The **deployed backend runs on the Cloudflare
Workers runtime (workerd)**, not Bun; the frontend runs on Vercel's runtime.
Write backend code against Workers APIs (Web `fetch`, D1/KV bindings). Use Bun
only for local dev/build/test.

## Design workflow with Google Stitch

```
Design Documentation → Google Stitch → Design Review → Figma Export
→ Approved Design → Implementation
```

- Before Stitch: finish `.ai/design-system.md` and write per-screen briefs in
  `prompts/stitch/<screen>.md` (Phase 2). Then **STOP and hand off** — the
  human runs Stitch, reviews, exports to Figma, and marks the design approved.
- Implement the frontend only from the **approved** design. If something can't
  be built as designed, note it, propose a change, and route it back through
  Stitch. **Never silently redesign in code.**

## Guardrails — never do these

- Never copy official distro documentation verbatim. Paraphrase, keep it
  accurate, cite sources (see `.ai/content.md`).
- Never crawl outside `robots.txt`. Prefer official APIs. Descriptive
  User-Agent + contact URL, polite rate limits, aggressive caching
  (see `.ai/security.md`, `.ai/data-sources.md`).
- Never put secrets in the repo. Wrangler secrets / Vercel env vars only.
- Never redesign an approved screen in code.
- Never merge unrelated changes into one commit.

## Git workflow

One completed task = one commit. Conventional Commits. Reference the doc a
change satisfies. Examples:

```
docs(ai): add project, architecture, and design-system docs
docs(design): write stitch briefs for explore and distro pages
feat(db): add d1 schema and migrations for distros and releases
feat(api): add distro list, detail, and download-resolve endpoints
feat(web): implement explore grid from approved design
test(api): cover download resolution and rate limiting
```

## Definition of Done (per stage)

- TypeScript strict passes; Biome lint/format clean.
- Vitest unit tests for API + ingestion; Playwright e2e for browse + download.
- Accessibility: keyboard-navigable, axe passes, RTL verified, reduced-motion
  honored.
- Performance: good Lighthouse scores on Explore + Distro pages.
- i18n: no hardcoded UI strings; all locales resolve; English fallback works.
- The relevant `.ai/` doc is updated **in the same change** and committed.
