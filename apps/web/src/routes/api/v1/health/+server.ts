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
	 * Did a **token-gated** call get past the token check?
	 *
	 * `/v1/health` is deliberately exempt from that check, so it answers 200
	 * even when the token is wrong — which made this endpoint report a
	 * perfectly healthy backend while every catalog request 404'd and the site
	 * rendered empty.
	 *
	 * `false` means **refused**, and only that: a bad token is the Worker's
	 * one reason to answer `NOT_FOUND` on a list route (`.ai/api.md`). A call
	 * that got in and then failed leaves this `true` and names the failure in
	 * `catalog_error` — reporting that as "unauthorized" sent one debugging
	 * session after the token when the real fault was a dead D1 binding.
	 * `null` in snapshot mode, where there is no token to be wrong.
	 */
	authorized: boolean | null;
	/** The error code the gated call answered with, or `null` if it succeeded.
	 *  `INTERNAL` here with `db:false` above means the D1 binding, not the
	 *  token. */
	catalog_error: string | null;
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
		catalog_error: null,
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
		if (catalog.ok) {
			body.authorized = true;
			body.distros = catalog.meta?.total ?? catalog.data.length;
		} else {
			// NOT_FOUND on a list route is the Worker's answer to a bad token.
			// Anything else got past the token and failed behind it.
			body.authorized = catalog.error.code !== "NOT_FOUND";
			body.catalog_error = catalog.error.code;
			body.status = "degraded";
		}
	} catch {
		// The call never completed, so whether the token would have been
		// accepted is unknown — saying `false` would be a guess.
		body.catalog_error = "UNREACHABLE";
		body.status = "degraded";
	}

	return json(ok(body), { headers: { "Cache-Control": "no-store" } });
};
