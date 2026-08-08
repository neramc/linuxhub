# Deployment Runbook

How to get Linuxhub live: the Hono Worker on Cloudflare, the SvelteKit app on
Vercel. Everything here needs account access, which is why it is a runbook for
a human rather than something an agent can do.

> **Where the project actually is.** Phase 5 tasks 5.1–5.4 and 5.6 are done.
> The Worker has the schema, cron ingestion and twelve endpoints; the BFF
> proxies it for `health`, `releases/recent`, `search`, `distros` and all three
> download endpoints. `distros/:slug`, `rankings`, `hall-of-fame` and `quiz`
> still read the committed snapshot in `apps/web/src/lib/server/data.ts` — see
> `.ai/handoff.md` § "Which BFF routes have moved" for why each one.
>
> **Set `LINUXHUB_API_URL` and `INTERNAL_API_TOKEN` in Vercel (§6).** Without
> them the deploy silently serves the snapshot for everything and the download
> buttons resolve nothing. `GET /api/v1/health` reports which mode is live.

Verify commands are marked ✅. Run them; do not assume.

---

## 0. Prerequisites

```bash
bun install
bunx wrangler login          # opens a browser; authorizes the Cloudflare account
```

Wrangler is a workspace dependency — `bunx wrangler` inside `apps/api` uses the
pinned version rather than whatever is global.

> **Windows.** Every command here runs in `cmd.exe` and PowerShell as written.
> Commands elsewhere in the repo use `bun run --filter '@linuxhub/…' <script>`,
> which **fails in `cmd.exe`**: single quotes are not quote characters there, so
> the filter arrives with the quotes attached and bun answers `error: No
> packages matched the filter`. Use double quotes, or `cd` into the workspace
> and run the script directly, as this runbook does throughout.

---

## 1. Cloudflare — create the resources

All four commands print an id. Keep the output; step 2 needs it.

```bash
cd apps/api

bunx wrangler d1 create linuxhub
bunx wrangler kv namespace create KV_CACHE
bunx wrangler kv namespace create KV_RATE
bunx wrangler kv namespace create KV_GEO
```

## 2. Paste the ids into `wrangler.toml`

`apps/api/wrangler.toml` ships with zeroed placeholders so local dev and
dry-run builds work without an account. Replace them:

| Placeholder in `wrangler.toml` | Replace with |
|---|---|
| `database_id = "00000000-0000-0000-0000-000000000000"` | the uuid from `d1 create` |
| `id = "0000000000000000000000000000cace"` (KV_CACHE) | the id from `kv namespace create KV_CACHE` |
| `id = "0000000000000000000000000000ea7e"` (KV_RATE) | …`KV_RATE` |
| `id = "00000000000000000000000000000e60"` (KV_GEO) | …`KV_GEO` |

Leave `[vars] SITE_ORIGIN` alone unless the domain changes — see §7.

✅ Check the config resolves before going further:

```bash
cd apps/api
bun run build          # wrangler deploy --dry-run
```

It prints the binding table. All four bindings should show your real ids.

## 3. Secrets

`apps/api/.dev.vars.example` documents all three. Production takes them one at
a time (each command prompts for the value):

```bash
cd apps/api
bunx wrangler secret put INTERNAL_API_TOKEN
bunx wrangler secret put RATE_SALT
bunx wrangler secret put HCAPTCHA_SECRET
```

Generate the two random ones with `openssl rand -hex 32`.

> ⚠️ **`INTERNAL_API_TOKEN` is not optional in production.** The Worker skips
> its auth check entirely when the secret is unset — deliberately, so local dev
> and tests run without secrets. A deployed Worker without it is a fully public
> API. Set it before, or immediately after, the first deploy.

`HCAPTCHA_SECRET` is the **secret** half of the hCaptcha key pair from
dashboard.hcaptcha.com. The **site** key is the public half and goes to Vercel
in §6.

Only `INTERNAL_API_TOKEN` is read today; the other two arrive with the write
endpoints in task 5.5. Setting them now costs nothing and means one fewer step
later — and changing `RATE_SALT` after launch resets every live rate-limit
window, so it is better set once, early.

✅ `bunx wrangler secret list` — three names, no values.

## 4. Create the schema in production D1

The `--local` database used during development is a separate SQLite file on
your machine. Production starts empty:

```bash
cd apps/api
bunx wrangler d1 migrations apply linuxhub --remote
```

✅ Expect six migrations applied, then:

```bash
bunx wrangler d1 execute linuxhub --remote \
  --command "SELECT COUNT(*) AS tables FROM sqlite_master WHERE type='table'"
```

Look for 15 tables (plus D1's own bookkeeping tables).

## 5. Deploy the Worker

```bash
cd apps/api
bun run deploy
```

That is `wrangler deploy` behind `scripts/check-deploy-config.ts`, which
refuses when `wrangler.toml` still holds the placeholder ids from §2. They are
valid TOML, so a plain `wrangler deploy` uploads a Worker whose D1 and KV
bindings point at nothing — a failure that shows up only as 500s in
production, one request at a time.

This uploads the code **and registers the three cron triggers** declared in
`wrangler.toml`. Note the `https://linuxhub-api.<subdomain>.workers.dev` URL it
prints — Vercel needs it in §6.

✅ Health check (the one route that needs no token):

```bash
curl https://linuxhub-api.<subdomain>.workers.dev/v1/health
```

Expect `{"ok":true,"data":{"service":"linuxhub-api","status":"up",...,"db":true,"kv":true}}`.
`db` or `kv` reading `false` means a binding id in §2 is wrong.

✅ And confirm the API is *not* public:

```bash
curl -o /dev/null -w '%{http_code}\n' https://linuxhub-api.<subdomain>.workers.dev/v1/distros
# 404 = INTERNAL_API_TOKEN is set and doing its job (see .ai/backend-rules.md
#       for why a bad token answers 404 rather than 403)
# 200 = the secret is missing. Go back to §3.
```

### Seeding the data without waiting for a schedule

After deploy, D1 has tables but no rows. The crons fill it on their own —
releases within 6 hours, mirrors at 03:00 UTC — but you can seed it now by
running the Worker locally *against the production bindings*:

```bash
cd apps/api
bunx wrangler dev --remote --test-scheduled
# then, in another terminal — in this order, and waiting for each to finish:
curl 'http://localhost:8787/__scheduled?cron=0+*/6+*+*+*'   # releases + artifacts
curl 'http://localhost:8787/__scheduled?cron=0+3+*+*+*'     # mirrors + links
```

> `__scheduled` returns `Ran scheduled event` **immediately** — the pass runs in
> the background via `waitUntil`. Give each a minute and watch the
> `wrangler dev` log before starting the next; firing both at once interleaves
> them and makes the result depend on timing.

Run releases first: the Fedora mirrorlist is per-repo, so the mirrors pass has
to know the newest Fedora release before it can ask for one. It logs
`skipped — no release ingested yet` otherwise, which is harmless but wastes the
run.

✅ Confirm rows landed, with provenance:

```bash
bunx wrangler d1 execute linuxhub --remote \
  --command "SELECT COUNT(*) n, MIN(fetched_at) FROM releases"
```

Expect roughly 12 distros, 36 content docs, ~42 releases, ~17 mirrors, and —
for arch and fedora, the two distros with a verified artifact source — ~39
editions and ~93 artifacts. Ingestion is idempotent, so re-running is safe.

✅ The check that matters most, because it is the one that fails in a way
nothing else notices — resolve a download and **fetch what comes back**:

```bash
curl -s -X POST https://<your-app>/api/v1/downloads/resolve \
  -H 'Content-Type: application/json' \
  -d '{"slug":"arch","version":"<a version from the page>","edition":"ISO","arch":"x86_64","format":"iso"}'
# then HEAD the "url" it returns — it must answer 200, not 404
```

A mirror whose `base_url` is not a base for our artifact paths produces a URL
that looks perfectly reasonable and 404s (ADR-0024).

The weekly rankings cron (`0 4 * * 1`) will correctly write nothing until the
site has traffic: rankings come from our own download counters, and those fill
from real visitors. See `.ai/handoff.md` § "Empty on purpose".

## 6. Vercel — the web app

Link the repo as a Vercel project.

| Setting | Value |
|---|---|
| Root Directory | `apps/web` |
| Framework Preset | SvelteKit — pinned in `apps/web/vercel.json`, no need to set it |
| Install Command | pinned in `apps/web/vercel.json` (`cd ../.. && bun install --frozen-lockfile`) |
| Build Command | project default (`vite build`, via `@sveltejs/adapter-vercel`) |

> ⚠️ **The build needs the whole repository, not just `apps/web`.** Vercel
> documents Root Directory as making files outside it inaccessible, and this
> app reads two things from the repo root: `packages/*`, which are consumed as
> TypeScript source, and `content/distros/`, which `src/lib/content/index.ts`
> picks up with an `import.meta.glob` reaching five levels up.
>
> Vercel's monorepo detection normally uploads the whole workspace, which is
> why the pinned install command starts with `cd ../..` — if the root is
> missing, install fails immediately instead of half-working.
>
> A missing `packages/*` fails the build loudly on its own. A missing
> `content/` would **not**: a glob matching nothing is not an error, and the
> deploy would succeed with every distro page showing three empty tabs. The
> Vite plugin `linuxhub:require-distro-content` fails the build instead, and
> prints `distro content: 36 docs across 12 distros` when it is happy. If you
> see that line, the root is reachable.

Environment variables — the three in `apps/web/.env.example`:

| Name | Value | Read by the code? | Exposed to the browser? |
|---|---|---|---|
| `LINUXHUB_API_URL` | the workers.dev URL from §5, no trailing slash | **yes** — unset means snapshot mode | no |
| `INTERNAL_API_TOKEN` | **exactly** the value from §3 | **yes** — a mismatch makes the Worker answer 404 to everything | no |
| `PUBLIC_HCAPTCHA_SITEKEY` | the hCaptcha *site* key | not yet — task 5.5 | yes — that is what `PUBLIC_` means |

✅ Load the site, switch the language, open a distro page, and check the build
log for the `distro content:` line. Then:

```bash
curl -s https://<your-app>/api/v1/health
```

Four fields, read in this order. They separate failures that look **identical
from the page** — every section renders empty in all of them:

| Field | Meaning |
|---|---|
| `"mode":"snapshot"` | `LINUXHUB_API_URL` is unset. The site works, but serves committed data |
| `"authorized":false` | **`INTERNAL_API_TOKEN` does not match the Worker's.** `/v1/health` is exempt from that check, so the `worker` block can read perfectly healthy while every catalog request 404s. This is the only field that catches it |
| `"distros":0` | Authorized and healthy, but the ingestion crons have not run — go back to § 5 "Seeding the data without waiting for a schedule" |
| `"distros":12` + `"status":"up"` | Working |

✅ And the public files, which are easy to forget and obvious once wrong:

```bash
curl -s https://<your-app>/robots.txt
curl -s -o /dev/null -w '%{http_code}\n' https://<your-app>/sitemap.xml
curl -s -o /dev/null -w '%{http_code}\n' https://<your-app>/api/v1/feeds/releases.rss
curl -sI https://<your-app>/ | grep -i content-security-policy
```

## 7. Changing the domain later

`SITE_ORIGIN` is the contact URL every ingest request advertises, which
`.ai/security.md` requires to resolve. It lives in exactly two places:

1. **`apps/api/wrangler.toml`**, under `[vars]` — what the deployed Worker
   uses. Edit, then `wrangler deploy`.
2. **`packages/ingest/src/index.ts`**, `DEFAULT_SITE_ORIGIN` — the build-time
   fallback for the local snapshot CLI and for a Worker with no var set.

Keep them in agreement. Current value: `https://linuxhub.kro.kr`.

Point the domain at both surfaces: the apex/`www` at Vercel, and — optionally —
a `Workers Route` or custom domain at the Worker. The Worker does not need a
public hostname; the BFF is its only caller.

## 8. Rollback

```bash
cd apps/api
bunx wrangler versions list                 # find the previous version id
bunx wrangler versions deploy <version-id>  # shift traffic back
```

D1 migrations are **forward-only** (`.ai/database.md`). There is no down
migration: a schema mistake is fixed by a new migration, not a rollback. D1
Time Travel (`wrangler d1 time-travel`) restores *data* to a point in time —
use it for a bad ingest, never as a schema undo.

Vercel rollbacks are a click in the Deployments list.

---

## Cost note

Everything here fits Cloudflare's and Vercel's free tiers at this scale: D1
holds a few hundred rows, KV serves cache reads, and the crons run 4–5 times a
day. The thing that would change that is download tracking in 5.6, which writes
a KV counter per click.
