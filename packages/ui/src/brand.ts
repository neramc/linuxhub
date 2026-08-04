// Distro brand presentation.
//
// ADR-0020: the API returns facts, and presentation is derived client-side.
// A brand colour has no upstream source to fetch and an initial is trivially
// derived from a name, so neither belongs in D1 — they live here, next to the
// components that render them.
//
// Colours are read from each project's own brand asset (the SVG logos in
// `assets/distros/`, whose provenance and licence are recorded per file in
// `assets/distros/ATTRIBUTION.md`). They are identity, not data: recolouring a
// project's mark is exactly what the trademark guidance in
// `.ai/data-sources.md` tells us not to do.

/** Slug → the project's own primary brand colour. */
export const BRAND_COLOR: Record<string, string> = {
	ubuntu: "#e95420",
	fedora: "#51a2da",
	"linux-mint": "#69b53f",
	arch: "#1793d1",
	debian: "#a81d33",
	opensuse: "#73ba25",
	manjaro: "#35bf5c",
	"pop-os": "#48b9c7",
	nixos: "#5277c3",
	zorin: "#15a6f0",
	elementary: "#64baff",
	endeavouros: "#7f3fbf",
};

/** Neutral fill for a distro we have no brand asset for. Deliberately a token
 *  rather than a literal, so it follows the theme like everything else. */
export const BRAND_FALLBACK = "var(--color-accent-fill)";

export function brandColor(slug: string): string {
	return BRAND_COLOR[slug] ?? BRAND_FALLBACK;
}

/**
 * Marks that no rule derives, because they are abbreviations a project chose
 * rather than anything readable off its name. Kept deliberately tiny: an entry
 * here is a maintenance cost for every future distro, so add one only when the
 * derived initial is actually wrong rather than merely different.
 */
const INITIALS_OVERRIDE: Record<string, string> = {
	// "M" would collide with Linux Mint in the same grid.
	Manjaro: "Mj",
};

/**
 * Logo-tile fallback text, derived from the display name (ADR-0020).
 *
 * A rule rather than a table, so a distro added tomorrow needs no maintenance.
 * The cases below are the ones a naive "first character" would get wrong, and
 * together they reproduce every initial the catalog previously hard-coded.
 */
export function initials(name: string): string {
	const trimmed = name.trim();
	if (trimmed.length === 0) return "?";

	const override = INITIALS_OVERRIDE[trimmed];
	if (override) return override;

	// "Pop!_OS" → "P!": punctuation inside the first word is part of the mark.
	const punctuated = trimmed.match(/^(\p{L})\p{L}*(\p{P})/u);
	if (punctuated) return `${punctuated[1]}${punctuated[2]}`;

	// "openSUSE" → "oS": a lowercase start with an internal capital is a
	// deliberate lowercase brand, so carry both letters rather than flattening it.
	const camel = trimmed.match(/^(\p{Ll})\p{Ll}*(\p{Lu})/u);
	if (camel) return `${camel[1]}${camel[2]}`;

	// "Linux Mint" → "M": when the first word is "Linux" the distinguishing one
	// is the second, otherwise the first ("Arch Linux" → "A").
	const words = trimmed.split(/\s+/);
	const distinguishing = /^linux$/i.test(words[0] ?? "") ? (words[1] ?? words[0]) : words[0];
	return (distinguishing ?? trimmed).charAt(0);
}

/** "US" → 🇺🇸 (regional indicator pair); null when no country is known. */
export function flagEmoji(countryCode: string | null | undefined): string | null {
	if (countryCode?.length !== 2) return null;
	return String.fromCodePoint(
		...[...countryCode.toUpperCase()].map((ch) => 0x1f1a5 + ch.charCodeAt(0)),
	);
}
