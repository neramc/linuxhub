# Roadmap & Phase Status

## Stage gates (binding — see CLAUDE.md)

```
Project Documentation → Repository Initialization → Design System → UI Design
→ Frontend Implementation → Backend Implementation → Testing → Deployment
```

## Phase status

| Phase | Scope | Gate | Status |
|---|---|---|---|
| **0 — Documentation** | Root `CLAUDE.md` + all `.ai/` docs (this set) | docs committed | ✅ done — reviewed & approved |
| **1 — Repository Initialization** | Bun workspaces; `apps/web` (SvelteKit) + `apps/api` (Hono); `packages/shared\|ui\|i18n\|ingest`; Biome; base CI; Wrangler + Vercel config; empty D1 migration | hello-world builds & deploys on both targets | ✅ done — lint/typecheck/tests green; web builds via Vercel adapter, api bundles via `wrangler deploy --dry-run` with D1/KV bindings. Live deploys need owner accounts/secrets → wired up in Phase 7 |
| **2 — Design System** | Finalize `design-system.md` + tokens in `packages/ui`; write all `prompts/stitch/*` briefs | briefs ready → **hand off to Stitch, STOP** | ⬜ not started |
| **3 — UI Design (Stitch)** | **Human** runs Stitch → review → Figma export → approval. Claude Code waits. | design approved | ⬜ not started |
| **4 — Frontend Implementation** | Build from approved design: layout, Explore, Distro page (MDX), download selector, i18n/RTL, rankings, search | quality gates pass | ⬜ not started |
| **5 — Backend Implementation** | D1/KV, ingestion (Cron), 50+ endpoints, hCaptcha, rate limits, caching, feeds | quality gates pass | ⬜ not started |
| **6 — Testing** | Unit + e2e + a11y + i18n + perf per Definition of Done | all green | ⬜ not started |
| **7 — Deployment** | Web → Vercel, API → Workers; secrets; smoke tests; monitoring; runbook in `docs/` | live + runbook committed | ⬜ not started |

Then iterate: Documentation → Design → Implementation → Testing → Review →
Documentation Update.

## Stitch screens to brief (Phase 2 checklist, minimum)

- [ ] Home / landing
- [ ] Explore / browse (grid + filters)
- [ ] Distro detail (MDX + download panel)
- [ ] Download selector modal
- [ ] Rankings
- [ ] Hall of Fame
- [ ] Category / Tag page
- [ ] Search results
- [ ] Compare
- [ ] Distro-finder quiz
- [ ] Contribute / report
- [ ] About
- [ ] 404 / error
- [ ] Global nav + language switcher
- [ ] Mobile nav

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
