import { ok } from "@linuxhub/shared";
import { Hono } from "hono";
import { runScheduled } from "./cron";
import type { Env } from "./env";

export type { Env };

const app = new Hono<{ Bindings: Env }>();

// Liveness — the only route without internal-token auth (.ai/backend-rules.md).
// D1/KV probes are added in Phase 5 alongside the real route surface.
app.get("/v1/health", (c) =>
	c.json(ok({ service: "linuxhub-api", status: "up", version: "0.1.0" })),
);

export default {
	fetch: app.fetch,
	// Cron Triggers (.ai/backend-rules.md § "Ingestion"). waitUntil keeps the
	// invocation alive for the whole pass; a schedule that throws is logged by
	// the runtime and retried on its next tick.
	scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(
			runScheduled(controller.cron, env, new Date(controller.scheduledTime)).then((summary) => {
				console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", ...summary }));
			}),
		);
	},
} satisfies ExportedHandler<Env>;

export { app };
