# Security

## hCaptcha — write actions only

| Endpoint | Captcha |
|---|---|
| `POST /suggest-distro`, `POST /report`, `POST /feedback`, `POST /mirrors/report-status` | **required**, verified server-side in the Worker against `HCAPTCHA_SECRET` before any processing |
| Browsing, search, `downloads/resolve`, `downloads/track` | **never** gated by captcha (rate-limited instead) |

Frontend renders hCaptcha only on the contribute/report forms via the shared
`CaptchaGate` component. Sitekey is public config; the secret exists only as a
Wrangler secret.

## Rate limiting

KV fixed-window counters keyed on a **salted hash** of the client IP
(`rl:<scope>:<ip-hash>:<window>`); raw IPs are never stored or logged.

| Scope | Limit (per IP) |
|---|---|
| write endpoints (each) | 5 / min, 30 / day |
| `downloads/resolve` | 30 / min |
| `downloads/track` | 30 / min |
| `search/suggest` | 60 / min |

Over limit → `429` + `Retry-After`. Limits are constants in
`packages/shared` — change = update here too.

## Headers (both apps)

- `Content-Security-Policy`: `default-src 'self'`; `img-src 'self' data:`;
  `script-src 'self'` + SvelteKit's required hashes + hCaptcha script host
  (contribute pages only); `frame-src` hCaptcha only; `connect-src 'self'`.
  No other third-party origins. No inline scripts beyond what SvelteKit needs.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Content-Type-Options: nosniff`
- `Permissions-Policy`: camera/mic/geolocation disabled.

## Secrets

| Secret | Where |
|---|---|
| `HCAPTCHA_SECRET` | Wrangler secret (api) |
| `INTERNAL_API_TOKEN` | Wrangler secret (api) + Vercel env (web) |
| `RATE_SALT` | Wrangler secret (api) |

Never in the repo, never in logs, never in error responses. `.env*` is
gitignored; local dev uses `.dev.vars` (gitignored) for Wrangler.

## Internal surface

The Worker rejects requests without a valid `X-Internal-Token` (constant-time
compare) except `/v1/health`. The BFF is the only public entry point and
forwards nothing sensitive from clients.

## Input handling

- Zod validation on every input at both layers (BFF + Worker).
- D1 access only via bound parameters — no string-built SQL.
- MDX content is authored in-repo (trusted), but frontmatter is schema-validated
  at build; community submission payloads are stored as opaque JSON and
  rendered escaped in any admin view.
- Uploaded/ingested URLs are validated (https, allowlisted hosts per
  `.ai/data-sources.md`) before being stored as download/mirror URLs.

## Crawler ethics (binding for `packages/ingest`)

- **Respect `robots.txt`** — parsed and cached per host; disallowed paths are
  never fetched. Prefer official APIs over HTML scraping.
- Descriptive User-Agent: `linuxhub-ingest/<version> (+https://<site>/about#crawler)`
  with a contact URL.
- Polite rates: ≤1 request/sec/host, exponential backoff on 429/5xx,
  conditional requests (`ETag`/`If-Modified-Since`) wherever supported.
- Cache aggressively (KV `versions:*`); never re-fetch unchanged resources
  inside a TTL window.
- Log `source_url` + `fetched_at` for every ingested record (`ingest_log`).
- Per-source robots/ToS status recorded in `.ai/data-sources.md` **before**
  a fetcher is written; if terms forbid use, the source is not used.

## Privacy

No accounts, no cookies beyond locale/theme preferences (no tracking
cookies), no third-party analytics in v1. Download tracking is aggregate
per-artifact-per-day counts only.
