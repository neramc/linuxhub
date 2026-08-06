# Monorepo layout and conventions

How this repository is wired, and the rules that keep six workspaces from
drifting into each other. Decisions and their reasoning live in ADR-0001
(Bun workspaces), ADR-0002 (the two deployed runtimes) and ADR-0023 (these
conventions).

## Layout

```
apps/
  web/        SvelteKit → Vercel.       Public site + the /api/v1 BFF.
  api/        Hono → Cloudflare Workers. D1, KV, cron ingestion.
packages/
  shared/     Zod schemas, the API envelope, constants. Imported by both apps.
  ui/         Design tokens + Svelte components + brand presentation.
  i18n/       Locale registry, message catalogs, the message runtime.
  ingest/     Source fetchers and normalizers. Imported by the Worker cron.
content/      Authored distro MDX, per distro per locale.
design/       Approved HTML/CSS comps — the visual source of truth.
scripts/      Repo-level tooling that is not part of a workspace.
```

`packages/*` are consumed as **TypeScript source**, not built artifacts. There
is no compile step between a package and its consumer, which is why there is no
task graph to orchestrate (ADR-0023).

## The two rules that are enforced, not just documented

`bun run check:boundaries` fails the build on either. It runs first in CI,
before the slower gates.

1. **Runtime boundary.** `apps/api/src` runs on workerd: no `node:` imports, no
   `Bun.` globals. `wrangler.toml` sets no `nodejs_compat` flag, so these fail
   at deploy, not at review. Tests are exempt — they run under Vitest and are
   never bundled. Type-only imports are exempt because they are erased.
2. **Dependency direction.** `packages/*` may not import an app, and the two
   apps may not import each other — they are separate deployments that talk
   over HTTP.

`packages/ingest` is the reason the first rule exists: the Worker imports its
fetchers while its CLI half legitimately uses `Bun.file` and `node:fs`. Only
the import graph separates them, so the graph is checked.

## Dependency versions

Anything used in more than one workspace lives in the **catalog** in the root
`package.json`:

```jsonc
"workspaces": {
  "packages": ["apps/*", "packages/*"],
  "catalog": { "svelte": "…", "typescript": "…", "vitest": "…" }
}
```

Workspaces then declare `"typescript": "catalog:"`. To bump one, edit the root
and run `bun install` — one line, every workspace, no possibility of drift.

A dependency used by exactly one workspace stays in that workspace. Promote it
to the catalog when a second one needs it, not before.

**Dependabot is deliberately off.** It does not understand Bun catalogs and
would either miss those versions or rewrite them wrongly. Catalog bumps are
manual until that support lands.

## The toolchain is pinned on purpose

`packageManager` in the root manifest is the single source for the Bun version,
and both CI jobs read it with `bun-version-file`. Biome is pinned to an exact
version matching the schema in `biome.json`.

This is not fastidiousness. A caret range on Biome plus `bun-version: latest`
in CI is what let the formatter move from 2.3 to 2.5 with no commit, adding
rules that broke lint on files nobody had touched.

## TypeScript

`tsconfig.base.json` at the root holds the options every workspace shares. A
workspace declares only its differences — its `types`, any extra `lib`, its
`include`.

`apps/web` is the exception and extends SvelteKit's generated
`.svelte-kit/tsconfig.json` instead. That file owns `paths` and `rootDirs`;
overriding it is how `$lib` imports break.

## The web build reaches outside its own directory

`apps/web` reads two things from the repository root: `packages/*`, consumed as
TypeScript source, and `content/distros/`, picked up by an `import.meta.glob`
that climbs five levels. Any deployment that gives the build only `apps/web`
is broken — and only half of it is broken *loudly*: a missing package fails
import resolution, while a glob matching nothing is not an error at all.

The Vite plugin `linuxhub:require-distro-content` closes that half. It counts
the authored docs at `buildStart` and fails the build with a message naming the
cause, so the failure can never be a site that builds cleanly and serves empty
distro pages. `docs/deployment.md` § 6 covers what this means on Vercel.

## Scripts

Every command runs from the repository root.

| Command | What it does |
|---|---|
| `bun run check:boundaries` | the two rules above |
| `bun run check` | `tsc` / `svelte-check` in every workspace |
| `bun run lint` | Biome across the repo (`bun run format` autofixes) |
| `bun run test` | Vitest in every workspace |
| `bun run build` | every workspace that has a build script, in parallel |
| `bun run dev:web` / `dev:api` | SvelteKit dev server / `wrangler dev` |

`--filter '*'` skips workspaces with no such script, so a new workspace joins
`check`, `test` and `build` by existing — nothing to register.

**The e2e and accessibility gate is not part of `bun run test`.** It needs a
production build first, and it has already caught one change that every other
gate passed:

```bash
bun run --filter '@linuxhub/web' build
cd apps/web && bun run test:e2e
```

## Adding a workspace

1. `apps/<name>/` or `packages/<name>/` with a `package.json` named
   `@linuxhub/<name>`.
2. Extend `../../tsconfig.base.json`; declare only what differs.
3. Shared dependency versions come from the catalog (`"catalog:"`).
4. Give it `check` and `test` scripts — the root scripts pick it up with no
   further wiring.
5. If it is an app with its own runtime, add its rule to
   `scripts/check-boundaries.ts`. A runtime constraint that only exists in
   prose is one nobody notices breaking.
