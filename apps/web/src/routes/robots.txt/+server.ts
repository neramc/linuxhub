import type { RequestHandler } from "./$types";

// robots.txt. A site whose own rules demand that *we* respect robots.txt
// (.ai/security.md § "Crawler ethics") should publish one.
//
// The only disallowed prefix is /api/ — the BFF. It is not secret, but it is
// machine surface with no crawl value, and `downloads/resolve` is a POST that
// costs a database lookup and a rate-limit slot per call.
export const GET: RequestHandler = ({ url }) => {
	const body = [
		"User-agent: *",
		"Allow: /",
		"Disallow: /api/",
		"",
		`Sitemap: ${url.origin}/sitemap.xml`,
		"",
	].join("\n");

	return new Response(body, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
};
