import { ok } from "@linuxhub/shared";
import { json } from "@sveltejs/kit";
import { getDistro, RECENT_RELEASES } from "$lib/server/data";
import type { RequestHandler } from "./$types";

// Cross-distro recent releases (.ai/api.md #12).
export const GET: RequestHandler = () => {
	const rows = RECENT_RELEASES.map((r) => ({ ...r, distro: getDistro(r.slug) }));
	return json(ok(rows, { next_cursor: null }));
};
