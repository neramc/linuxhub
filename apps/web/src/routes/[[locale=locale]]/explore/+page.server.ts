import type { ApiSuccess, Distro } from "@linuxhub/shared";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ fetch, url }) => {
	const category = url.searchParams.get("category");
	const sort = url.searchParams.get("sort") ?? "popularity";
	const query = new URLSearchParams({ sort });
	if (category) query.set("category", category);
	const res = await fetch(`/api/v1/distros?${query}`);
	const body = (await res.json()) as ApiSuccess<Distro[]>;
	return { distros: body.data, total: body.meta?.total ?? body.data.length, category, sort };
};
