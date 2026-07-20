import type { ApiSuccess } from "@linuxhub/shared";
import type { Distro, QUIZ } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ fetch }) => {
	const [quizRes, distroRes] = await Promise.all([fetch("/api/v1/quiz"), fetch("/api/v1/distros")]);
	const quiz = ((await quizRes.json()) as ApiSuccess<typeof QUIZ>).data;
	const distros = ((await distroRes.json()) as ApiSuccess<Distro[]>).data;
	return { quiz, distros };
};
