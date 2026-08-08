import { type Distro, type Health, ok } from "@linuxhub/shared";
import { json } from "@sveltejs/kit";
import { callWorker, workerConfigured, workerMode } from "$lib/server/worker";
import type { RequestHandler } from "./$types";

// BFF liveness (.ai/api.md #41).
//
// Reports its own status plus, when configured, the Worker's — so one call
// answers both "is the site up" and "is the backend behind it up", which is
// what a smoke test after a deploy actually needs. `mode` says which data
// source is being served, so a deploy with LINUXHUB_API_URL unset is visible
// rather than merely quiet.
export type BffHealth = Health & {
	mode: "worker" | "snapshot";
	worker: Health | null;
	/**
	 * Did a **token-gated** call succeed?
	 *
	 * `/v1/health` is deliberately exempt from the Worker's internal-token
	 * check, so it answers 200 even when the token is wrong — which made this
	 * endpoint report a perfectly healthy backend while every catalog request
	 * 404'd and the site rendered empty. That is the single most likely first
	 * deploy failure, and it was the one thing the health check could not see.
	 * `null` in snapshot mode, where there is no token to be wrong.
	 */
	authorized: boolean | null;
	/**
	 * How many distros the catalog actually holds. Separates "the Worker is
	 * fine but nobody has run the ingestion crons yet" from "the Worker is
	 * refusing us", which look identical from the page: both render empty.
	 */
	distros: number | null;
};

export const GET: RequestHandler = async ({ fetch }) => {
	const body: BffHealth = {
		service: "linuxhub-web-bff",
		status: "up",
		version: "0.1.0",
		db: false,
		kv: false,
		mode: workerMode(),
		worker: null,
		authorized: null,
		distros: null,
	};

	if (!workerConfigured()) return json(ok(body), { headers: { "Cache-Control": "no-store" } });

	try {
		const upstream = await callWorker<Health>("/v1/health", fetch);
		if (upstream.ok) {
			body.worker = upstream.data;
			body.db = upstream.data.db;
			body.kv = upstream.data.kv;
			// The BFF is only as healthy as the backend it proxies.
			body.status = upstream.data.status;
		} else {
			body.status = "degraded";
		}
	} catch {
		// A liveness probe has to answer even when its upstream does not.
		body.status = "degraded";
	}

	// The gated probe. Cheapest token-carrying call there is: one row, and the
	// real total comes back in `meta`.
	try {
		const catalog = await callWorker<Distro[]>("/v1/distros?limit=1", fetch);
		body.authorized = catalog.ok;
		if (catalog.ok) body.distros = catalog.meta?.total ?? catalog.data.length;
		else body.status = "degraded";
	} catch {
		body.authorized = false;
		body.status = "degraded";
	}

	return json(ok(body), { headers: { "Cache-Control": "no-store" } });
};
