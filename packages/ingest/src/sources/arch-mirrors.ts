// Arch Linux official mirror status JSON.
// Registered in .ai/data-sources.md (verified 2026-07-19: official status
// endpoint). Carries per-mirror health scores, which is why Arch mirrors get
// real `healthy` values while sources without health data default to healthy.

import type { HttpClient } from "../http";
import type { Fetched, LiveMirror } from "../types";

export const ARCH_MIRRORS_SOURCE = "archlinux.org/mirrors/status";
export const ARCH_MIRRORS_URL = "https://archlinux.org/mirrors/status/json/";

/** How many mirrors we keep — the picker shows a shortlist, not the full set. */
export const MIRROR_LIMIT = 8;

export type ArchMirror = {
	url: string;
	protocol: string;
	country: string;
	country_code: string;
	/** Lower is better; null means Arch has no recent measurement. */
	score: number | null;
	completion_pct: number | null;
	active: boolean;
};

export function normalizeArchMirrors(mirrors: ArchMirror[]): LiveMirror[] {
	return mirrors
		.filter((m) => m.active && m.protocol === "https" && m.completion_pct === 1 && m.score !== null)
		.sort((a, b) => (a.score ?? 99) - (b.score ?? 99))
		.slice(0, MIRROR_LIMIT)
		.map((m) => ({
			name: new URL(m.url).hostname,
			url: m.url,
			country: m.country,
			countryCode: m.country_code,
			note: `score ${m.score?.toFixed(1)} · https`,
		}));
}

export async function fetchArchMirrors(
	http: HttpClient,
	now = new Date(),
): Promise<Fetched<LiveMirror[]>> {
	const body = await http.getJson<{ urls: ArchMirror[] }>(ARCH_MIRRORS_URL);
	return {
		sourceUrl: ARCH_MIRRORS_URL,
		fetchedAt: now.toISOString(),
		data: normalizeArchMirrors(body.urls),
	};
}
