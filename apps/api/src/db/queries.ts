// Read queries. All SQL lives here (.ai/backend-rules.md § "Project
// structure"); parameters are always bound, never interpolated.
//
// Rows come back flat and get shaped into the API entities by the services —
// these functions know SQL, not response shapes.

import type {
	DistroListQuery,
	Edition,
	Mirror,
	RankHistoryPoint,
	RankingPeriod,
	ReleaseChannel,
	SearchQuery,
} from "@linuxhub/shared";

export type DistroRow = {
	id: number;
	slug: string;
	name: string;
	summary: string;
	family: string;
	based_on: string | null;
	homepage: string;
	status: string;
	logo_path: string;
	downloads: number;
	rank: number | null;
	trend: number | null;
};

export type ReleaseRow = {
	version: string;
	channel: string;
	lts: number;
	codename: string | null;
	latest_point: string | null;
	released_at: string | null;
	eol_at: string | null;
	notes_url: string | null;
	source_url: string | null;
	fetched_at: string | null;
};

// Popularity, rank movement, and download totals all come from our own
// signals; the joins below yield NULL/0 until 5.6 starts counting, which is
// why `?sort=popularity` falls back to name ordering.
const DISTRO_COLUMNS = `
	d.id, d.slug, d.name, d.summary, d.family, d.based_on, d.homepage, d.status, d.logo_path,
	COALESCE((SELECT SUM(de.count)
	            FROM download_events de
	            JOIN artifacts a ON a.id = de.artifact_id
	            JOIN editions  e ON e.id = a.edition_id
	            JOIN releases  r ON r.id = e.release_id
	           WHERE r.distro_id = d.id), 0) AS downloads,
	(SELECT rk.rank FROM rankings rk
	  WHERE rk.distro_id = d.id AND rk.period = 'week'
	  ORDER BY rk.snapshot_at DESC LIMIT 1) AS rank,
	(SELECT prev.rank - cur.rank
	   FROM rankings cur
	   JOIN rankings prev ON prev.distro_id = cur.distro_id
	                     AND prev.period = cur.period
	                     AND prev.snapshot_at < cur.snapshot_at
	  WHERE cur.distro_id = d.id AND cur.period = 'week'
	  ORDER BY cur.snapshot_at DESC, prev.snapshot_at DESC LIMIT 1) AS trend`;

const ORDER_BY: Record<DistroListQuery["sort"], string> = {
	// No ranking snapshot exists until we have download signals of our own, so
	// popularity degrades to a stable alphabetical order rather than inventing one.
	popularity: "rank IS NULL, rank ASC, d.name COLLATE NOCASE",
	name: "d.name COLLATE NOCASE",
	latest_release:
		"(SELECT MAX(r.released_at) FROM releases r WHERE r.distro_id = d.id) DESC NULLS LAST",
	newest: "d.created_at DESC",
};

type Filter = { sql: string; value: string };

function filtersFor(q: DistroListQuery): Filter[] {
	const filters: Filter[] = [];
	if (q.category) filters.push({ sql: taxonomyClause("category"), value: q.category });
	if (q.tag) filters.push({ sql: taxonomyClause("tag"), value: q.tag });
	if (q.desktop) filters.push({ sql: taxonomyClause("desktop"), value: q.desktop });
	if (q.family) filters.push({ sql: "d.family = ?", value: q.family });
	if (q.status) filters.push({ sql: "d.status = ?", value: q.status });
	if (q.q) filters.push({ sql: searchClause(), value: `%${q.q.toLowerCase()}%` });
	return filters;
}

const taxonomyClause = (kind: string) =>
	`EXISTS (SELECT 1 FROM distro_taxonomy t
	          WHERE t.distro_id = d.id AND t.kind = '${kind}' AND t.ref_slug = ?)`;

/** LIKE over name, summary and aliases, per ADR-0010. Adopting FTS5 is its own
 *  ADR, written when this plan actually gets slow. */
const searchClause = () =>
	`(LOWER(d.name) LIKE ? OR LOWER(d.summary) LIKE ? OR LOWER(d.aliases) LIKE ?)`;

/** Builds the shared WHERE clause and its bindings. `kind` is never
 *  caller-supplied — it comes from the fixed map above — and every value is a
 *  bound parameter. */
function whereFor(q: DistroListQuery): { sql: string; bindings: string[] } {
	const filters = filtersFor(q);
	if (filters.length === 0) return { sql: "", bindings: [] };
	const bindings: string[] = [];
	for (const f of filters) {
		// The search clause carries three placeholders for one value.
		const placeholders = (f.sql.match(/\?/g) ?? []).length;
		for (let i = 0; i < placeholders; i++) bindings.push(f.value);
	}
	return { sql: `WHERE ${filters.map((f) => f.sql).join(" AND ")}`, bindings };
}

export async function listDistros(
	db: D1Database,
	q: DistroListQuery,
): Promise<{ rows: DistroRow[]; total: number }> {
	const { sql: where, bindings } = whereFor(q);
	const offset = (q.page - 1) * q.limit;

	// A real COUNT(*) alongside the page, so `meta.total` is honest rather than
	// the length of the current page (.ai/backend-rules.md).
	const [page, count] = await db.batch<DistroRow | { total: number }>([
		db
			.prepare(
				`SELECT ${DISTRO_COLUMNS} FROM distros d ${where}
				 ORDER BY ${ORDER_BY[q.sort]} LIMIT ? OFFSET ?`,
			)
			.bind(...bindings, q.limit, offset),
		db.prepare(`SELECT COUNT(*) AS total FROM distros d ${where}`).bind(...bindings),
	]);

	return {
		rows: (page.results ?? []) as DistroRow[],
		total: ((count.results ?? [])[0] as { total: number } | undefined)?.total ?? 0,
	};
}

export async function searchDistros(
	db: D1Database,
	q: SearchQuery,
): Promise<{ rows: DistroRow[]; total: number }> {
	return listDistros(db, {
		page: q.page,
		limit: q.limit,
		q: q.q,
		sort: "popularity",
	} as DistroListQuery);
}

export async function getDistro(db: D1Database, slug: string): Promise<DistroRow | null> {
	return db
		.prepare(`SELECT ${DISTRO_COLUMNS} FROM distros d WHERE d.slug = ?1`)
		.bind(slug)
		.first<DistroRow>();
}

/** Same family first, then by rank — the heuristic behind endpoint #8. */
export async function relatedDistros(
	db: D1Database,
	row: DistroRow,
	limit = 3,
): Promise<DistroRow[]> {
	const { results } = await db
		.prepare(
			`SELECT ${DISTRO_COLUMNS} FROM distros d
			  WHERE d.slug != ?1 AND d.status = 'active'
			  ORDER BY (d.family != ?2 OR d.family = ''), rank IS NULL, rank ASC,
			           d.name COLLATE NOCASE
			  LIMIT ?3`,
		)
		.bind(row.slug, row.family, limit)
		.all<DistroRow>();
	return results ?? [];
}

export async function listReleases(
	db: D1Database,
	slug: string,
	channel?: ReleaseChannel,
): Promise<ReleaseRow[]> {
	const { results } = await db
		.prepare(
			`SELECT r.version, r.channel, r.lts, r.codename, r.latest_point, r.released_at,
			        r.eol_at, r.notes_url, r.source_url, r.fetched_at
			   FROM releases r JOIN distros d ON d.id = r.distro_id
			  WHERE d.slug = ?1 AND (?2 IS NULL OR r.channel = ?2)
			  ORDER BY r.released_at DESC NULLS LAST, r.version DESC`,
		)
		.bind(slug, channel ?? null)
		.all<ReleaseRow>();
	return results ?? [];
}

export async function recentReleases(
	db: D1Database,
	limit: number,
	cursor?: string,
): Promise<Array<ReleaseRow & { slug: string; name: string }>> {
	const { results } = await db
		.prepare(
			`SELECT d.slug, d.name, r.version, r.channel, r.lts, r.codename, r.latest_point,
			        r.released_at, r.eol_at, r.notes_url, r.source_url, r.fetched_at
			   FROM releases r JOIN distros d ON d.id = r.distro_id
			  WHERE r.released_at IS NOT NULL AND (?1 IS NULL OR r.released_at < ?1)
			  ORDER BY r.released_at DESC
			  LIMIT ?2`,
		)
		.bind(cursor ?? null, limit)
		.all<ReleaseRow & { slug: string; name: string }>();
	return results ?? [];
}

export async function listMirrors(db: D1Database, slug: string): Promise<Mirror[]> {
	const { results } = await db
		.prepare(
			`SELECT m.id, m.name, m.country, m.region, m.base_url, m.protocol, m.sponsor,
			        m.healthy, m.last_checked, m.source_url
			   FROM mirrors m JOIN distros d ON d.id = m.distro_id
			  WHERE d.slug = ?1
			  ORDER BY m.healthy DESC, m.name`,
		)
		.bind(slug)
		.all<Omit<Mirror, "healthy"> & { healthy: number }>();
	return (results ?? []).map((m) => ({ ...m, healthy: m.healthy === 1 }));
}

export async function listEditions(db: D1Database, slug: string): Promise<Edition[]> {
	const { results } = await db
		.prepare(
			`SELECT e.id, e.name, e.desktop, e.kind, r.version AS release_version
			   FROM editions e
			   JOIN releases r ON r.id = e.release_id
			   JOIN distros  d ON d.id = r.distro_id
			  WHERE d.slug = ?1
			  ORDER BY r.released_at DESC NULLS LAST, e.name`,
		)
		.bind(slug)
		.all<Edition>();
	return results ?? [];
}

export async function taxonomyFor(
	db: D1Database,
	distroIds: number[],
): Promise<Map<number, { categories: string[]; tags: string[]; desktops: string[] }>> {
	const out = new Map<number, { categories: string[]; tags: string[]; desktops: string[] }>();
	if (distroIds.length === 0) return out;

	// Placeholder count comes from the id array length; the ids themselves are
	// still bound parameters.
	const placeholders = distroIds.map((_, i) => `?${i + 1}`).join(", ");
	const { results } = await db
		.prepare(
			`SELECT distro_id, kind, ref_slug FROM distro_taxonomy
			  WHERE distro_id IN (${placeholders}) ORDER BY ref_slug`,
		)
		.bind(...distroIds)
		.all<{ distro_id: number; kind: string; ref_slug: string }>();

	for (const id of distroIds) out.set(id, { categories: [], tags: [], desktops: [] });
	for (const row of results ?? []) {
		const entry = out.get(row.distro_id);
		if (!entry) continue;
		if (row.kind === "category") entry.categories.push(row.ref_slug);
		else if (row.kind === "tag") entry.tags.push(row.ref_slug);
		else if (row.kind === "desktop") entry.desktops.push(row.ref_slug);
	}
	return out;
}

export async function rankingSnapshot(
	db: D1Database,
	period: RankingPeriod,
	limit: number,
): Promise<
	Array<{ rank: number; slug: string; name: string; score: number; delta: number | null }>
> {
	const { results } = await db
		.prepare(
			`WITH latest AS (SELECT MAX(snapshot_at) AS at FROM rankings WHERE period = ?1)
			 SELECT rk.rank, d.slug, d.name, rk.score,
			        (SELECT prev.rank - rk.rank FROM rankings prev
			          WHERE prev.distro_id = rk.distro_id AND prev.period = rk.period
			            AND prev.snapshot_at < rk.snapshot_at
			          ORDER BY prev.snapshot_at DESC LIMIT 1) AS delta
			   FROM rankings rk
			   JOIN distros d ON d.id = rk.distro_id
			  WHERE rk.period = ?1 AND rk.snapshot_at = (SELECT at FROM latest)
			  ORDER BY rk.rank
			  LIMIT ?2`,
		)
		.bind(period, limit)
		.all<{ rank: number; slug: string; name: string; score: number; delta: number | null }>();
	return results ?? [];
}

export async function rankHistory(
	db: D1Database,
	slug: string,
	period: RankingPeriod,
	limit = 12,
): Promise<RankHistoryPoint[]> {
	const { results } = await db
		.prepare(
			`SELECT rk.snapshot_at, rk.rank, rk.score
			   FROM rankings rk JOIN distros d ON d.id = rk.distro_id
			  WHERE d.slug = ?1 AND rk.period = ?2
			  ORDER BY rk.snapshot_at DESC
			  LIMIT ?3`,
		)
		.bind(slug, period, limit)
		.all<RankHistoryPoint>();
	// Oldest first, so the client can draw straight through the series.
	return (results ?? []).reverse();
}

export async function hallOfFame(db: D1Database) {
	const { results } = await db
		.prepare(
			`SELECT d.slug, d.name, h.rationale, h.sources, h.ordering
			   FROM hall_of_fame h JOIN distros d ON d.id = h.distro_id
			  ORDER BY h.ordering, d.name`,
		)
		.all<{
			slug: string;
			name: string;
			rationale: string;
			sources: string;
			ordering: number;
		}>();
	return results ?? [];
}
