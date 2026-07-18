import { ok } from "@linuxhub/shared";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

// BFF liveness. From Phase 5 on, the BFF proxies /api/v1/* to the Worker with
// the internal service token (see .ai/architecture.md); health stays local.
export const GET: RequestHandler = () =>
	json(ok({ service: "linuxhub-web-bff", status: "up", version: "0.1.0" }));
