import { recentReleases, renderRss, toItems } from "$lib/server/feed";
import type { RequestHandler } from "./$types";

// Recent releases, RSS 2.0 (.ai/api.md #55). Linked from the site footer.
export const GET: RequestHandler = async ({ fetch, url }) => {
	const releases = await recentReleases(fetch);
	const body = renderRss(url.origin, toItems(url.origin, releases), url.href);

	return new Response(body, {
		headers: {
			"Content-Type": "application/rss+xml; charset=utf-8",
			"Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
		},
	});
};
