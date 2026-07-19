import type { ApiSuccess } from "@linuxhub/shared";
import type { PageServerLoad } from "./$types";

type Entry = {
	rank: number;
	slug: string;
	name: string;
	familyLine: string;
	color: string;
	initials: string;
	trend: number;
	spark: string;
};

export const load: PageServerLoad = async ({ fetch }) => {
	const res = await fetch("/api/v1/rankings");
	const body = (await res.json()) as ApiSuccess<{ entries: Entry[]; movers: Entry[] }>;
	return body.data;
};
