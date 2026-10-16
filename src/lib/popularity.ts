/**
 * "Popular today" ranking from English Wikipedia pageviews (ADR-0013).
 * Pure functions shared by the sync (scripts/sync/popularity.ts) and the
 * site (src/lib/catalog.ts); no I/O here.
 */
import type { PopularityFile, PopularityItem } from "./data-schemas";

/** Wikimedia Pageviews REST API, per article: English Wikipedia, all access methods, people only. */
export const PAGEVIEWS_API =
  "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/";

/** Days fetched per article in one request: the latest complete day plus a week of slack. */
export const PAGEVIEWS_WINDOW_DAYS = 9;

const DAY_MS = 86_400_000;

/** `iso` (YYYY-MM-DD) shifted by `days`, in UTC. */
export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The newest day with complete daily pageviews: the UTC day before `today`. */
export function latestCompleteDay(today: string): string {
  return addDays(today, -1);
}

/** YYYY-MM-DD → YYYYMMDD (the Pageviews API date format). */
export function apiDate(iso: string): string {
  return iso.replaceAll("-", "");
}

/** Article title → URL path segment ("Pop!_OS", "Tails_(operating_system)"). */
export function titleSegment(article: string): string {
  return encodeURIComponent(article.replaceAll(" ", "_"));
}

export function wikipediaUrl(article: string): string {
  return `https://en.wikipedia.org/wiki/${titleSegment(article)}`;
}

/** Daily pageviews URL for one article, `days` days ending on `latest` (inclusive). */
export function pageviewsUrl(
  article: string,
  latest: string,
  days = PAGEVIEWS_WINDOW_DAYS,
): string {
  const start = addDays(latest, -(days - 1));
  return `${PAGEVIEWS_API}${titleSegment(article)}/daily/${apiDate(start)}/${apiDate(latest)}`;
}

/** A catalog distro the sync ranks: active, with a mapped Wikipedia article. */
export interface Target {
  slug: string;
  article: string;
}

/** Does `file` rank exactly these targets (same slugs, same articles)? */
export function coversTargets(file: PopularityFile, targets: readonly Target[]): boolean {
  if (file.items.length !== targets.length) return false;
  const want = new Map(targets.map((t) => [t.slug, t.article]));
  return file.items.every((i) => want.get(i.slug) === i.article);
}

/**
 * True when `file` already ranks `latest` (or a later day) for exactly the
 * current targets, so the sync can stop before sending any request. A
 * missing article (failed fetch, new catalog entry, changed mapping) makes
 * the next run fetch again.
 */
export function isCurrent(
  file: PopularityFile | undefined,
  targets: readonly Target[],
  latest: string,
): boolean {
  return !!file && file.day >= latest && coversTargets(file, targets);
}

/** Pageviews API items → views per ISO day ({ "2026-10-03": 1115 }). */
export function dailyViews(
  items: readonly { timestamp: string; views: number }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(item.timestamp);
    if (m && Number.isInteger(item.views) && item.views >= 0)
      out[`${m[1]}-${m[2]}-${m[3]}`] = item.views;
  }
  return out;
}

/** One article's daily views, keyed by ISO day. */
export interface ArticleViews {
  slug: string;
  article: string;
  views: Record<string, number>;
}

/** Newest day (not after `latest`) that any series has data for, or null. */
export function newestDay(series: readonly ArticleViews[], latest: string): string | null {
  let best: string | null = null;
  for (const s of series)
    for (const day of Object.keys(s.views)) if (day <= latest && (!best || day > best)) best = day;
  return best;
}

/**
 * The day to rank: the newest day (not after `latest`) that more than half of
 * the series have data for. A day Wikimedia has only partly published falls
 * back to the day before instead of ranking just the few articles it covers.
 */
export function rankingDay(series: readonly ArticleViews[], latest: string): string | null {
  const counts = new Map<string, number>();
  for (const s of series)
    for (const day of Object.keys(s.views))
      if (day <= latest) counts.set(day, (counts.get(day) ?? 0) + 1);
  let best: string | null = null;
  for (const [day, n] of counts) if (n * 2 > series.length && (!best || day > best)) best = day;
  return best;
}

const byViews = (a: { slug: string; v: number }, b: { slug: string; v: number }) =>
  b.v - a.v || a.slug.localeCompare(b.slug);

/**
 * Ranks the articles that have data on `day` by views (desc, ties by slug).
 * `prevRank` is the rank on the day before among those same articles, so a
 * filtered ranking can be re-numbered consistently with `rerank`.
 */
export function rankPopularity(series: readonly ArticleViews[], day: string): PopularityItem[] {
  const prevDay = addDays(day, -1);
  const ranked = series
    .flatMap((s) => {
      const v = s.views[day];
      return v === undefined
        ? []
        : [{ slug: s.slug, article: s.article, v, prev: s.views[prevDay] }];
    })
    .sort(byViews);
  const prevRank = new Map(
    ranked
      .flatMap((r) => (r.prev === undefined ? [] : [{ slug: r.slug, v: r.prev }]))
      .sort(byViews)
      .map((r, i) => [r.slug, i + 1]),
  );
  return ranked.map((r, i) => ({
    slug: r.slug,
    article: r.article,
    views: r.v,
    rank: i + 1,
    prevRank: prevRank.get(r.slug) ?? null,
  }));
}

/**
 * Re-numbers a subset of a ranking (e.g. after dropping distros that left the
 * catalog) so `rank` and `prevRank` stay contiguous from 1 and keep their order.
 */
export function rerank<T extends Pick<PopularityItem, "slug" | "rank" | "prevRank">>(
  items: readonly T[],
): T[] {
  const ordered = [...items].sort((a, b) => a.rank - b.rank || a.slug.localeCompare(b.slug));
  const prev = new Map(
    ordered
      .filter((i) => i.prevRank !== null)
      .sort((a, b) => (a.prevRank ?? 0) - (b.prevRank ?? 0))
      .map((i, n) => [i.slug, n + 1]),
  );
  return ordered.map((i, n) => ({ ...i, rank: n + 1, prevRank: prev.get(i.slug) ?? null }));
}

export type Movement = "up" | "down" | "same" | "new";

/** Change since the previous day: `delta` > 0 means it climbed that many places. */
export function movement(item: Pick<PopularityItem, "rank" | "prevRank">): {
  movement: Movement;
  delta: number;
} {
  if (item.prevRank === null) return { movement: "new", delta: 0 };
  const delta = item.prevRank - item.rank;
  return { movement: delta > 0 ? "up" : delta < 0 ? "down" : "same", delta };
}

/** Internal consistency of a popularity file (order, contiguous ranks, unique slugs). */
export function popularityProblems(file: PopularityFile): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  file.items.forEach((item, i) => {
    if (seen.has(item.slug)) problems.push(`${item.slug} is listed twice`);
    seen.add(item.slug);
    if (item.rank !== i + 1) problems.push(`${item.slug} has rank ${item.rank}, expected ${i + 1}`);
    const next = file.items[i + 1];
    if (next && byViews({ slug: item.slug, v: item.views }, { slug: next.slug, v: next.views }) > 0)
      problems.push(`${next.slug} is out of order (views desc, then slug)`);
  });
  const prev = file.items
    .map((i) => i.prevRank)
    .filter((r): r is number => r !== null)
    .sort((a, b) => a - b);
  if (prev.some((r, i) => r !== i + 1)) problems.push("prevRank values are not 1..n");
  return problems;
}
