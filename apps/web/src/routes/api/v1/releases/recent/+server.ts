import { type ApiMeta, ok, type RecentRelease } from "@linuxhub/shared";
import { json } from "@sveltejs/kit";
import { getDistro, RECENT_RELEASES } from "$lib/server/data";
import { CACHE, callWorker, workerConfigured } from "$lib/server/worker";
import type { RequestHandler } from "./$types";

// Cross-distro recent releases (.ai/api.md #12).
//
// The shape changed with this move, on purpose. It used to return
// `title: "Fedora 44"` and `subtitle: "Long-term support release"` — English
// composed on the server, which no amount of locale routing could translate.
// It now returns facts (`name`, `version`, `channel`, `lts`) and the page
// composes the label through @linuxhub/i18n (ADR-0020).
export const GET: RequestHandler = async ({ fetch, url }) => {
	const limit = url.searchParams.get("limit") ?? "10";

	if (workerConfigured()) {
		const upstream = await callWorker<RecentRelease[]>(
			`/v1/releases/recent?limit=${encodeURIComponent(limit)}`,
			fetch,
		);
		if (!upstream.ok) return json(upstream, { status: 502 });
		return json(ok(upstream.data, upstream.meta), {
			headers: { "Cache-Control": CACHE.list },
		});
	}

	// Snapshot fallback — same shape, so the page cannot tell the two apart.
	const rows: RecentRelease[] = RECENT_RELEASES.map((r) => {
		const distro = getDistro(r.slug);
		return {
			slug: r.slug,
			name: distro?.name ?? r.slug,
			version: r.title.replace(`${distro?.name ?? ""} `, ""),
			channel: "stable" as const,
			lts: r.subtitle.toLowerCase().includes("long-term"),
			released_at: r.date,
			notes_url: null,
		};
	}).slice(0, Number(limit) || 10);

	const meta: ApiMeta = { limit: Number(limit) || 10, next_cursor: null };
	return json(ok(rows, meta), { headers: { "Cache-Control": CACHE.list } });
};
