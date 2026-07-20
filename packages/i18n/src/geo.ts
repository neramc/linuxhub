// Country → default locale mapping (.ai/i18n.md "Geo detection & redirect").
// Served from KV_GEO in Phase 5; this module is the maintained source table.
// Countries not listed default to the base locale; Accept-Language is the
// tiebreaker when no country is available.

import { BASE_LOCALE, isLocale } from "./registry";

export const COUNTRY_LOCALE: Record<string, string> = {
	KR: "ko",
	JP: "ja",
	CN: "zh-Hans",
	SG: "zh-Hans",
	TW: "zh-Hant",
	HK: "zh-Hant",
	MO: "zh-Hant",
	DE: "de",
	AT: "de",
	CH: "de",
	FR: "fr",
	BE: "fr",
	ES: "es",
	MX: "es",
	AR: "es",
	CO: "es",
	CL: "es",
	PE: "es",
	BR: "pt-BR",
	PT: "pt",
	IT: "it",
	NL: "nl",
	PL: "pl",
	CZ: "cs",
	SK: "sk",
	HU: "hu",
	RO: "ro",
	BG: "bg",
	GR: "el",
	HR: "hr",
	LT: "lt",
	EE: "et",
	FI: "fi",
	SE: "sv",
	NO: "nb",
	DK: "da",
	RU: "ru",
	BY: "be",
	UA: "uk",
	TR: "tr",
	AZ: "az",
	AM: "hy",
	IL: "he",
	IR: "fa",
	SA: "ar",
	AE: "ar",
	EG: "ar",
	MA: "ar",
	DZ: "ar",
	TN: "ar",
	JO: "ar",
	IQ: "ar",
	IN: "hi",
	BD: "bn",
	LK: "si",
	VN: "vi",
	ID: "id",
	PH: "fil",
	GB: "en-GB",
	IE: "en-GB",
};

export function localeForCountry(country: string | null | undefined): string | undefined {
	if (!country) return undefined;
	const locale = COUNTRY_LOCALE[country.toUpperCase()];
	return locale && isLocale(locale) ? locale : undefined;
}

/** Best registry match from an Accept-Language header, else undefined. */
export function localeFromAcceptLanguage(header: string | null | undefined): string | undefined {
	if (!header) return undefined;
	const tags = header
		.split(",")
		.map((part) => {
			const [tag, qPart] = part.trim().split(";q=");
			return { tag: tag?.trim() ?? "", q: qPart ? Number.parseFloat(qPart) : 1 };
		})
		.filter((t) => t.tag && !Number.isNaN(t.q))
		.sort((a, b) => b.q - a.q);
	for (const { tag } of tags) {
		if (isLocale(tag)) return tag;
		const base = tag.split("-")[0];
		if (base && isLocale(base)) return base;
	}
	return undefined;
}

export function detectLocale(
	country: string | null | undefined,
	acceptLanguage: string | null | undefined,
): string {
	return localeForCountry(country) ?? localeFromAcceptLanguage(acceptLanguage) ?? BASE_LOCALE;
}
