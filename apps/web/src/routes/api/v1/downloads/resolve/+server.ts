import { type DownloadResolution, ERROR_STATUS, err, ok } from "@linuxhub/shared";
import { json } from "@sveltejs/kit";
import { callWorker, clientAddressOf, workerConfigured } from "$lib/server/worker";
import type { RequestHandler } from "./$types";

// Selection → a direct mirror URL with its checksum (.ai/api.md #15).
//
// Never cached at the edge: the answer depends on the caller's country and on
// which mirrors are healthy right now, and a shared cache would pin one
// visitor's mirror onto everyone behind the same POP. The Worker caches the
// artifact lookup itself, which is the expensive half.
export const POST: RequestHandler = async ({ fetch, request, getClientAddress }) => {
	if (!workerConfigured()) {
		return json(err("UPSTREAM_ERROR", "downloads are unavailable"), { status: 502 });
	}

	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body || typeof body !== "object") {
		return json(err("VALIDATION_ERROR", "invalid body"), { status: 400 });
	}

	// Geo comes from the edge, not from the client: a country in the request
	// body would let anyone pick any mirror by claiming to be there. An explicit
	// `mirror_id` is how a visitor overrides the choice, and that one is checked
	// against the artifact upstream.
	const country = request.headers.get("x-vercel-ip-country");
	const payload = { ...body, country: country ?? undefined };

	const upstream = await callWorker<DownloadResolution>("/v1/downloads/resolve", fetch, {
		body: payload,
		clientAddress: clientAddressOf(getClientAddress),
	});
	if (!upstream.ok) {
		return json(upstream, { status: ERROR_STATUS[upstream.error.code] });
	}

	return json(ok(upstream.data), { headers: { "Cache-Control": "no-store" } });
};
