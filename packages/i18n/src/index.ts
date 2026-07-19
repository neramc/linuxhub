// Locale registry — canonical table lives in .ai/i18n.md; this module is the
// runtime source consumed by routing, the API, and (later) Paraglide setup.

export { type MessageKey, m } from "./messages";

export type Locale = {
	/** Native label as shown in the language switcher. */
	label: string;
	/** BCP-47 tag, also the URL prefix (/ko, /pt-BR, …). */
	code: string;
	/** Right-to-left script. */
	rtl: boolean;
	/** Fallback chain before the base locale (e.g. pt-BR → pt). */
	fallback?: string;
};

export const BASE_LOCALE = "en";

export const LOCALES: readonly Locale[] = [
	{ label: "繁體中文", code: "zh-Hant", rtl: false },
	{ label: "日本語", code: "ja", rtl: false },
	{ label: "한국어", code: "ko", rtl: false },
	{ label: "简体中文", code: "zh-Hans", rtl: false },
	{ label: "azərbaycan", code: "az", rtl: false },
	{ label: "brezhoneg", code: "br", rtl: false },
	{ label: "British English", code: "en-GB", rtl: false, fallback: "en" },
	{ label: "català", code: "ca", rtl: false },
	{ label: "čeština", code: "cs", rtl: false },
	{ label: "dansk", code: "da", rtl: false },
	{ label: "Deutsch", code: "de", rtl: false },
	{ label: "eesti", code: "et", rtl: false },
	{ label: "English", code: "en", rtl: false },
	{ label: "español", code: "es", rtl: false },
	{ label: "Esperanto", code: "eo", rtl: false },
	{ label: "euskara", code: "eu", rtl: false },
	{ label: "Filipino", code: "fil", rtl: false },
	{ label: "français", code: "fr", rtl: false },
	{ label: "Gaeilge", code: "ga", rtl: false },
	{ label: "galego", code: "gl", rtl: false },
	{ label: "hrvatski", code: "hr", rtl: false },
	{ label: "Indonesia", code: "id", rtl: false },
	{ label: "interlingua", code: "ia", rtl: false },
	{ label: "italiano", code: "it", rtl: false },
	{ label: "kernewek", code: "kw", rtl: false },
	{ label: "lietuvių", code: "lt", rtl: false },
	{ label: "magyar", code: "hu", rtl: false },
	{ label: "Nederlands", code: "nl", rtl: false },
	{ label: "norsk bokmål", code: "nb", rtl: false },
	{ label: "occitan", code: "oc", rtl: false },
	{ label: "polski", code: "pl", rtl: false },
	{ label: "português", code: "pt", rtl: false },
	{ label: "português (Brasil)", code: "pt-BR", rtl: false, fallback: "pt" },
	{ label: "română", code: "ro", rtl: false },
	{ label: "shqip", code: "sq", rtl: false },
	{ label: "slovenčina", code: "sk", rtl: false },
	{ label: "suomi", code: "fi", rtl: false },
	{ label: "svenska", code: "sv", rtl: false },
	{ label: "Taqbaylit", code: "kab", rtl: false },
	{ label: "Tiếng Việt", code: "vi", rtl: false },
	{ label: "Türkçe", code: "tr", rtl: false },
	{ label: "Ελληνικά", code: "el", rtl: false },
	{ label: "беларуская", code: "be", rtl: false },
	{ label: "български", code: "bg", rtl: false },
	{ label: "русский", code: "ru", rtl: false },
	{ label: "українська", code: "uk", rtl: false },
	{ label: "հայերեն", code: "hy", rtl: false },
	{ label: "עברית", code: "he", rtl: true },
	{ label: "العربية", code: "ar", rtl: true },
	{ label: "فارسی", code: "fa", rtl: true },
	{ label: "کوردیی ناوەندی", code: "ckb", rtl: true },
	{ label: "हिन्दी", code: "hi", rtl: false },
	{ label: "বাংলা", code: "bn", rtl: false },
	{ label: "ਪੰਜਾਬੀ", code: "pa", rtl: false },
	{ label: "தமிழ்", code: "ta", rtl: false },
	{ label: "සිංහල", code: "si", rtl: false },
] as const;

export const LOCALE_CODES: readonly string[] = LOCALES.map((l) => l.code);

export const RTL_LOCALES: readonly string[] = LOCALES.filter((l) => l.rtl).map((l) => l.code);

export function isLocale(value: string): boolean {
	return LOCALE_CODES.includes(value);
}

export function localeDir(code: string): "ltr" | "rtl" {
	return RTL_LOCALES.includes(code) ? "rtl" : "ltr";
}

/** Fallback chain for a locale, ending at BASE_LOCALE. */
export function fallbackChain(code: string): string[] {
	const chain: string[] = [];
	let current: string | undefined = code;
	while (current && !chain.includes(current)) {
		chain.push(current);
		current = LOCALES.find((l) => l.code === current)?.fallback;
	}
	if (!chain.includes(BASE_LOCALE)) chain.push(BASE_LOCALE);
	return chain;
}
