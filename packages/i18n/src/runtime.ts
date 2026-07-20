// Message runtime — resolves m.<key> against the active locale with the
// fallback chain from the registry (ADR-0016). Keys stay Paraglide-shaped;
// the inlang compiler can replace this module without touching call sites.
//
// Locale state:
//  - On the server, hooks.server.ts binds a per-request source backed by
//    AsyncLocalStorage so concurrent SSR renders can't leak locales.
//  - In the browser (one locale per document), setLocale() is enough; a
//    locale switch performs a full navigation.

import { en, type MessageKey } from "./messages";
import { ko } from "./messages.ko";
import { BASE_LOCALE, fallbackChain } from "./registry";

const CATALOGS: Record<string, Partial<Record<MessageKey, string>>> = { en, ko };

/** Locales with an authored UI catalog (used by the switcher's "translated" hint). */
export const TRANSLATED_LOCALES: readonly string[] = Object.keys(CATALOGS);

let currentLocale = BASE_LOCALE;
let localeSource: (() => string | undefined) | null = null;

/** Server-side: bind a per-request locale source (e.g. AsyncLocalStorage). */
export function bindLocaleSource(source: () => string | undefined): void {
	localeSource = source;
}

export function setLocale(code: string): void {
	currentLocale = code;
}

export function getLocale(): string {
	return localeSource?.() ?? currentLocale;
}

function resolve(key: MessageKey): string {
	for (const code of fallbackChain(getLocale())) {
		const value = CATALOGS[code]?.[key];
		if (value !== undefined) return value;
	}
	return en[key] ?? key;
}

/** Locale-aware message catalog: m.some_key returns the active-locale string. */
export const m: Record<MessageKey, string> = new Proxy({} as Record<MessageKey, string>, {
	get(_target, key) {
		if (typeof key !== "string") return undefined;
		return resolve(key as MessageKey);
	},
	has(_target, key) {
		return typeof key === "string" && key in en;
	},
	ownKeys() {
		return Object.keys(en);
	},
	getOwnPropertyDescriptor() {
		return { enumerable: true, configurable: true };
	},
});

/** Prefix an internal path with the active locale (en stays unprefixed). */
export function localizeHref(path: string, locale = getLocale()): string {
	if (locale === BASE_LOCALE) return path;
	if (path === "/") return `/${locale}`;
	return `/${locale}${path}`;
}

/** Strip a known locale prefix from a pathname → [locale, unprefixed path]. */
export function splitLocale(pathname: string, isLocale: (v: string) => boolean): [string, string] {
	const segment = pathname.split("/")[1];
	if (segment && isLocale(segment)) {
		return [segment, pathname.slice(segment.length + 1) || "/"];
	}
	return [BASE_LOCALE, pathname];
}
