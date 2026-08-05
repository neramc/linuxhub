// Release writes and the reads ingestion itself needs. All SQL for `releases`
// lives here (.ai/backend-rules.md § "Project structure").

import type { LiveRelease } from "@linuxhub/ingest/types";

/**
 * Upserts one release cycle.
 *
 * Note what is *not* stored: whether the release is currently EOL. That is
 * derived from `eol_at < today` at read time (ADR-0019), so a row cannot go
 * quietly stale between ingestion runs as dates pass.
 */
export function upsertReleaseStatement(
	db: D1Database,
	slug: string,
	release: LiveRelease,
	sourceUrl: string,
	fetchedAt: string,
	channel: "stable" | "beta" | "rolling" = "stable",
): D1PreparedStatement {
	return db
		.prepare(
			`INSERT INTO releases
			   (distro_id, version, channel, lts, codename, latest_point,
			    released_at, eol_at, source_url, fetched_at)
			 VALUES ((SELECT id FROM distros WHERE slug = ?1),
			         ?2, ?10, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
			 ON CONFLICT(distro_id, version) DO UPDATE SET
			   channel      = excluded.channel,
			   lts          = excluded.lts,
			   codename     = excluded.codename,
			   latest_point = excluded.latest_point,
			   released_at  = excluded.released_at,
			   eol_at       = excluded.eol_at,
			   source_url   = excluded.source_url,
			   fetched_at   = excluded.fetched_at`,
		)
		.bind(
			slug,
			release.cycle,
			release.lts ? 1 : 0,
			release.codename ?? null,
			release.latest ?? null,
			release.releaseDate ?? null,
			release.eol ?? null,
			sourceUrl,
			fetchedAt,
			channel,
		);
}

export async function upsertReleases(
	db: D1Database,
	slug: string,
	releases: LiveRelease[],
	sourceUrl: string,
	fetchedAt: string,
	channel: "stable" | "beta" | "rolling" = "stable",
): Promise<{ written: number }> {
	if (releases.length === 0) return { written: 0 };
	const results = await db.batch(
		releases.map((r) => upsertReleaseStatement(db, slug, r, sourceUrl, fetchedAt, channel)),
	);
	return { written: results.reduce((n, r) => n + (r.meta?.changes ?? 0), 0) };
}

/** Newest ingested version for a distro — used to build version-dependent
 *  upstream URLs (e.g. Fedora's mirrorlist repo) instead of pinning one by
 *  hand and letting it go stale a release later. */
export async function newestVersion(db: D1Database, slug: string): Promise<string | null> {
	const row = await db
		.prepare(
			`SELECT r.version
			   FROM releases r
			   JOIN distros d ON d.id = r.distro_id
			  WHERE d.slug = ?1
			  ORDER BY r.released_at DESC NULLS LAST, r.id DESC
			  LIMIT 1`,
		)
		.bind(slug)
		.first<{ version: string }>();
	return row?.version ?? null;
}

/** Versions the catalog already has release rows for. Artifact indexes reach
 *  further back than our release source does, so this is what bounds them. */
export async function listVersions(db: D1Database, slug: string): Promise<string[]> {
	const { results } = await db
		.prepare(
			`SELECT r.version FROM releases r
			   JOIN distros d ON d.id = r.distro_id
			  WHERE d.slug = ?1`,
		)
		.bind(slug)
		.all<{ version: string }>();
	return (results ?? []).map((r) => r.version);
}
