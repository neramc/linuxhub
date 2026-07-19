import { ok } from "@linuxhub/shared";
import { json } from "@sveltejs/kit";
import { DISTROS } from "$lib/server/data";
import type { RequestHandler } from "./$types";

// Catalog list (.ai/api.md #1) — mock-backed until Phase 5 proxies the Worker.
export const GET: RequestHandler = ({ url }) => {
	const sort = url.searchParams.get("sort") ?? "popularity";
	const category = url.searchParams.get("category");
	let list = [...DISTROS];
	if (category) list = list.filter((d) => d.categories.includes(category));
	list.sort(
		sort === "trending"
			? (a, b) => b.trend - a.trend
			: sort === "name"
				? (a, b) => a.name.localeCompare(b.name)
				: (a, b) => a.rank - b.rank,
	);
	return json(ok(list, { page: 1, limit: 24, total: list.length }));
};
