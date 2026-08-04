// Worker bindings (.ai/backend-rules.md § "Runtime"). Kept in its own module so
// route, cron, and db code can share the type without importing the Hono app.

export type Env = {
	DB: D1Database;
	KV_CACHE: KVNamespace;
	KV_RATE: KVNamespace;
	KV_GEO: KVNamespace;
	// Wrangler secrets (set in Phase 7): HCAPTCHA_SECRET, INTERNAL_API_TOKEN, RATE_SALT
	HCAPTCHA_SECRET?: string;
	INTERNAL_API_TOKEN?: string;
	RATE_SALT?: string;
	/** Origin used in the ingest User-Agent's contact URL (.ai/security.md). */
	SITE_ORIGIN?: string;
};
