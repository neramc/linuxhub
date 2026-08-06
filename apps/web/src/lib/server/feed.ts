// Release feeds (.ai/api.md #55, #56).
//
// Both formats are built from the same rows the site renders, fetched through
// the BFF's own `releases/recent` — so a feed can never disagree with the page,
// and it works in both the Worker and snapshot modes without knowing which one
// it is in.

import { m } from "@linuxhub/i18n";
import type { ApiResponse, RecentRelease } from "@linuxhub/shared";

export const FEED_LIMIT = 30;

export function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

export async function recentReleases(
	fetchImpl: typeof fetch,
	limit = FEED_LIMIT,
): Promise<RecentRelease[]> {
	const response = await fetchImpl(`/api/v1/releases/recent?limit=${limit}`);
	const body = (await response.json()) as ApiResponse<RecentRelease[]>;
	return body.ok ? body.data : [];
}

export type FeedItem = {
	title: string;
	/** Canonical page for the release — our distro page, always resolvable. */
	link: string;
	/** The upstream announcement, when the source published one. */
	notesUrl: string | null;
	updated: string;
	guid: string;
};

export function toItems(origin: string, releases: RecentRelease[]): FeedItem[] {
	return releases.map((release) => {
		const link = `${origin}/distro/${release.slug}`;
		return {
			// A proper noun and a version number — nothing to translate, and
			// composed here rather than sent pre-built by any server (ADR-0020).
			title: `${release.name} ${release.version}`.trim(),
			link,
			notesUrl: release.notes_url,
			// Never null: `releases/recent` filters `released_at IS NOT NULL`,
			// because a feed entry with no date has nowhere to sort.
			updated: release.released_at,
			guid: `${link}#${release.version}`,
		};
	});
}

/**
 * RSS 2.0 wants RFC-822 dates; Atom wants RFC-3339. Both start from the same
 * `YYYY-MM-DD`, which is all the sources publish.
 *
 * An unparseable string falls back to the epoch rather than to `now`: a date
 * we cannot read must not make an old release resurface as today's news on
 * every rebuild, which is how a feed teaches its readers to ignore it.
 */
function asDate(value: string): Date {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

export function renderRss(origin: string, items: FeedItem[], self: string): string {
	const entries = items.map((item) =>
		[
			"    <item>",
			`      <title>${escapeXml(item.title)}</title>`,
			`      <link>${escapeXml(item.notesUrl ?? item.link)}</link>`,
			`      <guid isPermaLink="false">${escapeXml(item.guid)}</guid>`,
			`      <pubDate>${asDate(item.updated).toUTCString()}</pubDate>`,
			"    </item>",
		].join("\n"),
	);

	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
		"  <channel>",
		`    <title>${escapeXml(m.site_name)}</title>`,
		`    <link>${escapeXml(origin)}</link>`,
		`    <description>${escapeXml(m.site_tagline)}</description>`,
		`    <atom:link href="${escapeXml(self)}" rel="self" type="application/rss+xml"/>`,
		...entries,
		"  </channel>",
		"</rss>",
		"",
	].join("\n");
}

export function renderAtom(origin: string, items: FeedItem[], self: string): string {
	const newest = items.reduce(
		(latest, item) => (item.updated > latest ? item.updated : latest),
		"1970-01-01",
	);

	const entries = items.map((item) =>
		[
			"  <entry>",
			`    <title>${escapeXml(item.title)}</title>`,
			`    <link rel="alternate" href="${escapeXml(item.notesUrl ?? item.link)}"/>`,
			`    <id>${escapeXml(item.guid)}</id>`,
			`    <updated>${asDate(item.updated).toISOString()}</updated>`,
			"  </entry>",
		].join("\n"),
	);

	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<feed xmlns="http://www.w3.org/2005/Atom">',
		`  <title>${escapeXml(m.site_name)}</title>`,
		`  <subtitle>${escapeXml(m.site_tagline)}</subtitle>`,
		`  <id>${escapeXml(`${origin}/`)}</id>`,
		`  <link rel="alternate" href="${escapeXml(origin)}"/>`,
		`  <link rel="self" href="${escapeXml(self)}"/>`,
		`  <updated>${asDate(newest).toISOString()}</updated>`,
		...entries,
		"</feed>",
		"",
	].join("\n");
}
