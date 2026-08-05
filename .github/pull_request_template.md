<!--
Keep this short. The sections below are the ones where this project has been
bitten before — everything else belongs in the commit messages.
-->

## What changed and why

<!-- One paragraph. The problem, not the diff — the diff is below. -->

## Which doc this satisfies

<!--
CLAUDE.md golden rule 1: documentation comes before implementation, and
golden rule 4: every change is documented. Name the `.ai/` doc this
implements, and confirm it was updated in the same commit if the change
moved away from what it said.

If this made an architectural decision, it needs an ADR appended to
`.ai/decisions.md` — a new entry at the end, never an edit to an existing one.
-->

## Gates

```
bun run check:boundaries && bun run check && bun run lint && bun run test && bun run build
```

- [ ] The above passes.
- [ ] **UI changed?** Also ran the e2e + axe gate, which is *not* part of
      `bun run test`:
      `bun run --filter '@linuxhub/web' build && cd apps/web && bun run test:e2e`

## Things this project treats as blocking

Tick only what applies; delete the rest.

- [ ] **Design is frozen** (ADR-0017/0018). No approved screen was restyled.
      A genuinely new visual pattern went inventory → `design/` comp →
      approval → code, in that order.
- [ ] **No hand-typed facts.** Every factual value came from an official API,
      feed or structured source and is stored with `source_url` + `fetched_at`.
      Popularity comes only from our own counters.
- [ ] **A new data source** was registered in `.ai/data-sources.md` with its
      robots/ToS verified *before* its fetcher was written.
- [ ] **No hardcoded UI strings** — everything goes through `@linuxhub/i18n`,
      and layout uses logical CSS properties so RTL keeps mirroring.
- [ ] **Schema change** ships as a new forward-only migration, with
      `.ai/database.md` updated in the same commit.

## Anything left deliberately incomplete

<!--
Say so here rather than letting the next session discover it. If something is
empty on purpose — a table with no permitted source yet, a route that cannot
move — name it and say what unblocks it.
-->
