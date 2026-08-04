import { describe, expect, it } from "vitest";
import { type ConditionalStore, cacheKey, createFetchClient, type FetchLike } from "./http";

function memoryStore(): ConditionalStore & { map: Map<string, string> } {
	const map = new Map<string, string>();
	return {
		map,
		async get(key) {
			return map.get(key) ?? null;
		},
		async put(key, value) {
			map.set(key, value);
		},
	};
}

const noSleep = async () => {};

function client(fetchImpl: FetchLike, store?: ConditionalStore) {
	return createFetchClient({
		siteOrigin: "https://example.test",
		fetchImpl,
		sleepImpl: noSleep,
		store,
	});
}

describe("ingest http client", () => {
	it("identifies itself with a contact URL, as the crawler policy requires", async () => {
		let seen = "";
		const http = client(async (_url, init) => {
			seen = new Headers(init?.headers).get("User-Agent") ?? "";
			return new Response("ok");
		});
		await http.getText("https://a.test/x");
		expect(seen).toMatch(/^linuxhub-ingest\/\d/);
		expect(seen).toContain("+https://example.test/about#crawler");
	});

	it("retries 5xx and 429, then succeeds", async () => {
		let calls = 0;
		const http = client(async () => {
			calls++;
			if (calls === 1) return new Response("busy", { status: 503 });
			if (calls === 2) return new Response("slow down", { status: 429 });
			return new Response("finally");
		});
		expect(await http.getText("https://a.test/x")).toBe("finally");
		expect(calls).toBe(3);
	});

	it("gives up after the retry budget rather than hammering the source", async () => {
		let calls = 0;
		const http = createFetchClient({
			siteOrigin: "https://example.test",
			sleepImpl: noSleep,
			retries: 2,
			fetchImpl: async () => {
				calls++;
				return new Response("down", { status: 500 });
			},
		});
		await expect(http.getText("https://a.test/x")).rejects.toThrow(/after 3 attempts/);
		expect(calls).toBe(3);
	});

	it("does not retry a 404 — a missing resource is an answer, not a hiccup", async () => {
		let calls = 0;
		const http = client(async () => {
			calls++;
			return new Response("gone", { status: 404 });
		});
		await expect(http.getText("https://a.test/x")).rejects.toThrow();
		expect(calls).toBe(1);
	});

	it("replays a stored validator and serves the cached body on 304", async () => {
		const store = memoryStore();
		let sentIfNoneMatch: string | null = null;
		let calls = 0;

		const http = client(async (_url, init) => {
			calls++;
			sentIfNoneMatch = new Headers(init?.headers).get("If-None-Match");
			return calls === 1
				? new Response("first body", { headers: { etag: '"v1"' } })
				: new Response(null, { status: 304 });
		}, store);

		expect(await http.getText("https://a.test/x")).toBe("first body");
		expect(store.map.has(cacheKey("https://a.test/x"))).toBe(true);

		expect(await http.getText("https://a.test/x")).toBe("first body");
		expect(sentIfNoneMatch).toBe('"v1"');
		expect(calls).toBe(2);
	});

	it("paces requests to the same host", async () => {
		const gaps: string[] = [];
		const http = createFetchClient({
			siteOrigin: "https://example.test",
			minHostIntervalMs: 1000,
			sleepImpl: async (ms) => {
				gaps.push(`slept ${ms}`);
			},
			fetchImpl: async (url) => {
				gaps.push(`fetched ${url}`);
				return new Response("ok");
			},
		});

		await Promise.all([http.getText("https://a.test/1"), http.getText("https://a.test/2")]);

		// Serialized with a pause between them, not fired concurrently.
		expect(gaps).toEqual([
			"fetched https://a.test/1",
			"slept 1000",
			"fetched https://a.test/2",
			"slept 1000",
		]);
	});

	it("parses JSON through the same transport", async () => {
		const http = client(async () => new Response('{"a":1}'));
		expect(await http.getJson<{ a: number }>("https://a.test/x")).toEqual({ a: 1 });
	});
});
