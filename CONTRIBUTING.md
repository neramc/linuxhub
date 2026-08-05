# Contributing

Thanks for looking. This file is deliberately short — it points at the real
documents rather than restating them, because a second copy of a rule is a
copy that goes stale.

## Setup

```bash
bun install       # Bun is the package manager, test runner and script runner
bun run dev:web   # http://localhost:5173, no credentials needed
```

The dev server runs entirely from a committed data snapshot. You do not need a
Cloudflare or Vercel account to work on anything except deployment.

Layout, workspace boundaries and how to add a package: [`docs/monorepo.md`](docs/monorepo.md).

## Before you open a pull request

```bash
bun run check:boundaries && bun run check && bun run lint && bun run test && bun run build
```

**If you touched the UI, also run the e2e and accessibility gate.** It is not
part of `bun run test`, it needs a production build first, and it has already
caught a change that every other check passed:

```bash
bun run --filter '@linuxhub/web' build && cd apps/web && bun run test:e2e
```

The pull request template asks which documentation your change satisfies. That
is not paperwork — see the next section.

## Five rules that will get a change rejected

These are the project's, not preferences, and they are stated in full in
[`CLAUDE.md`](CLAUDE.md) and the `.ai/` docs.

1. **No hand-typed facts.** Versions, dates, editions, requirements and mirror
   lists come from an official API, feed or structured source, and are stored
   with `source_url` + `fetched_at`. If there is no fetchable source, the field
   stays empty. `apps/web/src/lib/server/data.ts` is a *work list of things
   still to be sourced*, not a place to add data.
2. **Register a source before writing its fetcher.** A new upstream needs a row
   in [`.ai/data-sources.md`](.ai/data-sources.md) with its `robots.txt` and
   terms actually checked — not assumed. A source that disallows us is not
   used; we link out instead.
3. **Popularity comes only from our own signals.** Never a third-party
   popularity chart, under any framing.
4. **The design is frozen** (ADR-0017/0018, owner-approved). Do not restyle an
   approved screen. A genuinely new visual pattern goes component inventory →
   comp in [`design/`](design/) → approval → code, in that order.
5. **No hardcoded UI strings, no physical CSS properties.** Everything goes
   through `@linuxhub/i18n`; layout uses logical properties so right-to-left
   locales keep mirroring.

Distro documentation has its own rules — paraphrase, never copy, and cite every
source in the frontmatter. See [`.ai/content.md`](.ai/content.md).

## Commits and decisions

One completed task, one commit, [Conventional Commits](https://www.conventionalcommits.org/),
and update the `.ai/` doc a change affects **in the same commit** — a doc that
lags its code is worse than no doc.

If your change makes an architectural decision, append an ADR to
[`.ai/decisions.md`](.ai/decisions.md). Append: never edit an existing entry,
even to correct a path that has since moved. They are a record of what was
decided and why, not a description of the present.

If a decision is genuinely open, stop and raise it rather than settling it
quietly in code.

## Reporting a security issue

See [`SECURITY.md`](SECURITY.md). Please do not open a public issue for a
vulnerability.

## If you maintain a distribution we catalog

Two things you may want, both handled without argument:

- **Our crawler is bothering you.** The policy is in
  [`.ai/security.md`](.ai/security.md) — official APIs preferred, `robots.txt`
  respected, one request per second per host. If our traffic is still a problem,
  open an issue and we will change or drop the source.
- **We are using your logo and you would rather we did not.** Say so and we
  remove the file and link out to you instead. Attribution and trademark notes
  are in [`assets/distros/ATTRIBUTION.md`](assets/distros/ATTRIBUTION.md).
