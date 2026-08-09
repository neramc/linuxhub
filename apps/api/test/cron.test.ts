// Ingestion tests. The transport is stubbed so these never touch an upstream —
// crawler politeness is not something a test suite should be exercising — but
// the database is real, so every upsert, CHECK constraint and conflict target
// is genuinely exercised.

import type { HttpClient } from "@linuxhub/ingest/http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	CRON_MIRRORS,
	CRON_RANKINGS,
	ingestMirrors,
	ingestReleases,
	runScheduled,
	snapshotRankings,
} from "../src/cron";
import { createTestContext, type TestContext } from "./harness";

const UBUNTU_CYCLES = [
	{
		cycle: "26.04",
		releaseDate: "2026-04-23",
		eol: "2031-04-30",
		latest: "26.04",
		lts: true,
		codename: "Resolute Raccoon",
	},
	{ cycle: "25.10", releaseDate: "2025-10-09", eol: "2026-07-09", latest: "25.10", lts: false },
];

const ARCH_MIRRORS = {
	urls: [
		{
			url: "https://mirror.example.se/archlinux/",
			protocol: "https",
			country: "Sweden",
			country_code: "SE",
			score: 1.2,
			completion_pct: 1,
			active: true,
		},
		{
			url: "https://mirror.example.de/archlinux/",
			protocol: "https",
			country: "Germany",
			country_code: "DE",
			score: 2.4,
			completion_pct: 1,
			active: true,
		},
	],
};

const UBUNTU_SUMS = `${"a".repeat(64)} *ubuntu-26.04-desktop-amd64.iso
${"b".repeat(64)} *ubuntu-26.04-live-server-amd64.iso
${"c".repeat(64)} *ubuntu-26.04-wsl-amd64.wsl`;

const ARCH_RELEASES = {
	releases: [
		{
			version: "2026.08.01",
			release_date: "2026-08-01",
			available: true,
			sha256_sum: "b1ee7",
			iso_url: "/iso/2026.08.01/archlinux-2026.08.01-x86_64.iso",
			torrent_url: null,
			magnet_uri: null,
		},
	],
};

const FEDORA_MIRRORLIST = "# repo = fedora-44\nhttps://mirror.example.fr/fedora/\n";

/** Serves fixtures by URL; any URL not listed throws, which is how the "one
 *  source fails, the others still land" case is set up. */
function stubHttp(routes: Record<string, unknown>): HttpClient {
	async function body(url: string): Promise<unknown> {
		const key = Object.keys(routes).find((k) => url.includes(k));
		if (key === undefined) throw new Error(`no stub for ${url}`);
		return routes[key];
	}
	return {
		async getText(url) {
			return String(await body(url));
		},
		async getJson<T>(url: string) {
			return (await body(url)) as T;
		},
		// Sources that publish no size ask for one with a HEAD; the stub has
		// none to give, which is the same as an upstream that omits it.
		async head() {
			return null;
		},
	};
}

describe("ingestion", () => {
	let ctx: TestContext;
	beforeEach(async () => {
		ctx = await createTestContext();
	});
	afterEach(() => ctx.dispose());

	it("seeds catalog identity from the cited content index", async () => {
		await ingestReleases(ctx.env, new Date("2026-08-04T00:00:00Z"), stubHttp({}));

		const row = await ctx.env.DB.prepare(
			"SELECT slug, name, summary, homepage, logo_path, source_url, family FROM distros WHERE slug = 'ubuntu'",
		).first<{
			name: string;
			summary: string;
			homepage: string;
			logo_path: string;
			source_url: string;
			family: string;
		}>();

		expect(row?.name).toBe("Ubuntu");
		expect(row?.homepage).toBe("https://ubuntu.com");
		expect(row?.logo_path).toBe("/distros/ubuntu.svg");
		// Identity is asserted only where a resolvable citation backs it.
		expect(row?.source_url).toMatch(/^https:\/\//);
		// Lineage is Wikidata's job; empty is honest until that step runs.
		expect(row?.family).toBe("");

		const docs = await ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM content_index").first<{
			n: number;
		}>();
		expect(docs?.n).toBe(36);
	});

	it("writes releases with provenance and the lts flag", async () => {
		await ingestReleases(
			ctx.env,
			new Date("2026-08-04T00:00:00Z"),
			stubHttp({ "/ubuntu.json": UBUNTU_CYCLES }),
		);

		const row = await ctx.env.DB.prepare(
			`SELECT r.version, r.channel, r.lts, r.codename, r.latest_point, r.released_at,
			        r.eol_at, r.source_url, r.fetched_at
			   FROM releases r JOIN distros d ON d.id = r.distro_id
			  WHERE d.slug = 'ubuntu' AND r.version = '26.04'`,
		).first<Record<string, unknown>>();

		expect(row).toMatchObject({
			channel: "stable",
			lts: 1,
			codename: "Resolute Raccoon",
			latest_point: "26.04",
			released_at: "2026-04-23",
			eol_at: "2031-04-30",
			source_url: "https://endoflife.date/api/ubuntu.json",
		});
		expect(row?.fetched_at).toBe("2026-08-04T00:00:00.000Z");
	});

	it("logs a failing source as an error without blocking the others", async () => {
		// Only Ubuntu has a stub; the other six endoflife products throw.
		const summary = await ingestReleases(
			ctx.env,
			new Date("2026-08-04T00:00:00Z"),
			stubHttp({ "/ubuntu.json": UBUNTU_CYCLES }),
		);

		// Asserted as behaviour rather than exact counts: the point is that the
		// one stubbed source lands and every other one is recorded as failing.
		// Pinning the numbers would make this break every time a source is added,
		// which says nothing about isolation.
		expect(summary.ok).toBeGreaterThanOrEqual(1);
		expect(summary.failed).toBeGreaterThan(0);

		const ubuntu = await ctx.env.DB.prepare(
			"SELECT COUNT(*) AS n FROM releases r JOIN distros d ON d.id = r.distro_id WHERE d.slug = 'ubuntu'",
		).first<{ n: number }>();
		expect(ubuntu?.n).toBe(2);

		const errors = await ctx.env.DB.prepare(
			"SELECT COUNT(*) AS n FROM ingest_log WHERE status = 'error'",
		).first<{ n: number }>();
		expect(errors?.n).toBe(summary.failed);

		// The source that did work is logged as such, next to the ones that did not.
		const ok = await ctx.env.DB.prepare(
			"SELECT COUNT(*) AS n FROM ingest_log WHERE status = 'ok' AND source LIKE '%ubuntu%'",
		).first<{ n: number }>();
		expect(ok?.n).toBe(1);
	});

	it("is idempotent — a second pass updates rather than duplicates", async () => {
		const http = stubHttp({ "/ubuntu.json": UBUNTU_CYCLES });
		await ingestReleases(ctx.env, new Date("2026-08-04T00:00:00Z"), http);
		await ingestReleases(ctx.env, new Date("2026-08-04T06:00:00Z"), http);

		const counts = await ctx.env.DB.prepare(
			"SELECT (SELECT COUNT(*) FROM distros) AS d, (SELECT COUNT(*) FROM releases) AS r, (SELECT COUNT(*) FROM content_index) AS c",
		).first<{ d: number; r: number; c: number }>();
		expect(counts).toEqual({ d: 12, r: 2, c: 36 });

		// The row is refreshed, not re-inserted.
		const fetchedAt = await ctx.env.DB.prepare(
			"SELECT fetched_at FROM releases WHERE version = '26.04'",
		).first<{ fetched_at: string }>();
		expect(fetchedAt?.fetched_at).toBe("2026-08-04T06:00:00.000Z");
	});

	it("stores arch mirrors with their published country and health", async () => {
		await ingestMirrors(
			ctx.env,
			new Date("2026-08-04T00:00:00Z"),
			stubHttp({ "mirrors/status": ARCH_MIRRORS }),
		);

		const { results } = await ctx.env.DB.prepare(
			`SELECT m.name, m.country, m.protocol, m.healthy, m.source_url
			   FROM mirrors m JOIN distros d ON d.id = m.distro_id
			  WHERE d.slug = 'arch' ORDER BY m.name`,
		).all<Record<string, unknown>>();

		expect(results).toHaveLength(2);
		expect(results[0]).toMatchObject({
			name: "mirror.example.de",
			country: "DE",
			protocol: "https",
			healthy: 1,
			source_url: "https://archlinux.org/mirrors/status/json/",
		});
	});

	it("skips the fedora mirrorlist until a release tells it which repo to ask for", async () => {
		await ingestMirrors(ctx.env, new Date("2026-08-04T00:00:00Z"), stubHttp({}));

		const skipped = await ctx.env.DB.prepare(
			"SELECT detail FROM ingest_log WHERE status = 'skipped'",
		).first<{ detail: string }>();
		expect(skipped?.detail).toMatch(/no release ingested yet/);
	});

	it("derives the fedora mirrorlist repo from the newest ingested release", async () => {
		const http = stubHttp({
			"/fedora.json": [{ cycle: "44", releaseDate: "2026-04-28", eol: "2027-06-02" }],
			mirrorlist: FEDORA_MIRRORLIST,
		});
		await ingestReleases(ctx.env, new Date("2026-08-04T00:00:00Z"), http);
		await ingestMirrors(ctx.env, new Date("2026-08-04T00:00:00Z"), http);

		const row = await ctx.env.DB.prepare(
			"SELECT m.source_url FROM mirrors m JOIN distros d ON d.id = m.distro_id WHERE d.slug = 'fedora'",
		).first<{ source_url: string }>();
		expect(row?.source_url).toContain("repo=fedora-44");
	});

	it("retires a mirror that dropped out of the upstream list instead of deleting it", async () => {
		await ingestMirrors(
			ctx.env,
			new Date("2026-08-04T00:00:00Z"),
			stubHttp({ "mirrors/status": ARCH_MIRRORS }),
		);
		await ingestMirrors(
			ctx.env,
			new Date("2026-08-05T00:00:00Z"),
			stubHttp({ "mirrors/status": { urls: [ARCH_MIRRORS.urls[0]] } }),
		);

		const { results } = await ctx.env.DB.prepare(
			"SELECT name, healthy FROM mirrors ORDER BY name",
		).all<{ name: string; healthy: number }>();
		expect(results).toEqual([
			{ name: "mirror.example.de", healthy: 0 },
			{ name: "mirror.example.se", healthy: 1 },
		]);
	});

	it("links artifacts to mirrors that arrived after them, so seeding order cannot matter", async () => {
		// The artifact pass runs before any Arch mirror exists on a fresh
		// database — that is the real first-deploy sequence. If only the artifact
		// pass linked, every Arch download would answer "mirror for artifact not
		// found" until it happened to run again, up to six hours later.
		await ingestReleases(
			ctx.env,
			new Date("2026-08-04T00:00:00Z"),
			stubHttp({ "releng/releases": ARCH_RELEASES }),
		);

		const before = await ctx.env.DB.prepare(
			`SELECT COUNT(*) AS n FROM artifact_mirrors am
			   JOIN artifacts a ON a.id = am.artifact_id
			   JOIN editions e ON e.id = a.edition_id
			   JOIN releases r ON r.id = e.release_id
			   JOIN distros  d ON d.id = r.distro_id
			  WHERE d.slug = 'arch'`,
		).first<{ n: number }>();
		expect(before?.n).toBe(0);

		await ingestMirrors(
			ctx.env,
			new Date("2026-08-04T01:00:00Z"),
			stubHttp({ "mirrors/status": ARCH_MIRRORS }),
		);

		const after = await ctx.env.DB.prepare(
			`SELECT COUNT(*) AS n FROM artifact_mirrors am
			   JOIN artifacts a ON a.id = am.artifact_id
			   JOIN editions e ON e.id = a.edition_id
			   JOIN releases r ON r.id = e.release_id
			   JOIN distros  d ON d.id = r.distro_id
			  WHERE d.slug = 'arch'`,
		).first<{ n: number }>();
		expect(after?.n).toBeGreaterThan(0);
	});

	it("ingests ubuntu ISOs from the checksum file, skipping what is not one", async () => {
		await ingestReleases(
			ctx.env,
			new Date("2026-08-09T00:00:00Z"),
			// Only 26.04's checksum file is served: Ubuntu removes a version's
			// directory at EOL, so a 404 for an older one is the normal case.
			stubHttp({
				"endoflife.date/api/ubuntu": UBUNTU_CYCLES,
				"releases.ubuntu.com/26.04": UBUNTU_SUMS,
			}),
		);

		const { results } = await ctx.env.DB.prepare(
			`SELECT e.name AS edition, a.arch, a.path FROM artifacts a
			   JOIN editions e ON e.id = a.edition_id
			   JOIN releases r ON r.id = e.release_id
			   JOIN distros  d ON d.id = r.distro_id
			  WHERE d.slug = 'ubuntu' ORDER BY e.name`,
		).all<{ edition: string; arch: string; path: string }>();

		// The .wsl image is not an ISO and must not become an artifact.
		expect(results).toEqual([
			{ edition: "Desktop", arch: "x86_64", path: "26.04/ubuntu-26.04-desktop-amd64.iso" },
			{ edition: "Server", arch: "x86_64", path: "26.04/ubuntu-26.04-live-server-amd64.iso" },
		]);

		// releases.ubuntu.com is a real download base, so it is linkable.
		const linked = await ctx.env.DB.prepare(
			`SELECT COUNT(*) AS n FROM artifact_mirrors am
			   JOIN mirrors m ON m.id = am.mirror_id
			  WHERE m.name = 'releases.ubuntu.com'`,
		).first<{ n: number }>();
		expect(linked?.n).toBe(2);
	});

	it("snapshots no rankings while there are no download signals of our own", async () => {
		const summary = await snapshotRankings(ctx.env, new Date("2026-08-04T00:00:00Z"));
		expect(summary.written).toBe(0);

		const detail = await ctx.env.DB.prepare(
			"SELECT detail FROM ingest_log WHERE source = 'rankings:week'",
		).first<{ detail: string }>();
		expect(detail?.detail).toBe("no download signals yet");
	});

	it("ranks distros once download events exist", async () => {
		await ingestReleases(
			ctx.env,
			new Date("2026-08-04T00:00:00Z"),
			stubHttp({ "/ubuntu.json": UBUNTU_CYCLES }),
		);
		await ctx.env.DB.batch([
			ctx.env.DB.prepare(
				"INSERT INTO editions (release_id, name) VALUES ((SELECT id FROM releases LIMIT 1), 'Desktop')",
			),
			ctx.env.DB.prepare(
				"INSERT INTO artifacts (edition_id, arch, format, path) VALUES ((SELECT id FROM editions LIMIT 1), 'x86_64', 'iso', '/a.iso')",
			),
			ctx.env.DB.prepare(
				"INSERT INTO download_events (artifact_id, day, count) VALUES ((SELECT id FROM artifacts LIMIT 1), '2026-08-03', 42)",
			),
		]);

		const summary = await snapshotRankings(ctx.env, new Date("2026-08-04T00:00:00Z"));
		expect(summary.written).toBe(1);

		const row = await ctx.env.DB.prepare(
			"SELECT d.slug, r.rank, r.score, r.period FROM rankings r JOIN distros d ON d.id = r.distro_id",
		).first<{ slug: string; rank: number; score: number; period: string }>();
		expect(row).toMatchObject({ slug: "ubuntu", rank: 1, score: 42, period: "week" });
	});

	it("dispatches each cron expression to its own pass", async () => {
		const mirrors = await runScheduled(CRON_MIRRORS, ctx.env, new Date(), stubHttp({}));
		expect(mirrors.schedule).toBe(CRON_MIRRORS);

		const rankings = await runScheduled(CRON_RANKINGS, ctx.env, new Date());
		expect(rankings.schedule).toBe(CRON_RANKINGS);
	});
});
