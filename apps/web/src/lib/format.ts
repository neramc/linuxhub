// Presentation helpers — the formatting the API stopped doing (ADR-0020).
//
// The Worker returns facts: a number for `downloads`, a `channel` plus an
// `lts` flag rather than "Long-term support release", an ISO date rather than
// a rendered one. Everything that turns those into text for a human belongs
// here, where it can see the active locale.

import { getLocale, m } from "@linuxhub/i18n";
import type { Release } from "@linuxhub/shared";

/** Locale-aware compact download count: 1200000 → "1.2M" in en, "120만" in ko. */
export function formatDownloads(count: number): string {
	return new Intl.NumberFormat(getLocale(), {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(count);
}

/** Locale-aware date. Invalid or empty input renders as an em dash rather than
 *  "Invalid Date", which is what a raw `new Date("")` would put on the page. */
export function formatDate(iso: string | null | undefined): string {
	if (!iso) return "—";
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "—";
	return new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium" }).format(date);
}

export function formatBytes(bytes: number | null | undefined): string {
	if (bytes === null || bytes === undefined) return "—";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`;
}

type ChannelFacts = Pick<Release, "channel" | "lts"> & { eol?: boolean };

/**
 * The one place a release channel becomes words.
 *
 * Precedence matters and is deliberate: a cycle that has passed its EOL date
 * reads as end-of-life whatever channel it shipped in, and LTS outranks plain
 * stable because it is the more specific claim.
 */
export function releaseChannelLabel(release: ChannelFacts): string {
	if (release.eol) return m.release_eol;
	if (release.channel === "rolling") return m.release_rolling;
	if (release.channel === "beta") return m.release_beta;
	if (release.lts) return m.release_lts;
	return m.release_stable;
}

/** "Fedora 44" — a proper noun and a version number, so no translation is
 *  involved; it is composed here only so no server sends it pre-built. */
export function releaseTitle(name: string, version: string): string {
	return `${name} ${version}`.trim();
}
