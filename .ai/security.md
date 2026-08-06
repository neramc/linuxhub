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

**Implemented.** Asserted by `apps/web/e2e/security.spec.ts` and
`apps/api/test/health.test.ts` — a wrong header is invisible on the page, so it
has to be a test rather than a convention.

### Web (`apps/web`)

`Content-Security-Policy` is declared in **`svelte.config.js`** under
`kit.csp`, not hand-written: only SvelteKit knows the hashes and the nonce of
the scripts it injects. Everything else is set in `hooks.server.ts`, so the
headers are identical in dev, in `vite preview` and in production.

| Directive | Value | Note |
|---|---|---|
| `default-src` | `'self'` | |
| `script-src` | `'self'` + SvelteKit's nonce | |
| `style-src` | `'self' 'unsafe-inline'` | the approved comps use inline `style="…"` attributes throughout; see below |
| `img-src` | `'self' data:` | |
| `font-src`, `connect-src` | `'self'` | `connect-src` is what keeps the BFF the browser's only correspondent |
| `frame-src` | `'none'` | hCaptcha's hosts are added here when the write endpoints land in 5.5, and not before |
| `object-src`, `frame-ancestors` | `'none'` | |
| `base-uri`, `form-action` | `'self'` | |

`'unsafe-inline'` on **`style-src` only** is a deliberate, bounded exception.
A style attribute cannot execute, every value in one comes from our own markup
rather than from user input, and removing it means editing every approved
screen — a design change, not a security fix. It is **never** acceptable on
`script-src`.

Plus, from `hooks.server.ts`:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` — redundant with `frame-ancestors` in modern
  browsers, and the only protection in the ones that predate it
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`

The pre-paint theme script lives in **`static/theme.js`**, not inline in
`app.html`. SvelteKit nonces only the scripts it injects itself, so an inline
one is blocked and dark-mode visitors get a flash of light before hydration.
`script-src 'self'` covers the external file.

### Worker (`apps/api`)

`withSecurityHeaders` sets `default-src 'none'; frame-ancestors 'none'`,
`nosniff`, `DENY`, `no-referrer` and HSTS on every response including errors.
The Worker returns JSON to the BFF and nothing else; if one of its responses is
ever being rendered by a browser, something has gone wrong, and the strictest
possible policy makes that failure inert.

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
