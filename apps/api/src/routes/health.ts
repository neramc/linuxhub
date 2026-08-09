// #41 — liveness. The only route without internal-token auth
// (.ai/backend-rules.md § "Auth"), so it works before Phase 7 sets secrets.

import { type Health, ok } from "@linuxhub/shared";
import { Hono } from "hono";
import type { App } from "../middleware";

export const VERSION = "0.1.0";

export const health = new Hono<App>();

/** Longest probe failure we report. Enough to name the fault, short enough
 *  that no payload can ride out through a public endpoint. */
const REASON_LIMIT = 200;

type ProbeResult = { ok: boolean; error: string | null };

/** Probes are best-effort: a probe that throws reports the dependency as down
 *  rather than taking the health endpoint down with it. The reason travels with
 *  it, because "db: false" on its own does not say whether the binding id is
 *  wrong, the database is gone, or the query was bad. */
async function probe(check: () => Promise<unknown>): Promise<ProbeResult> {
	try {
		await check();
		return { ok: true, error: null };
	} catch (error) {
		return { ok: false, error: String(error).slice(0, REASON_LIMIT) };
	}
}

health.get("/health", async (c) => {
	const [db, kv] = await Promise.all([
		probe(() => c.env.DB.prepare("SELECT 1").first()),
		// `list`, not `get`: a `get` for a missing key resolves to null without
		// throwing, so it passes even when the namespace id is wrong — which is
		// exactly the deploy fault this is here to catch. `list` has to reach
		// the namespace to answer.
		probe(() => c.env.KV_CACHE.list({ limit: 1 })),
	]);

	const body: Health = {
		service: "linuxhub-api",
		status: db.ok && kv.ok ? "up" : "degraded",
		version: VERSION,
		db: db.ok,
		kv: kv.ok,
		db_error: db.error,
		kv_error: kv.error,
	};
	return c.json(ok(body));
});
