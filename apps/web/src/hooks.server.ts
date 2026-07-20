import { AsyncLocalStorage } from "node:async_hooks";
import { BASE_LOCALE, bindLocaleSource, detectLocale, isLocale, localeDir } from "@linuxhub/i18n";
import { type Handle, redirect } from "@sveltejs/kit";

// Per-request locale for the message runtime — AsyncLocalStorage so
// concurrent SSR renders can't leak each other's locale (ADR-0016).
const localeStore = new AsyncLocalStorage<string>();
bindLocaleSource(() => localeStore.getStore());

const LOCALE_COOKIE = "lh-locale";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const handle: Handle = ({ event, resolve }) => {
	const { pathname, search } = event.url;
	const segment = pathname.split("/")[1] ?? "";

	let locale = BASE_LOCALE;
	if (segment && isLocale(segment)) {
		// The base locale is canonically unprefixed: /en/explore → /explore.
		if (segment === BASE_LOCALE) {
			redirect(308, pathname.slice(BASE_LOCALE.length + 1) + search || "/");
		}
		locale = segment;
	} else if (!pathname.startsWith("/api/")) {
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

	return localeStore.run(locale, () =>
		resolve(event, {
			transformPageChunk: ({ html }) =>
				html.replace("%lh.lang%", locale).replace("%lh.dir%", localeDir(locale)),
		}),
	);
};
