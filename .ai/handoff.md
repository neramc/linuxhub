# Handoff — state of the repo

> **Read this first in a new session.** It says what is actually built, what is
> real data versus placeholder, which commands work, and where the next piece
> of work starts. When it disagrees with a phase doc, the phase doc wins on
> *intent* and this file wins on *current state*.
>
> Last updated: 2026-07-20, end of Phase 4.

## Where the project stands

Phases 0–4 are complete and committed on `main`. **The design is frozen** —
see "Design is closed" below before touching any styling.

| Phase | State |
|---|---|
| 0 Documentation | ✅ `.ai/` is the SSOT, 14 docs + this one |
| 1 Repo init | ✅ Bun workspaces, Biome, CI, placeholder Worker |
| 2 Design system | ✅ tokens + `design/` comps |
| 3 UI design | ✅ approved, then rebuilt as Flathub × WinUI 3 (ADR-0017/0018) |
| 4 Frontend | ✅ all 15 screens, live data, MDX content, i18n + RTL, motion, e2e + axe |
| **5 Backend** | ⬜ **next** — Hono/D1 replaces the mock BFF |
| 6 Testing | ⬜ Lighthouse budget + coverage still to measure |
| 7 Deployment | ⬜ blocked on owner accounts (below) |

## What is real and what is not

Being precise about this saves a session from "fixing" something that is
deliberately a placeholder.

**Real**
- **Release/EOL data** for 7 distros and **mirror lists** for Arch + Fedora,
  fetched from public APIs into a committed snapshot
  (`apps/web/src/lib/server/live-data.json`, regenerate with
  `bun packages/ingest/src/live.ts`). Sources registered in
  `.ai/data-sources.md`; provenance is surfaced on the distro page.
- **Distro logos** — 12 official SVGs from Wikimedia Commons in
  `assets/distros/` + `apps/web/static/distros/`, licensed and attributed in
  `assets/distros/ATTRIBUTION.md`.
- **Distro prose** — `content/distros/<slug>/en/{description,install,usage}.md`,
  36 docs written from official documentation with sources cited, compiled by
  mdsvex and rendered in the detail tabs.
- **Korean UI** — a complete `ko` catalog; locale routing, geo redirect, and
  RTL are wired end to end.

**Placeholder — do not treat as truth**
- `downloads`, `rank`, `trend` in `DISTROS`, and everything in `SPECS`,
  `BANNERS`, `QUIZ`, `HALL_OF_FAME` (`apps/web/src/lib/server/data.ts`) are
  curated/invented editorial values. Rankings must come from our own signals
  once the backend exists (`.ai/data-sources.md`).
- Screenshots are grey frames. There is no screenshot pipeline yet.
- Download buttons do not resolve to a file. The version table and mirror
  picker are UI only.
- The contribute forms complete locally; there is no hCaptcha and no POST
  endpoint yet.
- `apps/api` serves only `/v1/health`. `migrations/0001_init.sql` is an empty
  placeholder. The D1/KV ids in `wrangler.toml` are zeros.

## Commands that work

```bash
bun install                 # workspaces: apps/* + packages/*
bun run check               # tsc + svelte-check across all 6 packages
bun run lint                # Biome (bun run format to autofix)
bun run test                # vitest, all packages
bun run build               # web (Vercel) + api (wrangler dry-run)
bun run dev:web             # SvelteKit dev server
```

E2E is **not** part of `bun run test` — it needs a production build first:

```bash
bun run --filter '@linuxhub/web' build
cd apps/web && bun run test:e2e      # 17 tests incl. the axe WCAG 2 AA gate
```

Gate status at handoff: check/lint/test/build green in all 6 packages,
17/17 e2e green, no horizontal overflow across 12 routes × 5 widths.

## Environment notes (remote container)

These cost real time to rediscover.

- **`bun install` and SvelteKit type generation run automatically** via
  `.claude/hooks/session-start.sh` on session start. If `$types` imports fail,
  run `cd apps/web && bunx svelte-kit sync`.
- **Bun's `fetch` fails through this container's HTTPS proxy.** The ingest CLI
  therefore shells out to `curl` (`packages/ingest/src/live.ts`). On Workers in
  Phase 5, use native `fetch` — the proxy constraint is local only.
- **Playwright** uses the prebuilt Chromium at `/opt/pw-browsers/chromium` when
  present and falls back to its own download elsewhere; never run
  `playwright install` here.
- **Do not `pkill -f` a pattern matching your own shell** — it kills the tool
  call. Free a port with `fuser -k <port>/tcp` instead.
- Preview/e2e ports in use: **4173** manual preview, **4174** Playwright.

## Design is closed

`.ai/design-system.md` is the contract; `design/` comps are the visual source
of truth and `packages/ui/src/styles.css` is their production port — the two
must stay identical. ADR-0017 (Flathub × WinUI 3) and ADR-0018 (acrylic) set
the language; the owner approved it on 2026-07-20.

**Do not restyle screens while building features.** If a feature genuinely
needs a new visual pattern: add it to the component inventory in
`.ai/design-system.md`, build it in `design/`, get approval, then implement —
in that order (ADR-0012, and the golden rules in `CLAUDE.md`).

Guardrails that must survive any feature work:
- every UI string goes through `@linuxhub/i18n` — no hardcoded text;
- logical CSS properties only, so RTL keeps mirroring;
- the axe gate blocks serious/critical violations — run it before committing UI;
- new colours come from tokens, never literal hex in a component.

## Phase 5 — where to start

Goal: replace the mock BFF with the real Hono/D1 backend. `.ai/api.md`
(67 endpoints), `.ai/database.md` (schema + KV keyspace), and
`.ai/backend-rules.md` (structure, validation, errors, caching, rate limits,
cron) are the specs. Suggested order, each step its own commit:

1. **Schema** — replace the empty `migrations/0001_init.sql` with the real
   tables from `.ai/database.md`; apply locally with
   `wrangler d1 migrations apply linuxhub --local`.
2. **Ingestion on the Worker** — port `packages/ingest/src/live.ts` to a Cron
   Trigger writing D1/KV (native `fetch` there), keeping the same source list
   and the `fetched_at`/`source_url` provenance columns.
3. **Read endpoints** — distros list/detail, releases, rankings, search, with
   the shared Zod schemas from `packages/shared` and the standard envelope.
4. **Point the BFF at the Worker** — `apps/web/src/routes/api/v1/*` currently
   reads `data.ts` directly; switch each to proxy the Worker with the caching
   TTLs in `.ai/frontend-rules.md`. Delete `data.ts` only when nothing imports
   it (the compare/quiz/hall-of-fame editorial content needs a home first).
5. **Write endpoints** — suggest/report/feedback behind hCaptcha + KV rate
   limits, then wire the contribute forms.
6. **Download resolution** — the piece with real user value: resolve
   edition/arch/format + region to an actual mirror URL, with checksums.

Keep the BFF envelope `{ ok, data, meta }` unchanged throughout so the
frontend does not move while the backend lands under it.

## Needs the owner, not an agent

- **Cloudflare account** — D1 database + 3 KV namespaces provisioned, real ids
  substituted into `apps/api/wrangler.toml`; secrets (`HCAPTCHA_SECRET`,
  `INTERNAL_API_TOKEN`, `RATE_SALT`) set via `wrangler secret put`.
- **Vercel project** — linked for the SvelteKit app, with
  `INTERNAL_API_TOKEN` matching the Worker.
- **hCaptcha** site + secret keys.
- A decision on the **Paraglide/inlang compiler**: ADR-0016 ships a
  hand-rolled, Paraglide-shaped runtime. Adopting the real compiler is a
  mechanical swap, but it is a dependency the owner should agree to.
