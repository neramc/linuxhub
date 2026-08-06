import type { RecentRelease } from "@linuxhub/shared";
import { describe, expect, it } from "vitest";
import { escapeXml, renderAtom, renderRss, toItems } from "./feed";

const ORIGIN = "https://linuxhub.kro.kr";

const RELEASES: RecentRelease[] = [
	{
		slug: "fedora",
		name: "Fedora",
		version: "44",
		channel: "stable",
		lts: false,
		released_at: "2026-04-28",
		notes_url: "https://fedoramagazine.org/announcing-fedora-44/",
	},
	{
		slug: "arch",
		name: "Arch Linux",
		version: "2026.08.01",
		channel: "rolling",
		lts: false,
		released_at: "2026-08-01",
		// A source that publishes no announcement link.
		notes_url: null,
	},
];

describe("toItems", () => {
	it("links to our page when the source published no announcement", () => {
		const [fedora, arch] = toItems(ORIGIN, RELEASES);
		expect(fedora?.notesUrl).toBe("https://fedoramagazine.org/announcing-fedora-44/");
		expect(arch?.notesUrl).toBeNull();
		expect(arch?.link).toBe(`${ORIGIN}/distro/arch`);
	});

	it("dates an unreadable date to the epoch, not to now", () => {
		// "now" would make an old release resurface as today's news on every
		// rebuild, which is how a feed teaches readers to ignore it.
		const xml = renderRss(
			ORIGIN,
			toItems(ORIGIN, [{ ...RELEASES[0], released_at: "not-a-date" } as RecentRelease]),
			ORIGIN,
		);
		expect(xml).toContain("<pubDate>Thu, 01 Jan 1970 00:00:00 GMT</pubDate>");
	});
});

describe("escapeXml", () => {
	it("escapes everything that would break a document", () => {
		expect(escapeXml(`Tom & "Jerry" <b>'x'</b>`)).toBe(
			"Tom &amp; &quot;Jerry&quot; &lt;b&gt;&apos;x&apos;&lt;/b&gt;",
		);
	});
});

describe("renderRss", () => {
	const xml = renderRss(ORIGIN, toItems(ORIGIN, RELEASES), `${ORIGIN}/api/v1/feeds/releases.rss`);

	it("emits RFC-822 dates, which is what RSS 2.0 requires", () => {
		expect(xml).toContain("<pubDate>Tue, 28 Apr 2026 00:00:00 GMT</pubDate>");
	});

	it("carries a self link and one item per release", () => {
		expect(xml).toContain('rel="self"');
		expect(xml.match(/<item>/g)).toHaveLength(2);
	});

	it("prefers the upstream announcement as the item link", () => {
		expect(xml).toContain("<link>https://fedoramagazine.org/announcing-fedora-44/</link>");
		expect(xml).toContain(`<link>${ORIGIN}/distro/arch</link>`);
	});
});

describe("renderAtom", () => {
	const xml = renderAtom(ORIGIN, toItems(ORIGIN, RELEASES), `${ORIGIN}/api/v1/feeds/releases.atom`);

	it("emits RFC-3339 dates, which is what Atom requires", () => {
		expect(xml).toContain("<updated>2026-04-28T00:00:00.000Z</updated>");
	});

	it("stamps the feed with its newest entry rather than with now", () => {
		// The feed-level <updated> is the first one in the document, and must be
		// the newest entry's date (Arch, 2026-08-01), not Fedora's earlier one.
		const feedUpdated = xml.slice(xml.indexOf("<updated>"), xml.indexOf("</updated>"));
		expect(feedUpdated).toContain("2026-08-01");
	});

	it("gives every entry a stable id", () => {
		expect(xml).toContain(`<id>${ORIGIN}/distro/fedora#44</id>`);
	});
});
