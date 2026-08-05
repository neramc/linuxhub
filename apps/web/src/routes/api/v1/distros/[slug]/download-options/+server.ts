import { type DownloadOptions, err, ok } from "@linuxhub/shared";
import { json } from "@sveltejs/kit";
import { CACHE, callWorker, workerConfigured } from "$lib/server/worker";
import type { RequestHandler } from "./$types";

// The selector's decision tree (.ai/api.md #14).
//
// There is no snapshot fallback: `data.ts` has no artifact paths, sizes or
// checksums — it never did — so with no Worker configured the honest answer is
// an empty matrix, and the page keeps the placeholder rendering it shipped
// with rather than being handed a selection that cannot resolve.
export const GET: RequestHandler = async ({ fetch, params }) => {
	if (!workerConfigured()) {
		return json(ok({ slug: params.slug, versions: [], mirrors: [] } satisfies DownloadOptions), {
			headers: { "Cache-Control": CACHE.detail },
		});
	}

	const upstream = await callWorker<DownloadOptions>(
		`/v1/distros/${encodeURIComponent(params.slug)}/download-options`,
		fetch,
	);
	if (!upstream.ok) {
		// A distro with no artifacts sourced yet is a 404 upstream, which is not
		// a page error — the distro exists, its downloads do not yet.
		if (upstream.error.code === "NOT_FOUND") {
			return json(ok({ slug: params.slug, versions: [], mirrors: [] } satisfies DownloadOptions), {
				headers: { "Cache-Control": CACHE.detail },
			});
		}
		return json(err("UPSTREAM_ERROR", "download options are unavailable"), { status: 502 });
	}

	return json(ok(upstream.data), { headers: { "Cache-Control": CACHE.detail } });
};
