// The ingestion audit trail. One row per source per run: what was fetched,
// when, and whether it changed anything (.ai/security.md § "Crawler ethics").
// Per-value provenance lives on the ingested rows themselves (ADR-0019).

export type IngestStatus = "ok" | "error" | "skipped";

export type IngestLogRow = {
	source: string;
	url: string;
	fetchedAt: string;
	status: IngestStatus;
	changed?: number;
	detail?: string;
};

export function logIngestStatement(db: D1Database, row: IngestLogRow): D1PreparedStatement {
	return db
		.prepare(
			`INSERT INTO ingest_log (source, url, fetched_at, status, changed, detail)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
		)
		.bind(row.source, row.url, row.fetchedAt, row.status, row.changed ?? 0, row.detail ?? null);
}

export async function logIngest(db: D1Database, rows: IngestLogRow[]): Promise<void> {
	if (rows.length === 0) return;
	await db.batch(rows.map((row) => logIngestStatement(db, row)));
}

/** Newest successful fetch per source — powers the provenance line the distro
 *  page already shows ("data fetched from … at …"). */
export async function latestProvenance(
	db: D1Database,
): Promise<Array<{ source: string; url: string; fetched_at: string }>> {
	const { results } = await db
		.prepare(
			`SELECT source, url, MAX(fetched_at) AS fetched_at
			   FROM ingest_log
			  WHERE status = 'ok'
			  GROUP BY source
			  ORDER BY source`,
		)
		.all<{ source: string; url: string; fetched_at: string }>();
	return results;
}
