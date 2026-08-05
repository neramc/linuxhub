// Download queries. All SQL for the selector and for resolution lives here
// (.ai/backend-rules.md § "Project structure").

export type OptionRow = {
	version: string;
	channel: string;
	lts: number;
	released_at: string | null;
	edition: string;
	desktop: string | null;
	kind: string;
	arch: string;
	format: string;
};

/** The whole decision tree in one query — versions, their editions, and what
 *  each is available as — so the selector never needs a second round trip. */
export async function downloadOptionRows(db: D1Database, slug: string): Promise<OptionRow[]> {
	const { results } = await db
		.prepare(
			`SELECT r.version, r.channel, r.lts, r.released_at,
			        e.name AS edition, e.desktop, e.kind,
			        a.arch, a.format
			   FROM artifacts a
			   JOIN editions e ON e.id = a.edition_id
			   JOIN releases r ON r.id = e.release_id
			   JOIN distros  d ON d.id = r.distro_id
			  WHERE d.slug = ?1
			  ORDER BY r.released_at DESC NULLS LAST, r.version DESC, e.name, a.arch, a.format`,
		)
		.bind(slug)
		.all<OptionRow>();
	return results ?? [];
}

export type ResolvedArtifact = {
	artifact_id: number;
	path: string;
	size: number | null;
	sha256: string | null;
	sig_url: string | null;
};

export async function findArtifact(
	db: D1Database,
	slug: string,
	version: string,
	edition: string,
	arch: string,
	format: string,
): Promise<ResolvedArtifact | null> {
	return db
		.prepare(
			`SELECT a.id AS artifact_id, a.path, a.size, a.sha256, a.sig_url
			   FROM artifacts a
			   JOIN editions e ON e.id = a.edition_id
			   JOIN releases r ON r.id = e.release_id
			   JOIN distros  d ON d.id = r.distro_id
			  WHERE d.slug = ?1 AND r.version = ?2 AND e.name = ?3
			    AND a.arch = ?4 AND a.format = ?5`,
		)
		.bind(slug, version, edition, arch, format)
		.first<ResolvedArtifact>();
}

export type MirrorChoice = {
	id: number;
	name: string;
	country: string;
	base_url: string;
};

/**
 * Picks a mirror for an artifact.
 *
 * Order: the one asked for, then one in the caller's country, then any healthy
 * one. Deliberately not "closest by latency" — we have no latency data, and
 * inventing a ranking from a country code alone would be a guess dressed as a
 * measurement. The caller is told which of the three happened.
 */
export async function chooseMirror(
	db: D1Database,
	artifactId: number,
	requestedId?: number,
	country?: string,
): Promise<{ mirror: MirrorChoice | null; choice: "requested" | "country" | "fallback" }> {
	if (requestedId !== undefined) {
		const mirror = await db
			.prepare(
				`SELECT m.id, m.name, m.country, m.base_url
				   FROM artifact_mirrors am JOIN mirrors m ON m.id = am.mirror_id
				  WHERE am.artifact_id = ?1 AND m.id = ?2 AND am.available = 1 AND m.healthy = 1`,
			)
			.bind(artifactId, requestedId)
			.first<MirrorChoice>();
		if (mirror) return { mirror, choice: "requested" };
	}

	if (country) {
		const mirror = await db
			.prepare(
				`SELECT m.id, m.name, m.country, m.base_url
				   FROM artifact_mirrors am JOIN mirrors m ON m.id = am.mirror_id
				  WHERE am.artifact_id = ?1 AND m.country = ?2 AND am.available = 1 AND m.healthy = 1
				  ORDER BY m.name LIMIT 1`,
			)
			.bind(artifactId, country.toUpperCase())
			.first<MirrorChoice>();
		if (mirror) return { mirror, choice: "country" };
	}

	const mirror = await db
		.prepare(
			`SELECT m.id, m.name, m.country, m.base_url
			   FROM artifact_mirrors am JOIN mirrors m ON m.id = am.mirror_id
			  WHERE am.artifact_id = ?1 AND am.available = 1 AND m.healthy = 1
			  ORDER BY m.name LIMIT 1`,
		)
		.bind(artifactId)
		.first<MirrorChoice>();
	return { mirror, choice: "fallback" };
}

/** The mirrors a visitor may pick from — only those a download can actually
 *  come from, so choosing one is never a way to get a URL that 404s. */
export async function listDownloadMirrors(db: D1Database, slug: string): Promise<MirrorChoice[]> {
	const { results } = await db
		.prepare(
			`SELECT m.id, m.name, m.country, m.base_url
			   FROM mirrors m JOIN distros d ON d.id = m.distro_id
			  WHERE d.slug = ?1 AND m.healthy = 1 AND m.serves_artifacts = 1
			  ORDER BY m.country, m.name`,
		)
		.bind(slug)
		.all<MirrorChoice>();
	return results ?? [];
}

/**
 * Records a download click in KV.
 *
 * KV rather than D1 because this is the one write on a hot path, and a counter
 * that costs a database round trip per click is a counter that shapes the page
 * it is measuring. The daily cron flushes these into `download_events`; losing
 * a day of KV loses a day of counts and nothing else (.ai/database.md).
 */
export async function trackDownload(
	kv: KVNamespace,
	artifactId: number,
	mirrorId: number | undefined,
	day: string,
): Promise<void> {
	const key = `dlcount:${artifactId}:${mirrorId ?? 0}:${day}`;
	const current = Number.parseInt((await kv.get(key)) ?? "0", 10);
	// 48h, so the daily flush has a full day of slack before a bucket expires.
	await kv.put(key, String(current + 1), { expirationTtl: 48 * 60 * 60 });
}

/**
 * Moves yesterday's and today's KV click counters into `download_events`.
 *
 * KV is the write path because it is cheap on a hot page; D1 is where the
 * counts have to end up, because KV entries expire and rankings need history.
 * The flush is additive (`count = count + excluded.count`) and deletes each key
 * it banks, so running it twice in a day cannot double-count.
 */
export async function flushDownloadCounters(
	kv: KVNamespace,
	db: D1Database,
): Promise<{ flushed: number }> {
	let cursor: string | undefined;
	let flushed = 0;

	do {
		const page = await kv.list({ prefix: "dlcount:", cursor, limit: 1000 });
		cursor = page.list_complete ? undefined : page.cursor;

		const statements: D1PreparedStatement[] = [];
		const keys: string[] = [];

		for (const entry of page.keys) {
			const [, artifactId, mirrorId, day] = entry.name.split(":");
			const count = Number.parseInt((await kv.get(entry.name)) ?? "0", 10);
			if (!artifactId || !day || count <= 0) continue;

			statements.push(
				db
					.prepare(
						`INSERT INTO download_events (artifact_id, mirror_id, day, count)
						 SELECT ?1, ?2, ?3, ?4
						  WHERE EXISTS (SELECT 1 FROM artifacts WHERE id = ?1)
						 ON CONFLICT(artifact_id, mirror_id, day)
						 DO UPDATE SET count = count + excluded.count`,
					)
					.bind(Number(artifactId), Number(mirrorId ?? 0), day, count),
			);
			keys.push(entry.name);
		}

		if (statements.length > 0) {
			await db.batch(statements);
			// Deleted only after the write landed: a crash between the two costs a
			// re-flush of counts already banked, which the additive upsert would
			// double. Losing the delete is the safer half of that trade — the keys
			// expire on their own within 48h.
			await Promise.all(keys.map((k) => kv.delete(k)));
			flushed += statements.length;
		}
	} while (cursor);

	return { flushed };
}
