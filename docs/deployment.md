# Deployment Runbook

How to get Linuxhub live: the Hono Worker on Cloudflare, the SvelteKit app on
Vercel. Everything here needs account access, which is why it is a runbook for
a human rather than something an agent can do.

> **Where the project actually is.** Phase 5 tasks 5.1–5.3 are done: the Worker
> has the real schema, cron ingestion and nine read endpoints. **The BFF still
> serves `apps/web/src/lib/server/data.ts` and does not call the Worker yet** —
> that is task 5.4. So deploying today gives you a working frontend on its
> existing data plus a Worker quietly filling production D1 on schedule. That
> is a useful thing to deploy early: the ingestion history starts accumulating
> now instead of on the day 5.4 lands.

Verify commands are marked ✅. Run them; do not assume.

---

## 0. Prerequisites

```bash
bun install
bunx wrangler login          # opens a browser; authorizes the Cloudflare account
```

Wrangler is a workspace dependency — `bunx wrangler` inside `apps/api` uses the
pinned version rather than whatever is global.

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
bun run --filter '@linuxhub/api' build     # wrangler deploy --dry-run
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

✅ Expect five migrations applied, then:

```bash
bunx wrangler d1 execute linuxhub --remote \
  --command "SELECT COUNT(*) AS tables FROM sqlite_master WHERE type='table'"
```

Look for 15 tables (plus D1's own bookkeeping tables).

## 5. Deploy the Worker

```bash
cd apps/api
bunx wrangler deploy
```

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
# then, in another terminal:
curl 'http://localhost:8787/__scheduled?cron=0+*/6+*+*+*'   # releases + catalog
curl 'http://localhost:8787/__scheduled?cron=0+3+*+*+*'     # mirrors
```

✅ Confirm rows landed, with provenance:

```bash
bunx wrangler d1 execute linuxhub --remote \
  --command "SELECT COUNT(*) n, MIN(fetched_at) FROM releases"
```

Expect roughly 12 distros, 36 content docs, ~42 releases and ~16 mirrors.
Ingestion is idempotent, so re-running is safe.

The weekly rankings cron (`0 4 * * 1`) will correctly write nothing: rankings
come from our own download counters, which do not exist until task 5.6. See
`.ai/handoff.md` § "Empty on purpose".

## 6. Vercel — the web app

Link the repo as a Vercel project. It is a Bun workspace, so:

| Setting | Value |
|---|---|
| Root Directory | `apps/web` |
| Framework Preset | SvelteKit |
| Install Command | `bun install` (run from the repo root) |
| Build Command | project default (`vite build`, via `@sveltejs/adapter-vercel`) |

Environment variables — the three in `apps/web/.env.example`:

| Name | Value | Exposed to the browser? |
|---|---|---|
| `LINUXHUB_API_URL` | the workers.dev URL from §5, no trailing slash | no |
| `INTERNAL_API_TOKEN` | **exactly** the value from §3 | no |
| `PUBLIC_HCAPTCHA_SITEKEY` | the hCaptcha *site* key | yes — that is what `PUBLIC_` means |

None of them is read by the code yet (see the note at the top of this file), so
a first deploy succeeds with them empty. Setting them now means the deploy that
lands 5.4 needs no dashboard visit.

✅ Load the site, switch the language, open a distro page. If the deployment
serves an unstyled page or the wrong `lang`, that is a build problem, not a
data one.

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
