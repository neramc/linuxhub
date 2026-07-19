import { ok } from "@linuxhub/shared";
import { json } from "@sveltejs/kit";
import { DISTROS } from "$lib/server/data";
import type { RequestHandler } from "./$types";

// Rankings (.ai/api.md #32) — deterministic mock sparkline per distro.
function spark(seed: number, trend: number): string {
	const pts: string[] = [];
	for (let i = 0; i < 9; i++) {
		const wobble = ((seed * (i + 3)) % 5) - 2;
		const drift = trend === 0 ? 0 : -trend * (i / 8) * 8;
		const y = Math.min(21, Math.max(3, 12 + wobble + drift));
		pts.push(`${i * 11},${Math.round(y)}`);
	}
	return pts.join(" ");
}

export const GET: RequestHandler = () => {
	const entries = [...DISTROS]
		.sort((a, b) => a.rank - b.rank)
		.map((d, i) => ({
			rank: d.rank,
			slug: d.slug,
			name: d.name,
			familyLine: d.familyLine,
			color: d.color,
			initials: d.initials,
			trend: d.trend,
			spark: spark(d.slug.length + i, d.trend),
		}));
	const movers = [...entries]
		.filter((e) => e.trend !== 0)
		.sort((a, b) => Math.abs(b.trend) - Math.abs(a.trend))
		.slice(0, 3);
	return json(ok({ entries, movers }));
};
