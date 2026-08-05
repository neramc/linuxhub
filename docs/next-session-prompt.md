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
session stopped. 5.1-5.3 are done, four of the five movable BFF routes proxy
the Worker (health, releases/recent, search, distros), and 5.6 download
resolution is done END TO END for arch and fedora — the download button
delivers a real file with its checksum, and clicks are counted.

Read first, in this order:
  1. .ai/handoff.md      - current state, "Which BFF routes have moved", what
                           is EMPTY ON PURPOSE (read that table before
                           "fixing" a blank field), commands, container traps
  2. .ai/roadmap.md      - Phase 5 breakdown with done-when criteria
  3. .ai/frontend-contract.md - what the frontend consumes and which of its
                           open questions are settled
  4. .ai/api.md, .ai/database.md, .ai/backend-rules.md - the specs
  5. .ai/decisions.md ADR-0019..0025 - the decisions already locked in.
                           ADR-0024 in particular: a mirror row is only a
                           download base if its SOURCE says so

Goal for this session: pick up the highest-value unblocked work. In order of
value:

  a) Artifact sources for the other TEN distros. 5.6 built the whole
     machinery and proved it on arch + fedora; every other distro still shows
     the placeholder download section because no artifact source is
     registered for it. Ubuntu and Debian SHA256SUMS are already verified in
     .ai/data-sources.md and not yet wired (they publish no sizes, so each ISO
     needs its own HEAD). This is what unblocks distros/:slug.
  b) 5.5 write endpoints behind hCaptcha + KV rate limits.
  c) 5.7 retiring data.ts. Note `requirements` still has NO table and NO
     source — the detail page renders a hardcoded four-row list.

  When you add an artifact source, verify a resolved URL by FETCHING it. A
  Fedora mirror-base bug survived unit tests, live ingestion and a
  code review, and died the moment a resolved URL was actually requested.

Do NOT move the BFF's distros/:slug, rankings, hall-of-fame or quiz routes
yet. Each reads a table that is legitimately empty, and moving one replaces a
working screen with a blank one. .ai/handoff.md says which and why. rankings
is no longer blocked on plumbing — the counter path is live — it is blocked on
real traffic, which no fetch can supply.

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
- The reconciled Zod schemas already exist in packages/shared/src/schemas.ts
  and constrain both sides — import them rather than redeclaring shapes.
  Question 4 in .ai/frontend-contract.md (where the editorial sets live) is
  still open; answer it with an ADR rather than deciding it silently.
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
  shells out to curl for that reason. workerd's fetch DOES work here, so the
  Worker cron can be run against live sources locally.
- Free a port with `fuser -k <port>/tcp`; never `pkill -f` a pattern that
  matches your own shell.
- apps/web/src/app.html: never write the lang/dir placeholder tokens literally
  anywhere in that file. hooks.server.ts substitutes them with a
  single-occurrence String.replace, so an earlier mention — even in a comment —
  eats the substitution. `bun run test` does not catch it; the e2e axe gate does.
- Biome resolves to 2.5.4. If lint fails on files you did not touch, that is why.

Cloudflare/Vercel/hCaptcha accounts are NOT provisioned — wrangler.toml holds
placeholder ids and production D1 is empty. Build and test against
`wrangler dev --local`; leave anything needing real credentials for Phase 7 and
list it explicitly in your report.

Start by reading the docs above, then give me a short plan before you write
code.
```

---

## Variants

Swap the goal paragraph when the session's focus differs.

**Wikidata lineage (task 5.3b — unblocks the family facet before 5.4):**

```text
Goal for this session: fill distros.family / based_on and the taxonomy tables
from Wikidata, which 5.2 deliberately left empty rather than hand-typing. Add
the verified registry row for query.wikidata.org/sparql (CC0) to
.ai/data-sources.md BEFORE writing the fetcher, then add it as a weekly cron
source alongside the existing three, following the shape in
packages/ingest/src/sources/. Slug-to-QID mapping belongs in registry.ts as a
pointer, not a fact. Every row it writes carries source_url + fetched_at.
```

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
