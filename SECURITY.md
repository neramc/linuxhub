# Security Policy

## Reporting a vulnerability

Please report privately via GitHub's
[**Report a vulnerability**](https://github.com/neramc/linuxhub/security/advisories/new)
form rather than opening a public issue.

Include what you did, what happened, and what you expected. A proof of concept
helps; a full exploit chain is not required.

Expect an acknowledgement within a few days. This is a small project and there
is no bug-bounty programme — what we can offer is a prompt fix and credit in
the advisory if you want it.

## What is in scope

Where this project's risk actually lives, roughly in order:

- **The download flow.** Linuxhub's purpose is handing people a URL to an
  operating system image and a checksum to verify it against. Anything that
  could make us serve a wrong URL, a wrong checksum, or a mirror we did not
  intend is the most serious class of bug here. (The resolution flow is not
  built yet — see the status note in the README.)
- **Ingestion.** The backend fetches from third-party endpoints on a schedule
  and writes to the database. Injection through an upstream payload, or a way
  to make ingestion write a URL we did not fetch, is in scope.
- **The internal API boundary.** The Cloudflare Worker is meant to be reachable
  only by the site's own backend-for-frontend, authenticated with a shared
  token. Any way to bypass that is in scope.
- **The public API and the site**: injection, SSRF, XSS, cache poisoning,
  bypassing rate limits or the captcha on write endpoints.
- **Secret exposure** in logs, error responses, or the repository history.

## What is not

- Findings from automated scanners with no demonstrated impact.
- Denial of service through raw volume.
- Vulnerabilities in the Linux distributions we catalog — report those to the
  distribution. We are an index and are not affiliated with any of them.
- Missing hardening headers with no exploitable consequence, though we will
  still take the report.

## How the project handles secrets

No credential is ever committed. Worker secrets are set with
`wrangler secret put` and web secrets are Vercel environment variables; the
templates in the repository (`apps/api/.dev.vars.example`,
`apps/web/.env.example`) carry names and explanations only, never values. Raw
IP addresses are never stored or logged — rate limiting keys on a salted hash.
Full policy: [`.ai/security.md`](.ai/security.md).

## If you are a distribution or mirror operator

You are more likely to be here because of our crawler than because of a
vulnerability, so: our ingestion identifies itself as
`linuxhub-ingest/<version>` with a contact URL, prefers official APIs over
scraping, respects `robots.txt` absolutely — a disallowed source is not used at
all — makes at most one request per second per host, and caches aggressively so
unchanged resources cost you a 304.

If our traffic is a problem, or you would rather we did not use a source at
all, open an issue and we will change or drop it. No justification needed.
