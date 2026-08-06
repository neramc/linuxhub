import { AsyncLocalStorage } from "node:async_hooks";
import { BASE_LOCALE, bindLocaleSource, detectLocale, isLocale, localeDir } from "@linuxhub/i18n";
import { type Handle, redirect } from "@sveltejs/kit";

// Per-request locale for the message runtime — AsyncLocalStorage so
// concurrent SSR renders can't leak each other's locale (ADR-0016).
const localeStore = new AsyncLocalStorage<string>();
bindLocaleSource(() => localeStore.getStore());

const LOCALE_COOKIE = "lh-locale";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Response headers from `.ai/security.md` § "Headers".
 *
 * Content-Security-Policy is deliberately **not** here — it lives in
 * `svelte.config.js`, because only SvelteKit knows the hashes and nonces of
 * the scripts it injects. Setting it in both places would mean the stricter of
 * two policies wins silently, which is a debugging trap.
 *
 * Applied in the hook rather than in `vercel.json` so they are identical in
 * dev, in `vite preview`, and in production — a header that only exists in
 * production is a header nobody tests.
 */
const SECURITY_HEADERS: Record<string, string> = {
	// Two years, with subdomains, preload-eligible. Browsers ignore this over
	// plain http, so it is safe to send unconditionally in dev.
	"Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"X-Content-Type-Options": "nosniff",
	// Redundant with CSP frame-ancestors for modern browsers, and the only
	// protection in the ones that predate it.
	"X-Frame-Options": "DENY",
	"Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
};

/**
 * Paths that must never be geo-redirected into a locale prefix.
 *
 * `/robots.txt` and `/sitemap.xml` have exactly one canonical URL each, at the
 * root, by specification — a crawler arriving from a Korean IP must not be
 * bounced to `/ko/robots.txt`, which does not exist. The BFF is here for the
 * same reason: it serves JSON, and a locale prefix would only break the fetch.
 */
const UNLOCALIZED = new Set(["/robots.txt", "/sitemap.xml"]);

function isUnlocalized(pathname: string): boolean {
	return pathname.startsWith("/api/") || UNLOCALIZED.has(pathname);
}

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname, search } = event.url;
	const segment = pathname.split("/")[1] ?? "";

	let locale = BASE_LOCALE;
	if (segment && isLocale(segment)) {
		// The base locale is canonically unprefixed: /en/explore → /explore.
		if (segment === BASE_LOCALE) {
			redirect(308, pathname.slice(BASE_LOCALE.length + 1) + search || "/");
		}
		locale = segment;
	} else if (!isUnlocalized(pathname)) {
		// No prefix → geo/cookie detection, redirect once (.ai/i18n.md).
		const cookie = event.cookies.get(LOCALE_COOKIE);
		const preferred =
			cookie && isLocale(cookie)
				? cookie
				: detectLocale(
						// Vercel edge geo header; absent in dev → Accept-Language tiebreaker.
						event.request.headers.get("x-vercel-ip-country"),
						event.request.headers.get("accept-language"),
					);
		if (!cookie) {
			event.cookies.set(LOCALE_COOKIE, preferred, {
				path: "/",
				maxAge: COOKIE_MAX_AGE,
				httpOnly: false,
				sameSite: "lax",
			});
		}
		if (preferred !== BASE_LOCALE) {
			redirect(307, `/${preferred}${pathname === "/" ? "" : pathname}${search}` || `/${preferred}`);
		}
	}

	event.locals.locale = locale;

	const response = await localeStore.run(locale, () =>
		resolve(event, {
			transformPageChunk: ({ html }) =>
				html.replace("%lh.lang%", locale).replace("%lh.dir%", localeDir(locale)),
		}),
	);

	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		response.headers.set(name, value);
	}
	return response;
};
