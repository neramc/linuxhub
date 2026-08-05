// Edition and artifact writes. All SQL for `editions`, `artifacts` and
// `artifact_mirrors` lives here (.ai/backend-rules.md § "Project structure").

import type { LiveArtifact, LiveCatalog, LiveEdition } from "@linuxhub/ingest/types";

/** An artifact path is mirror-relative unless the source published something a
 *  mirror does not serve — a torrent page, a magnet URI. */
export function isAbsoluteRef(path: string): boolean {
	return /^(https?:|magnet:)/i.test(path);
}

export function upsertEditionStatement(
	db: D1Database,
	slug: string,
	version: string,
	edition: LiveEdition & { version: string },
): D1PreparedStatement {
	// INSERT…SELECT rather than VALUES with a subselect: a subselect that finds
	// no release yields NULL and trips the NOT NULL constraint, which fails the
	// whole D1 batch. This form inserts nothing instead, so one unresolvable
	// entry cannot cost the other eighty-three their refresh.
	return db
		.prepare(
			`INSERT INTO editions (release_id, name, desktop, kind)
			 SELECT r.id, ?3, ?4, ?5
			   FROM releases r
			   JOIN distros d ON d.id = r.distro_id
			  WHERE d.slug = ?1 AND r.version = ?2
			 ON CONFLICT(release_id, name) DO UPDATE SET
			   desktop = excluded.desktop,
			   kind    = excluded.kind`,
		)
		.bind(slug, version, edition.name, edition.desktop ?? null, edition.kind);
}

export function upsertArtifactStatement(
	db: D1Database,
	slug: string,
	artifact: LiveArtifact,
	sourceUrl: string,
	fetchedAt: string,
): D1PreparedStatement {
	return db
		.prepare(
			`INSERT INTO artifacts
			   (edition_id, arch, format, path, size, sha256, source_url, fetched_at)
			 SELECT e.id, ?4, ?5, ?6, ?7, ?8, ?9, ?10
			   FROM editions e
			   JOIN releases r ON r.id = e.release_id
			   JOIN distros  d ON d.id = r.distro_id
			  WHERE d.slug = ?1 AND r.version = ?2 AND e.name = ?3
			 ON CONFLICT(edition_id, arch, format) DO UPDATE SET
			   path       = excluded.path,
			   size       = excluded.size,
			   sha256     = excluded.sha256,
			   source_url = excluded.source_url,
			   fetched_at = excluded.fetched_at`,
		)
		.bind(
			slug,
			artifact.version,
			artifact.edition,
			artifact.arch,
			artifact.format,
			artifact.path,
			artifact.size ?? null,
			artifact.sha256 ?? null,
			sourceUrl,
			fetchedAt,
		);
}

/** Ensures a mirror row exists for an origin the artifact index points at —
 *  Fedora's redirector is a mirror in every sense that matters here, and it is
 *  the base its artifact paths are relative to, so it serves artifacts. */
export function ensureMirrorStatement(
	db: D1Database,
	slug: string,
	baseUrl: string,
	name: string,
	sourceUrl: string,
	fetchedAt: string,
): D1PreparedStatement {
	return db
		.prepare(
			`INSERT INTO mirrors
			   (distro_id, name, country, region, base_url, protocol, healthy,
			    last_checked, source_url, fetched_at, serves_artifacts)
			 VALUES ((SELECT id FROM distros WHERE slug = ?1), ?2, '', '', ?3, 'https', 1, ?4, ?5, ?4, 1)
			 ON CONFLICT(distro_id, base_url) DO UPDATE SET
			   healthy          = 1,
			   last_checked     = excluded.last_checked,
			   fetched_at       = excluded.fetched_at,
			   serves_artifacts = 1`,
		)
		.bind(slug, name, baseUrl, fetchedAt, sourceUrl);
}

/**
 * Links every mirror-relative artifact of a distro to every healthy mirror of
 * that distro **whose base URL its path is relative to**.
 *
 * `serves_artifacts` is what makes that last clause true. A mirror row can be a
 * perfectly real mirror of the distro and still be the wrong base: Fedora's
 * MirrorManager publishes per-repo directories, and joining an artifact path
 * onto one produces a 404 (migration 0006).
 *
 * Absolute references are skipped deliberately: a magnet URI is not served by
 * a mirror, and pretending otherwise would put a row in `artifact_mirrors`
 * that resolution would then have to special-case anyway.
 */
export function linkArtifactsToMirrorsStatement(db: D1Database, slug: string): D1PreparedStatement {
	// The WHERE below is also what lets SQLite tell the ON CONFLICT clause apart
	// from a join constraint — an INSERT…SELECT with no WHERE of its own fails
	// to parse here (the same trap the rankings snapshot hit).
	return db
		.prepare(
			`INSERT INTO artifact_mirrors (artifact_id, mirror_id, available)
			 SELECT a.id, m.id, 1
			   FROM artifacts a
			   JOIN editions e ON e.id = a.edition_id
			   JOIN releases r ON r.id = e.release_id
			   JOIN distros  d ON d.id = r.distro_id
			   JOIN mirrors  m ON m.distro_id = d.id AND m.healthy = 1
			                  AND m.serves_artifacts = 1
			  WHERE d.slug = ?1
			    AND a.path NOT LIKE 'http%'
			    AND a.path NOT LIKE 'magnet:%'
			 ON CONFLICT(artifact_id, mirror_id) DO UPDATE SET available = 1`,
		)
		.bind(slug);
}

/** Drops links to mirrors that are no longer an artifact base. The link step
 *  only ever inserts, so without this a mirror reclassified by a later ingest
 *  would keep serving resolutions from a base that does not work. */
export function pruneArtifactMirrorsStatement(db: D1Database, slug: string): D1PreparedStatement {
	return db
		.prepare(
			`DELETE FROM artifact_mirrors
			  WHERE mirror_id IN (
			        SELECT m.id FROM mirrors m
			          JOIN distros d ON d.id = m.distro_id
			         WHERE d.slug = ?1 AND m.serves_artifacts = 0)`,
		)
		.bind(slug);
}

export async function upsertCatalog(
	db: D1Database,
	slug: string,
	catalog: LiveCatalog,
	sourceUrl: string,
	fetchedAt: string,
): Promise<{ written: number }> {
	let written = 0;

	// Three passes, because each level's insert resolves the one above it by a
	// subselect: a release must exist before its edition, an edition before its
	// artifacts.
	if (catalog.editions.length > 0) {
		const results = await db.batch(
			catalog.editions.map((e) => upsertEditionStatement(db, slug, e.version, e)),
		);
		written += results.reduce((n, r) => n + (r.meta?.changes ?? 0), 0);
	}
	if (catalog.artifacts.length > 0) {
		const results = await db.batch(
			catalog.artifacts.map((a) => upsertArtifactStatement(db, slug, a, sourceUrl, fetchedAt)),
		);
		written += results.reduce((n, r) => n + (r.meta?.changes ?? 0), 0);
	}

	return { written };
}
