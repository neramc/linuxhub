# Architecture

## System diagram

```
                     ┌────────────────────────────── Vercel ─────────────────────────────┐
                     │  apps/web — SvelteKit (Svelte 5 runes, TS strict)                 │
 Browser ──────────▶ │  ┌─────────────┐      ┌─────────────────────────────┐            │
   │                 │  │  UI routes  │      │  /api/v1/* — BFF routes     │            │
   │  HTML/JSON      │  │  (SSR+CSR)  │─────▶│  public API, proxy + cache  │            │
   └───────────────  │  └─────────────┘      └──────────────┬──────────────┘            │
                     └──────────────────────────────────────┼───────────────────────────┘
                                                            │ fetch (service token header)
                     ┌────────────────────── Cloudflare ────▼───────────────────────────┐
                     │  apps/api — Hono on Workers (workerd runtime)                    │
                     │  ┌──────────────┐   ┌──────────┐   ┌───────────────────────────┐ │
                     │  │ REST handlers│──▶│    D1    │   │ Cron Triggers → ingest    │ │
                     │  │ (Zod-valid.) │   │ (SQLite) │   │ (packages/ingest fetchers)│ │
                     │  └──────┬───────┘   └──────────┘   └─────────────┬─────────────┘ │
                     │         │        ┌──────────┐                    │               │
                     │         └───────▶│    KV    │◀───────────────────┘               │
                     │                  │  caches  │                                    │
                     │                  └──────────┘                                    │
                     └──────────────────────────────────────────────────────────────────┘
                                                            │ robots-aware fetch
                                        Official distro APIs / release pages / mirror
                                        manifests / Repology / GitHub Releases / Wikidata
```

## Runtime boundaries (critical)

| Where | Runtime | What runs there | What NOT to use there |
|---|---|---|---|
| `apps/web` | Vercel (Node/Edge via SvelteKit adapter) | UI SSR, `/api` BFF, sitemap | D1/KV bindings (Worker-only) |
| `apps/api` | Cloudflare Workers (workerd) | Hono REST, ingestion cron, D1/KV | Bun/Node-only APIs (`fs`, `Bun.*`, `node:*` beyond compat list) |
| Local dev | Bun | package management, scripts, Vitest, builds; `wrangler dev` for the Worker | assuming Bun APIs exist in production |

Backend code targets Web-standard APIs (`fetch`, `Request`, `Response`,
`crypto.subtle`) plus Workers bindings (`env.DB` for D1, `env.KV_*` for KV).

## Layers and responsibilities

### 1. `apps/web` — SvelteKit on Vercel
- Renders all UI routes with SSR + hydration; locale-prefixed routing (`/ko/...`).
- Hosts the **public API** under `/api/v1/*` as a BFF:
  - Validates query/body with shared Zod schemas (`packages/shared`).
  - Proxies to the Worker, attaching an internal service token header.
  - Caches responses (`Cache-Control`, `ETag`, `stale-while-revalidate`) so the
    Worker and D1 stay cold for hot paths.
  - Serves web-native outputs: `sitemap.xml`, OpenSearch XML, RSS/Atom passthrough.
- Never talks to D1/KV directly — always through the Worker.

### 2. `apps/api` — Hono on Cloudflare Workers
- Owns all data: D1 reads/writes, KV caching, download resolution, rankings
  computation, hCaptcha verification, rate limiting.
- Exposes the internal REST surface mirrored by the BFF (same paths, `/v1/*`).
- Runs ingestion on **Cron Triggers** (see `.ai/data-sources.md` for cadence).

### 3. `packages/*`
- `shared` — TS types, Zod schemas, constants (single source for both apps).
- `ui` — shared Svelte components + design tokens (consumed by `apps/web`).
- `i18n` — Paraglide message catalogs + locale registry (see `.ai/i18n.md`).
- `ingest` — robots-aware fetchers/normalizers; imported by the Worker cron.

## Data flow — browse

1. Browser requests `/{locale}/explore?category=desktop`.
2. SvelteKit `load` calls the BFF (`/api/v1/distros?...`) server-side.
3. BFF checks its HTTP cache → on miss, fetches Worker `/v1/distros?...`.
4. Worker checks KV (`cache:distros:<query-hash>`) → on miss, queries D1,
   stores in KV with TTL, returns JSON envelope.
5. BFF sets `ETag`/`Cache-Control` and returns; page renders cards from
   shared `packages/ui` components.

## Data flow — download resolution

1. User walks the selector: version → edition → arch → format → mirror
   (options come from `GET /distros/:slug/download-options`, geo-ranked
   mirrors from `GET /mirrors/nearest?country=`).
2. Client posts `{ slug, version, edition, arch, format, mirror }` to
   `POST /api/v1/downloads/resolve`.
3. Worker checks KV `dl:<hash>` → on miss, joins `artifacts` ×
   `artifact_mirrors` × `mirrors` in D1, builds the direct URL, caches in KV.
4. Response: direct URL + size + sha256 + signature URL + verify instructions.
5. Client fires `POST /api/v1/downloads/track` (rate-limited, KV counter →
   periodically flushed to D1 for rankings).

## Data flow — ingestion

1. Cron Trigger fires (per-source schedule).
2. `packages/ingest` fetcher checks robots.txt policy (cached), fetches the
   official API/release page with descriptive UA + contact URL.
3. Normalizer maps the payload to D1 rows (`releases`, `artifacts`,
   `mirrors`, `artifact_mirrors`), recording `source_url` + `fetched_at`.
4. Warm KV: latest-version cache, download-options cache invalidation.
5. Failures log + back off; never hammer a source.

## Caching strategy (layered)

| Layer | What | TTL |
|---|---|---|
| Vercel/BFF HTTP cache | list/detail/search GET responses | 60s–5min + SWR |
| KV | query results, resolved downloads, geo→locale, version fetches | per key, see `.ai/database.md` |
| D1 | source of truth | — |
| Browser | static assets immutable; API responses via ETag | — |

Invalidation: ingestion bumps a per-distro `version` KV key that the Worker
includes in cache keys — no manual purging.

## Error handling

Single typed error envelope everywhere (defined in `.ai/api.md`). The BFF maps
Worker failures to the same envelope; unexpected errors become `500` with an
opaque `request_id` for correlation (logged, never leaked stack traces).

## Environments

| Env | Web | API |
|---|---|---|
| local | `bun dev` (SvelteKit) | `wrangler dev` (Miniflare, local D1/KV) |
| preview | Vercel preview deploys | Workers preview env (`wrangler deploy --env preview`) |
| production | Vercel prod | Workers prod + D1/KV prod bindings |

Secrets: Vercel env vars (web) and Wrangler secrets (api). Never in the repo.
