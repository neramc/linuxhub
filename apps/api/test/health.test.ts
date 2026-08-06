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

describe("security headers", () => {
	it("locks down the internal surface — nothing here should ever render", async () => {
		const ctx = await createTestContext();
		const res = await app.request("/v1/health", {}, ctx.env);

		expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
		expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(res.headers.get("X-Frame-Options")).toBe("DENY");
		expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
		await ctx.dispose();
	});

	it("sets them on an error response too", async () => {
		const ctx = await createTestContext();
		const res = await app.request("/v1/nope", {}, ctx.env);

		expect(res.status).toBe(404);
		expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
		await ctx.dispose();
	});
});
