// The health check exists to make a bad deploy visible. It reported a healthy
// backend while the site rendered empty, because the one call it made —
// `/v1/health` — is exempt from the Worker's internal-token check. These cover
// the three states a first deploy actually lands in.

import type { ApiResponse } from "@linuxhub/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { env } from "$env/dynamic/private";
import type { BffHealth } from "./+server";
import { GET } from "./+server";

const WORKER_UP = {
	ok: true,
	data: { service: "linuxhub-api", status: "up", version: "0.1.0", db: true, kv: true },
};
const NOT_FOUND = { ok: false, error: { code: "NOT_FOUND", message: "not found" } };

/** Answers each path from `routes`; anything unlisted 404s like the Worker
 *  does for an unauthorized caller. */
function stubFetch(routes: Record<string, unknown>) {
	return (async (url: string | URL) => {
		const path = String(url);
		const key = Object.keys(routes).find((k) => path.includes(k));
		return new Response(JSON.stringify(key ? routes[key] : NOT_FOUND), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}) as unknown as typeof fetch;
}

// biome-ignore lint/suspicious/noExplicitAny: the handler reads only `fetch`.
const event = (fetchImpl: typeof fetch) => ({ fetch: fetchImpl }) as any;

async function health(fetchImpl: typeof fetch): Promise<BffHealth> {
	const response = await GET(event(fetchImpl));
	const body = (await response.json()) as ApiResponse<BffHealth>;
	if (!body.ok) throw new Error("health must always answer a success envelope");
	return body.data;
}

beforeEach(() => {
	env.LINUXHUB_API_URL = "https://api.test";
	env.INTERNAL_API_TOKEN = "secret";
});

describe("GET /api/v1/health", () => {
	it("reports snapshot mode when no Worker is configured", async () => {
		env.LINUXHUB_API_URL = "";
		const body = await health(stubFetch({}));

		expect(body.mode).toBe("snapshot");
		// There is no token to be wrong, so the question does not apply.
		expect(body.authorized).toBeNull();
		expect(body.distros).toBeNull();
	});

	it("catches a token mismatch, which /v1/health alone cannot see", async () => {
		// The Worker exempts /v1/health from its token check, so it answers 200
		// while every gated route 404s. Before the gated probe this deploy
		// reported status "up" with a completely unusable catalog.
		const body = await health(stubFetch({ "/v1/health": WORKER_UP }));

		expect(body.worker?.status).toBe("up");
		expect(body.authorized).toBe(false);
		expect(body.catalog_error).toBe("NOT_FOUND");
		expect(body.status).toBe("degraded");
	});

	it("does not blame the token for a failure behind it", async () => {
		// A dead D1 binding makes the gated call answer INTERNAL. It got past
		// the token; calling that "unauthorized" sent a real debugging session
		// after the wrong thing.
		const body = await health(
			stubFetch({
				"/v1/health": {
					ok: true,
					data: { ...WORKER_UP.data, status: "degraded", db: false },
				},
				"/v1/distros": { ok: false, error: { code: "INTERNAL", message: "internal error" } },
			}),
		);

		expect(body.db).toBe(false);
		expect(body.authorized).toBe(true);
		expect(body.catalog_error).toBe("INTERNAL");
	});

	it("separates an unseeded catalog from an unauthorized one", async () => {
		const body = await health(
			stubFetch({
				"/v1/health": WORKER_UP,
				"/v1/distros": { ok: true, data: [], meta: { page: 1, limit: 1, total: 0 } },
			}),
		);

		expect(body.authorized).toBe(true);
		expect(body.distros).toBe(0); // crons have not run yet
		expect(body.status).toBe("up");
	});

	it("reports a healthy, seeded backend", async () => {
		const body = await health(
			stubFetch({
				"/v1/health": WORKER_UP,
				"/v1/distros": { ok: true, data: [{}], meta: { page: 1, limit: 1, total: 12 } },
			}),
		);

		expect(body).toMatchObject({ status: "up", db: true, kv: true, authorized: true, distros: 12 });
	});

	it("still answers when the Worker is unreachable", async () => {
		const unreachable = (async () => {
			throw new Error("ECONNREFUSED");
		}) as unknown as typeof fetch;

		const body = await health(unreachable);
		expect(body.status).toBe("degraded");
		// Unknown, not refused — the call never reached the token check.
		expect(body.authorized).toBeNull();
		expect(body.catalog_error).toBe("UNREACHABLE");
	});
});
