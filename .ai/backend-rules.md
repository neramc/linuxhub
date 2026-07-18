# Backend Rules — `apps/api` (Hono on Cloudflare Workers)

## Runtime

Deployed on the **Cloudflare Workers runtime (workerd)** via Wrangler. Code
uses Web-standard APIs + Workers bindings only:

- `env.DB` — D1 database
- `env.KV_CACHE`, `env.KV_RATE`, `env.KV_GEO` — KV namespaces
- `env.HCAPTCHA_SECRET`, `env.INTERNAL_API_TOKEN` — Wrangler secrets

No Bun/Node-only APIs in `apps/api`. Bun is used only to run scripts/tests
locally; local serving via `wrangler dev`.

## Project structure

```
apps/api/src/
├─ index.ts            # Hono app: routes mounted, cron export
├─ routes/             # one file per resource (distros.ts, downloads.ts, …)
├─ middleware/          # auth (internal token), rate-limit, cache, error
├─ services/           # business logic (download-resolver, rankings, search)
├─ db/                 # D1 query modules (typed, no inline SQL in routes)
├─ cron/               # ingestion entrypoints per schedule
└─ lib/                # envelope, errors, hcaptcha, geo, hashing
packages/ingest/       # fetchers + normalizers (imported by cron/)
```

Routes stay thin: validate → call service → wrap in envelope. SQL lives only
in `db/` modules. Shared types/schemas come from `packages/shared`.

## Validation

- **Zod on every input**: params, query, body — schemas imported from
  `packages/shared` (the same schemas the BFF uses).
- Validation failure → `400` with `VALIDATION_ERROR` envelope listing issues.
- Never trust `?locale=` etc. — validate against the registry.

## Error format

Single envelope (canonical definition in `.ai/api.md`):

```json
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "…", "details": {}, "request_id": "…" } }
```

- Typed error codes: `VALIDATION_ERROR`, `NOT_FOUND`, `RATE_LIMITED`,
  `CAPTCHA_FAILED`, `UPSTREAM_ERROR`, `INTERNAL`.
- Central error middleware converts thrown `ApiError`s; unknown errors →
  `INTERNAL` + logged with `request_id`; stack traces never leak.

## Auth (internal)

The Worker only accepts requests carrying `X-Internal-Token` matching
`INTERNAL_API_TOKEN` (BFF-to-Worker), except `/v1/health`. There is no public
user auth in v1.

## Caching

- KV read-through helper: `cached(key, ttl, fetcher)` — all cacheable services
  use it. Keyspace + TTLs defined in `.ai/database.md`.
- Cache keys include a per-distro generation counter bumped by ingestion, so
  updates invalidate naturally.
- Responses also carry `Cache-Control` hints the BFF respects.

## Rate limiting

KV-based fixed-window counters (`rl:<scope>:<ip-hash>:<window>`), enforced by
middleware on: all write endpoints, `downloads/resolve`, `downloads/track`,
`search/suggest`. Over limit → `429` + `Retry-After`. Limits per endpoint in
`.ai/security.md`. IPs are hashed with a salt secret — raw IPs are never stored.

## hCaptcha

Write endpoints (`suggest-distro`, `report`, `feedback`,
`mirrors/report-status`) require an hCaptcha token, verified server-side
against `HCAPTCHA_SECRET` **before** any processing. Failure →
`403 CAPTCHA_FAILED`. Never gate reads.

## Ingestion (Cron Triggers)

- Schedules (start point; tune per source in `.ai/data-sources.md`):
  - hourly — release checks for rolling/high-frequency sources
  - every 6h — standard release + artifact refresh
  - daily — mirror lists, metadata, logo/license audit
  - weekly — rankings snapshot to `rankings` table
- Every fetch: robots-aware, descriptive UA + contact URL, timeout + retry
  with backoff, result logged with `source_url` + `fetched_at`.
- Ingestion is idempotent (upserts keyed on natural keys); partial failure of
  one source never blocks others.

## Logging

Structured JSON logs: `{ ts, level, request_id, route, status, ms, msg }`.
Cron logs add `{ source, fetched, changed }`. No PII, no raw IPs, no secrets.

## Testing

Vitest for services, resolvers, validators, rate-limit logic (Miniflare/
workers-pool environment). Every endpoint has at least: happy path, validation
failure, and NOT_FOUND coverage. Download resolution and rate limiting get
dedicated suites (quality gate).
