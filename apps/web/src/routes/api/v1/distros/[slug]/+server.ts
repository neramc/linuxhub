import { err, ok } from "@linuxhub/shared";
import { json } from "@sveltejs/kit";
import { DISTROS, FEDORA_DETAIL, getDistro } from "$lib/server/data";
import type { RequestHandler } from "./$types";

// Distro detail (.ai/api.md #2) — fedora carries full mock content; other
// slugs reuse the same shape with their own identity so every page renders.
export const GET: RequestHandler = ({ params }) => {
	const distro = getDistro(params.slug);
	if (!distro) {
		return json(err("NOT_FOUND", "distro not found"), { status: 404 });
	}
	const related = FEDORA_DETAIL.related
		.filter((slug) => slug !== distro.slug)
		.map((slug) => getDistro(slug))
		.filter((d) => d !== undefined)
		.slice(0, 3);
	const detail = {
		...FEDORA_DETAIL,
		summary: distro.slug === "fedora" ? FEDORA_DETAIL.summary : distro.summary,
		badges: { ...FEDORA_DETAIL.badges, family: distro.familyLine },
		related,
	};
	return json(ok({ distro, detail }));
};
