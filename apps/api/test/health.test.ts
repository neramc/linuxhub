import type { ApiResponse, Health } from "@linuxhub/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/index";
import { createTestContext, type TestContext } from "./harness";

describe("GET /v1/health", () => {
	let ctx: TestContext;
	beforeAll(async () => {
		ctx = await createTestContext();
	});
	afterAll(() => ctx.dispose());

	it("reports the dependency probes without auth", async () => {
		const res = await app.request("/v1/health", {}, ctx.env);
		expect(res.status).toBe(200);

		const body = (await res.json()) as ApiResponse<Health>;
		expect(body.ok).toBe(true);
		if (!body.ok) return;
		expect(body.data).toMatchObject({ service: "linuxhub-api", status: "up", db: true, kv: true });
	});

	it("reports degraded rather than throwing when a binding is missing", async () => {
		const res = await app.request("/v1/health", {}, { ...ctx.env, DB: undefined });
		expect(res.status).toBe(200);

		const body = (await res.json()) as ApiResponse<Health>;
		expect(body.ok).toBe(true);
		if (!body.ok) return;
		expect(body.data).toMatchObject({ status: "degraded", db: false, kv: true });
	});

	it("stays reachable when an internal token is configured", async () => {
		const res = await app.request("/v1/health", {}, { ...ctx.env, INTERNAL_API_TOKEN: "secret" });
		expect(res.status).toBe(200);
	});

	it("404s unknown routes", async () => {
		const res = await app.request("/v1/nope", {}, ctx.env);
		expect(res.status).toBe(404);
	});
});
