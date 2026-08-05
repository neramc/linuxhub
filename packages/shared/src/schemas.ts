// Reconciled API schemas — the single definition the Worker validates against
// and the BFF consumes, so a shape drift fails at the type level instead of
// silently at runtime (.ai/frontend-contract.md).
//
// One rule shapes everything here, from ADR-0020: **the API returns facts.**
// No pre-composed English strings, no pre-formatted numbers, no presentation
// baked into payloads. `downloads` is a number the page formats with `Intl`;
// `familyLine` is composed by the page through @linuxhub/i18n; `color`,
// `initials`, `flag` and the ranking sparkline are derived client-side.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Pagination — defaults defined in .ai/api.md
// ---------------------------------------------------------------------------

export const PAGINATION = { defaultLimit: 24, maxLimit: 100 } as const;

export const paginationSchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(PAGINATION.maxLimit).default(PAGINATION.defaultLimit),
});

// ---------------------------------------------------------------------------
// Enumerations — mirror the CHECK constraints in .ai/database.md
// ---------------------------------------------------------------------------

export const releaseChannel = z.enum(["stable", "beta", "rolling"]);
export type ReleaseChannel = z.infer<typeof releaseChannel>;

export const distroStatus = z.enum(["active", "discontinued"]);

export const rankingPeriod = z.enum(["week", "month", "year", "all"]);
export type RankingPeriod = z.infer<typeof rankingPeriod>;

export const distroSort = z.enum(["popularity", "name", "latest_release", "newest"]);

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export const releaseSchema = z.object({
	version: z.string(),
	channel: releaseChannel,
	lts: z.boolean(),
	codename: z.string().nullable(),
	/** Newest point release, e.g. "24.04.3". */
	latest_point: z.string().nullable(),
	released_at: z.string().nullable(),
	eol_at: z.string().nullable(),
	/** Derived from `eol_at < today`, never stored (ADR-0019). */
	eol: z.boolean(),
	notes_url: z.string().nullable(),
	source_url: z.string().nullable(),
	fetched_at: z.string().nullable(),
});
export type Release = z.infer<typeof releaseSchema>;

export const distroSchema = z.object({
	slug: z.string(),
	name: z.string(),
	summary: z.string(),
	/** Empty until the Wikidata lineage step fills it — never hand-typed. */
	family: z.string(),
	based_on: z.string().nullable(),
	homepage: z.string(),
	status: distroStatus,
	logo: z.string(),
	categories: z.array(z.string()),
	tags: z.array(z.string()),
	desktops: z.array(z.string()),
	/** Count of our own tracked download clicks. Zero until 5.6 ships
	 *  `downloads/track`; there is no permitted source for it before then. */
	downloads: z.number(),
	/** Null while no ranking snapshot exists. */
	rank: z.number().nullable(),
	/** Rank movement since the previous snapshot; null with fewer than two. */
	trend: z.number().nullable(),
	latest_release: releaseSchema.nullable(),
});
export type Distro = z.infer<typeof distroSchema>;

export const mirrorSchema = z.object({
	id: z.number(),
	name: z.string(),
	/** ISO 3166-1 alpha-2, or "" where the source publishes no geo. */
	country: z.string(),
	region: z.string(),
	base_url: z.string(),
	protocol: z.string(),
	sponsor: z.string().nullable(),
	healthy: z.boolean(),
	last_checked: z.string().nullable(),
	source_url: z.string().nullable(),
});
export type Mirror = z.infer<typeof mirrorSchema>;

export const editionSchema = z.object({
	id: z.number(),
	name: z.string(),
	desktop: z.string().nullable(),
	kind: z.enum(["desktop", "server", "minimal", "other"]),
	release_version: z.string(),
});
export type Edition = z.infer<typeof editionSchema>;

/** One row per source per successful ingest — the provenance line on the
 *  distro page is a product feature, not debug output. */
export const provenanceSchema = z.object({
	source: z.string(),
	url: z.string(),
	fetched_at: z.string(),
});
export type Provenance = z.infer<typeof provenanceSchema>;

export const distroDetailSchema = z.object({
	distro: distroSchema,
	releases: z.array(releaseSchema),
	editions: z.array(editionSchema),
	mirrors: z.array(mirrorSchema),
	related: z.array(distroSchema),
	provenance: z.array(provenanceSchema),
});
export type DistroDetail = z.infer<typeof distroDetailSchema>;

export const rankingEntrySchema = z.object({
	rank: z.number(),
	slug: z.string(),
	name: z.string(),
	score: z.number(),
	/** Positive means the distro moved up since the previous snapshot. */
	delta: z.number().nullable(),
});
export type RankingEntry = z.infer<typeof rankingEntrySchema>;

/** The sparkline series. The client draws it; the API does not ship a
 *  pre-rendered points string (ADR-0020). */
export const rankHistoryPointSchema = z.object({
	snapshot_at: z.string(),
	rank: z.number(),
	score: z.number(),
});
export type RankHistoryPoint = z.infer<typeof rankHistoryPointSchema>;

export const recentReleaseSchema = z.object({
	slug: z.string(),
	name: z.string(),
	version: z.string(),
	channel: releaseChannel,
	lts: z.boolean(),
	released_at: z.string(),
	notes_url: z.string().nullable(),
});
export type RecentRelease = z.infer<typeof recentReleaseSchema>;

export const hallOfFameEntrySchema = z.object({
	slug: z.string(),
	name: z.string(),
	rationale: z.string(),
	sources: z.array(z.string()),
	ordering: z.number(),
});
export type HallOfFameEntry = z.infer<typeof hallOfFameEntrySchema>;

export const healthSchema = z.object({
	service: z.string(),
	status: z.enum(["up", "degraded"]),
	version: z.string(),
	db: z.boolean(),
	kv: z.boolean(),
});
export type Health = z.infer<typeof healthSchema>;

// ---------------------------------------------------------------------------
// Query schemas
// ---------------------------------------------------------------------------

export const distroListQuery = paginationSchema.extend({
	category: z.string().min(1).optional(),
	tag: z.string().min(1).optional(),
	family: z.string().min(1).optional(),
	desktop: z.string().min(1).optional(),
	status: distroStatus.optional(),
	q: z.string().min(1).optional(),
	sort: distroSort.default("popularity"),
});
export type DistroListQuery = z.infer<typeof distroListQuery>;

export const searchQuery = paginationSchema.extend({
	q: z.string().trim().min(1, "q is required"),
});
export type SearchQuery = z.infer<typeof searchQuery>;

export const rankingsQuery = z.object({
	period: rankingPeriod.default("week"),
	limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type RankingsQuery = z.infer<typeof rankingsQuery>;

export const recentReleasesQuery = z.object({
	/** Opaque cursor: the `released_at` of the last row of the previous page. */
	cursor: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type RecentReleasesQuery = z.infer<typeof recentReleasesQuery>;

export const releaseListQuery = z.object({
	channel: releaseChannel.optional(),
});
export type ReleaseListQuery = z.infer<typeof releaseListQuery>;

export const slugParam = z.object({
	slug: z
		.string()
		.min(1)
		.regex(/^[a-z0-9][a-z0-9-]*$/, "slug must be lowercase alphanumeric with hyphens"),
});

// ---------------------------------------------------------------------------
// Derivations — shared so the Worker and the BFF cannot disagree about them
// ---------------------------------------------------------------------------

/** `eol` is a fact about *today*, so it is computed on read rather than stored
 *  where it would quietly go stale (ADR-0019). */
export function isEol(eolAt: string | null, today = new Date().toISOString().slice(0, 10)) {
	return eolAt !== null && eolAt < today;
}

// ---------------------------------------------------------------------------
// Downloads (.ai/api.md #14, #15, #21)
// ---------------------------------------------------------------------------

export const artifactFormat = z.enum(["iso", "torrent", "magnet", "checksum", "signature"]);
export type ArtifactFormat = z.infer<typeof artifactFormat>;

/** One selectable edition and what it is available as. */
export const downloadEditionSchema = z.object({
	name: z.string(),
	desktop: z.string().nullable(),
	kind: z.enum(["desktop", "server", "minimal", "other"]),
	archs: z.array(z.string()),
	formats: z.array(artifactFormat),
});

/** The selector's whole decision tree in one response, so walking it never
 *  needs another round trip (.ai/api.md #14). */
export const downloadOptionsSchema = z.object({
	slug: z.string(),
	versions: z.array(
		z.object({
			version: z.string(),
			channel: releaseChannel,
			lts: z.boolean(),
			released_at: z.string().nullable(),
			editions: z.array(downloadEditionSchema),
		}),
	),
	mirrors: z.array(
		z.object({
			id: z.number(),
			name: z.string(),
			country: z.string(),
			base_url: z.string(),
		}),
	),
});
export type DownloadOptions = z.infer<typeof downloadOptionsSchema>;

export const resolveRequest = z.object({
	slug: z.string().min(1),
	version: z.string().min(1),
	edition: z.string().min(1),
	arch: z.string().min(1),
	format: artifactFormat.default("iso"),
	/** Omit to let the server pick — see `mirror_choice` on the response. */
	mirror_id: z.coerce.number().int().positive().optional(),
	/** ISO 3166-1 alpha-2, used to prefer a nearby mirror when none is named. */
	country: z.string().length(2).optional(),
});
export type ResolveRequest = z.infer<typeof resolveRequest>;

/**
 * What a resolved download is.
 *
 * No `instructions` string, despite `.ai/api.md` listing one: that would be
 * composed English, which ADR-0020 keeps out of payloads. The page has the
 * checksum and the algorithm, and composes the verify instructions through
 * @linuxhub/i18n.
 */
export const downloadResolutionSchema = z.object({
	url: z.string(),
	artifact_id: z.number(),
	size: z.number().nullable(),
	sha256: z.string().nullable(),
	sig_url: z.string().nullable(),
	mirror: z
		.object({ id: z.number(), name: z.string(), country: z.string(), base_url: z.string() })
		.nullable(),
	/** How the mirror was arrived at, so the UI can say "nearest" honestly. */
	mirror_choice: z.enum(["requested", "country", "fallback", "origin"]),
});
export type DownloadResolution = z.infer<typeof downloadResolutionSchema>;

export const trackRequest = z.object({
	artifact_id: z.coerce.number().int().positive(),
	mirror_id: z.coerce.number().int().positive().optional(),
});
export type TrackRequest = z.infer<typeof trackRequest>;
