// KV fixed-window rate limiting (.ai/security.md § "Rate limiting").
//
// Raw IPs are never stored or logged. The key holds a salted hash, so the KV
// contents are useless to anyone who reads them and we never hold the address
// itself beyond the length of a request.

export type RateLimitResult = {
	allowed: boolean;
	/** Seconds until the current window rolls over — the `Retry-After` value. */
	retryAfter: number;
};

/**
 * Which client a request belongs to.
 *
 * The Worker's own `CF-Connecting-IP` is the *BFF's* address, not the user's —
 * the BFF is the only thing that ever calls it, so limiting on that would
 * throttle the whole site as one client. The BFF forwards the real address in
 * `X-Client-IP`, which is trustworthy precisely because the internal token
 * already gates who can set it.
 */
export function clientAddress(request: Request): string {
	return (
		request.headers.get("X-Client-IP") ??
		request.headers.get("CF-Connecting-IP") ??
		// No address at all (local dev, tests): everything shares one bucket,
		// which is the safe direction to fail.
		"unknown"
	);
}

async function hashAddress(address: string, salt: string): Promise<string> {
	const data = new TextEncoder().encode(`${salt}:${address}`);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return [...new Uint8Array(digest)]
		.slice(0, 12)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Fixed window, not a sliding one: a counter per `windowSeconds` bucket, which
 * KV expires on its own. A sliding window would need either a read-modify-write
 * of a timestamp list or a Durable Object, and neither is worth it to make the
 * boundary behaviour slightly fairer on an endpoint whose limit exists to stop
 * scripted abuse rather than to meter anything.
 */
export async function rateLimit(
	kv: KVNamespace,
	scope: string,
	address: string,
	limit: number,
	windowSeconds: number,
	salt: string,
): Promise<RateLimitResult> {
	const now = Math.floor(Date.now() / 1000);
	const window = Math.floor(now / windowSeconds);
	const key = `rl:${scope}:${await hashAddress(address, salt)}:${window}`;
	const retryAfter = windowSeconds - (now % windowSeconds);

	const current = Number.parseInt((await kv.get(key)) ?? "0", 10);
	if (current >= limit) return { allowed: false, retryAfter };

	// Racy by construction: two concurrent requests can both read the same
	// count. The overshoot is bounded by concurrency and this is a throttle,
	// not an accounting system — paying for a Durable Object to close it would
	// cost more than the requests it would prevent.
	await kv.put(key, String(current + 1), { expirationTtl: windowSeconds + 60 });
	return { allowed: true, retryAfter };
}
