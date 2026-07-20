// @linuxhub/i18n — locale registry, geo mapping, and the message runtime.
// Canonical registry table lives in .ai/i18n.md.

export { detectLocale, localeForCountry, localeFromAcceptLanguage } from "./geo";
export { en, type MessageKey } from "./messages";
export {
	BASE_LOCALE,
	fallbackChain,
	isLocale,
	LOCALE_CODES,
	LOCALES,
	type Locale,
	localeDir,
	RTL_LOCALES,
} from "./registry";
export {
	bindLocaleSource,
	getLocale,
	localizeHref,
	m,
	setLocale,
	splitLocale,
	TRANSLATED_LOCALES,
} from "./runtime";
