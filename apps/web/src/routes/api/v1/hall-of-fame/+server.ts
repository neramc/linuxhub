import { ok } from "@linuxhub/shared";
import { json } from "@sveltejs/kit";
import { HALL_OF_FAME } from "$lib/server/data";
import type { RequestHandler } from "./$types";

// Hall of Fame (.ai/api.md #35) — editorial entries with cited rationale.
export const GET: RequestHandler = () => json(ok(HALL_OF_FAME));
