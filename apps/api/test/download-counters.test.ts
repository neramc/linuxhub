// The KV → D1 half of download tracking. `POST /downloads/track` only writes a
// KV counter; without this flush the counts expire at 48h and rankings never
// see them, so the loop is only closed once these two agree.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { flushDownloadCounters, trackDownload } from "../src/db/downloads";
import { createTestContext, type TestContext } from "./harness";

const DAY = "2026-08-04";

async function counterRow(ctx: TestContext, artifactId: number, mirrorId = 0) {
	return ctx.env.DB.prepare(
		"SELECT count FROM download_events WHERE artifact_id = ?1 AND mirror_id = ?2 AND day = ?3",
	)
		.bind(artifactId, mirrorId, DAY)
		.first<{ count: number }>();
}

describe("flushDownloadCounters", () => {
	let ctx: TestContext;
	let artifactId: number;
	let mirrorId: number;

	beforeEach(async () => {
		ctx = await createTestContext();
		await ctx.env.DB.batch([
			ctx.env.DB.prepare(
				`INSERT INTO distros (slug, name, homepage, logo_path, created_at, updated_at)
				 VALUES ('arch', 'Arch Linux', 'https://a.test', '/a.svg', 't', 't')`,
			),
			ctx.env.DB.prepare(
				`INSERT INTO releases (distro_id, version, channel)
				 VALUES ((SELECT id FROM distros WHERE slug='arch'), '2026.08.01', 'rolling')`,
			),
			ctx.env.DB.prepare(
				`INSERT INTO editions (release_id, name, kind)
				 VALUES ((SELECT id FROM releases WHERE version='2026.08.01'), 'default', 'other')`,
			),
			ctx.env.DB.prepare(
				`INSERT INTO artifacts (edition_id, arch, format, path)
				 VALUES ((SELECT id FROM editions WHERE name='default'), 'x86_64', 'iso', 'iso/a.iso')`,
			),
			ctx.env.DB.prepare(
				`INSERT INTO mirrors (distro_id, name, country, base_url)
				 VALUES ((SELECT id FROM distros WHERE slug='arch'), 'se.test', 'SE', 'https://se.test/')`,
			),
		]);
		artifactId = (await ctx.env.DB.prepare("SELECT id FROM artifacts").first<{ id: number }>())
			?.id as number;
		mirrorId = (await ctx.env.DB.prepare("SELECT id FROM mirrors").first<{ id: number }>())
			?.id as number;
	});

	afterEach(() => ctx.dispose());

	it("banks tracked clicks into download_events and clears the keys it banked", async () => {
		await trackDownload(ctx.env.KV_RATE, artifactId, undefined, DAY);
		await trackDownload(ctx.env.KV_RATE, artifactId, undefined, DAY);
		await trackDownload(ctx.env.KV_RATE, artifactId, mirrorId, DAY);

		const result = await flushDownloadCounters(ctx.env.KV_RATE, ctx.env.DB);

		expect(result.flushed).toBe(2); // two buckets: unattributed + one mirror
		expect((await counterRow(ctx, artifactId))?.count).toBe(2);
		expect((await counterRow(ctx, artifactId, mirrorId))?.count).toBe(1);

		const remaining = await ctx.env.KV_RATE.list({ prefix: "dlcount:" });
		expect(remaining.keys).toHaveLength(0);
	});

	it("cannot double-count when it runs twice in the same day", async () => {
		await trackDownload(ctx.env.KV_RATE, artifactId, undefined, DAY);
		await flushDownloadCounters(ctx.env.KV_RATE, ctx.env.DB);

		const second = await flushDownloadCounters(ctx.env.KV_RATE, ctx.env.DB);

		expect(second.flushed).toBe(0);
		expect((await counterRow(ctx, artifactId))?.count).toBe(1);
	});

	it("adds to a day's existing total rather than replacing it", async () => {
		await trackDownload(ctx.env.KV_RATE, artifactId, undefined, DAY);
		await flushDownloadCounters(ctx.env.KV_RATE, ctx.env.DB);

		// Clicks that arrive after the first flush, still inside the same day.
		await trackDownload(ctx.env.KV_RATE, artifactId, undefined, DAY);
		await trackDownload(ctx.env.KV_RATE, artifactId, undefined, DAY);
		await flushDownloadCounters(ctx.env.KV_RATE, ctx.env.DB);

		expect((await counterRow(ctx, artifactId))?.count).toBe(3);
	});

	it("drops a counter for an artifact that no longer exists without losing the rest", async () => {
		// Re-ingestion can retire an artifact between the click and the flush.
		// The insert is guarded by EXISTS rather than left to the foreign key,
		// because a constraint failure aborts the whole D1 batch — one dead
		// artifact would cost every real count in the same page.
		await trackDownload(ctx.env.KV_RATE, 999_999, undefined, DAY);
		await trackDownload(ctx.env.KV_RATE, artifactId, undefined, DAY);

		const result = await flushDownloadCounters(ctx.env.KV_RATE, ctx.env.DB);

		expect(result.flushed).toBe(2);
		expect((await counterRow(ctx, artifactId))?.count).toBe(1);
		expect(await counterRow(ctx, 999_999)).toBeNull();
	});
});
