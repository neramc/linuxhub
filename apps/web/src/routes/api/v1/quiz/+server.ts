import { ok } from "@linuxhub/shared";
import { json } from "@sveltejs/kit";
import { QUIZ } from "$lib/server/data";
import type { RequestHandler } from "./$types";

// Distro-finder question set (.ai/api.md #49).
export const GET: RequestHandler = () => json(ok(QUIZ));
