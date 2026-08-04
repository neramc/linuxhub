import { type Distro, ok, searchQuery } from "@linuxhub/shared";
import { json } from "@sveltejs/kit";
import { toSharedDistro } from "$lib/server/adapt";
import { DISTROS } from "$lib/server/data";
import { CACHE, callWorker, workerConfigured } from "$lib/server/worker";
import type { RequestHandler } from "./$types";

// Search (.ai/api.md #22).
export const GET: RequestHandler = async ({ fetch, url }) => {
	const raw = url.searchParams.get("q") ?? "";

	// An empty query is a legitimate state — the search page and the command
	// palette both render before anyone types — so it answers with an empty
	// result set rather than the VALIDATION_ERROR the Worker's schema would
	// (correctly) raise for a missing `q`.
	if (raw.trim().length === 0) {
		return json(ok([] as Distro[], { total: 0 }), { headers: { "Cache-Control": CACHE.search } });
	}

	if (workerConfigured()) {
		const parsed = searchQuery.safeParse(Object.fromEntries(url.searchParams));
		if (!parsed.success) {
			return json(ok([] as Distro[], { total: 0 }), {
				headers: { "Cache-Control": CACHE.search },
			});
		}
		const upstream = await callWorker<Distro[]>(
			`/v1/search?q=${encodeURIComponent(parsed.data.q)}&limit=${parsed.data.limit}`,
			fetch,
		);
		if (!upstream.ok) return json(upstream, { status: 502 });
		return json(ok(upstream.data, upstream.meta), { headers: { "Cache-Control": CACHE.search } });
	}

	// Snapshot fallback — the contains-match equivalent of the LIKE strategy
	// (ADR-0010) the Worker runs in SQL.
	const q = raw.trim().toLowerCase();
	const results = DISTROS.filter(
		(d) =>
			d.name.toLowerCase().includes(q) ||
			d.summary.toLowerCase().includes(q) ||
			d.familyLine.toLowerCase().includes(q),
	).map(toSharedDistro);

	return json(ok(results, { total: results.length }), {
		headers: { "Cache-Control": CACHE.search },
	});
};
