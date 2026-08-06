import { recentReleases, renderAtom, toItems } from "$lib/server/feed";
import type { RequestHandler } from "./$types";

// Recent releases, Atom (.ai/api.md #56). Linked from the site footer.
export const GET: RequestHandler = async ({ fetch, url }) => {
	const releases = await recentReleases(fetch);
	const body = renderAtom(url.origin, toItems(url.origin, releases), url.href);

	return new Response(body, {
		headers: {
			"Content-Type": "application/atom+xml; charset=utf-8",
			"Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
		},
	});
};
