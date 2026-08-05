// BFF download routes (.ai/api.md #14, #15, #21).
//
// These cover the three things the BFF adds on top of the Worker and that the
// Worker's own suite therefore cannot see: geo comes from the edge header and
// not from the caller, an upstream 404 is a page-safe empty matrix rather than
// an error, and counting a click can never fail the download.

import type { ApiResponse, DownloadOptions, DownloadResolution } from "@linuxhub/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "$env/dynamic/private";
import { GET as downloadOptions } from "../distros/[slug]/download-options/+server";
import { POST as resolve } from "./resolve/+server";
import { POST as track } from "./track/+server";

type Call = { url: string; init: RequestInit };

function stubFetch(response: unknown, calls: Call[] = [], status = 200) {
	return Object.assign(
		(async (url: string | URL, init: RequestInit = {}) => {
			calls.push({ url: String(url), init });
			return new Response(JSON.stringify(response), {
				status,
				headers: { "Content-Type": "application/json" },
			});
		}) as unknown as typeof fetch,
		{ calls },
	);
}

// The handlers take a RequestEvent; these tests build only the parts they read.
// biome-ignore lint/suspicious/noExplicitAny: narrowing a full RequestEvent here would test SvelteKit, not us.
const event = (parts: Record<string, unknown>) => parts as any;

const RESOLUTION: DownloadResolution = {
	url: "https://mirror.test/iso/a.iso",
	artifact_id: 7,
	size: 100,
	sha256: "abc",
	sig_url: null,
	mirror: { id: 3, name: "mirror.test", country: "SE", base_url: "https://mirror.test/" },
	mirror_choice: "country",
};

beforeEach(() => {
	env.LINUXHUB_API_URL = "https://api.test";
	env.INTERNAL_API_TOKEN = "secret";
});

describe("GET download-options", () => {
	it("passes the Worker's matrix through", async () => {
		const matrix: DownloadOptions = { slug: "arch", versions: [], mirrors: [] };
		const response = await downloadOptions(
			event({ fetch: stubFetch({ ok: true, data: matrix }), params: { slug: "arch" } }),
		);
		const body = (await response.json()) as ApiResponse<DownloadOptions>;
		expect(body.ok).toBe(true);
	});

	it("answers an empty matrix — not an error — for a distro with no artifacts yet", async () => {
		// Ten of twelve distros are in this state until their artifact sources
		// are wired; the page must still render.
		const response = await downloadOptions(
			event({
				fetch: stubFetch({ ok: false, error: { code: "NOT_FOUND", message: "distro" } }),
				params: { slug: "nixos" },
			}),
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as ApiResponse<DownloadOptions>;
		if (!body.ok) throw new Error("expected success");
		expect(body.data.versions).toEqual([]);
	});

	it("answers an empty matrix when no Worker is configured", async () => {
		env.LINUXHUB_API_URL = "";
		const response = await downloadOptions(
			event({ fetch: stubFetch({}), params: { slug: "arch" } }),
		);
		const body = (await response.json()) as ApiResponse<DownloadOptions>;
		if (!body.ok) throw new Error("expected success");
		expect(body.data).toEqual({ slug: "arch", versions: [], mirrors: [] });
	});
});

describe("POST resolve", () => {
	it("takes the country from the edge header and ignores one in the body", async () => {
		const calls: Call[] = [];
		await resolve(
			event({
				fetch: stubFetch({ ok: true, data: RESOLUTION }, calls),
				getClientAddress: () => "203.0.113.9",
				request: new Request("https://web.test/api/v1/downloads/resolve", {
					method: "POST",
					headers: { "x-vercel-ip-country": "SE" },
					// A caller claiming to be elsewhere must not get to pick a mirror
					// by saying so.
					body: JSON.stringify({ slug: "arch", version: "1", country: "JP" }),
				}),
			}),
		);

		const sent = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>;
		expect(sent.country).toBe("SE");
		expect(calls[0]?.init.method).toBe("POST");
	});

	it("forwards the caller's address so the Worker limits the user, not the BFF", async () => {
		const calls: Call[] = [];
		await resolve(
			event({
				fetch: stubFetch({ ok: true, data: RESOLUTION }, calls),
				getClientAddress: () => "203.0.113.9",
				request: new Request("https://web.test/api/v1/downloads/resolve", {
					method: "POST",
					body: JSON.stringify({ slug: "arch" }),
				}),
			}),
		);

		const headers = calls[0]?.init.headers as Record<string, string>;
		expect(headers["X-Client-IP"]).toBe("203.0.113.9");
		expect(headers["X-Internal-Token"]).toBe("secret");
	});

	it("keeps the Worker's status for a combination that does not exist", async () => {
		const response = await resolve(
			event({
				fetch: stubFetch({ ok: false, error: { code: "NOT_FOUND", message: "artifact" } }),
				getClientAddress: () => "203.0.113.9",
				request: new Request("https://web.test/api/v1/downloads/resolve", {
					method: "POST",
					body: JSON.stringify({ slug: "arch" }),
				}),
			}),
		);
		expect(response.status).toBe(404);
	});

	it("rejects a body that is not an object", async () => {
		const response = await resolve(
			event({
				fetch: stubFetch({}),
				getClientAddress: () => "203.0.113.9",
				request: new Request("https://web.test/api/v1/downloads/resolve", {
					method: "POST",
					body: "not json",
				}),
			}),
		);
		expect(response.status).toBe(400);
	});
});

describe("POST track", () => {
	it("never fails the download it is measuring", async () => {
		const failing = (async () => {
			throw new Error("worker unreachable");
		}) as unknown as typeof fetch;
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});

		const response = await track(
			event({
				fetch: failing,
				getClientAddress: () => "203.0.113.9",
				request: new Request("https://web.test/api/v1/downloads/track", {
					method: "POST",
					body: JSON.stringify({ artifact_id: 7 }),
				}),
			}),
		);

		expect(response.status).toBe(200);
		const body = (await response.json()) as ApiResponse<{ counted: boolean }>;
		if (!body.ok) throw new Error("expected success");
		expect(body.data.counted).toBe(false);
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});

	it("reports a counted click when the Worker took it", async () => {
		const response = await track(
			event({
				fetch: stubFetch({ ok: true, data: { counted: true } }),
				getClientAddress: () => "203.0.113.9",
				request: new Request("https://web.test/api/v1/downloads/track", {
					method: "POST",
					body: JSON.stringify({ artifact_id: 7 }),
				}),
			}),
		);
		const body = (await response.json()) as ApiResponse<{ counted: boolean }>;
		if (!body.ok) throw new Error("expected success");
		expect(body.data.counted).toBe(true);
	});
});
