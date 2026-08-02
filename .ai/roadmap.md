# Roadmap & Phase Status

> **Starting a new session?** Read `.ai/handoff.md` first — it carries the
> current state, what is real versus placeholder, the commands that work, and
> the environment notes. This file carries the plan.

## Stage gates (binding — see CLAUDE.md)

```
Project Documentation → Repository Initialization → Design System → UI Design
→ Frontend Implementation → Backend Implementation → Testing → Deployment
```

## Phase status

| Phase | Scope | Gate | Status |
|---|---|---|---|
| **0 — Documentation** | Root `CLAUDE.md` + all `.ai/` docs | docs committed | ✅ done |
| **1 — Repository Initialization** | Bun workspaces; `apps/web` + `apps/api`; `packages/shared\|ui\|i18n\|ingest`; Biome; CI; Wrangler + Vercel config | hello-world builds on both targets | ✅ done — live deploys need owner accounts (Phase 7) |
| **2 — Design System** | Tokens in `packages/ui`; 15 screen briefs in `prompts/stitch/` | briefs ready | ✅ done |
| **3 — UI Design** | HTML/CSS comps in `design/` (ADR-0012) | owner approval | ✅ **approved 2026-07-20** — Flathub × WinUI 3 (ADR-0017 + acrylic ADR-0018). **Design is frozen; see `.ai/handoff.md` before restyling anything** |
| **4 — Frontend Implementation** | All screens from the approved design, real data, content, i18n/RTL, motion, tests | quality gates pass | ✅ **complete** — 8 milestones, detail below |
| **5 — Backend Implementation** | D1/KV, Cron ingestion, endpoint surface, hCaptcha, rate limits, caching, feeds | quality gates pass | ⬜ **next** — breakdown below |
| **6 — Testing** | Coverage, Lighthouse budget, i18n + a11y sweep per Definition of Done | all green | ⬜ not started |
| **7 — Deployment** | Web → Vercel, API → Workers; secrets; smoke tests; runbook in `docs/` | live + runbook committed | ⬜ blocked on owner accounts |

### Phase 4 milestones (all done)

1. Shell + all 15 screens on a mock BFF.
2. Screens wired to the BFF envelope with URL-as-state browsing.
3. Real data (ADR-0015) — official logos, brand mark, live release/EOL cycles
   and Arch/Fedora mirrors from the committed snapshot, provenance surfaced.
4. mdsvex content pipeline — 36 authored distro docs with cited sources.
5. i18n runtime + locale routing (ADR-0016) — geo redirect, `/en`
   canonicalization, full Korean catalog, RTL verified in `ar`.
6. Motion pass — View Transitions, reduced-motion honored throughout.
7. Playwright e2e + axe WCAG 2 AA gate (17 tests) and the contrast
   corrections it surfaced.
8. Visual system rebuilt as Flathub × WinUI 3 (ADR-0017/0018) across
   `packages/ui`, the `design/` comps, and every page-scoped style.

### Phase 5 breakdown (ordered; one commit each)

Specs: `.ai/api.md` (61 endpoints, the *target*) · `.ai/database.md` (schema +
KV keyspace) · `.ai/backend-rules.md` (structure, validation, errors, caching,
limits, cron) · **`.ai/frontend-contract.md`** (what the shipped frontend
actually consumes, and the five open questions to settle first).

| # | Task | Done when |
|---|---|---|
| 5.1 | **D1 schema** — replace the empty `0001_init.sql` with the real tables | `wrangler d1 migrations apply linuxhub --local` succeeds; schema matches `.ai/database.md` |
| 5.2 | **Cron ingestion on the Worker** — port `packages/ingest/src/live.ts` to a Cron Trigger writing D1/KV with native `fetch` | a scheduled run populates releases + mirrors with `source_url` + `fetched_at` |
| 5.3 | **Read endpoints** — distros list/detail, releases, rankings, search | shared Zod schemas validate; standard envelope; unit tests per endpoint |
| 5.4 | **BFF proxies the Worker** — `apps/web/src/routes/api/v1/*` stops reading `data.ts` | frontend unchanged; caching TTLs per `.ai/frontend-rules.md`; e2e still green |
| 5.5 | **Write endpoints** — suggest/report/feedback behind hCaptcha + KV rate limits | contribute forms submit for real; limits covered by tests |
| 5.6 | **Download resolution** — edition/arch/format + region → real mirror URL + checksum | the download button delivers a file from an official mirror |
| 5.7 | **Retire `data.ts`** — every placeholder symbol replaced by an API/feed/Wikidata source per `.ai/data-sources.md`; editorial content moved to content/ or D1 | nothing imports `data.ts` and the file is deleted; every factual field carries `source_url` + `fetched_at` |

**Sourcing rule for 5.7 (binding):** facts come from official APIs, RSS/Atom
feeds, or Wikidata — never hand-typed; popularity comes from our own counters
— never from third-party charts; editorial content stays authored but carries
resolvable citations. The per-symbol plan and 12 verified announcement feeds
are in `.ai/data-sources.md`.

Then iterate: Documentation → Design → Implementation → Testing → Review →
Documentation Update.

## Stitch screens to brief (Phase 2 checklist, minimum)

- [x] Home / landing
- [x] Explore / browse (grid + filters)
- [x] Distro detail (MDX + download panel)
- [x] Download selector modal
- [x] Rankings
- [x] Hall of Fame
- [x] Category / Tag page
- [x] Search results
- [x] Compare
- [x] Distro-finder quiz
- [x] Contribute / report
- [x] About
- [x] 404 / error
- [x] Global nav + language switcher
- [x] Mobile nav

## Product roadmap

### MVP (first public deploy)
Explore grid + facets; distro detail with MDX (en + ko) and download selector;
search + autocomplete; categories/tags/families/desktops; ~30 onboarded
distros with verified sources; mirrors + geo ranking; checksums; i18n shell
(all locales routed, UI translated for initial set, English fallback);
dark/light; RSS/Atom; sitemap.

### v1
50+ endpoint surface complete; rankings (week/month/year/all) + trending +
rising + rank history; Hall of Fame (editorial); compare; quiz; random;
recommendations; badges + OpenSearch; contribute/report/feedback
(hCaptcha-gated); 100+ distros; translation coverage growth.

### Later (explicitly out of v1 scope — revisit deliberately)
User accounts; comments/reviews; API keys for third parties; mirror
self-service portal; more ranking signals (only with permitted sources);
mobile apps.
