// ---------------------------------------------------------------------------
// API envelope — canonical shape defined in .ai/api.md
// ---------------------------------------------------------------------------

export type ApiMeta = {
	page?: number;
	limit?: number;
	total?: number;
	next_cursor?: string | null;
};

export type ApiSuccess<T> = { ok: true; data: T; meta?: ApiMeta };

export type ApiErrorCode =
	| "VALIDATION_ERROR"
	| "NOT_FOUND"
	| "RATE_LIMITED"
	| "CAPTCHA_FAILED"
	| "UPSTREAM_ERROR"
	| "INTERNAL";

export type ApiFailure = {
	ok: false;
	error: {
		code: ApiErrorCode;
		message: string;
		details?: unknown;
		request_id?: string;
	};
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T, meta?: ApiMeta): ApiSuccess<T> {
	return meta === undefined ? { ok: true, data } : { ok: true, data, meta };
}

export function err(
	code: ApiErrorCode,
	message: string,
	details?: unknown,
	request_id?: string,
): ApiFailure {
	return {
		ok: false,
		error: {
			code,
			message,
			...(details !== undefined && { details }),
			...(request_id !== undefined && { request_id }),
		},
	};
}

export const ERROR_STATUS: Record<ApiErrorCode, number> = {
	VALIDATION_ERROR: 400,
	CAPTCHA_FAILED: 403,
	NOT_FOUND: 404,
	RATE_LIMITED: 429,
	UPSTREAM_ERROR: 502,
	INTERNAL: 500,
};

// Pagination lives in ./schemas alongside the query schemas that extend it,
// and is re-exported below — importing it back from here would make this
// module and ./schemas circular.

// ---------------------------------------------------------------------------
// Rate limits (per IP) — defined in .ai/security.md; changes update both
// ---------------------------------------------------------------------------

export const RATE_LIMITS = {
	write: { perMinute: 5, perDay: 30 },
	downloadsResolve: { perMinute: 30 },
	downloadsTrack: { perMinute: 30 },
	searchSuggest: { perMinute: 60 },
} as const;

// ---------------------------------------------------------------------------
// API schemas — entity shapes and query validation shared by the Worker and
// the BFF (.ai/frontend-contract.md, ADR-0020)
// ---------------------------------------------------------------------------

export * from "./schemas";
