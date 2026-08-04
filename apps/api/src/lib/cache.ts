// KV read-through cache (.ai/backend-rules.md § "Caching").
//
// Every cacheable service goes through `cached()`, so the cache is impossible
// to bypass by calling a db/ module directly from a route.

/**
 * Cache keys embed a generation counter that ingestion bumps whenever it
 * changes a distro, so updates invalidate naturally and nothing ever needs
 * manual purging (.ai/architecture.md § "Caching strategy").
 *
 * `all` is the catalog-wide generation, used by list and search keys that no
 * single distro owns.
 */
export async function generation(kv: KVNamespace, slug = "all"): Promise<string> {
	return (await kv.get(`gen:${slug}`)) ?? "0";
}

export async function cached<T>(
	kv: KVNamespace,
	key: string,
	ttlSeconds: number,
	fetcher: () => Promise<T>,
): Promise<T> {
	const hit = await kv.get(key, "json");
	if (hit !== null) return hit as T;

	const value = await fetcher();
	// A cache write must never fail a read that already succeeded.
	try {
		await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
	} catch {
		// Losing a cache write costs a repeat query, nothing more.
	}
	return value;
}

/** Stable, order-independent hash of a validated query object, so two requests
 *  that differ only in parameter order share one cache entry. */
export function hashQuery(query: Record<string, unknown>): string {
	const canonical = Object.keys(query)
		.filter((k) => query[k] !== undefined)
		.sort()
		.map((k) => `${k}=${String(query[k])}`)
		.join("&");

	// FNV-1a: short, dependency-free, and collisions only ever cost a stale
	// cache entry inside a TTL window — this is not a security boundary.
	let hash = 0x811c9dc5;
	for (let i = 0; i < canonical.length; i++) {
		hash ^= canonical.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(36);
}

/** TTLs from .ai/database.md § "KV keyspaces". */
export const TTL = {
	list: 300,
	detail: 3600,
	rankings: 600,
} as const;
