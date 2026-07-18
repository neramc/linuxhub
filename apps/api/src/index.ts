import { ok } from "@linuxhub/shared";
import { Hono } from "hono";

export type Env = {
	DB: D1Database;
	KV_CACHE: KVNamespace;
	KV_RATE: KVNamespace;
	KV_GEO: KVNamespace;
	// Wrangler secrets (set in Phase 7): HCAPTCHA_SECRET, INTERNAL_API_TOKEN, RATE_SALT
};

const app = new Hono<{ Bindings: Env }>();

// Liveness — the only route without internal-token auth (.ai/backend-rules.md).
// D1/KV probes are added in Phase 5 alongside the real route surface.
app.get("/v1/health", (c) =>
	c.json(ok({ service: "linuxhub-api", status: "up", version: "0.1.0" })),
);

export default app;
