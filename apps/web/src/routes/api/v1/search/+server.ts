import { ok } from "@linuxhub/shared";
import { json } from "@sveltejs/kit";
import { DISTROS } from "$lib/server/data";
import type { RequestHandler } from "./$types";

// Search (.ai/api.md #22) — simple contains-match over name/summary/family,
// matching the LIKE strategy of ADR-0010 until Phase 5.
export const GET: RequestHandler = ({ url }) => {
	const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
	const results = q
		? DISTROS.filter(
				(d) =>
					d.name.toLowerCase().includes(q) ||
					d.summary.toLowerCase().includes(q) ||
					d.familyLine.toLowerCase().includes(q),
			)
		: [];
	return json(ok(results, { total: results.length }));
};
