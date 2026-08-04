// Catalog identity writes. All SQL for `distros` and `content_index` lives
// here (.ai/backend-rules.md § "Project structure"); parameters are always
// bound, never interpolated.

import type { ContentDistroRow, ContentDocRow, ContentIndex } from "@linuxhub/ingest/content";

/**
 * Upserts the catalog identity every distro gets from its authored, cited MDX.
 *
 * `family` and `based_on` are deliberately not touched: lineage comes from
 * Wikidata in a later step, and this statement must not overwrite it with the
 * empty default on the next run.
 */
export function upsertDistroStatement(
	db: D1Database,
	row: ContentDistroRow,
	now: string,
): D1PreparedStatement {
	return db
		.prepare(
			`INSERT INTO distros
			   (slug, name, summary, homepage, logo_path, source_url, fetched_at, created_at, updated_at)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?7)
			 ON CONFLICT(slug) DO UPDATE SET
			   name       = excluded.name,
			   summary    = excluded.summary,
			   homepage   = excluded.homepage,
			   logo_path  = excluded.logo_path,
			   source_url = excluded.source_url,
			   fetched_at = excluded.fetched_at,
			   updated_at = excluded.updated_at`,
		)
		.bind(row.slug, row.name, row.summary, row.homepage, row.logo_path, row.source_url, now);
}

export function upsertContentDocStatement(
	db: D1Database,
	slug: string,
	doc: ContentDocRow,
): D1PreparedStatement {
	return db
		.prepare(
			`INSERT INTO content_index (distro_id, doc, locale, source_urls, reviewed_at)
			 VALUES ((SELECT id FROM distros WHERE slug = ?1), ?2, ?3, ?4, ?5)
			 ON CONFLICT(distro_id, doc, locale) DO UPDATE SET
			   source_urls = excluded.source_urls,
			   reviewed_at = excluded.reviewed_at`,
		)
		.bind(slug, doc.doc, doc.locale, JSON.stringify(doc.source_urls), doc.reviewed_at);
}

/**
 * Seeds distro identity and the MDX registry from the generated content index.
 * Idempotent: safe to run at the head of every ingestion pass, which is what
 * guarantees the foreign keys releases and mirrors need already resolve.
 */
export async function syncCatalog(db: D1Database, index: ContentIndex, now: string) {
	const statements: D1PreparedStatement[] = [];
	for (const row of index.distros) {
		statements.push(upsertDistroStatement(db, row, now));
	}
	// Content rows are a second pass so every distro row exists before the
	// subselect on `slug` runs.
	for (const row of index.distros) {
		for (const doc of row.docs) {
			statements.push(upsertContentDocStatement(db, row.slug, doc));
		}
	}
	const results = await db.batch(statements);
	return { written: results.reduce((n, r) => n + (r.meta?.changes ?? 0), 0) };
}

export async function distroIdBySlug(db: D1Database, slug: string): Promise<number | null> {
	const row = await db
		.prepare("SELECT id FROM distros WHERE slug = ?1")
		.bind(slug)
		.first<{ id: number }>();
	return row?.id ?? null;
}
