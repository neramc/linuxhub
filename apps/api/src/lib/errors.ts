// Typed errors and the single response envelope (.ai/api.md § "Errors").

import { type ApiErrorCode, ERROR_STATUS, err } from "@linuxhub/shared";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export class ApiError extends Error {
	constructor(
		readonly code: ApiErrorCode,
		message: string,
		readonly details?: unknown,
	) {
		super(message);
		this.name = "ApiError";
	}
}

export const notFound = (what: string) => new ApiError("NOT_FOUND", `${what} not found`);

/** Correlates a log line with the response a caller saw; never a stack trace. */
export function requestId(): string {
	return `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function fail(
	c: Context,
	code: ApiErrorCode,
	message: string,
	details?: unknown,
	id?: string,
) {
	return c.json(
		err(code, message, details, id ?? c.get("requestId")),
		ERROR_STATUS[code] as ContentfulStatusCode,
	);
}
