// Every endpoint owes a happy path, a validation failure, and NOT_FOUND
// coverage (.ai/backend-rules.md § "Testing"). The database is real, so the
// SQL is genuinely exercised rather than mocked away.

import type { HttpClient } from "@linuxhub/ingest/http";
import type {
	ApiResponse,
	Distro,
	DistroDetail,
	HallOfFameEntry,
	RankHistoryPoint,
	RankingEntry,
	RecentRelease,
	Release,
} from "@linuxhub/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ingestReleases } from "../src/cron";
import { app } from "../src/index";
import { createTestContext, type TestContext } from "./harness";

const CYCLES: Record<string, unknown> = {
	"/ubuntu.json": [
		{
			cycle: "26.04",
			releaseDate: "2026-04-23",
			eol: "2031-04-30",
			latest: "26.04",
			lts: true,
			codename: "Resolute Raccoon",
		},
		{ cycle: "20.04", releaseDate: "2020-04-23", eol: "2025-05-29", lts: true },
	],
	"/fedora.json": [{ cycle: "44", releaseDate: "2026-04-28", eol: "2027-06-02" }],
};

const stubHttp: HttpClient = {
	async getText(url) {
		return String(await this.getJson(url));
	},
	async getJson<T>(url: string) {
		const key = Object.keys(CYCLES).find((k) => url.includes(k));
		if (key === undefined) throw new Error(`no stub for ${url}`);
		return CYCLES[key] as T;
	},
	async head() {
		return null;
	},
};

async function get<T>(ctx: TestContext, path: string): Promise<{ status: number; body: T }> {
	const res = await app.request(path, {}, ctx.env);
	return { status: res.status, body: (await res.json()) as T };
}

describe("read endpoints", () => {
	let ctx: TestContext;

	beforeAll(async () => {
		ctx = await createTestContext();
		await ingestReleases(ctx.env, new Date("2026-08-04T00:00:00Z"), stubHttp);

		// Taxonomy, mirrors and Hall of Fame are seeded by later tasks; inserted
		// directly here so the joins that serve them are covered now.
		await ctx.env.DB.batch([
			ctx.env.DB.prepare(
				"INSERT INTO distro_taxonomy (distro_id, kind, ref_slug) VALUES ((SELECT id FROM distros WHERE slug='ubuntu'), 'category', 'desktop')",
			),
			ctx.env.DB.prepare(
				"INSERT INTO distro_taxonomy (distro_id, kind, ref_slug) VALUES ((SELECT id FROM distros WHERE slug='ubuntu'), 'desktop', 'gnome')",
			),
			ctx.env.DB.prepare(
				"INSERT INTO distro_taxonomy (distro_id, kind, ref_slug) VALUES ((SELECT id FROM distros WHERE slug='fedora'), 'category', 'desktop')",
			),
			ctx.env.DB.prepare(
				`INSERT INTO mirrors (distro_id, name, country, base_url, source_url)
				 VALUES ((SELECT id FROM distros WHERE slug='ubuntu'), 'mirror.example.se', 'SE', 'https://mirror.example.se/ubuntu/', 'https://example.test/list')`,
			),
			ctx.env.DB.prepare(
				`INSERT INTO hall_of_fame (distro_id, rationale, sources, ordering)
				 VALUES ((SELECT id FROM distros WHERE slug='debian'), 'The universal operating system.', '["https://www.debian.org/social_contract"]', 1)`,
			),
		]);
	});

	afterAll(() => ctx.dispose());

	describe("GET /v1/distros", () => {
		it("returns the catalog with an honest total, not the page length", async () => {
			const { status, body } = await get<ApiResponse<Distro[]>>(ctx, "/v1/distros?limit=2");
			expect(status).toBe(200);
			if (!body.ok) throw new Error("expected success");

			expect(body.data).toHaveLength(2);
			expect(body.meta).toMatchObject({ page: 1, limit: 2, total: 12 });
		});

		it("returns facts, not presentation — a number for downloads and no composed strings", async () => {
			const { body } = await get<ApiResponse<Distro[]>>(ctx, "/v1/distros?q=ubuntu");
			if (!body.ok) throw new Error("expected success");

			const ubuntu = body.data[0];
			expect(ubuntu?.slug).toBe("ubuntu");
			expect(typeof ubuntu?.downloads).toBe("number");
			expect(ubuntu).not.toHaveProperty("familyLine");
			expect(ubuntu).not.toHaveProperty("color");
			expect(ubuntu).not.toHaveProperty("initials");
		});

		it("filters by category and by tag", async () => {
			const { body } = await get<ApiResponse<Distro[]>>(ctx, "/v1/distros?category=desktop");
			if (!body.ok) throw new Error("expected success");
			expect(body.data.map((d) => d.slug).sort()).toEqual(["fedora", "ubuntu"]);

			const none = await get<ApiResponse<Distro[]>>(ctx, "/v1/distros?tag=nonexistent");
			if (!none.body.ok) throw new Error("expected success");
			expect(none.body.data).toEqual([]);
			expect(none.body.meta?.total).toBe(0);
		});

		it("attaches taxonomy and the newest release to each row", async () => {
			const { body } = await get<ApiResponse<Distro[]>>(ctx, "/v1/distros?q=ubuntu");
			if (!body.ok) throw new Error("expected success");

			const ubuntu = body.data[0];
			expect(ubuntu?.categories).toEqual(["desktop"]);
			expect(ubuntu?.desktops).toEqual(["gnome"]);
			expect(ubuntu?.latest_release).toMatchObject({ version: "26.04", lts: true, eol: false });
		});

		it("falls back to name order for popularity while no ranking snapshot exists", async () => {
			const { body } = await get<ApiResponse<Distro[]>>(ctx, "/v1/distros?sort=popularity");
			if (!body.ok) throw new Error("expected success");

			const names = body.data.map((d) => d.name);
			expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
			expect(body.data.every((d) => d.rank === null)).toBe(true);
		});

		it("rejects an unknown sort with VALIDATION_ERROR", async () => {
			const { status, body } = await get<ApiResponse<Distro[]>>(ctx, "/v1/distros?sort=vibes");
			expect(status).toBe(400);
			if (body.ok) throw new Error("expected failure");
			expect(body.error.code).toBe("VALIDATION_ERROR");
			expect(body.error.request_id).toMatch(/^req_/);
		});

		it("rejects a limit above the documented maximum", async () => {
			const { status } = await get<ApiResponse<Distro[]>>(ctx, "/v1/distros?limit=500");
			expect(status).toBe(400);
		});
	});

	describe("GET /v1/distros/:slug", () => {
		it("returns the distro with its releases, mirrors, related set and provenance", async () => {
			const { status, body } = await get<ApiResponse<DistroDetail>>(ctx, "/v1/distros/ubuntu");
			expect(status).toBe(200);
			if (!body.ok) throw new Error("expected success");

			expect(body.data.distro.name).toBe("Ubuntu");
			expect(body.data.releases.map((r) => r.version)).toEqual(["26.04", "20.04"]);
			expect(body.data.mirrors[0]).toMatchObject({ name: "mirror.example.se", healthy: true });
			expect(body.data.related.length).toBeGreaterThan(0);
			expect(body.data.related.map((r) => r.slug)).not.toContain("ubuntu");
			// The provenance line is a product feature, so it must survive to the client.
			expect(body.data.provenance[0]).toMatchObject({
				source: expect.stringContaining("endoflife"),
			});
		});

		it("derives eol from eol_at rather than storing it", async () => {
			const { body } = await get<ApiResponse<DistroDetail>>(ctx, "/v1/distros/ubuntu");
			if (!body.ok) throw new Error("expected success");

			const [current, old] = body.data.releases;
			expect(current).toMatchObject({ eol_at: "2031-04-30", eol: false });
			expect(old).toMatchObject({ eol_at: "2025-05-29", eol: true });
			// eol is never a channel value (ADR-0019).
			expect(body.data.releases.every((r) => r.channel === "stable")).toBe(true);
		});

		it("404s an unknown slug", async () => {
			const { status, body } = await get<ApiResponse<DistroDetail>>(ctx, "/v1/distros/nope");
			expect(status).toBe(404);
			if (body.ok) throw new Error("expected failure");
			expect(body.error.code).toBe("NOT_FOUND");
		});

		it("rejects a malformed slug before it reaches the database", async () => {
			const { status, body } = await get<ApiResponse<DistroDetail>>(
				ctx,
				"/v1/distros/Not%20A%20Slug",
			);
			expect(status).toBe(400);
			if (body.ok) throw new Error("expected failure");
			expect(body.error.code).toBe("VALIDATION_ERROR");
		});
	});

	describe("GET /v1/distros/:slug/releases", () => {
		it("lists releases newest first", async () => {
			const { status, body } = await get<ApiResponse<Release[]>>(
				ctx,
				"/v1/distros/ubuntu/releases",
			);
			expect(status).toBe(200);
			if (!body.ok) throw new Error("expected success");
			expect(body.data.map((r) => r.version)).toEqual(["26.04", "20.04"]);
		});

		it("filters by channel", async () => {
			const { body } = await get<ApiResponse<Release[]>>(
				ctx,
				"/v1/distros/ubuntu/releases?channel=rolling",
			);
			if (!body.ok) throw new Error("expected success");
			expect(body.data).toEqual([]);
		});

		it("rejects an unknown channel", async () => {
			const { status } = await get<ApiResponse<Release[]>>(
				ctx,
				"/v1/distros/ubuntu/releases?channel=eol",
			);
			expect(status).toBe(400);
		});

		it("404s an unknown distro", async () => {
			const { status } = await get<ApiResponse<Release[]>>(ctx, "/v1/distros/nope/releases");
			expect(status).toBe(404);
		});
	});

	describe("GET /v1/releases/recent", () => {
		it("returns cross-distro releases newest first, with no composed English", async () => {
			const { status, body } = await get<ApiResponse<RecentRelease[]>>(
				ctx,
				"/v1/releases/recent?limit=2",
			);
			expect(status).toBe(200);
			if (!body.ok) throw new Error("expected success");

			expect(body.data[0]).toMatchObject({ slug: "fedora", version: "44", lts: false });
			expect(body.data[0]).not.toHaveProperty("title");
			expect(body.data[0]).not.toHaveProperty("subtitle");
			expect(body.meta?.next_cursor).toBe("2026-04-23");
		});

		it("pages through with the cursor and stops at the end", async () => {
			const { body } = await get<ApiResponse<RecentRelease[]>>(
				ctx,
				"/v1/releases/recent?limit=2&cursor=2026-04-23",
			);
			if (!body.ok) throw new Error("expected success");
			expect(body.data.map((r) => r.version)).toEqual(["20.04"]);
			expect(body.meta?.next_cursor).toBeNull();
		});

		it("rejects a limit above the maximum", async () => {
			const { status } = await get<ApiResponse<RecentRelease[]>>(
				ctx,
				"/v1/releases/recent?limit=999",
			);
			expect(status).toBe(400);
		});
	});

	describe("GET /v1/rankings", () => {
		it("returns an empty snapshot while we have no download signals of our own", async () => {
			const { status, body } = await get<
				ApiResponse<{ entries: RankingEntry[]; movers: RankingEntry[] }>
			>(ctx, "/v1/rankings");
			expect(status).toBe(200);
			if (!body.ok) throw new Error("expected success");
			expect(body.data).toEqual({ entries: [], movers: [] });
		});

		it("rejects an unknown period", async () => {
			const { status } = await get<ApiResponse<unknown>>(ctx, "/v1/rankings?period=fortnight");
			expect(status).toBe(400);
		});
	});

	describe("GET /v1/distros/:slug/rank-history", () => {
		it("returns a series for the client to draw, not a rendered points string", async () => {
			const { status, body } = await get<ApiResponse<RankHistoryPoint[]>>(
				ctx,
				"/v1/distros/ubuntu/rank-history",
			);
			expect(status).toBe(200);
			if (!body.ok) throw new Error("expected success");
			expect(Array.isArray(body.data)).toBe(true);
		});

		it("404s an unknown distro", async () => {
			const { status } = await get<ApiResponse<RankHistoryPoint[]>>(
				ctx,
				"/v1/distros/nope/rank-history",
			);
			expect(status).toBe(404);
		});
	});

	describe("GET /v1/hall-of-fame", () => {
		it("returns entries with their citations parsed", async () => {
			const { status, body } = await get<ApiResponse<HallOfFameEntry[]>>(ctx, "/v1/hall-of-fame");
			expect(status).toBe(200);
			if (!body.ok) throw new Error("expected success");
			expect(body.data).toHaveLength(1);
			expect(body.data[0]).toMatchObject({
				slug: "debian",
				sources: ["https://www.debian.org/social_contract"],
			});
		});
	});

	describe("internal auth", () => {
		it("hides the surface from a caller with no token", async () => {
			const res = await app.request(
				"/v1/distros",
				{},
				{ ...ctx.env, INTERNAL_API_TOKEN: "secret" },
			);
			expect(res.status).toBe(404);
		});

		it("serves a caller presenting the right token", async () => {
			const res = await app.request(
				"/v1/distros",
				{ headers: { "X-Internal-Token": "secret" } },
				{ ...ctx.env, INTERNAL_API_TOKEN: "secret" },
			);
			expect(res.status).toBe(200);
		});
	});
});
