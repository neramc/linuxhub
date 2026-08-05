// Artifact ingestion against a real D1. The three-level insert (release →
// edition → artifact) resolves each parent by subselect, so an ordering
// mistake produces silence rather than an error — which is exactly why these
// assert on rows landing, not on the calls returning.

import type { LiveCatalog } from "@linuxhub/ingest/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	isAbsoluteRef,
	linkArtifactsToMirrorsStatement,
	pruneArtifactMirrorsStatement,
	upsertCatalog,
} from "../src/db/artifacts";
import { upsertReleases } from "../src/db/releases";
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
			path: "pub/fedora/44/ws.iso",
			size: 2299832320,
			sha256: "aaa",
		},
		{
			version: "44",
			edition: "KDE",
			arch: "x86_64",
			format: "iso",
			path: "pub/fedora/44/kde.iso",
			sha256: "bbb",
		},
		{
			version: "44",
			edition: "KDE",
			arch: "x86_64",
			format: "magnet",
			path: "magnet:?xt=urn:btih:deadbeef",
		},
	],
};

async function seedDistroAndRelease(ctx: TestContext) {
	await ctx.env.DB.prepare(
		`INSERT INTO distros (slug, name, homepage, logo_path, created_at, updated_at)
		 VALUES ('fedora', 'Fedora', 'https://f.test', '/f.svg', 't', 't')`,
	).run();
	await upsertReleases(ctx.env.DB, "fedora", CATALOG.releases, "https://src.test", "2026-08-05");
}

describe("artifact ingestion", () => {
	let ctx: TestContext;
	beforeEach(async () => {
		ctx = await createTestContext();
		await seedDistroAndRelease(ctx);
	});
	afterEach(() => ctx.dispose());

	it("writes editions and artifacts under their release, with provenance", async () => {
		await upsertCatalog(ctx.env.DB, "fedora", CATALOG, "https://src.test", "2026-08-05T00:00:00Z");

		const counts = await ctx.env.DB.prepare(
			"SELECT (SELECT COUNT(*) FROM editions) e, (SELECT COUNT(*) FROM artifacts) a",
		).first<{ e: number; a: number }>();
		expect(counts).toEqual({ e: 2, a: 3 });

		const row = await ctx.env.DB.prepare(
			`SELECT a.arch, a.size, a.sha256, a.source_url, a.fetched_at, e.name, e.desktop
			   FROM artifacts a JOIN editions e ON e.id = a.edition_id
			  WHERE a.path = 'pub/fedora/44/ws.iso'`,
		).first<Record<string, unknown>>();
		expect(row).toMatchObject({
			arch: "x86_64",
			size: 2299832320,
			sha256: "aaa",
			source_url: "https://src.test",
			fetched_at: "2026-08-05T00:00:00Z",
			name: "Workstation",
			desktop: null,
		});
	});

	it("is idempotent — a second pass updates rather than duplicating", async () => {
		await upsertCatalog(ctx.env.DB, "fedora", CATALOG, "https://src.test", "2026-08-05T00:00:00Z");
		await upsertCatalog(ctx.env.DB, "fedora", CATALOG, "https://src.test", "2026-08-05T06:00:00Z");

		const counts = await ctx.env.DB.prepare(
			"SELECT (SELECT COUNT(*) FROM editions) e, (SELECT COUNT(*) FROM artifacts) a",
		).first<{ e: number; a: number }>();
		expect(counts).toEqual({ e: 2, a: 3 });

		const fetched = await ctx.env.DB.prepare(
			"SELECT fetched_at FROM artifacts WHERE path = 'pub/fedora/44/ws.iso'",
		).first<{ fetched_at: string }>();
		expect(fetched?.fetched_at).toBe("2026-08-05T06:00:00Z");
	});

	it("skips an entry whose release is missing instead of failing the whole batch", async () => {
		// A version we have no release row for, mixed in with one we do. The good
		// entry must survive the bad one.
		await upsertCatalog(
			ctx.env.DB,
			"fedora",
			{
				releases: [],
				editions: [
					{ version: "99", name: "Ghost", kind: "desktop" },
					{ version: "44", name: "Server", kind: "server" },
				],
				artifacts: [],
			},
			"https://src.test",
			"2026-08-05",
		);

		const names = await ctx.env.DB.prepare("SELECT name FROM editions ORDER BY name").all<{
			name: string;
		}>();
		expect(names.results.map((r) => r.name)).toEqual(["Server"]);
	});

	describe("mirror linking", () => {
		beforeEach(async () => {
			await upsertCatalog(
				ctx.env.DB,
				"fedora",
				CATALOG,
				"https://src.test",
				"2026-08-05T00:00:00Z",
			);
			await ctx.env.DB.batch([
				ctx.env.DB.prepare(
					`INSERT INTO mirrors (distro_id, name, base_url, healthy, serves_artifacts)
					 VALUES ((SELECT id FROM distros WHERE slug='fedora'), 'a.test', 'https://a.test/', 1, 1)`,
				),
				ctx.env.DB.prepare(
					`INSERT INTO mirrors (distro_id, name, base_url, healthy, serves_artifacts)
					 VALUES ((SELECT id FROM distros WHERE slug='fedora'), 'down.test', 'https://down.test/', 0, 1)`,
				),
				// A real mirror of the distro whose base_url is a repo directory,
				// not a root our paths extend — Fedora's MirrorManager list.
				ctx.env.DB.prepare(
					`INSERT INTO mirrors (distro_id, name, base_url, healthy, serves_artifacts)
					 VALUES ((SELECT id FROM distros WHERE slug='fedora'), 'repo.test',
					         'https://repo.test/fedora/linux/releases/44/Everything/x86_64/os/', 1, 0)`,
				),
			]);
		});

		it("links mirror-relative artifacts to healthy mirrors only", async () => {
			await ctx.env.DB.batch([linkArtifactsToMirrorsStatement(ctx.env.DB, "fedora")]);

			const { results } = await ctx.env.DB.prepare(
				`SELECT m.name, a.path FROM artifact_mirrors am
				   JOIN mirrors m ON m.id = am.mirror_id
				   JOIN artifacts a ON a.id = am.artifact_id
				  ORDER BY a.path`,
			).all<{ name: string; path: string }>();

			// Two ISOs against the one healthy artifact base. The unhealthy mirror
			// and the repo-directory mirror are both excluded.
			expect(results.map((r) => r.path)).toEqual(["pub/fedora/44/kde.iso", "pub/fedora/44/ws.iso"]);
			expect(new Set(results.map((r) => r.name))).toEqual(new Set(["a.test"]));
		});

		it("never links a mirror whose base_url is not a base for our paths", async () => {
			// Joining `pub/fedora/44/ws.iso` onto a repo directory produces a URL
			// that answers 404, which is how this was found.
			await ctx.env.DB.batch([linkArtifactsToMirrorsStatement(ctx.env.DB, "fedora")]);

			const linked = await ctx.env.DB.prepare(
				`SELECT COUNT(*) AS n FROM artifact_mirrors am
				   JOIN mirrors m ON m.id = am.mirror_id
				  WHERE m.name = 'repo.test'`,
			).first<{ n: number }>();
			expect(linked?.n).toBe(0);
		});

		it("drops links to a mirror that stops being an artifact base", async () => {
			await ctx.env.DB.batch([linkArtifactsToMirrorsStatement(ctx.env.DB, "fedora")]);
			await ctx.env.DB.prepare(
				"UPDATE mirrors SET serves_artifacts = 0 WHERE name = 'a.test'",
			).run();

			await ctx.env.DB.batch([pruneArtifactMirrorsStatement(ctx.env.DB, "fedora")]);

			const n = await ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM artifact_mirrors").first<{
				n: number;
			}>();
			expect(n?.n).toBe(0);
		});

		it("never links a magnet — no mirror serves one", async () => {
			await ctx.env.DB.batch([linkArtifactsToMirrorsStatement(ctx.env.DB, "fedora")]);

			const magnet = await ctx.env.DB.prepare(
				`SELECT COUNT(*) AS n FROM artifact_mirrors am
				   JOIN artifacts a ON a.id = am.artifact_id
				  WHERE a.format = 'magnet'`,
			).first<{ n: number }>();
			expect(magnet?.n).toBe(0);
		});

		it("is idempotent", async () => {
			await ctx.env.DB.batch([linkArtifactsToMirrorsStatement(ctx.env.DB, "fedora")]);
			await ctx.env.DB.batch([linkArtifactsToMirrorsStatement(ctx.env.DB, "fedora")]);
			const n = await ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM artifact_mirrors").first<{
				n: number;
			}>();
			expect(n?.n).toBe(2);
		});
	});
});

describe("isAbsoluteRef", () => {
	it("separates what a mirror can serve from what it cannot", () => {
		expect(isAbsoluteRef("pub/fedora/44/ws.iso")).toBe(false);
		expect(isAbsoluteRef("iso/2026.08.01/arch.iso")).toBe(false);
		expect(isAbsoluteRef("https://archlinux.org/releng/releases/x/torrent/")).toBe(true);
		expect(isAbsoluteRef("magnet:?xt=urn:btih:deadbeef")).toBe(true);
	});
});
