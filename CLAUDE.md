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

- **Claude Code** is both the *designer* and the *implementation environment*
  (designer role assumed from Google Stitch per **ADR-0012**): it produces
  high-fidelity HTML/CSS design comps in `design/` from the briefs in
  `prompts/stitch/`, and after human approval implements frontend + backend,
  writes tests, refactors, and keeps documentation synchronized. Claude Code
  **never** invents architecture ad hoc, ignores project rules, duplicates
  components, or changes an approved screen without updating the comp and
  getting re-approval first.
- **The human** reviews and approves designs at the Phase 3 gate and remains
  the decision authority for scope and process changes.

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
| **`.ai/handoff.md`** | **Read first in a new session** — current state, real vs placeholder, working commands, environment notes, Phase 5 entry point |
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

## Design workflow (ADR-0012)

```
Design Documentation (briefs) → HTML/CSS Design Comps in design/
→ Human Design Review → Approved Design → Implementation
```

- `prompts/stitch/*.md` briefs are the per-screen design requirements;
  `design/` holds the comps built strictly from `packages/ui` tokens.
- The human reviews the comps (both themes, breakpoints, RTL, states) and
  marks the design **approved**. Only then does Phase 4 implement it.
- If something can't be built as designed, update the comp, get re-approval,
  then implement. **Never silently redesign in code.**

**Design status: frozen.** The owner approved Flathub × WinUI 3 on 2026-07-20
(ADR-0017 + ADR-0018). Feature work must not restyle approved screens; a
genuinely new visual pattern goes inventory → comp → approval → code, in that
order.

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

## Quality gates (run before every commit)

```bash
bun run check     # types across all packages
bun run lint      # Biome (bun run format autofixes)
bun run test      # vitest
bun run build     # web + api dry-run
```

UI changes additionally need the e2e + accessibility gate, which runs against
a production build and is **not** part of `bun run test`:

```bash
bun run --filter '@linuxhub/web' build && cd apps/web && bun run test:e2e
```

## Definition of Done (per stage)

- TypeScript strict passes; Biome lint/format clean.
- Vitest unit tests for API + ingestion; Playwright e2e for browse + download.
- Accessibility: keyboard-navigable, axe passes, RTL verified, reduced-motion
  honored.
- Performance: good Lighthouse scores on Explore + Distro pages.
- i18n: no hardcoded UI strings; all locales resolve; English fallback works.
- The relevant `.ai/` doc is updated **in the same change** and committed.
