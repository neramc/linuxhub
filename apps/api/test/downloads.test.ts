import type { LiveCatalog } from "@linuxhub/ingest/types";
import type { ApiResponse, DownloadOptions, DownloadResolution } from "@linuxhub/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { upsertCatalog } from "../src/db/artifacts";
import { upsertReleases } from "../src/db/releases";
import { app } from "../src/index";
import { joinMirror } from "../src/services/downloads";
import { createTestContext, type TestContext } from "./harness";

const CATALOG: LiveCatalog = {
	releases: [{ cycle: "44", releaseDate: "2026-04-28", lts: false, supported: true }],
	editions: [
		{ version: "44", name: "Workstation", kind: "desktop" },
		{ version: "44", name: "KDE", desktop: "kde", kind: "desktop" },
	],
	artifacts: [
		{
			version: "44",
			edition: "Workstation",
			arch: "x86_64",
			format: "iso",
			path: "pub/f/44/ws.iso",
			size: 2299832320,
			sha256: "aaa",
		},
		{
			version: "44",
			edition: "Workstation",
			arch: "aarch64",
			format: "iso",
			path: "pub/f/44/ws-a.iso",
		},
		{ version: "44", edition: "KDE", arch: "x86_64", format: "iso", path: "pub/f/44/kde.iso" },
		{
			version: "44",
			edition: "KDE",
			arch: "x86_64",
			format: "magnet",
			path: "magnet:?xt=urn:btih:beef",
		},
	],
};

async function post(ctx: TestContext, path: string, body: unknown) {
	const res = await app.request(
		path,
		{ method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } },
		ctx.env,
	);
	return { status: res.status, body: await res.json() };
}

describe("download endpoints", () => {
	let ctx: TestContext;

	beforeAll(async () => {
		ctx = await createTestContext();
		await ctx.env.DB.prepare(
			`INSERT INTO distros (slug, name, homepage, logo_path, created_at, updated_at)
			 VALUES ('fedora', 'Fedora', 'https://f.test', '/f.svg', 't', 't')`,
		).run();
		await upsertReleases(ctx.env.DB, "fedora", CATALOG.releases, "https://src.test", "2026-08-05");
		await upsertCatalog(ctx.env.DB, "fedora", CATALOG, "https://src.test", "2026-08-05");
		await ctx.env.DB.batch([
			ctx.env.DB.prepare(
				`INSERT INTO mirrors (distro_id, name, country, base_url, healthy, serves_artifacts)
				 VALUES ((SELECT id FROM distros WHERE slug='fedora'), 'se.test', 'SE', 'https://se.test/', 1, 1)`,
			),
			ctx.env.DB.prepare(
				`INSERT INTO mirrors (distro_id, name, country, base_url, healthy, serves_artifacts)
				 VALUES ((SELECT id FROM distros WHERE slug='fedora'), 'de.test', 'DE', 'https://de.test/', 1, 1)`,
			),
			// Listed for Fedora but not a base our paths extend: it must never
			// appear in the picker, because picking it would 404.
			ctx.env.DB.prepare(
				`INSERT INTO mirrors (distro_id, name, country, base_url, healthy, serves_artifacts)
				 VALUES ((SELECT id FROM distros WHERE slug='fedora'), 'repo.test', 'JP',
				         'https://repo.test/fedora/linux/releases/44/Everything/x86_64/os/', 1, 0)`,
			),
		]);
		await ctx.env.DB.batch([
			ctx.env.DB.prepare(
				`INSERT INTO artifact_mirrors (artifact_id, mirror_id, available)
				 SELECT a.id, m.id, 1 FROM artifacts a, mirrors m
				  WHERE a.path NOT LIKE 'magnet:%' AND m.serves_artifacts = 1`,
			),
		]);
	});

	afterAll(() => ctx.dispose());

	describe("GET download-options", () => {
		it("returns the decision tree grouped version → edition → arch/format", async () => {
			const res = await app.request("/v1/distros/fedora/download-options", {}, ctx.env);
			const body = (await res.json()) as ApiResponse<DownloadOptions>;
			expect(res.status).toBe(200);
			if (!body.ok) throw new Error("expected success");

			expect(body.data.versions).toHaveLength(1);
			const [version] = body.data.versions;
			expect(version?.version).toBe("44");

			const ws = version?.editions.find((e) => e.name === "Workstation");
			expect(ws?.archs.sort()).toEqual(["aarch64", "x86_64"]);
			expect(ws?.formats).toEqual(["iso"]);

			const kde = version?.editions.find((e) => e.name === "KDE");
			expect(kde?.desktop).toBe("kde");
			expect(kde?.formats.sort()).toEqual(["iso", "magnet"]);

			// repo.test is a healthy Fedora mirror and is deliberately absent: the
			// picker only offers mirrors a download can actually come from.
			expect(body.data.mirrors.map((m) => m.country).sort()).toEqual(["DE", "SE"]);
		});

		it("404s a distro that does not exist", async () => {
			const res = await app.request("/v1/distros/nope/download-options", {}, ctx.env);
			expect(res.status).toBe(404);
		});
	});

	describe("POST resolve", () => {
		it("joins the chosen mirror with the artifact path and returns the checksum", async () => {
			const mirror = await ctx.env.DB.prepare(
				"SELECT id FROM mirrors WHERE name = 'se.test'",
			).first<{ id: number }>();

			const { status, body } = await post(ctx, "/v1/downloads/resolve", {
				slug: "fedora",
				version: "44",
				edition: "Workstation",
				arch: "x86_64",
				format: "iso",
				mirror_id: mirror?.id,
			});
			expect(status).toBe(200);
			const parsed = body as ApiResponse<DownloadResolution>;
			if (!parsed.ok) throw new Error("expected success");

			expect(parsed.data).toMatchObject({
				url: "https://se.test/pub/f/44/ws.iso",
				size: 2299832320,
				sha256: "aaa",
				mirror_choice: "requested",
			});
			expect(parsed.data.mirror?.name).toBe("se.test");
		});

		it("prefers a mirror in the caller's country when none is named", async () => {
			const { body } = await post(ctx, "/v1/downloads/resolve", {
				slug: "fedora",
				version: "44",
				edition: "Workstation",
				arch: "x86_64",
				country: "DE",
			});
			const parsed = body as ApiResponse<DownloadResolution>;
			if (!parsed.ok) throw new Error("expected success");
			expect(parsed.data.mirror?.country).toBe("DE");
			expect(parsed.data.mirror_choice).toBe("country");
		});

		it("falls back to any healthy mirror, and says that is what it did", async () => {
			const { body } = await post(ctx, "/v1/downloads/resolve", {
				slug: "fedora",
				version: "44",
				edition: "Workstation",
				arch: "x86_64",
				country: "JP",
			});
			const parsed = body as ApiResponse<DownloadResolution>;
			if (!parsed.ok) throw new Error("expected success");
			expect(parsed.data.mirror_choice).toBe("fallback");
			expect(parsed.data.url).toMatch(/^https:\/\/(de|se)\.test\//);
		});

		it("returns a magnet untouched — handing it a mirror would corrupt it", async () => {
			const { body } = await post(ctx, "/v1/downloads/resolve", {
				slug: "fedora",
				version: "44",
				edition: "KDE",
				arch: "x86_64",
				format: "magnet",
			});
			const parsed = body as ApiResponse<DownloadResolution>;
			if (!parsed.ok) throw new Error("expected success");
			expect(parsed.data.url).toBe("magnet:?xt=urn:btih:beef");
			expect(parsed.data.mirror).toBeNull();
			expect(parsed.data.mirror_choice).toBe("origin");
		});

		it("404s a combination that does not exist", async () => {
			const { status, body } = await post(ctx, "/v1/downloads/resolve", {
				slug: "fedora",
				version: "44",
				edition: "Workstation",
				arch: "riscv64",
			});
			expect(status).toBe(404);
			const parsed = body as ApiResponse<unknown>;
			if (parsed.ok) throw new Error("expected failure");
			expect(parsed.error.code).toBe("NOT_FOUND");
		});

		it("rejects a body missing required fields", async () => {
			const { status, body } = await post(ctx, "/v1/downloads/resolve", { slug: "fedora" });
			expect(status).toBe(400);
			const parsed = body as ApiResponse<unknown>;
			if (parsed.ok) throw new Error("expected failure");
			expect(parsed.error.code).toBe("VALIDATION_ERROR");
		});
	});

	describe("POST track", () => {
		it("counts a click in KV rather than on the hot database path", async () => {
			const artifact = await ctx.env.DB.prepare(
				"SELECT id FROM artifacts WHERE path = 'pub/f/44/ws.iso'",
			).first<{ id: number }>();

			await post(ctx, "/v1/downloads/track", { artifact_id: artifact?.id });
			await post(ctx, "/v1/downloads/track", { artifact_id: artifact?.id });

			const day = new Date().toISOString().slice(0, 10);
			const count = await ctx.env.KV_RATE.get(`dlcount:${artifact?.id}:0:${day}`);
			expect(count).toBe("2");
		});

		it("rejects a body without an artifact", async () => {
			const { status } = await post(ctx, "/v1/downloads/track", {});
			expect(status).toBe(400);
		});
	});

	describe("rate limiting", () => {
		it("answers 429 with Retry-After once the window is spent", async () => {
			const env = { ...ctx.env, RATE_SALT: "test-salt" };
			const body = { artifact_id: 1 };

			let last = new Response();
			// The documented limit is 30/min; the 31st must be refused.
			for (let i = 0; i < 31; i++) {
				last = await app.request(
					"/v1/downloads/track",
					{ method: "POST", body: JSON.stringify(body) },
					env,
				);
			}

			expect(last.status).toBe(429);
			expect(Number(last.headers.get("Retry-After"))).toBeGreaterThan(0);
		});

		it("is skipped entirely when no salt is configured", async () => {
			// A constant fallback salt would make the stored hashes reversible,
			// which is worse than not limiting in dev.
			for (let i = 0; i < 40; i++) {
				const res = await app.request(
					"/v1/downloads/track",
					{ method: "POST", body: JSON.stringify({ artifact_id: 2 }) },
					ctx.env,
				);
				expect(res.status).toBe(200);
			}
		});
	});
});

describe("joinMirror", () => {
	it("never doubles or drops the separator", () => {
		expect(joinMirror("https://m.test/", "a/b.iso")).toBe("https://m.test/a/b.iso");
		expect(joinMirror("https://m.test", "a/b.iso")).toBe("https://m.test/a/b.iso");
		expect(joinMirror("https://m.test/", "/a/b.iso")).toBe("https://m.test/a/b.iso");
	});
});
