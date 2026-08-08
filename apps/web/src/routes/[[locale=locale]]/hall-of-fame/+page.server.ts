import { unwrap } from "$lib/server/api";
import type { HALL_OF_FAME } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ fetch }) => {
	const res = await fetch("/api/v1/hall-of-fame");
	const entries = await unwrap<typeof HALL_OF_FAME>(
		res,
		[] as unknown as typeof HALL_OF_FAME,
		"hall-of-fame",
	);
	return { entries };
};
