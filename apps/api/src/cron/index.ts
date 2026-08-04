// Ingestion entrypoints, one per schedule (.ai/backend-rules.md § "Ingestion").
//
// Two rules shape everything here:
//
//   1. Partial failure of one source never blocks another. Every source runs
//      inside its own try/catch and writes an `ingest_log` row either way, so a
//      Fedora outage cannot cost us the Ubuntu refresh.
//   2. Ingestion is idempotent. Every write is an upsert on a natural key, so
//      re-running a schedule is free and a retry is never destructive.

import { DEFAULT_SITE_ORIGIN } from "@linuxhub/ingest";
import type { ContentIndex } from "@linuxhub/ingest/content";
import contentIndex from "@linuxhub/ingest/content-index.json" with { type: "json" };
import { createFetchClient, type HttpClient } from "@linuxhub/ingest/http";
import { DISTRO_SOURCES, mirrorSourcesFor } from "@linuxhub/ingest/registry";
import { fetchArchMirrors } from "@linuxhub/ingest/sources/arch-mirrors";
import { ENDOFLIFE_SOURCE, fetchReleaseCycles } from "@linuxhub/ingest/sources/endoflife";
import { fetchFedoraMirrors } from "@linuxhub/ingest/sources/fedora-mirrors";
import { syncCatalog } from "../db/distros";
import { type IngestLogRow, logIngest } from "../db/ingest-log";
import { replaceMirrors } from "../db/mirrors";
import { newestVersion, upsertReleases } from "../db/releases";
import type { Env } from "../env";

export const CRON_RELEASES = "0 */6 * * *";
export const CRON_MIRRORS = "0 3 * * *";
export const CRON_RANKINGS = "0 4 * * 1";

export type IngestSummary = {
	schedule: string;
	sources: number;
	ok: number;
	failed: number;
	written: number;
};

const index = contentIndex as ContentIndex;

function clientFor(env: Env): HttpClient {
	return createFetchClient({
		siteOrigin: env.SITE_ORIGIN ?? DEFAULT_SITE_ORIGIN,
		// KV-backed conditional requests: an unchanged upstream costs it a 304
		// instead of a full body (.ai/security.md § "Crawler ethics").
		store: {
			get: (key) => env.KV_CACHE.get(key),
			put: (key, value, ttl) => env.KV_CACHE.put(key, value, { expirationTtl: ttl }),
		},
	});
}

/** Cache keys embed a per-distro generation counter, so an ingest that changes
 *  a distro invalidates its cached reads without any manual purging
 *  (.ai/architecture.md § "Caching strategy"). */
async function bumpGeneration(env: Env, slug: string): Promise<void> {
	await env.KV_CACHE.put(`gen:${slug}`, Date.now().toString());
}

/** `http` is injectable so tests exercise the upserts and the failure handling
 *  without touching an upstream — never override it in production. */
export async function ingestReleases(
	env: Env,
	now = new Date(),
	http: HttpClient = clientFor(env),
): Promise<IngestSummary> {
	const logs: IngestLogRow[] = [];
	let ok = 0;
	let failed = 0;
	let written = 0;

	await syncCatalog(env.DB, index, now.toISOString());

	for (const row of DISTRO_SOURCES) {
		if (row.release.kind !== "endoflife") continue;
		try {
			const result = await fetchReleaseCycles(http, row.release.product, now);
			const upserted = await upsertReleases(
				env.DB,
				row.slug,
				result.data,
				result.sourceUrl,
				result.fetchedAt,
			);
			written += upserted.written;
			if (upserted.written > 0) await bumpGeneration(env, row.slug);
			ok++;
			logs.push({
				source: `${ENDOFLIFE_SOURCE}:${row.slug}`,
				url: result.sourceUrl,
				fetchedAt: result.fetchedAt,
				status: "ok",
				changed: upserted.written,
			});
		} catch (error) {
			failed++;
			logs.push({
				source: `${ENDOFLIFE_SOURCE}:${row.slug}`,
				url: `endoflife.date/api/${row.release.product}.json`,
				fetchedAt: now.toISOString(),
				status: "error",
				detail: String(error),
			});
		}
	}

	await logIngest(env.DB, logs);
	return { schedule: CRON_RELEASES, sources: ok + failed, ok, failed, written };
}

export async function ingestMirrors(
	env: Env,
	now = new Date(),
	http: HttpClient = clientFor(env),
): Promise<IngestSummary> {
	const logs: IngestLogRow[] = [];
	let ok = 0;
	let failed = 0;
	let written = 0;

	await syncCatalog(env.DB, index, now.toISOString());

	for (const row of mirrorSourcesFor("arch")) {
		try {
			const result = await fetchArchMirrors(http, now);
			const stored = await replaceMirrors(
				env.DB,
				row.slug,
				result.data,
				result.sourceUrl,
				result.fetchedAt,
			);
			written += stored.written;
			if (stored.written > 0 || stored.retired > 0) await bumpGeneration(env, row.slug);
			ok++;
			logs.push({
				source: `arch-mirrors:${row.slug}`,
				url: result.sourceUrl,
				fetchedAt: result.fetchedAt,
				status: "ok",
				changed: stored.written,
			});
		} catch (error) {
			failed++;
			logs.push({
				source: `arch-mirrors:${row.slug}`,
				url: "archlinux.org/mirrors/status/json/",
				fetchedAt: now.toISOString(),
				status: "error",
				detail: String(error),
			});
		}
	}

	for (const row of mirrorSourcesFor("fedora")) {
		// The mirrorlist repo tracks whatever release we last ingested, so it
		// cannot be left pinned to a version that has since been superseded.
		const version = await newestVersion(env.DB, row.slug);
		if (!version) {
			logs.push({
				source: `fedora-mirrors:${row.slug}`,
				url: "mirrors.fedoraproject.org/mirrorlist",
				fetchedAt: now.toISOString(),
				status: "skipped",
				detail: "no release ingested yet, cannot pick a repo",
			});
			continue;
		}
		try {
			const result = await fetchFedoraMirrors(http, `fedora-${version}`, now);
			const stored = await replaceMirrors(
				env.DB,
				row.slug,
				result.data,
				result.sourceUrl,
				result.fetchedAt,
			);
			written += stored.written;
			if (stored.written > 0 || stored.retired > 0) await bumpGeneration(env, row.slug);
			ok++;
			logs.push({
				source: `fedora-mirrors:${row.slug}`,
				url: result.sourceUrl,
				fetchedAt: result.fetchedAt,
				status: "ok",
				changed: stored.written,
			});
		} catch (error) {
			failed++;
			logs.push({
				source: `fedora-mirrors:${row.slug}`,
				url: "mirrors.fedoraproject.org/mirrorlist",
				fetchedAt: now.toISOString(),
				status: "error",
				detail: String(error),
			});
		}
	}

	await logIngest(env.DB, logs);
	return { schedule: CRON_MIRRORS, sources: ok + failed, ok, failed, written };
}

/**
 * Weekly popularity snapshot.
 *
 * Scores come only from our own download counters (`download_events`, fed by
 * the KV flush) — third-party popularity charts are a forbidden source
 * (.ai/data-sources.md § "Ranking signals"). Until `downloads/track` ships in
 * 5.6 there is nothing to count, so this writes zero rows. That is the correct
 * outcome, not a gap to paper over.
 */
export async function snapshotRankings(env: Env, now = new Date()): Promise<IngestSummary> {
	const snapshotAt = now.toISOString();
	const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

	const result = await env.DB.prepare(
		`INSERT INTO rankings (distro_id, period, snapshot_at, rank, score)
		 SELECT distro_id, 'week', ?1, RANK() OVER (ORDER BY score DESC), score
		   FROM (SELECT d.id AS distro_id, SUM(de.count) AS score
		           FROM download_events de
		           JOIN artifacts a ON a.id = de.artifact_id
		           JOIN editions  e ON e.id = a.edition_id
		           JOIN releases  r ON r.id = e.release_id
		           JOIN distros   d ON d.id = r.distro_id
		          WHERE de.day >= ?2
		          GROUP BY d.id)
		  -- SQLite cannot tell an upsert clause from a join constraint after a
		  -- SELECT with no WHERE of its own; "WHERE true" disambiguates it.
		  WHERE true
		 ON CONFLICT(distro_id, period, snapshot_at)
		 DO UPDATE SET rank = excluded.rank, score = excluded.score`,
	)
		.bind(snapshotAt, since)
		.run();

	const written = result.meta?.changes ?? 0;
	await logIngest(env.DB, [
		{
			source: "rankings:week",
			url: "internal:download_events",
			fetchedAt: snapshotAt,
			status: "ok",
			changed: written,
			detail: written === 0 ? "no download signals yet" : undefined,
		},
	]);
	return { schedule: CRON_RANKINGS, sources: 1, ok: 1, failed: 0, written };
}

export async function runScheduled(
	cron: string,
	env: Env,
	now = new Date(),
	http?: HttpClient,
): Promise<IngestSummary> {
	switch (cron) {
		case CRON_MIRRORS:
			return ingestMirrors(env, now, http);
		case CRON_RANKINGS:
			return snapshotRankings(env, now);
		default:
			return ingestReleases(env, now, http);
	}
}
