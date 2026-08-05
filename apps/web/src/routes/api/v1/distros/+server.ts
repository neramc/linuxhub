import { type Distro, err, ok } from "@linuxhub/shared";
import { json } from "@sveltejs/kit";
import { toSharedDistro } from "$lib/server/adapt";
import { DISTROS } from "$lib/server/data";
import { CACHE, callWorker, workerConfigured } from "$lib/server/worker";
import type { RequestHandler } from "./$types";

// Catalog list (.ai/api.md #1).
export const GET: RequestHandler = async ({ fetch, url }) => {
	if (workerConfigured()) {
		// `trending` is not a Worker sort: it only ever meant "order by the
		// invented trend column", and there is no trend until we have download
		// signals of our own (5.6). Map it to the default rather than handing the
		// Worker a value its schema rejects.
		const query = new URLSearchParams(url.searchParams);
		if (query.get("sort") === "trending") query.set("sort", "popularity");

		const upstream = await callWorker<Distro[]>(`/v1/distros?${query}`, fetch);
		if (!upstream.ok) {
			return json(err("UPSTREAM_ERROR", "catalog is unavailable"), { status: 502 });
		}
		return json(ok(upstream.data, upstream.meta), { headers: { "Cache-Control": CACHE.list } });
	}

	// Snapshot fallback.
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

	return json(ok(list.map(toSharedDistro), { page: 1, limit: 24, total: list.length }), {
		headers: { "Cache-Control": CACHE.list },
	});
};
