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
