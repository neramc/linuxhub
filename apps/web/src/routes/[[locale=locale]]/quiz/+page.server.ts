import { unwrap } from "$lib/server/api";
import type { Distro, QUIZ } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ fetch }) => {
	const [quizRes, distroRes] = await Promise.all([fetch("/api/v1/quiz"), fetch("/api/v1/distros")]);
	const quiz = await unwrap<typeof QUIZ>(quizRes, [] as unknown as typeof QUIZ, "quiz:questions");
	const distros = await unwrap<Distro[]>(distroRes, [], "quiz:distros");
	return { quiz, distros };
};
