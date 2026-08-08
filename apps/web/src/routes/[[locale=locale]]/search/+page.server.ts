import type { Distro } from "@linuxhub/shared";
import { unwrapList } from "$lib/server/api";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ fetch, url }) => {
	const q = url.searchParams.get("q") ?? "";
	const res = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}`);
	const { items, total } = await unwrapList<Distro>(res, "search:results");
	return { q, results: items, total };
};
