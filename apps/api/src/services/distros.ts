// Business logic and caching. Routes never call db/ directly, so the cache is
// impossible to bypass (.ai/backend-rules.md § "Caching").

import {
	type Distro,
	type DistroDetail,
	type DistroListQuery,
	type HallOfFameEntry,
	isEol,
	type RankHistoryPoint,
	type RankingEntry,
	type RankingPeriod,
	type RecentRelease,
	type Release,
	type ReleaseChannel,
	releaseChannel,
	type SearchQuery,
} from "@linuxhub/shared";
import { latestProvenance } from "../db/ingest-log";
import * as db from "../db/queries";
import type { Env } from "../env";
import { cached, generation, hashQuery, TTL } from "../lib/cache";
import { notFound } from "../lib/errors";

function toRelease(row: db.ReleaseRow, today: string): Release {
	return {
		version: row.version,
		// The CHECK constraint guarantees this, but parsing keeps the response
		// honest if a migration ever widens the column.
		channel: releaseChannel.catch("stable" as ReleaseChannel).parse(row.channel),
		lts: row.lts === 1,
		codename: row.codename,
		latest_point: row.latest_point,
		released_at: row.released_at,
		eol_at: row.eol_at,
		eol: isEol(row.eol_at, today),
		notes_url: row.notes_url,
		source_url: row.source_url,
		fetched_at: row.fetched_at,
	};
}

type Taxonomy = { categories: string[]; tags: string[]; desktops: string[] };
const EMPTY_TAXONOMY: Taxonomy = { categories: [], tags: [], desktops: [] };

function toDistro(row: db.DistroRow, taxonomy: Taxonomy, latest: Release | null): Distro {
	return {
		slug: row.slug,
		name: row.name,
		summary: row.summary,
		family: row.family,
		based_on: row.based_on,
		homepage: row.homepage,
		status: row.status === "discontinued" ? "discontinued" : "active",
		logo: row.logo_path,
		categories: taxonomy.categories,
		tags: taxonomy.tags,
		desktops: taxonomy.desktops,
		downloads: row.downloads,
		rank: row.rank,
		trend: row.trend,
		latest_release: latest,
	};
}

/** Attaches taxonomy and the newest release to a page of distro rows in two
 *  queries rather than two per row. */
async function hydrate(env: Env, rows: db.DistroRow[], today: string): Promise<Distro[]> {
	if (rows.length === 0) return [];
	const taxonomy = await db.taxonomyFor(
		env.DB,
		rows.map((r) => r.id),
	);
	const latest = await Promise.all(rows.map((r) => db.listReleases(env.DB, r.slug)));
	return rows.map((row, i) => {
		const newest = latest[i]?.[0];
		return toDistro(
			row,
			taxonomy.get(row.id) ?? EMPTY_TAXONOMY,
			newest ? toRelease(newest, today) : null,
		);
	});
}

const today = () => new Date().toISOString().slice(0, 10);

export async function listDistros(
	env: Env,
	query: DistroListQuery,
): Promise<{ data: Distro[]; total: number }> {
	const gen = await generation(env.KV_CACHE);
	return cached(env.KV_CACHE, `cache:distros:${gen}:${hashQuery(query)}`, TTL.list, async () => {
		const { rows, total } = await db.listDistros(env.DB, query);
		return { data: await hydrate(env, rows, today()), total };
	});
}

export async function searchDistros(
	env: Env,
	query: SearchQuery,
): Promise<{ data: Distro[]; total: number }> {
	const gen = await generation(env.KV_CACHE);
	return cached(env.KV_CACHE, `cache:search:${gen}:${hashQuery(query)}`, TTL.list, async () => {
		const { rows, total } = await db.searchDistros(env.DB, query);
		return { data: await hydrate(env, rows, today()), total };
	});
}

export async function getDistroDetail(env: Env, slug: string): Promise<DistroDetail> {
	const gen = await generation(env.KV_CACHE, slug);
	return cached(env.KV_CACHE, `cache:distro:${slug}:${gen}`, TTL.detail, async () => {
		const row = await db.getDistro(env.DB, slug);
		if (!row) throw notFound("distro");

		const now = today();
		const [releases, editions, mirrors, related, provenance] = await Promise.all([
			db.listReleases(env.DB, slug),
			db.listEditions(env.DB, slug),
			db.listMirrors(env.DB, slug),
			db.relatedDistros(env.DB, row),
			latestProvenance(env.DB),
		]);

		const [distro] = await hydrate(env, [row], now);
		if (!distro) throw notFound("distro");

		return {
			distro,
			releases: releases.map((r) => toRelease(r, now)),
			editions,
			mirrors,
			related: await hydrate(env, related, now),
			provenance,
		};
	});
}

export async function listReleasesFor(
	env: Env,
	slug: string,
	channel?: ReleaseChannel,
): Promise<Release[]> {
	const row = await db.getDistro(env.DB, slug);
	if (!row) throw notFound("distro");
	const now = today();
	return (await db.listReleases(env.DB, slug, channel)).map((r) => toRelease(r, now));
}

export async function recentReleases(
	env: Env,
	limit: number,
	cursor?: string,
): Promise<{ data: RecentRelease[]; nextCursor: string | null }> {
	// One extra row tells us whether another page exists without a second query.
	const rows = await db.recentReleases(env.DB, limit + 1, cursor);
	const page = rows.slice(0, limit);
	return {
		data: page.map((row) => ({
			slug: row.slug,
			name: row.name,
			version: row.version,
			channel: releaseChannel.catch("stable" as ReleaseChannel).parse(row.channel),
			lts: row.lts === 1,
			// The query filters these out, so the fallback is unreachable in practice.
			released_at: row.released_at ?? "",
			notes_url: row.notes_url,
		})),
		nextCursor: rows.length > limit ? (page[page.length - 1]?.released_at ?? null) : null,
	};
}

export async function rankings(
	env: Env,
	period: RankingPeriod,
	limit: number,
): Promise<{ entries: RankingEntry[]; movers: RankingEntry[] }> {
	const gen = await generation(env.KV_CACHE);
	return cached(env.KV_CACHE, `rankings:${period}:${gen}:${limit}`, TTL.rankings, async () => {
		const entries = await db.rankingSnapshot(env.DB, period, limit);
		const movers = [...entries]
			.filter((e) => e.delta !== null && e.delta !== 0)
			.sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))
			.slice(0, 3);
		return { entries, movers };
	});
}

export async function rankHistory(
	env: Env,
	slug: string,
	period: RankingPeriod,
): Promise<RankHistoryPoint[]> {
	const row = await db.getDistro(env.DB, slug);
	if (!row) throw notFound("distro");
	return db.rankHistory(env.DB, slug, period);
}

export async function hallOfFame(env: Env): Promise<HallOfFameEntry[]> {
	const rows = await db.hallOfFame(env.DB);
	return rows.map((row) => ({
		slug: row.slug,
		name: row.name,
		rationale: row.rationale,
		sources: safeJsonArray(row.sources),
		ordering: row.ordering,
	}));
}

function safeJsonArray(value: string): string[] {
	try {
		const parsed: unknown = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.map(String) : [];
	} catch {
		return [];
	}
}
