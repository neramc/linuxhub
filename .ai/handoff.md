# Handoff — state of the repo

> **Read this first in a new session.** It says what is actually built, what is
> real data versus placeholder, which commands work, and where the next piece
> of work starts. When it disagrees with a phase doc, the phase doc wins on
> *intent* and this file wins on *current state*.
>
> Last updated: 2026-08-04, after Phase 5 tasks 5.1–5.3.
>
> A ready-to-paste continuation prompt for the next session lives in
> `docs/next-session-prompt.md`.

## Where the project stands

Phases 0–4 are complete. Phase 5 is **in progress**: the schema, cron
ingestion and read endpoints are done and the Worker serves real data, but the
BFF has not been repointed at it yet — that is task 5.4, and it is the change
that can break every screen at once. **The design is frozen** — see "Design is
closed" below before touching any styling.

| Phase | State |
|---|---|
| 0 Documentation | ✅ `.ai/` is the SSOT, 14 docs + this one |
| 1 Repo init | ✅ Bun workspaces, Biome, CI, placeholder Worker |
| 2 Design system | ✅ tokens + `design/` comps |
| 3 UI design | ✅ approved, then rebuilt as Flathub × WinUI 3 (ADR-0017/0018) |
| 4 Frontend | ✅ all 15 screens, live data, MDX content, i18n + RTL, motion, e2e + axe |
| **5 Backend** | 🟡 **5.1–5.3 done** (schema, cron ingestion, read endpoints). **5.4 is next** — point the BFF at the Worker |
| 6 Testing | ⬜ Lighthouse budget + coverage still to measure |
| 7 Deployment | 🟡 config + runbook ready (`docs/deployment.md`); the account steps are the owner's |

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
- **The Worker's D1** — 15 tables, populated by cron from the same three
  verified sources. A local run holds 12 distros, 36 content docs, 42 releases
  and 16 mirrors, every ingested row carrying `source_url` + `fetched_at`.
- **Nine read endpoints** on the Worker (#1, #2, #3, #12, #22, #32/#34, #35,
  #37, #41), returning facts only — numbers not formatted strings, no composed
  English, no presentation (ADR-0020).

**Placeholder — do not treat as truth**
- **`apps/web/src/lib/server/data.ts` is a work list, not a data store.**
  `downloads`, `rank`, `trend`, `SPECS`, `EDITIONS`, `REQUIREMENTS`,
  `BANNERS`, `QUIZ`, `HALL_OF_FAME` were invented during the build-out.
  **The BFF still serves it** — task 5.4 is what starts replacing it. The
  per-symbol plan and the 12 verified announcement feeds are in
  `.ai/data-sources.md` → "Replacing the placeholder data". Do not add new
  facts to that file; wire a source instead.
- Screenshots are grey frames. There is no screenshot pipeline yet.
- Download buttons do not resolve to a file. The version table and mirror
  picker are UI only.
- The contribute forms complete locally; there is no hCaptcha and no POST
  endpoint yet.
- The D1/KV ids in `wrangler.toml` are still zeros — everything above was
  built and verified against `--local`.

**Empty on purpose — not a gap to fill by hand**

This distinction matters more than it looks, because the obvious "fix" for
each of these is the one the project forbids:

| Table / field | Why it is empty | Filled by |
|---|---|---|
| `rankings`, `download_events`, `downloads`, `rank`, `trend` | popularity comes from **our own signals only**; there are no signals until the site counts download clicks. Third-party charts are a forbidden source | 5.6 |
| `distros.family`, `based_on`, taxonomy | lineage comes from Wikidata; hand-typing it violates the sourcing rule | its own commit, before 5.4 needs the family facet |
| `releases` for arch/manjaro/endeavouros | rolling: no version cycles exist to fetch. Their ISO-snapshot endpoints are identified but unverified | when that source is verified |
| `releases` for zorin/elementary | fixed-cadence but no machine-readable source found — registry kind `unsourced` | when a source is found |
| `editions`, `artifacts` | need per-distro release APIs | 5.6/5.7 |
| `hall_of_fame` | blocked on frontend-contract question 4 (editorial in D1 or `content/`?) | 5.7 |

Consequence for 5.4: **do not repoint the BFF's `rankings`, `hall-of-fame` or
`quiz` routes.** They would replace working editorial screens with blank ones.
`health`, `releases/recent`, `search`, `distros` and `distros/:slug` are ready.

## Commands that work

```bash
bun install                 # workspaces: apps/* + packages/*
bun run check               # tsc + svelte-check across all 6 packages
bun run lint                # Biome (bun run format to autofix)
bun run test                # vitest, all packages
bun run build               # web (Vercel) + api (wrangler dry-run)
bun run dev:web             # SvelteKit dev server
```

Backend-specific, all from `apps/api` and all local — no Cloudflare account
needed:

```bash
bunx wrangler d1 migrations apply linuxhub --local     # create/refresh the schema
bunx wrangler dev --local --test-scheduled             # serve + allow cron firing
curl 'localhost:8787/__scheduled?cron=0+*/6+*+*+*'     # releases ingest
curl 'localhost:8787/__scheduled?cron=0+3+*+*+*'       # mirrors ingest
curl 'localhost:8787/__scheduled?cron=0+4+*+*+1'       # weekly rankings snapshot
curl localhost:8787/v1/health
bunx wrangler d1 execute linuxhub --local --command "SELECT COUNT(*) FROM releases"
```

Regenerate the two committed data artifacts when their inputs change:

```bash
bun packages/ingest/src/content-index.ts   # after editing MDX frontmatter
bun packages/ingest/src/live.ts            # the Phase 4 BFF snapshot
```

E2E is **not** part of `bun run test` — it needs a production build first:

```bash
bun run --filter '@linuxhub/web' build
cd apps/web && bun run test:e2e      # 17 tests incl. the axe WCAG 2 AA gate
```

Gate status at handoff: check/lint/test/build green in all 6 packages,
**73 unit tests** (44 in `apps/api`), 17/17 e2e green.

Two traps this session paid for, worth knowing before you touch either file:

- **`apps/web/src/app.html`**: `hooks.server.ts` substitutes the lang/dir
  placeholders with a single-occurrence `String.replace`. Writing either token
  literally anywhere earlier in the file — even inside a comment — consumes the
  substitution and ships an unresolved attribute. It fails the axe gate on five
  routes and breaks locale switching, and `bun run test` does **not** catch it.
- **Biome resolves to 2.5.4** (biome.json pins that schema; package.json still
  allows `^2.3.0`), and 2.5 added rules that fire on Phase 4 files. If lint
  breaks on code you did not touch, that is why.

Docs carry no automated gate, so when you change one, check that the paths it
names still exist — `.ai/` docs referencing moved files is the most common
form of documentation rot here. (ADR entries in `.ai/decisions.md` are
historical records: never rewrite them, even when a path they mention has
since moved.)

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

## Phase 5 — where it stands

Goal: replace the mock BFF with the real Hono/D1 backend. `.ai/api.md`
(61 endpoints — the *target*), `.ai/database.md` (schema + KV keyspace), and
`.ai/backend-rules.md` (structure, validation, errors, caching, rate limits,
cron) are the specs.

**Read `.ai/frontend-contract.md` first.** The shipped frontend consumes
shapes that differ from `.ai/api.md` — pre-formatted numbers, composed
English strings, presentation baked into payloads. That file maps every
current response field to its D1 source, lists the recurring problems to fix
rather than port, gives a safe endpoint-by-endpoint sequence for 5.4, and
records which of its architecture questions are now settled (1–3 answered by
ADR-0019/0020; question 4 is still open and blocks the editorial endpoints).

The Worker's shape is set by the worked example in `.ai/backend-rules.md`:
route validates → service caches → `db/` holds every line of SQL. Fifty more
endpoints written to one pattern review far faster than fifty variations, so
copy `routes/distros.ts` rather than inventing a second shape.

1. ✅ **Schema** — `migrations/0001_init.sql` … `0005_indexes.sql`, 15 tables
   and 9 indexes (ADR-0019).
2. ✅ **Ingestion on the Worker** — cron triggers writing D1/KV from the three
   verified sources, with per-row provenance and an `ingest_log` audit trail.
3. ✅ **Read endpoints** — nine of them, facts only (ADR-0020), tested against
   a real Miniflare D1 (ADR-0021).
4. ⬜ **Point the BFF at the Worker** — `apps/web/src/routes/api/v1/*` still
   reads `data.ts`; switch each to proxy the Worker with the caching TTLs in
   `.ai/frontend-rules.md`. **This is the risky one** — it swaps the data
   source under ~15 screens. Move one endpoint at a time in the order in
   `.ai/frontend-contract.md`, run the e2e suite after each, and skip
   `rankings`/`hall-of-fame`/`quiz` (see "Empty on purpose" above). The pages
   also have to take back the formatting the API no longer does: `Intl` for
   `downloads`, `@linuxhub/i18n` for every composed label, `initials` from
   `name`, and a brand-colour lookup in `packages/ui`.
   Delete `data.ts` only when nothing imports it (the compare/quiz/hall-of-fame
   editorial content needs a home first).
5. **Write endpoints** — suggest/report/feedback behind hCaptcha + KV rate
   limits, then wire the contribute forms.
6. **Download resolution** — the piece with real user value: resolve
   edition/arch/format + region to an actual mirror URL, with checksums.
7. **Retire `data.ts`** — replace each remaining placeholder symbol with its
   real source per `.ai/data-sources.md`: specs and taxonomy from Wikidata,
   editions from the official release APIs, requirements from official install
   docs, release links from the announcement feeds, popularity from our own
   counters. Editorial content (quiz, Hall of Fame) moves to content/ or D1.
   The file is deleted when nothing imports it.

Sitting outside that numbered list, and worth doing **before** 5.4 if the
family facet matters: a **Wikidata lineage fetcher** to fill
`distros.family`/`based_on` and the taxonomy tables. It was deliberately left
out of 5.2 to keep that task at its stated scope. `query.wikidata.org/sparql`
(CC0) needs a verified registry row in `.ai/data-sources.md` before its
fetcher is written, like any other source.

Keep the BFF envelope `{ ok, data, meta }` unchanged throughout so the
frontend does not move while the backend lands under it.

## Needs the owner, not an agent

**The procedure for all of this is `docs/deployment.md`** — resources, secrets,
remote migrations, cron seeding, Vercel, rollback. Env templates are committed
at `apps/api/.dev.vars.example` and `apps/web/.env.example`.


- **Cloudflare account** — D1 database + 3 KV namespaces provisioned, real ids
  substituted into `apps/api/wrangler.toml`; secrets (`HCAPTCHA_SECRET`,
  `INTERNAL_API_TOKEN`, `RATE_SALT`) set via `wrangler secret put`. Until then
  the schema, cron triggers and endpoints exist only in local state under
  `apps/api/.wrangler/` (gitignored) — production D1 is empty and no cron has
  ever fired there. First deploy needs
  `wrangler d1 migrations apply linuxhub --remote`, then one manual run of each
  schedule to populate it.
- ~~`SITE_ORIGIN`~~ — **set to `https://linuxhub.kro.kr`.** It lives in exactly
  two places, both commented to point at each other: `[vars]` in
  `apps/api/wrangler.toml` (what production uses) and `DEFAULT_SITE_ORIGIN` in
  `packages/ingest/src/index.ts` (the build-time fallback). Changing domains =
  edit both, then redeploy. `docs/deployment.md` §7.
- **Vercel project** — linked for the SvelteKit app, with
  `INTERNAL_API_TOKEN` matching the Worker.
- **hCaptcha** site + secret keys — the *secret* half is a Wrangler secret, the
  *site* half is a Vercel `PUBLIC_` var. Neither is read until task 5.5.
- ~~A decision on the Paraglide/inlang compiler~~ — **settled 2026-08-04
  (ADR-0022): keep the hand-rolled runtime through v1.** Revisit when authored
  catalogs reach ~5 or the message payload shows up in the Phase 6 Lighthouse
  budget. The first thing to fix then is the static `CATALOGS` map, which is
  not necessarily the compiler.
