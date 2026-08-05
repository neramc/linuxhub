// #41 — liveness. The only route without internal-token auth
// (.ai/backend-rules.md § "Auth"), so it works before Phase 7 sets secrets.

import { type Health, ok } from "@linuxhub/shared";
import { Hono } from "hono";
import type { App } from "../middleware";

export const VERSION = "0.1.0";

export const health = new Hono<App>();

/** Probes are best-effort: a probe that throws reports the dependency as down
 *  rather than taking the health endpoint down with it. */
async function probe(check: () => Promise<unknown>): Promise<boolean> {
	try {
		await check();
		return true;
	} catch {
		return false;
	}
}

health.get("/health", async (c) => {
	const [db, kv] = await Promise.all([
		probe(() => c.env.DB.prepare("SELECT 1").first()),
		probe(() => c.env.KV_CACHE.get("gen:all")),
	]);

	const body: Health = {
		service: "linuxhub-api",
		status: db && kv ? "up" : "degraded",
		version: VERSION,
		db,
		kv,
	};
	return c.json(ok(body));
});
