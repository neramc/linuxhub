import type { ApiSuccess } from "@linuxhub/shared";
import type { Distro } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ fetch, url }) => {
	const q = url.searchParams.get("q") ?? "";
	const res = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}`);
	const body = (await res.json()) as ApiSuccess<Distro[]>;
	return { q, results: body.data, total: body.meta?.total ?? body.data.length };
};
