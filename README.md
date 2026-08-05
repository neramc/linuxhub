# Linuxhub

A fast, multilingual catalog for browsing almost every Linux distribution —
Flathub-style card browsing paired with a guided download flow that walks you
from version → edition → architecture → file format → country mirror and hands
you a direct link with its checksum.

[![CI](https://github.com/neramc/linuxhub/actions/workflows/ci.yml/badge.svg)](https://github.com/neramc/linuxhub/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE.md)

> **Status: pre-launch.** Not deployed yet. The frontend is complete across all
> 15 screens with real release data, 36 authored distro docs, and a working
> Korean locale; the backend has its schema, cron ingestion and read endpoints,
> and the site is mid-migration from a committed data snapshot onto that
> backend. Download resolution — the flow described above — is **not built
> yet**. `.ai/handoff.md` is the honest, current picture, including a table of
> what is deliberately empty and why.

## Why it exists

Choosing and downloading a Linux distribution is worse than it should be.
Release pages disagree with each other, mirrors are a wall of unlabelled URLs,
checksums are a separate page you are trusted to find, and almost none of it
exists outside English. Linuxhub is an attempt at the boring version of that
problem being solved properly: accurate data with visible provenance, a
download you can verify, in your own language.

## Two rules that shape the whole codebase

Both are enforced rather than encouraged, and they explain most of the design
decisions you will run into:

**Nothing factual is hand-typed.** Versions, release dates, EOL dates, LTS
flags and mirror lists all come from official APIs, and every row stores the
`source_url` and `fetched_at` it came from. If a fact has no source we can
fetch, the field stays empty and the UI says nothing rather than guessing.
Several tables are empty right now for exactly this reason.

**Popularity comes only from our own signals.** Download counts and rankings
are built from clicks this site actually observes. Scraping a third-party
popularity chart is forbidden, which is why rankings are empty until the site
has traffic rather than seeded with plausible numbers.

The corollary matters if you are running a distro's infrastructure: everything
we fetch goes through a documented crawler policy — official APIs preferred,
`robots.txt` respected (a disallowed source is simply not used), one request
per second per host, conditional requests, aggressive caching, and a
descriptive User-Agent with a contact URL. See
[`.ai/security.md`](.ai/security.md) and [`.ai/data-sources.md`](.ai/data-sources.md).
If our traffic is a problem for you, the contact URL in the User-Agent is the
fastest way to reach us.

## Stack

| Layer | Choice |
|---|---|
| Monorepo | Bun workspaces |
| Frontend | SvelteKit (Svelte 5 runes) → Vercel |
| Public API | SvelteKit routes acting as a BFF |
| Backend | Hono → Cloudflare Workers |
| Data | Cloudflare D1 (SQLite) + KV, filled by Cron Triggers |
| Content | mdsvex, authored per distro per locale |
| Tooling | TypeScript strict, Biome, Vitest, Playwright + axe |

## Quick start 

```bash
bun install
bun run dev:web          # http://localhost:5173
```

That runs entirely from a committed data snapshot — no accounts, no
credentials, no network. To run the backend too:

```bash
cd apps/api
bunx wrangler d1 migrations apply linuxhub --local
bunx wrangler dev --local --test-scheduled
```

Everything else — layout, workspace boundaries, the dependency catalog, how to
add a workspace — is in [`docs/monorepo.md`](docs/monorepo.md).

## Checks

```bash
bun run check:boundaries   # runtime + dependency-direction rules
bun run check              # TypeScript across every workspace
bun run lint               # Biome (bun run format autofixes)
bun run test               # Vitest
bun run build              # every workspace with a build script
```

The accessibility and end-to-end gate is **not** part of `bun run test` — it
needs a production build first, and it has already caught a change every other
check passed:

```bash
bun run --filter '@linuxhub/web' build
cd apps/web && bun run test:e2e
```

## Documentation

Two audiences, and the split is deliberate.

| Where | For | Contents |
|---|---|---|
| [`.ai/`](.ai/) | agents and maintainers | Project memory and the single source of truth: architecture, API catalog, schema, data sources, i18n, security, the ADR log, and `handoff.md` — read that one first |
| [`docs/`](docs/) | humans | [monorepo conventions](docs/monorepo.md), the [deployment runbook](docs/deployment.md) |
| [`design/`](design/) | — | Approved HTML/CSS comps. The visual system is frozen (ADR-0017/0018) |
| [`content/`](content/) | — | Authored distro documentation, cited, per locale |

When these disagree, `.ai/` wins — the order is `.ai/` > `docs/` > `prompts/` >
code, and it is stated in [`CLAUDE.md`](CLAUDE.md).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). The short version: the checks above
must pass, the design is frozen, no UI string is hardcoded, and no fact ships
without a source.

## Licensing

Not a single licence, and the difference matters here.

- **Code** — [Apache-2.0](LICENSE.md).
- **Distro logos** in `assets/distros/` — **not ours**. They are trademarks of
  their respective projects, used unmodified as nominative references to
  identify each distribution. Per-file source, licence and trademark notes are
  in [`assets/distros/ATTRIBUTION.md`](assets/distros/ATTRIBUTION.md). Some
  carry their own free licence (Debian's Open Use Logo, the Nix snowflake);
  most are used under trademark fair use. **If you represent a project and
  object to our use of your mark, tell us and we will remove the file and link
  out to you instead** — that is the standing policy, not a negotiation.
- **Distro documentation** in `content/` — written by us from official
  documentation, never copied, with sources cited in each file's frontmatter.
  The upstream documentation it paraphrases remains under its own licence.

Linuxhub is not affiliated with, endorsed by, or sponsored by any of the
distributions it catalogs.
