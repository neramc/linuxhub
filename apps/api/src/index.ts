import { Hono } from "hono";
import { runScheduled } from "./cron";
import type { Env } from "./env";
import { type App, onError, onNotFound, withInternalAuth, withLogging } from "./middleware";
import { distros } from "./routes/distros";
import { downloads } from "./routes/downloads";
import { health } from "./routes/health";

export type { Env };

const app = new Hono<App>();

app.onError(onError);
app.notFound(onNotFound);

app.use("*", withLogging);
app.use("*", withInternalAuth);

app.route("/v1", health);
app.route("/v1", distros);
app.route("/v1", downloads);

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
