// Polite HTTP transport for ingestion, implementing the binding crawler policy
// in .ai/security.md: descriptive UA with a contact URL, ≤1 request/sec/host,
// timeouts, exponential backoff on 429/5xx, and conditional requests wherever
// the upstream supports them.
//
// Transport is an interface rather than a concrete fetch call because the two
// callers have different constraints: the Worker cron uses native `fetch`,
// while the local snapshot CLI has to shell out to curl (this container's
// HTTPS proxy breaks Bun's fetch — see .ai/handoff.md). Both satisfy
// `HttpClient`, so every fetcher works unchanged under either.

import { ingestUserAgent } from "./index";

export type HttpClient = {
	getText(url: string): Promise<string>;
	getJson<T>(url: string): Promise<T>;
	/**
	 * Content-Length of a resource, without downloading it.
	 *
	 * Some sources publish a checksum list and no sizes — Ubuntu's and Debian's
	 * `SHA256SUMS` are both like that — and a size is worth one cheap request
	 * against a file we are about to link people to. `null` when the upstream
	 * does not report one; never an estimate.
	 */
	head(url: string): Promise<number | null>;
};

/** Only what this client actually calls. Narrower than `typeof fetch`, whose
 *  extra members (`preconnect`) differ between the Bun and Workers type
 *  packages and would otherwise make the same code unbuildable in one of them. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Minimal KV-shaped store, so `http.ts` doesn't depend on Workers types. */
export type ConditionalStore = {
	get(key: string): Promise<string | null>;
	put(key: string, value: string, ttlSeconds: number): Promise<void>;
};

export type FetchClientOptions = {
	/** Contact origin baked into the User-Agent (.ai/security.md). */
	siteOrigin: string;
	/** Per-request timeout. */
	timeoutMs?: number;
	/** Minimum gap between two requests to the same host. */
	minHostIntervalMs?: number;
	/** Retries after the first attempt, on 429/5xx and network errors. */
	retries?: number;
	/** When present, ETag/Last-Modified are stored and replayed as conditional
	 *  request headers, so an unchanged resource costs upstream a 304. */
	store?: ConditionalStore;
	/** Cache lifetime for the conditional-request bookkeeping. */
	storeTtlSeconds?: number;
	/** Injected in tests; defaults to the runtime's global fetch. */
	fetchImpl?: FetchLike;
	/** Injected in tests so backoff doesn't actually sleep. */
	sleepImpl?: (ms: number) => Promise<void>;
};

const DEFAULTS = {
	timeoutMs: 30_000,
	minHostIntervalMs: 1_000,
	retries: 3,
	storeTtlSeconds: 6 * 60 * 60,
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type CachedResponse = { etag?: string; lastModified?: string; body: string };

/** A response the source will keep giving us — 404, 403, 410. Retrying it is
 *  pointless traffic, which the crawler policy in .ai/security.md forbids, so
 *  it escapes the retry loop instead of being swallowed by it. */
class NonRetryableError extends Error {}

export function createFetchClient(options: FetchClientOptions): HttpClient {
	const ua = ingestUserAgent(options.siteOrigin);
	const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
	const minHostIntervalMs = options.minHostIntervalMs ?? DEFAULTS.minHostIntervalMs;
	const retries = options.retries ?? DEFAULTS.retries;
	const storeTtl = options.storeTtlSeconds ?? DEFAULTS.storeTtlSeconds;
	const doFetch = options.fetchImpl ?? fetch;
	const doSleep = options.sleepImpl ?? sleep;

	// Serializes requests per host so we never exceed one per second to any one
	// upstream, however many fetchers run concurrently.
	const hostQueues = new Map<string, Promise<unknown>>();

	function paced<T>(host: string, work: () => Promise<T>): Promise<T> {
		const previous = hostQueues.get(host) ?? Promise.resolve();
		const next = previous
			.catch(() => undefined)
			.then(async () => {
				const result = await work();
				await doSleep(minHostIntervalMs);
				return result;
			});
		hostQueues.set(
			host,
			next.catch(() => undefined),
		);
		return next;
	}

	async function readCached(url: string): Promise<CachedResponse | null> {
		if (!options.store) return null;
		const raw = await options.store.get(cacheKey(url));
		if (!raw) return null;
		try {
			return JSON.parse(raw) as CachedResponse;
		} catch {
			return null;
		}
	}

	async function request(url: string): Promise<string> {
		const host = new URL(url).host;
		return paced(host, async () => {
			const cached = await readCached(url);
			let lastError: unknown;

			for (let attempt = 0; attempt <= retries; attempt++) {
				if (attempt > 0) await doSleep(2 ** attempt * 500);
				try {
					const headers: Record<string, string> = { "User-Agent": ua, Accept: "*/*" };
					if (cached?.etag) headers["If-None-Match"] = cached.etag;
					if (cached?.lastModified) headers["If-Modified-Since"] = cached.lastModified;

					const response = await doFetch(url, {
						headers,
						signal: AbortSignal.timeout(timeoutMs),
					});

					// Unchanged upstream: serve what we already have, cost them nothing.
					if (response.status === 304 && cached) return cached.body;

					if (response.status === 429 || response.status >= 500) {
						lastError = new Error(`${response.status} from ${url}`);
						continue;
					}
					if (!response.ok) throw new NonRetryableError(`${response.status} from ${url}`);

					const body = await response.text();
					if (options.store) {
						const etag = response.headers.get("etag") ?? undefined;
						const lastModified = response.headers.get("last-modified") ?? undefined;
						if (etag || lastModified) {
							await options.store.put(
								cacheKey(url),
								JSON.stringify({ etag, lastModified, body } satisfies CachedResponse),
								storeTtl,
							);
						}
					}
					return body;
				} catch (error) {
					if (error instanceof NonRetryableError) throw error;
					lastError = error;
				}
			}
			throw new Error(`fetch failed after ${retries + 1} attempts: ${url} (${lastError})`);
		});
	}

	/** Deliberately outside the retry/conditional machinery of `request`: a HEAD
	 *  carries no body to cache, and a size we fail to learn costs a display
	 *  detail rather than a row. Still paced like every other request. */
	async function head(url: string): Promise<number | null> {
		const host = new URL(url).host;
		return paced(host, async () => {
			try {
				const response = await doFetch(url, {
					method: "HEAD",
					headers: { "User-Agent": ua, Accept: "*/*" },
					signal: AbortSignal.timeout(timeoutMs),
				});
				if (!response.ok) return null;
				const length = Number(response.headers.get("content-length"));
				return Number.isFinite(length) && length > 0 ? length : null;
			} catch {
				return null;
			}
		});
	}

	return {
		getText: request,
		async getJson<T>(url: string): Promise<T> {
			return JSON.parse(await request(url)) as T;
		},
		head,
	};
}

/** KV keyspace for upstream fetch caching (.ai/database.md § "KV keyspaces"). */
export function cacheKey(url: string): string {
	return `versions:http:${url}`;
}
