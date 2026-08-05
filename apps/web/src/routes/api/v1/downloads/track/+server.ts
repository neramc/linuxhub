import { ok } from "@linuxhub/shared";
import { json } from "@sveltejs/kit";
import { callWorker, clientAddressOf, workerConfigured } from "$lib/server/worker";
import type { RequestHandler } from "./$types";

// Count a download click (.ai/api.md #21).
//
// This endpoint always answers 200. A click is a measurement, and a
// measurement that can fail the thing it measures is worse than a lost count:
// the browser fires this alongside the navigation to the file, so an error here
// would surface as a broken download for no gain. Failures are logged instead.
export const POST: RequestHandler = async ({ fetch, request, getClientAddress }) => {
	const counted = { counted: false };
	if (!workerConfigured()) return json(ok(counted));

	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body) return json(ok(counted));

	try {
		const upstream = await callWorker<{ counted: boolean }>("/v1/downloads/track", fetch, {
			body,
			clientAddress: clientAddressOf(getClientAddress),
		});
		return json(ok({ counted: upstream.ok }));
	} catch (error) {
		console.log(
			JSON.stringify({
				ts: new Date().toISOString(),
				level: "warn",
				msg: "download click not counted",
				detail: String(error),
			}),
		);
		return json(ok(counted));
	}
};
