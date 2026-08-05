// Download endpoints (.ai/api.md #14, #15, #21). Routes stay thin: validate →
// service → envelope.

import { ok, RATE_LIMITS, resolveRequest, slugParam, trackRequest } from "@linuxhub/shared";
import { type Context, Hono } from "hono";
import { fail } from "../lib/errors";
import { clientAddress, rateLimit } from "../lib/rate-limit";
import type { App } from "../middleware";
import * as service from "../services/downloads";

export const downloads = new Hono<App>();

const MINUTE = 60;

/** Applies a per-IP limit, answering 429 with `Retry-After` when it bites.
 *  With no RATE_SALT configured — local dev and tests — limiting is skipped
 *  rather than run against a constant salt, which would be worse than nothing:
 *  a predictable salt makes the stored hashes reversible. */
async function limited(
	c: Context<App>,
	scope: string,
	perMinute: number,
): Promise<Response | null> {
	const salt = c.env.RATE_SALT;
	if (!salt) return null;

	const { allowed, retryAfter } = await rateLimit(
		c.env.KV_RATE,
		scope,
		clientAddress(c.req.raw),
		perMinute,
		MINUTE,
		salt,
	);
	if (allowed) return null;

	c.header("Retry-After", String(retryAfter));
	return fail(c, "RATE_LIMITED", "too many requests");
}

// #14 — the selector's whole decision tree
downloads.get("/distros/:slug/download-options", async (c) => {
	const parsed = slugParam.safeParse({ slug: c.req.param("slug") });
	if (!parsed.success) {
		return fail(c, "VALIDATION_ERROR", "invalid slug", parsed.error.issues);
	}
	return c.json(ok(await service.downloadOptions(c.env, parsed.data.slug)));
});

// #15 — selection → a direct URL with its checksum
downloads.post("/downloads/resolve", async (c) => {
	const limitedResponse = await limited(c, "dl-resolve", RATE_LIMITS.downloadsResolve.perMinute);
	if (limitedResponse) return limitedResponse;

	const body = await c.req.json().catch(() => null);
	const parsed = resolveRequest.safeParse(body);
	if (!parsed.success) {
		return fail(c, "VALIDATION_ERROR", "invalid body", parsed.error.issues);
	}
	return c.json(ok(await service.resolveDownload(c.env, parsed.data)));
});

// #21 — count a click. Fire-and-forget for the caller; a lost count is a lost
// count, and must never be able to fail the download the user came for.
downloads.post("/downloads/track", async (c) => {
	const limitedResponse = await limited(c, "dl-track", RATE_LIMITS.downloadsTrack.perMinute);
	if (limitedResponse) return limitedResponse;

	const body = await c.req.json().catch(() => null);
	const parsed = trackRequest.safeParse(body);
	if (!parsed.success) {
		return fail(c, "VALIDATION_ERROR", "invalid body", parsed.error.issues);
	}

	await service.trackDownload(c.env, parsed.data.artifact_id, parsed.data.mirror_id);
	return c.json(ok({ counted: true }));
});
