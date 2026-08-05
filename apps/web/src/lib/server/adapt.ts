// Snapshot → facts adapter.
//
// While task 5.4 is in flight the BFF has two sources: the Worker, and the
// committed snapshot in `data.ts` for deploys with no Worker configured. They
// must emit **one** shape, or every page would need to know which branch it
// got — so the snapshot is adapted up to the shared `Distro` here, in one
// place, rather than each route doing it slightly differently.
//
// This file dies with `data.ts` in task 5.7.

import type { Distro } from "@linuxhub/shared";
import { HOMEPAGES, type Distro as SnapshotDistro } from "./data";

const MULTIPLIER: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9 };

/**
 * "1.2M" → 1200000. The snapshot stores downloads pre-formatted, which is the
 * exact defect ADR-0020 removes from the API; parsing it back is the price of
 * keeping the fallback shape-compatible until the snapshot goes away.
 */
export function parseCompact(value: string): number {
	const match = value.trim().match(/^([\d.]+)\s*([KMB])?$/i);
	if (!match) return 0;
	const amount = Number.parseFloat(match[1] ?? "0");
	if (Number.isNaN(amount)) return 0;
	return Math.round(amount * (MULTIPLIER[(match[2] ?? "").toUpperCase()] ?? 1));
}

export function toSharedDistro(d: SnapshotDistro): Distro {
	return {
		slug: d.slug,
		name: d.name,
		summary: d.summary,
		family: d.family,
		// The snapshot never carried a machine-readable parent — `familyLine` was
		// prose. Lineage arrives with the Wikidata step, which is blocked on QIDs
		// (.ai/data-sources.md), so the honest value here is "unknown".
		based_on: null,
		homepage: HOMEPAGES[d.slug] ?? "",
		status: "active",
		logo: d.logo,
		categories: d.categories,
		tags: [],
		desktops: [],
		downloads: parseCompact(d.downloads),
		rank: d.rank,
		trend: d.trend,
		latest_release: null,
	};
}
