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
import {
	DISTRO_SOURCES,
	MIRROR_SERVES_ARTIFACTS,
	mirrorSourcesFor,
} from "@linuxhub/ingest/registry";
import { fetchArchMirrors } from "@linuxhub/ingest/sources/arch-mirrors";
import { ARCH_RELEASES_SOURCE, fetchArchReleases } from "@linuxhub/ingest/sources/arch-releases";
import {
	DEBIAN_ARTIFACTS_SOURCE,
	DEBIAN_BASE,
	fetchDebianArtifacts,
} from "@linuxhub/ingest/sources/debian-artifacts";
import { ENDOFLIFE_SOURCE, fetchReleaseCycles } from "@linuxhub/ingest/sources/endoflife";
import {
	FEDORA_ARTIFACTS_SOURCE,
	FEDORA_REDIRECTOR,
	fetchFedoraArtifacts,
} from "@linuxhub/ingest/sources/fedora-artifacts";
import { fetchFedoraMirrors } from "@linuxhub/ingest/sources/fedora-mirrors";
import {
	fetchPopOsArtifacts,
	POP_OS_ARTIFACTS_SOURCE,
	POP_OS_BASE,
} from "@linuxhub/ingest/sources/pop-os-artifacts";
import {
	fetchUbuntuArtifacts,
	UBUNTU_ARTIFACTS_SOURCE,
	UBUNTU_BASE,
} from "@linuxhub/ingest/sources/ubuntu-artifacts";
import {
	ensureMirrorStatement,
	linkArtifactsToMirrorsStatement,
	pruneArtifactMirrorsStatement,
	upsertCatalog,
} from "../db/artifacts";
import { syncCatalog } from "../db/distros";
import { flushDownloadCounters } from "../db/downloads";
import { type IngestLogRow, logIngest } from "../db/ingest-log";
import { replaceMirrors } from "../db/mirrors";
import { listVersions, newestVersion, upsertReleases } from "../db/releases";
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

	// Artifacts come after the release rows they hang off: every edition and
	// artifact insert resolves its parent by subselect, so a release that is not
	// there yet silently produces nothing.
	const artifacts = await ingestArtifacts(env, now, http);
	ok += artifacts.ok;
	failed += artifacts.failed;
	written += artifacts.written;
	logs.push(...artifacts.logs);

	await logIngest(env.DB, logs);
	return { schedule: CRON_RELEASES, sources: ok + failed, ok, failed, written };
}

/**
 * ISO paths, checksums and sizes — what the download flow actually needs.
 *
 * Kept as its own function rather than folded into the loop above because the
 * two sources are shaped differently: Arch publishes releases *and* their
 * artifacts together (its snapshots are the versions), while Fedora publishes
 * artifacts for releases another source already told us about.
 */
async function ingestArtifacts(
	env: Env,
	now: Date,
	http: HttpClient,
): Promise<{ ok: number; failed: number; written: number; logs: IngestLogRow[] }> {
	const logs: IngestLogRow[] = [];
	let ok = 0;
	let failed = 0;
	let written = 0;

	// Arch: the snapshots are both the releases and the artifacts.
	try {
		const result = await fetchArchReleases(http, now);
		const releases = await upsertReleases(
			env.DB,
			"arch",
			result.data.releases,
			result.sourceUrl,
			result.fetchedAt,
			"rolling",
		);
		const catalog = await upsertCatalog(
			env.DB,
			"arch",
			result.data,
			result.sourceUrl,
			result.fetchedAt,
		);
		await env.DB.batch([
			pruneArtifactMirrorsStatement(env.DB, "arch"),
			linkArtifactsToMirrorsStatement(env.DB, "arch"),
		]);
		written += releases.written + catalog.written;
		if (catalog.written > 0) await bumpGeneration(env, "arch");
		ok++;
		logs.push({
			source: `${ARCH_RELEASES_SOURCE}:arch`,
			url: result.sourceUrl,
			fetchedAt: result.fetchedAt,
			status: "ok",
			changed: releases.written + catalog.written,
		});
	} catch (error) {
		failed++;
		logs.push({
			source: `${ARCH_RELEASES_SOURCE}:arch`,
			url: "archlinux.org/releng/releases/json/",
			fetchedAt: now.toISOString(),
			status: "error",
			detail: String(error),
		});
	}

	// Fedora: bounded to versions we already have release rows for, because the
	// index reaches further back than endoflife.date reports.
	try {
		const versions = await listVersions(env.DB, "fedora");
		if (versions.length === 0) {
			logs.push({
				source: `${FEDORA_ARTIFACTS_SOURCE}:fedora`,
				url: FEDORA_ARTIFACTS_URL_FOR_LOG,
				fetchedAt: now.toISOString(),
				status: "skipped",
				detail: "no fedora releases ingested yet",
			});
		} else {
			const result = await fetchFedoraArtifacts(http, versions, now);
			await env.DB.batch([
				ensureMirrorStatement(
					env.DB,
					"fedora",
					FEDORA_REDIRECTOR,
					"download.fedoraproject.org",
					result.sourceUrl,
					result.fetchedAt,
				),
			]);
			const catalog = await upsertCatalog(
				env.DB,
				"fedora",
				result.data,
				result.sourceUrl,
				result.fetchedAt,
			);
			await env.DB.batch([
				pruneArtifactMirrorsStatement(env.DB, "fedora"),
				linkArtifactsToMirrorsStatement(env.DB, "fedora"),
			]);
			written += catalog.written;
			if (catalog.written > 0) await bumpGeneration(env, "fedora");
			ok++;
			logs.push({
				source: `${FEDORA_ARTIFACTS_SOURCE}:fedora`,
				url: result.sourceUrl,
				fetchedAt: result.fetchedAt,
				status: "ok",
				changed: catalog.written,
			});
		}
	} catch (error) {
		failed++;
		logs.push({
			source: `${FEDORA_ARTIFACTS_SOURCE}:fedora`,
			url: FEDORA_ARTIFACTS_URL_FOR_LOG,
			fetchedAt: now.toISOString(),
			status: "error",
			detail: String(error),
		});
	}

	// Ubuntu: same shape as Fedora — bounded to the versions we hold release
	// rows for, because releases.ubuntu.com keeps directories we have no
	// release for and drops ones we do at EOL.
	try {
		const versions = await listVersions(env.DB, "ubuntu");
		if (versions.length === 0) {
			logs.push({
				source: `${UBUNTU_ARTIFACTS_SOURCE}:ubuntu`,
				url: UBUNTU_BASE,
				fetchedAt: now.toISOString(),
				status: "skipped",
				detail: "no ubuntu releases ingested yet",
			});
		} else {
			const result = await fetchUbuntuArtifacts(http, versions, now);
			await env.DB.batch([
				ensureMirrorStatement(
					env.DB,
					"ubuntu",
					UBUNTU_BASE,
					"releases.ubuntu.com",
					result.sourceUrl,
					result.fetchedAt,
				),
			]);
			const catalog = await upsertCatalog(
				env.DB,
				"ubuntu",
				result.data,
				result.sourceUrl,
				result.fetchedAt,
			);
			await env.DB.batch([
				pruneArtifactMirrorsStatement(env.DB, "ubuntu"),
				linkArtifactsToMirrorsStatement(env.DB, "ubuntu"),
			]);
			written += catalog.written;
			if (catalog.written > 0) await bumpGeneration(env, "ubuntu");
			ok++;
			logs.push({
				source: `${UBUNTU_ARTIFACTS_SOURCE}:ubuntu`,
				url: result.sourceUrl,
				fetchedAt: result.fetchedAt,
				status: "ok",
				changed: catalog.written,
			});
		}
	} catch (error) {
		failed++;
		logs.push({
			source: `${UBUNTU_ARTIFACTS_SOURCE}:ubuntu`,
			url: UBUNTU_BASE,
			fetchedAt: now.toISOString(),
			status: "error",
			detail: String(error),
		});
	}

	// Debian: unlike Ubuntu and Fedora this needs no version list — cdimage
	// keeps one live tree under `current`, and the point release comes back in
	// the filenames. Sizes stay absent by policy, not by omission: Debian's
	// robots.txt forbids requesting the ISOs (.ai/data-sources.md).
	try {
		const result = await fetchDebianArtifacts(http, undefined, now);
		await env.DB.batch([
			ensureMirrorStatement(
				env.DB,
				"debian",
				DEBIAN_BASE,
				"cdimage.debian.org",
				result.sourceUrl,
				result.fetchedAt,
			),
		]);
		const catalog = await upsertCatalog(
			env.DB,
			"debian",
			result.data,
			result.sourceUrl,
			result.fetchedAt,
		);
		await env.DB.batch([
			pruneArtifactMirrorsStatement(env.DB, "debian"),
			linkArtifactsToMirrorsStatement(env.DB, "debian"),
		]);
		written += catalog.written;
		if (catalog.written > 0) await bumpGeneration(env, "debian");
		ok++;
		logs.push({
			source: `${DEBIAN_ARTIFACTS_SOURCE}:debian`,
			url: result.sourceUrl,
			fetchedAt: result.fetchedAt,
			status: "ok",
			changed: catalog.written,
		});
	} catch (error) {
		failed++;
		logs.push({
			source: `${DEBIAN_ARTIFACTS_SOURCE}:debian`,
			url: DEBIAN_BASE,
			fetchedAt: now.toISOString(),
			status: "error",
			detail: String(error),
		});
	}

	// Pop!_OS: one API call per version and channel, and it hands back the url,
	// the size and the checksum together — no filename parsing, no HEAD.
	try {
		const versions = await listVersions(env.DB, "pop-os");
		if (versions.length === 0) {
			logs.push({
				source: `${POP_OS_ARTIFACTS_SOURCE}:pop-os`,
				url: POP_OS_BASE,
				fetchedAt: now.toISOString(),
				status: "skipped",
				detail: "no pop-os releases ingested yet",
			});
		} else {
			const result = await fetchPopOsArtifacts(http, versions, now);
			await env.DB.batch([
				ensureMirrorStatement(
					env.DB,
					"pop-os",
					POP_OS_BASE,
					"iso.pop-os.org",
					result.sourceUrl,
					result.fetchedAt,
				),
			]);
			const catalog = await upsertCatalog(
				env.DB,
				"pop-os",
				result.data,
				result.sourceUrl,
				result.fetchedAt,
			);
			await env.DB.batch([
				pruneArtifactMirrorsStatement(env.DB, "pop-os"),
				linkArtifactsToMirrorsStatement(env.DB, "pop-os"),
			]);
			written += catalog.written;
			if (catalog.written > 0) await bumpGeneration(env, "pop-os");
			ok++;
			logs.push({
				source: `${POP_OS_ARTIFACTS_SOURCE}:pop-os`,
				url: result.sourceUrl,
				fetchedAt: result.fetchedAt,
				status: "ok",
				changed: catalog.written,
			});
		}
	} catch (error) {
		failed++;
		logs.push({
			source: `${POP_OS_ARTIFACTS_SOURCE}:pop-os`,
			url: POP_OS_BASE,
			fetchedAt: now.toISOString(),
			status: "error",
			detail: String(error),
		});
	}

	return { ok, failed, written, logs };
}

const FEDORA_ARTIFACTS_URL_FOR_LOG = "fedoraproject.org/releases.json";

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
				MIRROR_SERVES_ARTIFACTS.arch,
			);
			// Re-link, because the mirror set just changed. Without this the
			// links are only rebuilt by the 6-hourly artifact pass, which makes
			// the two schedules order-dependent: on a fresh database the artifact
			// pass runs before any Arch mirror exists, so every Arch download
			// resolves to "mirror for artifact not found" until the artifact pass
			// happens to run again. Linking here makes the order irrelevant and
			// makes a newly added mirror usable within a day rather than six
			// hours.
			await env.DB.batch([
				pruneArtifactMirrorsStatement(env.DB, row.slug),
				linkArtifactsToMirrorsStatement(env.DB, row.slug),
			]);
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
				MIRROR_SERVES_ARTIFACTS.fedora,
			);
			await env.DB.batch([
				pruneArtifactMirrorsStatement(env.DB, row.slug),
				linkArtifactsToMirrorsStatement(env.DB, row.slug),
			]);
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

	// Bank the day's download clicks. KV is the write path because it is cheap
	// on a hot page, but KV entries expire and rankings need history, so they
	// have to land in D1 before they do (.ai/database.md § "KV keyspaces").
	try {
		const flushed = await flushDownloadCounters(env.KV_RATE, env.DB);
		written += flushed.flushed;
		ok++;
		logs.push({
			source: "downloads:flush",
			url: "internal:kv",
			fetchedAt: now.toISOString(),
			status: "ok",
			changed: flushed.flushed,
			detail: flushed.flushed === 0 ? "no clicks to bank" : undefined,
		});
	} catch (error) {
		failed++;
		logs.push({
			source: "downloads:flush",
			url: "internal:kv",
			fetchedAt: now.toISOString(),
			status: "error",
			detail: String(error),
		});
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
