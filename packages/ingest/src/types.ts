// Normalized shapes every source fetcher produces. These are deliberately
// upstream-agnostic: a fetcher's job is to turn one API's payload into these,
// so the D1 upserts in apps/api never learn what endoflife.date or
// MirrorManager happen to call their fields.

/** One release cycle, normalized. `eol`/`lts` come from upstream; "is it EOL
 *  today" is derived at read time and never stored (ADR-0019). */
export type LiveRelease = {
	cycle: string;
	latest?: string;
	codename?: string;
	releaseDate?: string;
	eol?: string;
	lts: boolean;
	supported: boolean;
};

export type LiveMirror = {
	name: string;
	url: string;
	country?: string;
	countryCode?: string;
	note?: string;
};

/** What a fetcher hands back: the rows plus the URL they came from, so the
 *  caller can write `source_url` onto every row it stores. */
export type Fetched<T> = {
	sourceUrl: string;
	fetchedAt: string;
	data: T;
};

/** An installable variant of a release — Fedora's "Workstation", Arch's "ISO". */
export type LiveEdition = {
	name: string;
	/** Desktop environment slug, set only when the source actually names one. */
	desktop?: string;
	kind: "desktop" | "server" | "minimal" | "other";
};

/** A downloadable file. `path` is mirror-relative where the artifact is
 *  mirrored, and an absolute URL or URI where the source publishes one that no
 *  mirror serves (a torrent page, a magnet link). */
export type LiveArtifact = {
	/** Release version this belongs to, matching `releases.version`. */
	version: string;
	/** Edition name this belongs to, matching `editions.name`. */
	edition: string;
	arch: string;
	format: "iso" | "torrent" | "magnet" | "checksum" | "signature";
	path: string;
	size?: number;
	sha256?: string;
};

/** What an artifact fetcher yields: the releases it found, the editions of
 *  each, and the files under them. */
export type LiveCatalog = {
	releases: LiveRelease[];
	editions: Array<LiveEdition & { version: string }>;
	artifacts: LiveArtifact[];
};
