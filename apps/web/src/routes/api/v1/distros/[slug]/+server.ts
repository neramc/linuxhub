import { err, ok } from "@linuxhub/shared";
import { json } from "@sveltejs/kit";
import { DISTROS, getDetailFor, getDistro } from "$lib/server/data";
import type { RequestHandler } from "./$types";

// Distro detail (.ai/api.md #2) — releases/mirrors come from the committed
// live snapshot; related distros are the closest neighbors in the same family.
export const GET: RequestHandler = ({ params }) => {
	const distro = getDistro(params.slug);
	if (!distro) {
		return json(err("NOT_FOUND", "distro not found"), { status: 404 });
	}
	const detail = getDetailFor(distro);
	detail.related = DISTROS.filter((d) => d.slug !== distro.slug)
		.sort((a, b) => {
			const aFam = a.family === distro.family ? 0 : 1;
			const bFam = b.family === distro.family ? 0 : 1;
			return aFam - bFam || a.rank - b.rank;
		})
		.slice(0, 3);
	return json(ok({ distro, detail }));
};
