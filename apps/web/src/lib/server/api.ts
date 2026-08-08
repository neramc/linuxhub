// Reading a BFF envelope from a page loader.
//
// Every loader used to cast the parsed body straight to `ApiSuccess<T>` and
// read `.data`. That cast is a lie whenever the endpoint answers an error
// envelope — `.data` is `undefined`, the next `.slice`/`.map` throws, and the
// whole page becomes a 500. It is exactly the failure a misconfigured
// `INTERNAL_API_TOKEN` produces: the Worker answers 404 to everything, the BFF
// turns that into `UPSTREAM_ERROR`, and the site goes down rather than
// degrading. TypeScript could not catch it, because the cast asserted the
// problem away.

import type { ApiResponse } from "@linuxhub/shared";

/**
 * Unwraps an envelope, falling back rather than throwing.
 *
 * A page that can render with less should render with less: the nav, the
 * footer and the editorial content are still worth serving when the catalog is
 * briefly unavailable. The failure is logged with its code so it is diagnosable
 * from the Vercel logs, and `GET /api/v1/health` reports the same condition on
 * demand — degrading quietly is not the same as hiding.
 *
 * Use `error(404, …)` instead where the page genuinely cannot exist without the
 * data, as `distro/[slug]` does.
 */
export async function unwrap<T>(response: Response, fallback: T, what: string): Promise<T> {
	let body: ApiResponse<T> | null = null;
	try {
		body = (await response.json()) as ApiResponse<T>;
	} catch {
		// A non-JSON body means something in front of the route answered.
	}

	if (body?.ok) return body.data;

	console.log(
		JSON.stringify({
			ts: new Date().toISOString(),
			level: "error",
			msg: "BFF request failed, page degraded",
			what,
			status: response.status,
			code: body?.ok === false ? body.error.code : "NON_JSON",
		}),
	);
	return fallback;
}

/** `meta.total` when the endpoint reported one, else the page's own length —
 *  so a degraded list says "0 results" rather than claiming a total it lost. */
export async function unwrapList<T>(
	response: Response,
	what: string,
): Promise<{ items: T[]; total: number }> {
	let body: ApiResponse<T[]> | null = null;
	try {
		body = (await response.json()) as ApiResponse<T[]>;
	} catch {
		// as above
	}

	if (body?.ok) return { items: body.data, total: body.meta?.total ?? body.data.length };

	console.log(
		JSON.stringify({
			ts: new Date().toISOString(),
			level: "error",
			msg: "BFF request failed, page degraded",
			what,
			status: response.status,
			code: body?.ok === false ? body.error.code : "NON_JSON",
		}),
	);
	return { items: [], total: 0 };
}
