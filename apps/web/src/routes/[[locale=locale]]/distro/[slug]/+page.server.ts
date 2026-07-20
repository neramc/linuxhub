import type { ApiResponse } from "@linuxhub/shared";
import { error } from "@sveltejs/kit";
import type { DetailPayload, Distro } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ fetch, params }) => {
	const res = await fetch(`/api/v1/distros/${params.slug}`);
	const body = (await res.json()) as ApiResponse<{ distro: Distro; detail: DetailPayload }>;
	if (!body.ok) {
		error(404, "distro not found");
	}
	return body.data;
};
