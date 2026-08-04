// Mirror writes. All SQL for `mirrors` lives here
// (.ai/backend-rules.md § "Project structure").

import type { LiveMirror } from "@linuxhub/ingest/types";

function protocolOf(url: string): string {
	try {
		const scheme = new URL(url).protocol.replace(":", "");
		return ["https", "http", "ftp", "rsync"].includes(scheme) ? scheme : "https";
	} catch {
		return "https";
	}
}

export function upsertMirrorStatement(
	db: D1Database,
	slug: string,
	mirror: LiveMirror,
	sourceUrl: string,
	fetchedAt: string,
): D1PreparedStatement {
	return db
		.prepare(
			`INSERT INTO mirrors
			   (distro_id, name, country, region, base_url, protocol,
			    sponsor, healthy, last_checked, source_url, fetched_at)
			 VALUES ((SELECT id FROM distros WHERE slug = ?1),
			         ?2, ?3, '', ?4, ?5, NULL, 1, ?6, ?7, ?6)
			 ON CONFLICT(distro_id, base_url) DO UPDATE SET
			   name         = excluded.name,
			   country      = excluded.country,
			   protocol     = excluded.protocol,
			   healthy      = 1,
			   last_checked = excluded.last_checked,
			   source_url   = excluded.source_url,
			   fetched_at   = excluded.fetched_at`,
		)
		.bind(
			slug,
			mirror.name,
			// Only Arch's status JSON publishes a country; MirrorManager does not.
			mirror.countryCode?.toUpperCase() ?? "",
			mirror.url,
			protocolOf(mirror.url),
			fetchedAt,
			sourceUrl,
		);
}

/**
 * Replaces a distro's mirror list with what the source currently publishes.
 *
 * Mirrors that dropped out of the upstream list are marked unhealthy rather
 * than deleted: a mirror can come back, and `artifact_mirrors` rows may already
 * point at it. `healthy = 0` takes it out of the picker without losing history.
 */
export async function replaceMirrors(
	db: D1Database,
	slug: string,
	mirrors: LiveMirror[],
	sourceUrl: string,
	fetchedAt: string,
): Promise<{ written: number; retired: number }> {
	if (mirrors.length === 0) return { written: 0, retired: 0 };

	const statements = mirrors.map((m) => upsertMirrorStatement(db, slug, m, sourceUrl, fetchedAt));
	const results = await db.batch(statements);

	// Placeholder count comes from the fetched list length, not from any
	// caller-supplied string — every URL is still a bound parameter.
	const placeholders = mirrors.map((_, i) => `?${i + 2}`).join(", ");
	const retired = await db
		.prepare(
			`UPDATE mirrors SET healthy = 0
			  WHERE distro_id = (SELECT id FROM distros WHERE slug = ?1)
			    AND base_url NOT IN (${placeholders})`,
		)
		.bind(slug, ...mirrors.map((m) => m.url))
		.run();

	return {
		written: results.reduce((n, r) => n + (r.meta?.changes ?? 0), 0),
		retired: retired.meta?.changes ?? 0,
	};
}
