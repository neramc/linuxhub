import type { Distro } from "@linuxhub/shared";
import { unwrapList } from "$lib/server/api";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ fetch, url }) => {
	const category = url.searchParams.get("category");
	const sort = url.searchParams.get("sort") ?? "popularity";
	const query = new URLSearchParams({ sort });
	if (category) query.set("category", category);
	const res = await fetch(`/api/v1/distros?${query}`);
	const { items, total } = await unwrapList<Distro>(res, "explore:distros");
	return { distros: items, total, category, sort };
};
