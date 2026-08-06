import { BASE_LOCALE, TRANSLATED_LOCALES } from "@linuxhub/i18n";
import type { ApiResponse, Distro } from "@linuxhub/shared";
import type { RequestHandler } from "./$types";

// Sitemap (.ai/api.md #59 — "served by the web app directly").
//
// Only the locales that actually have a message catalog are listed. The
// registry carries ~57, but a locale with no catalog renders English behind a
// translated URL, and telling a search engine that `/de/explore` is German
// when it is English is the same class of claim as a hand-typed fact.
// Locales join this list by gaining a catalog, not by being added here.

/** Routes with stable, indexable content. `/search` is query-driven and
 *  `/distro/<slug>` is added per distro below. */
const STATIC_PATHS = [
	"/",
	"/explore",
	"/rankings",
	"/hall-of-fame",
	"/quiz",
	"/compare",
	"/about",
	"/contribute",
] as const;

function localizedPath(locale: string, path: string): string {
	if (locale === BASE_LOCALE) return path;
	return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/** One <url> per path per locale, each carrying the full alternate set — which
 *  is what xhtml:link requires: every variant must list every variant. */
function urlEntry(origin: string, path: string, lastmod?: string): string {
	const alternates = TRANSLATED_LOCALES.map(
		(locale) =>
			`    <xhtml:link rel="alternate" hreflang="${locale}" href="${escapeXml(
				origin + localizedPath(locale, path),
			)}"/>`,
	).join("\n");

	return TRANSLATED_LOCALES.map((locale) => {
		const loc = escapeXml(origin + localizedPath(locale, path));
		return [
			"  <url>",
			`    <loc>${loc}</loc>`,
			lastmod ? `    <lastmod>${escapeXml(lastmod)}</lastmod>` : "",
			alternates,
			`    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(
				origin + localizedPath(BASE_LOCALE, path),
			)}"/>`,
			"  </url>",
		]
			.filter(Boolean)
			.join("\n");
	}).join("\n");
}

export const GET: RequestHandler = async ({ fetch, url }) => {
	// The catalog comes from the BFF, so the sitemap lists what the site
	// actually serves rather than a second, drifting list of slugs.
	let distros: Distro[] = [];
	try {
		const response = await fetch("/api/v1/distros?limit=100");
		const body = (await response.json()) as ApiResponse<Distro[]>;
		if (body.ok) distros = body.data;
	} catch {
		// A sitemap missing its distro pages beats a 500 on /sitemap.xml: the
		// static routes are still worth serving, and crawlers retry.
	}

	const entries = [
		...STATIC_PATHS.map((path) => urlEntry(url.origin, path)),
		...distros.map((distro) =>
			urlEntry(
				url.origin,
				`/distro/${distro.slug}`,
				distro.latest_release?.released_at ?? undefined,
			),
		),
	];

	const xml = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
		'        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
		...entries,
		"</urlset>",
		"",
	].join("\n");

	return new Response(xml, {
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
};
