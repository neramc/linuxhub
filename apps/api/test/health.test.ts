import { describe, expect, it } from "vitest";
import { app } from "../src/index";

describe("GET /v1/health", () => {
	it("returns the ok envelope without auth", async () => {
		const res = await app.request("/v1/health");
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			ok: boolean;
			data: { service: string; status: string };
		};
		expect(body.ok).toBe(true);
		expect(body.data.service).toBe("linuxhub-api");
		expect(body.data.status).toBe("up");
	});

	it("404s unknown routes", async () => {
		const res = await app.request("/v1/nope");
		expect(res.status).toBe(404);
	});
});
