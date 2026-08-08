import { unwrap } from "$lib/server/api";
import type { PageServerLoad } from "./$types";

type Entry = {
	rank: number;
	slug: string;
	name: string;
	familyLine: string;
	color: string;
	initials: string;
	logo: string;
	trend: number;
	spark: string;
};

export const load: PageServerLoad = async ({ fetch }) => {
	const res = await fetch("/api/v1/rankings");
	return unwrap<{ entries: Entry[]; movers: Entry[] }>(
		res,
		{ entries: [], movers: [] },
		"rankings",
	);
};
