// Routes stay thin: validate → service → envelope. No SQL, no business rules
// (.ai/backend-rules.md § "Worked example").

import {
	distroListQuery,
	ok,
	rankingsQuery,
	recentReleasesQuery,
	releaseListQuery,
	searchQuery,
	slugParam,
} from "@linuxhub/shared";
import { Hono } from "hono";
import { fail } from "../lib/errors";
import type { App } from "../middleware";
import * as service from "../services/distros";

export const distros = new Hono<App>();

/** Every route validates with `safeParse`, so a Zod error is never thrown at a
 *  client — it becomes a VALIDATION_ERROR envelope listing the issues. */
function parseSlug(c: { req: { param: (k: string) => string } }) {
	return slugParam.safeParse({ slug: c.req.param("slug") });
}

// #1 — catalog list
distros.get("/distros", async (c) => {
	const parsed = distroListQuery.safeParse(c.req.query());
	if (!parsed.success) {
		return fail(c, "VALIDATION_ERROR", "invalid query", parsed.error.issues);
	}
	const { data, total } = await service.listDistros(c.env, parsed.data);
	return c.json(ok(data, { page: parsed.data.page, limit: parsed.data.limit, total }));
});

// #22 — search
distros.get("/search", async (c) => {
	const parsed = searchQuery.safeParse(c.req.query());
	if (!parsed.success) {
		return fail(c, "VALIDATION_ERROR", "invalid query", parsed.error.issues);
	}
	const { data, total } = await service.searchDistros(c.env, parsed.data);
	return c.json(ok(data, { page: parsed.data.page, limit: parsed.data.limit, total }));
});

// #12 — cross-distro recent releases, cursor-paginated
distros.get("/releases/recent", async (c) => {
	const parsed = recentReleasesQuery.safeParse(c.req.query());
	if (!parsed.success) {
		return fail(c, "VALIDATION_ERROR", "invalid query", parsed.error.issues);
	}
	const { data, nextCursor } = await service.recentReleases(
		c.env,
		parsed.data.limit,
		parsed.data.cursor,
	);
	return c.json(ok(data, { limit: parsed.data.limit, next_cursor: nextCursor }));
});

// #32 — popularity ranking snapshot (+ the biggest movers, #34)
distros.get("/rankings", async (c) => {
	const parsed = rankingsQuery.safeParse(c.req.query());
	if (!parsed.success) {
		return fail(c, "VALIDATION_ERROR", "invalid query", parsed.error.issues);
	}
	const result = await service.rankings(c.env, parsed.data.period, parsed.data.limit);
	return c.json(ok(result, { total: result.entries.length }));
});

// #35 — Hall of Fame
distros.get("/hall-of-fame", async (c) => {
	const entries = await service.hallOfFame(c.env);
	return c.json(ok(entries, { total: entries.length }));
});

// #2 — distro detail
distros.get("/distros/:slug", async (c) => {
	const parsed = parseSlug(c);
	if (!parsed.success) {
		return fail(c, "VALIDATION_ERROR", "invalid slug", parsed.error.issues);
	}
	return c.json(ok(await service.getDistroDetail(c.env, parsed.data.slug)));
});

// #3 — releases for one distro
distros.get("/distros/:slug/releases", async (c) => {
	const parsed = parseSlug(c);
	if (!parsed.success) {
		return fail(c, "VALIDATION_ERROR", "invalid slug", parsed.error.issues);
	}
	const query = releaseListQuery.safeParse(c.req.query());
	if (!query.success) {
		return fail(c, "VALIDATION_ERROR", "invalid query", query.error.issues);
	}
	const releases = await service.listReleasesFor(c.env, parsed.data.slug, query.data.channel);
	return c.json(ok(releases, { total: releases.length }));
});

// #37 — rank history, the series the client draws a sparkline from
distros.get("/distros/:slug/rank-history", async (c) => {
	const parsed = parseSlug(c);
	if (!parsed.success) {
		return fail(c, "VALIDATION_ERROR", "invalid slug", parsed.error.issues);
	}
	const query = rankingsQuery.safeParse(c.req.query());
	if (!query.success) {
		return fail(c, "VALIDATION_ERROR", "invalid query", query.error.issues);
	}
	const points = await service.rankHistory(c.env, parsed.data.slug, query.data.period);
	return c.json(ok(points, { total: points.length }));
});
