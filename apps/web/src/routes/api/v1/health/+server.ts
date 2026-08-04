import { type Health, ok } from "@linuxhub/shared";
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
	};

	if (workerConfigured()) {
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
	}

	return json(ok(body), { headers: { "Cache-Control": "no-store" } });
};
