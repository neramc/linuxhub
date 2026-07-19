import type { ApiSuccess } from "@linuxhub/shared";
import type { HALL_OF_FAME } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ fetch }) => {
	const res = await fetch("/api/v1/hall-of-fame");
	const body = (await res.json()) as ApiSuccess<typeof HALL_OF_FAME>;
	return { entries: body.data };
};
