// The regression this exists for: a page loader that read `.data` off an error
// envelope threw `undefined.slice is not a function`, and a misconfigured
// INTERNAL_API_TOKEN took the whole site to a 500 instead of degrading.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { unwrap, unwrapList } from "./api";

function envelope(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

let logged: string[] = [];

beforeEach(() => {
	logged = [];
	vi.spyOn(console, "log").mockImplementation((line: string) => {
		logged.push(String(line));
	});
});

describe("unwrap", () => {
	it("returns the payload of a success envelope", async () => {
		const data = await unwrap(envelope({ ok: true, data: [1, 2, 3] }), [], "test");
		expect(data).toEqual([1, 2, 3]);
	});

	it("falls back instead of throwing on an error envelope", async () => {
		// This is what the Worker answers when INTERNAL_API_TOKEN does not match.
		const data = await unwrap(
			envelope({ ok: false, error: { code: "UPSTREAM_ERROR", message: "catalog" } }, 502),
			[],
			"home:trending",
		);
		expect(data).toEqual([]);
	});

	it("falls back on a body that is not JSON at all", async () => {
		const data = await unwrap(
			new Response("<html>gateway timeout</html>", { status: 504 }),
			[],
			"x",
		);
		expect(data).toEqual([]);
	});

	it("logs the failure with its code, so degrading is not the same as hiding", async () => {
		await unwrap(
			envelope({ ok: false, error: { code: "UPSTREAM_ERROR", message: "catalog" } }, 502),
			[],
			"home:trending",
		);
		expect(logged).toHaveLength(1);
		const line = JSON.parse(logged[0] as string);
		expect(line).toMatchObject({
			level: "error",
			what: "home:trending",
			status: 502,
			code: "UPSTREAM_ERROR",
		});
	});

	it("does not log when the call succeeded", async () => {
		await unwrap(envelope({ ok: true, data: [] }), [], "test");
		expect(logged).toEqual([]);
	});
});

describe("unwrapList", () => {
	it("prefers meta.total over the page length", async () => {
		const result = await unwrapList(
			envelope({ ok: true, data: [1, 2], meta: { page: 1, limit: 2, total: 57 } }),
			"explore",
		);
		expect(result).toEqual({ items: [1, 2], total: 57 });
	});

	it("falls back to the page length when the endpoint reports no total", async () => {
		const result = await unwrapList(envelope({ ok: true, data: [1, 2, 3] }), "explore");
		expect(result.total).toBe(3);
	});

	it("reports zero rather than a total it lost", async () => {
		const result = await unwrapList(
			envelope({ ok: false, error: { code: "UPSTREAM_ERROR", message: "x" } }, 502),
			"explore",
		);
		expect(result).toEqual({ items: [], total: 0 });
	});
});
