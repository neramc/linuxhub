// Worker client — the BFF's only way to reach apps/api.
//
// The BFF never touches D1 or KV; it proxies the Worker with the internal
// service token (.ai/architecture.md § "Layers and responsibilities", settled
// in Phase 0 and not reopened). This module is that proxy.
//
// ── Transitional dual mode ─────────────────────────────────────────────────
// Task 5.4 moves the BFF endpoint by endpoint, and the Worker needs a
// Cloudflare account that only exists in production. So a route asks
// `workerConfigured()` first: with LINUXHUB_API_URL set it proxies, without it
// the route keeps serving the committed snapshot in `data.ts`.
//
// This is deliberately temporary and deliberately loud — `workerMode()` is
// logged once per cold start, so "the deploy is serving stale mock data" can
// never look like "the deploy is fine". The branch disappears with `data.ts`
// itself in task 5.7.

import type { ApiResponse } from "@linuxhub/shared";
import { env } from "$env/dynamic/private";

/** Read at runtime, not build time: these are set in the Vercel dashboard and
 *  must take effect on redeploy without a rebuild of the app bundle. */
const apiUrl = () => env.LINUXHUB_API_URL?.replace(/\/+$/, "") ?? "";
const apiToken = () => env.INTERNAL_API_TOKEN ?? "";

export function workerConfigured(): boolean {
	return apiUrl().length > 0;
}

export type WorkerMode = "worker" | "snapshot";

let announced = false;

/** Which data source this instance is serving from. Logged once per cold start
 *  so the mode is visible in Vercel's logs without a request-by-request trace. */
export function workerMode(): WorkerMode {
	const mode: WorkerMode = workerConfigured() ? "worker" : "snapshot";
	if (!announced) {
		announced = true;
		console.log(
			JSON.stringify({
				ts: new Date().toISOString(),
				level: mode === "worker" ? "info" : "warn",
				msg:
					mode === "worker"
						? "BFF proxying the Worker"
						: "BFF serving the committed snapshot — LINUXHUB_API_URL is unset",
			}),
		);
	}
	return mode;
}

export class WorkerError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "WorkerError";
	}
}

/**
 * Calls the Worker and returns its envelope untouched.
 *
 * The envelope is deliberately passed through rather than re-wrapped: the
 * Worker and the BFF share one response shape (`.ai/api.md`), so re-building it
 * here would be a second place for it to drift.
 */
export async function callWorker<T>(
	path: string,
	fetchImpl: typeof fetch = fetch,
): Promise<ApiResponse<T>> {
	const base = apiUrl();
	if (!base) throw new WorkerError(503, "LINUXHUB_API_URL is not configured");

	const token = apiToken();
	const response = await fetchImpl(`${base}${path}`, {
		headers: token ? { "X-Internal-Token": token } : {},
	});

	// A non-JSON body means something in front of the Worker answered — a proxy
	// error page, a 502 from the edge. Surfacing that as UPSTREAM_ERROR beats
	// letting JSON.parse throw a message nobody can act on.
	const body = await response.text();
	try {
		return JSON.parse(body) as ApiResponse<T>;
	} catch {
		throw new WorkerError(502, `Worker returned non-JSON (${response.status})`);
	}
}

/** `Cache-Control` values per endpoint class (`.ai/frontend-rules.md`). */
export const CACHE = {
	list: "public, s-maxage=60, stale-while-revalidate=300",
	detail: "public, s-maxage=300, stale-while-revalidate=600",
	search: "public, s-maxage=30, stale-while-revalidate=120",
	rankings: "public, s-maxage=600, stale-while-revalidate=1200",
} as const;
