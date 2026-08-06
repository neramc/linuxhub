// Cross-cutting middleware (.ai/backend-rules.md).

import type { Context, ErrorHandler, MiddlewareHandler, NotFoundHandler } from "hono";
import type { Env } from "../env";
import { ApiError, fail, requestId } from "../lib/errors";

export type Vars = { requestId: string };
export type App = { Bindings: Env; Variables: Vars };

/** Structured JSON logs, one line per request. No PII, no raw IPs, no secrets
 *  (.ai/backend-rules.md § "Logging"). */
export const withLogging: MiddlewareHandler<App> = async (c, next) => {
	const id = requestId();
	c.set("requestId", id);
	const started = Date.now();
	await next();
	console.log(
		JSON.stringify({
			ts: new Date().toISOString(),
			level: c.res.status >= 500 ? "error" : "info",
			request_id: id,
			route: new URL(c.req.url).pathname,
			status: c.res.status,
			ms: Date.now() - started,
		}),
	);
};

/**
 * Response headers for the internal surface (.ai/security.md § "Headers",
 * which specifies them for *both* apps).
 *
 * This one only ever returns JSON to the BFF, so the policy is the strictest
 * one there is: `default-src 'none'` says nothing on this origin may load
 * anything, which is exactly right for a surface no browser should be
 * rendering. If a response from here is ever being displayed, something has
 * gone wrong, and this makes that failure inert rather than exploitable.
 */
const SECURITY_HEADERS: Record<string, string> = {
	"Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
	"Strict-Transport-Security": "max-age=63072000; includeSubDomains",
	"Referrer-Policy": "no-referrer",
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
};

export const withSecurityHeaders: MiddlewareHandler<App> = async (c, next) => {
	await next();
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		c.header(name, value);
	}
};

/**
 * Converts thrown `ApiError`s to the envelope; anything else becomes an opaque
 * INTERNAL, logged with its request_id. Stack traces never leak.
 *
 * Registered with `app.onError`, not as try/catch middleware: Hono's composer
 * hands a thrown error straight to the error handler, so a middleware wrapping
 * `next()` never sees it and the client gets Hono's default plain-text 500.
 */
export const onError: ErrorHandler<App> = (error, c: Context<App>) => {
	if (error instanceof ApiError) {
		return fail(c, error.code, error.message, error.details);
	}
	console.error(
		JSON.stringify({
			ts: new Date().toISOString(),
			level: "error",
			request_id: c.get("requestId"),
			route: new URL(c.req.url).pathname,
			msg: String(error),
		}),
	);
	return fail(c, "INTERNAL", "internal error");
};

/** Unknown routes answer in the same envelope as everything else, so the BFF
 *  has exactly one response shape to parse. */
export const onNotFound: NotFoundHandler<App> = (c) => fail(c, "NOT_FOUND", "not found");

/** Constant-time comparison, so a wrong token cannot be found byte by byte. */
function tokensMatch(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

/**
 * The Worker is internal: only the BFF may call it, carrying
 * `X-Internal-Token` (.ai/security.md § "Internal surface"). `/v1/health` is
 * exempt so liveness works before secrets are configured.
 *
 * With no token configured — local dev and tests, where wrangler.toml holds
 * placeholder ids and no secrets exist — the check is skipped. It cannot be
 * skipped in production, because Phase 7 provisions the secret.
 *
 * A bad token answers 404 rather than 403: the error taxonomy in .ai/api.md
 * has no auth code, and an internal surface should not confirm it exists to
 * anything that cannot already call it. The log line below carries the real
 * reason, so a misconfigured token is still diagnosable rather than looking
 * like a missing distro.
 */
export const withInternalAuth: MiddlewareHandler<App> = async (c, next) => {
	const expected = c.env.INTERNAL_API_TOKEN;
	if (!expected) return next();
	if (c.req.path === "/v1/health") return next();

	const presented = c.req.header("X-Internal-Token");
	if (!presented || !tokensMatch(presented, expected)) {
		console.warn(
			JSON.stringify({
				ts: new Date().toISOString(),
				level: "warn",
				request_id: c.get("requestId"),
				route: c.req.path,
				msg: presented ? "internal token mismatch" : "internal token missing",
			}),
		);
		throw new ApiError("NOT_FOUND", "not found");
	}
	return next();
};
