// The guard exists because both faults it catches deploy *successfully* and
// fail only in production. Both fixtures below are the real thing: the second
// is the config that took this project's first deploy down.

import { describe, expect, it } from "vitest";
import { declaredBindings, isPlaceholder, requiredBindings } from "./check-deploy-config";

const ENV_TS = `
export type Env = {
	DB: D1Database;
	KV_CACHE: KVNamespace;
	KV_RATE: KVNamespace;
	KV_GEO: KVNamespace;
	INTERNAL_API_TOKEN?: string;
	SITE_ORIGIN?: string;
};`;

describe("requiredBindings", () => {
	it("takes the names from Env rather than a hardcoded list", () => {
		expect(requiredBindings(ENV_TS)).toEqual(["DB", "KV_CACHE", "KV_RATE", "KV_GEO"]);
	});

	it("ignores secrets and vars, which are not bindings", () => {
		expect(requiredBindings(ENV_TS)).not.toContain("INTERNAL_API_TOKEN");
		expect(requiredBindings(ENV_TS)).not.toContain("SITE_ORIGIN");
	});
});

describe("declaredBindings", () => {
	it("reads every binding the config declares, CRLF included", () => {
		// The config came back from a Windows machine with CRLF endings.
		const toml =
			'[[d1_databases]]\r\nbinding = "DB"\r\n\r\n[[kv_namespaces]]\r\nbinding = "KV_CACHE"\r\n';
		expect(declaredBindings(toml)).toEqual(["DB", "KV_CACHE"]);
	});

	it("catches the binding wrangler suggests instead of ours", () => {
		const toml = '[[d1_databases]]\nbinding = "linuxhub"\ndatabase_name = "linuxhub"\n';
		const declared = declaredBindings(toml);
		expect(declared).toEqual(["linuxhub"]);
		expect(requiredBindings(ENV_TS).filter((n) => !declared.includes(n))).toContain("DB");
	});
});

describe("isPlaceholder", () => {
	it("catches the committed placeholders, including the cute ones", () => {
		// "All zeros" would pass three of these four — it did, on the first try.
		expect(isPlaceholder("00000000-0000-0000-0000-000000000000")).toBe(true);
		expect(isPlaceholder("0000000000000000000000000000cace")).toBe(true);
		expect(isPlaceholder("0000000000000000000000000000ea7e")).toBe(true);
		expect(isPlaceholder("00000000000000000000000000000e60")).toBe(true);
	});

	it("passes real ids", () => {
		expect(isPlaceholder("f25e9e31-8851-48e5-a36c-d374db28ef4c")).toBe(false);
		expect(isPlaceholder("c11a899ae51b4bfd9e8b2ffd29b86471")).toBe(false);
	});
});
