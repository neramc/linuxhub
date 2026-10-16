/**
 * "Popular today" sync (ADR-0013): ranks the active catalog by English
 * Wikipedia pageviews (people only, all access methods) on the latest
 * complete UTC day, keeping the day before's rank for movement arrows.
 *
 * - One request per article covers a 9-day window, so the latest day and the
 *   day before arrive together.
 * - No request at all when src/data/popularity.json already ranks the latest
 *   complete day for exactly the current catalog/mapping.
 * - The most-viewed article goes first: if Wikimedia has not published the
 *   latest day yet, the run stops after that one request.
 * - The ranked day is the newest one that most articles have data for, so a
 *   partly published day is not ranked from a handful of articles.
 * - One failing article never fails the run: it is left out and fetched again
 *   on the next run. Too many failures keep the previous file untouched.
 * - A time budget keeps a throttled run (429 + Retry-After) from pushing the
 *   shared workflow job into its timeout; articles not reached count as failed.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { type PopularityFile, popularityFileSchema } from "../../src/lib/data-schemas";
import {
  type ArticleViews,
  coversTargets,
  dailyViews,
  isCurrent,
  latestCompleteDay,
  newestDay,
  PAGEVIEWS_API,
  pageviewsUrl,
  rankingDay,
  rankPopularity,
  type Target,
} from "../../src/lib/popularity";
import { getJson, HttpError } from "./http";
import type { SyncContext } from "./source";
import { DATA_DIR, readPopularity, writePopularity } from "./store";
import { WIKIPEDIA_ARTICLES } from "./wikipedia-articles";

/** Stop asking after this many articles in a row failed (after the client's own retries). */
const MAX_CONSECUTIVE_FAILURES = 3;
/** Keep the previous file when more than this share of articles failed. */
const MAX_FAILED_SHARE = 0.25;
/** Stop starting new requests after this long; the rest count as failed. */
const MAX_DURATION_MS = 10 * 60_000;

export interface PopularityOutcome {
  result: "changed" | "unchanged" | "failed";
  detail: string;
}

/** Active catalog distros with a mapped article, in catalog slug order. */
export function popularityTargets(): Target[] {
  const dir = join(DATA_DIR, "..", "content", "distros");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .flatMap((f) => {
      const slug = f.replace(/\.yaml$/, "");
      const status = (parse(readFileSync(join(dir, f), "utf8")) as { status?: string } | null)
        ?.status;
      const article = WIKIPEDIA_ARTICLES[slug];
      return status !== "discontinued" && article ? [{ slug, article }] : [];
    });
}

function readPrevious(ctx: SyncContext): PopularityFile | undefined {
  try {
    return readPopularity();
  } catch (error) {
    ctx.log(
      `ignoring unreadable popularity.json: ${error instanceof Error ? error.message : error}`,
    );
    return undefined;
  }
}

export async function syncPopularity(
  ctx: SyncContext,
  options: { dryRun: boolean },
): Promise<PopularityOutcome> {
  const latest = latestCompleteDay(ctx.today);
  const prev = readPrevious(ctx);
  const targets = popularityTargets();
  if (targets.length === 0) return { result: "unchanged", detail: "no distro to rank" };
  if (isCurrent(prev, targets, latest))
    return { result: "unchanged", detail: `already ranks ${prev?.day}` };

  // Most-viewed first (by the previous ranking), so the first answer tells
  // whether Wikimedia has published the latest day yet.
  const prevRank = new Map(prev?.items.map((i) => [i.slug, i.rank]) ?? []);
  const order = (slug: string) => prevRank.get(slug) ?? Number.POSITIVE_INFINITY;
  const queue = [...targets].sort(
    (a, b) => order(a.slug) - order(b.slug) || a.slug.localeCompare(b.slug),
  );
  const onlyNewDayMatters = !!prev && coversTargets(prev, targets);

  const series: ArticleViews[] = [];
  const failed: string[] = [];
  const noData: string[] = [];
  let streak = 0;
  const deadline = Date.now() + MAX_DURATION_MS;
  for (const [index, target] of queue.entries()) {
    if (Date.now() > deadline) {
      const rest = queue.slice(index).map((t) => t.slug);
      failed.push(...rest);
      ctx.log(`out of time, not fetched: ${rest.join(", ")}`);
      break;
    }
    try {
      const data = await getJson<{ items?: { timestamp: string; views: number }[] }>(
        pageviewsUrl(target.article, latest),
        { noCache: true },
      );
      series.push({ ...target, views: dailyViews(data.items ?? []) });
      streak = 0;
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) {
        // The API answers 404 when an article has no views in the window (or no longer exists).
        noData.push(target.slug);
        ctx.log(`no pageviews for "${target.article}" (${target.slug}); check the mapping`);
        continue;
      }
      failed.push(target.slug);
      ctx.log(`${target.slug}: ${error instanceof Error ? error.message : error}`);
      if (++streak >= MAX_CONSECUTIVE_FAILURES)
        return {
          result: "failed",
          detail: `stopped after ${streak} failures in a row (${failed.join(", ")}); kept the previous ranking`,
        };
    }
    if (onlyNewDayMatters && series.length === 1) {
      const newest = newestDay(series, latest);
      if (prev && newest && newest <= prev.day)
        return {
          result: "unchanged",
          detail: `Wikimedia has not published ${latest} yet (newest: ${newest})`,
        };
    }
  }

  if (failed.length > targets.length * MAX_FAILED_SHARE)
    return {
      result: "failed",
      detail: `${failed.length}/${targets.length} articles failed (${failed.join(", ")}); kept the previous ranking`,
    };
  const day = rankingDay(series, latest);
  if (!day) return { result: "failed", detail: "no day in the window has data for most articles" };
  if (prev && day < prev.day)
    return { result: "failed", detail: `API data (${day}) is older than ours (${prev.day})` };

  const next = popularityFileSchema.parse({
    source: PAGEVIEWS_API,
    project: "en.wikipedia",
    day,
    items: rankPopularity(series, day),
  } satisfies PopularityFile);
  const notes = [
    failed.length ? `${failed.length} failed: ${failed.join(", ")}` : "",
    noData.length ? `no data: ${noData.join(", ")}` : "",
  ].filter(Boolean);
  const summary = `${day}, ${next.items.length} distros, top: ${next.items
    .slice(0, 3)
    .map((i) => i.slug)
    .join(", ")}${notes.length ? ` (${notes.join("; ")})` : ""}`;
  if (prev && JSON.stringify(prev) === JSON.stringify(next))
    return { result: "unchanged", detail: summary };
  if (!options.dryRun) writePopularity(next);
  return { result: "changed", detail: summary };
}
