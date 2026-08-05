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

## Worked example — one endpoint, all four layers

Build the first endpoint exactly like this, then copy the shape for the rest.
Sixty-one endpoints written to one pattern review far faster than sixty-one
variations. Helpers referenced here already exist in `packages/shared`:
`ok`, `err`, `ERROR_STATUS`, `paginationSchema`, `PAGINATION`.

**1. Schema — `packages/shared`** (imported by the Worker *and* the BFF, so
one definition constrains both sides):

```ts
export const distroListQuery = paginationSchema.extend({
  category: z.string().min(1).optional(),
  sort: z.enum(["popularity", "name", "latest_release", "newest"]).default("popularity"),
});
export type DistroListQuery = z.infer<typeof distroListQuery>;
```

**2. Query module — `src/db/distros.ts`** (all SQL lives here; parameters are
always bound, never interpolated):

```ts
export async function listDistros(db: D1Database, q: DistroListQuery) {
  const offset = (q.page - 1) * q.limit;
  const stmt = db
    .prepare(`SELECT d.slug, d.name, d.summary, d.family, d.homepage, d.status
              FROM distros d
              WHERE d.status = 'active'
              ORDER BY d.name
              LIMIT ?1 OFFSET ?2`)
    .bind(q.limit, offset);
  const { results } = await stmt.all<DistroRow>();
  return results;
}
```

**3. Service — `src/services/distros.ts`** (business logic + caching; routes
never call `db/` directly, so the cache is impossible to bypass):

```ts
export function listDistrosCached(env: Env, q: DistroListQuery) {
  return cached(env.KV_CACHE, `cache:distros:${gen}:${hashQuery(q)}`, 300, () =>
    listDistros(env.DB, q),
  );
}
```

**4. Route — `src/routes/distros.ts`** (validate → service → envelope; three
lines of logic, no SQL, no business rules):

```ts
distros.get("/", async (c) => {
  const parsed = distroListQuery.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json(err("VALIDATION_ERROR", "invalid query", parsed.error.issues),
                  ERROR_STATUS.VALIDATION_ERROR);
  }
  const rows = await listDistrosCached(c.env, parsed.data);
  return c.json(ok(rows, { page: parsed.data.page, limit: parsed.data.limit, total: rows.length }));
});
```

**5. Tests** — the three cases every endpoint owes (see Testing below): happy
path, validation failure, `NOT_FOUND`.

Things this example pins down, which are easy to get wrong once and then
repeat sixty times:

- `safeParse` + `VALIDATION_ERROR`, never a thrown Zod error reaching the client.
- `ERROR_STATUS[code]` for the HTTP status — never a hand-written number.
- `meta` on every list response, using the shared pagination defaults.
- Bound parameters (`?1`, `?2`) — string interpolation into SQL is a review
  blocker.
- `total` in the sketch above is a placeholder. **Settled in 5.3: it is a real
  `COUNT(*)`,** issued alongside the page query in a single `db.batch()`, so
  pagination does not lie about how much there is.

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
- Thrown `ApiError`s become the envelope; unknown errors → `INTERNAL` + logged
  with `request_id`; stack traces never leak.
- **Register the converter with `app.onError`, not as try/catch middleware.**
  Hono's composer hands a thrown error straight to the error handler, so
  middleware wrapping `next()` never sees it and the client gets Hono's default
  plain-text 500. `app.notFound` gets the same treatment, so unmatched routes
  answer in the envelope too and the BFF has exactly one shape to parse.

## Auth (internal)

The Worker only accepts requests carrying `X-Internal-Token` matching
`INTERNAL_API_TOKEN` (BFF-to-Worker), except `/v1/health`. There is no public
user auth in v1. Comparison is constant-time.

A bad or missing token answers **404**, not 403: the error taxonomy has no auth
code, and an internal surface should not confirm it exists to a caller that
cannot already reach it. The Worker logs the real reason (`internal token
missing` / `mismatch`), so a misconfiguration is diagnosable from logs rather
than looking like a missing distro.

With no token configured — local dev and tests, where `wrangler.toml` holds
placeholder ids and no secrets exist — the check is skipped. It cannot be
skipped in production, because Phase 7 provisions the secret.

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

Vitest against a **real D1 and real KV**, created by Miniflare in
`apps/api/test/harness.ts` (ADR-0021). The harness applies the files in
`migrations/` verbatim, so every test also exercises the schema — CHECK
constraints, UNIQUE keys and upsert conflict targets bite there exactly as they
will in production, which a hand-written stub would silently accept.

Every endpoint has at least: happy path, validation failure, and NOT_FOUND
coverage. Ingestion tests stub the HTTP transport (a test suite has no business
calling an upstream) but keep the database real. Download resolution and rate
limiting get dedicated suites (quality gate).
