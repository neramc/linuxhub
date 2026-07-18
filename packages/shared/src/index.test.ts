import { describe, expect, it } from "vitest";
import { ERROR_STATUS, err, ok, paginationSchema } from "./index";

describe("envelope helpers", () => {
	it("wraps success data", () => {
		expect(ok({ a: 1 })).toEqual({ ok: true, data: { a: 1 } });
	});

	it("includes meta only when given", () => {
		const res = ok([1, 2], { page: 1, limit: 24, total: 2 });
		expect(res.meta).toEqual({ page: 1, limit: 24, total: 2 });
		expect("meta" in ok([1, 2])).toBe(false);
	});

	it("wraps errors with code and message", () => {
		const res = err("NOT_FOUND", "distro not found");
		expect(res).toEqual({
			ok: false,
			error: { code: "NOT_FOUND", message: "distro not found" },
		});
		expect(ERROR_STATUS[res.error.code]).toBe(404);
	});
});

describe("paginationSchema", () => {
	it("applies defaults", () => {
		expect(paginationSchema.parse({})).toEqual({ page: 1, limit: 24 });
	});

	it("coerces strings and caps limit", () => {
		expect(paginationSchema.parse({ page: "2", limit: "50" })).toEqual({
			page: 2,
			limit: 50,
		});
		expect(() => paginationSchema.parse({ limit: 1000 })).toThrow();
	});
});
