// endoflife.date — release cycles, release dates, EOL dates, LTS flags.
// Registered in .ai/data-sources.md (verified 2026-07-19: public JSON API
// intended for programmatic use, no auth). Authoritative for versions; the
// announcement feeds are for links, never for version data.

import type { HttpClient } from "../http";
import type { Fetched, LiveRelease } from "../types";

export const ENDOFLIFE_SOURCE = "endoflife.date";

/** How many cycles we keep per distro — the detail page shows a version table,
 *  not a full history. */
export const CYCLE_LIMIT = 6;

export function endoflifeUrl(product: string): string {
	return `https://endoflife.date/api/${product}.json`;
}

export type EolCycle = {
	cycle: string;
	releaseDate?: string;
	/** ISO date, or `false` for "no EOL announced" (rolling/current). */
	eol?: string | boolean;
	latest?: string;
	lts?: boolean;
	codename?: string;
};

export function normalizeCycles(cycles: EolCycle[], today: string): LiveRelease[] {
	return cycles.slice(0, CYCLE_LIMIT).map((c) => {
		const eol = typeof c.eol === "string" ? c.eol : undefined;
		return {
			cycle: c.cycle,
			latest: c.latest,
			codename: c.codename,
			releaseDate: c.releaseDate,
			eol,
			lts: c.lts === true,
			supported: c.eol === false || (eol !== undefined && eol > today),
		};
	});
}

export async function fetchReleaseCycles(
	http: HttpClient,
	product: string,
	now = new Date(),
): Promise<Fetched<LiveRelease[]>> {
	const sourceUrl = endoflifeUrl(product);
	const cycles = await http.getJson<EolCycle[]>(sourceUrl);
	return {
		sourceUrl,
		fetchedAt: now.toISOString(),
		data: normalizeCycles(cycles, now.toISOString().slice(0, 10)),
	};
}
