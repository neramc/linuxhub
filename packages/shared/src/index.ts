import { z } from "zod";

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

// ---------------------------------------------------------------------------
// Pagination — defaults defined in .ai/api.md
// ---------------------------------------------------------------------------

export const PAGINATION = { defaultLimit: 24, maxLimit: 100 } as const;

export const paginationSchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(PAGINATION.maxLimit).default(PAGINATION.defaultLimit),
});

// ---------------------------------------------------------------------------
// Rate limits (per IP) — defined in .ai/security.md; changes update both
// ---------------------------------------------------------------------------

export const RATE_LIMITS = {
	write: { perMinute: 5, perDay: 30 },
	downloadsResolve: { perMinute: 30 },
	downloadsTrack: { perMinute: 30 },
	searchSuggest: { perMinute: 60 },
} as const;
