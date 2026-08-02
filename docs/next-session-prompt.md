# Continuation prompt — Phase 5

Paste the block below as the first message of the next session. It is written
to be self-contained: it names the entry-point docs, states the constraints
that are easy to violate, and sets a stopping point so the session produces
reviewable commits instead of one enormous change.

Keep this file updated at the end of each session so the next prompt reflects
where work actually stopped.

---

```text
Linuxhub, Phase 5 (Backend Implementation). Continue from where the last
session stopped — Phase 4 is complete and pushed to main.

Read first, in this order:
  1. .ai/handoff.md      — current state, real vs placeholder, working
                           commands, container quirks
  2. .ai/roadmap.md      — Phase 5 breakdown, tasks 5.1–5.7 with done-when
                           criteria
  3. .ai/api.md, .ai/database.md, .ai/backend-rules.md — the specs you build
                           against
  4. .ai/data-sources.md — "Replacing the placeholder data" + the verified
                           announcement-feed registry

Goal for this session: work tasks 5.1 → 5.3 (D1 schema → Cron ingestion on
the Worker → read endpoints). Stop after 5.3 and report; do not start 5.4
(pointing the BFF at the Worker) without checking in first, because that is
the change that can break the whole frontend at once.

Binding constraints — these are project rules, not preferences:

- Documentation before implementation. If something is architecturally
  undefined, stop and write the .ai/ doc first, then build.
- Every factual value comes from an official API, RSS/Atom feed, or Wikidata
  and is stored with source_url + fetched_at. Nothing factual is hand-typed.
  apps/web/src/lib/server/data.ts is a WORK LIST, not a data store — do not
  add facts to it.
- Popularity (downloads, rank, trend) comes from our OWN signals only —
  counters in KV aggregated into D1. Scraping DistroWatch or any third-party
  popularity chart is forbidden.
- Crawler ethics: respect robots.txt, prefer official APIs, descriptive
  User-Agent with a contact URL, ≤1 req/sec/host, cache aggressively. Register
  a source in .ai/data-sources.md BEFORE writing its fetcher.
- Never copy official documentation verbatim — paraphrase and cite.
- The design is FROZEN (ADR-0017/0018, owner-approved). Do not restyle any
  screen. If a feature truly needs a new visual pattern: component inventory
  → design/ comp → approval → code, in that order.
- No hardcoded UI strings — everything goes through @linuxhub/i18n. Logical
  CSS properties only, so RTL keeps mirroring.
- Keep the BFF response envelope { ok, data, meta } unchanged so the frontend
  does not move while the backend lands under it.
- One completed task = one commit, Conventional Commits, referencing the doc
  it satisfies. Never merge unrelated changes into one commit.

Before every commit run:
  bun run check && bun run lint && bun run test && bun run build
UI-affecting changes additionally need:
  bun run --filter '@linuxhub/web' build && cd apps/web && bun run test:e2e

Update the relevant .ai/ doc in the SAME commit as the change it describes,
append an ADR to .ai/decisions.md for any meaningful decision, and refresh
.ai/handoff.md + docs/next-session-prompt.md at the end of the session.

Environment notes that will otherwise cost you time:
- Dependencies and SvelteKit types are installed automatically by
  .claude/hooks/session-start.sh.
- Bun's fetch fails through this container's HTTPS proxy — the ingest CLI
  shells out to curl for that reason. On Workers, use native fetch.
- Free a port with `fuser -k <port>/tcp`; never `pkill -f` a pattern that
  matches your own shell.

Cloudflare/Vercel/hCaptcha accounts are NOT provisioned — wrangler.toml holds
placeholder ids. Build and test against `wrangler dev --local` and D1 local
migrations; leave anything needing real credentials for Phase 7 and list it
explicitly in your report.

Start by reading the docs above, then give me a short plan for 5.1–5.3
before you write code.
```

---

## Variants

Swap the goal paragraph when the session's focus differs.

**Data sourcing only (task 5.7 pulled forward, no backend prerequisites):**

```text
Goal for this session: replace the placeholder data in
apps/web/src/lib/server/data.ts with real sources, per the per-symbol plan in
.ai/data-sources.md. Extend packages/ingest/src/live.ts (the committed-snapshot
CLI) rather than waiting for the Worker: add Wikidata SPARQL for desktop /
package-manager / lineage facts, the official release APIs for editions, and
the 12 verified announcement feeds for release links. Every new source gets a
registry row with its robots/ToS check BEFORE its fetcher is written. Leave
downloads/rank/trend alone — those need real telemetry, not a source.
```

**Frontend feature work (no backend dependency):**

```text
Goal for this session: <feature>. The design is frozen (ADR-0017/0018) — build
with existing components and tokens from packages/ui. If the feature needs a
visual pattern that does not exist yet, stop and propose it rather than
inventing it in code. The axe gate and the e2e suite must stay green.
```
