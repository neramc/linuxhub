/**
 * Site-side access to the catalog and synced data. All functions run at build
 * time (static output).
 */
import { type CollectionEntry, getCollection, getEntry } from "astro:content";
import type {
  Artifact,
  Edition,
  HistoryEntry,
  PopularityFile,
  PopularityItem,
  Release,
  ReleasesFile,
} from "./data-schemas";
import {
  historyFileSchema,
  mirrorsFileSchema,
  popularityFileSchema,
  statusFileSchema,
} from "./data-schemas";
import { type Movement, movement, rerank, wikipediaUrl } from "./popularity";

export type Distro = CollectionEntry<"distros">;

let cache: Distro[] | undefined;

/** All distros in editorial order. */
export async function getDistros(): Promise<Distro[]> {
  cache ??= (await getCollection("distros")).sort((a, b) => a.data.order - b.data.order);
  return cache;
}

export async function getDistro(slug: string): Promise<Distro | undefined> {
  return (await getDistros()).find((d) => d.id === slug);
}

export async function getReleases(slug: string): Promise<ReleasesFile | undefined> {
  return (await getEntry("releases", slug))?.data;
}

/** The release to feature: newest non-beta (stable/lts/rolling), else the first one. */
export function featuredRelease(file: ReleasesFile | undefined): Release | undefined {
  if (!file) return undefined;
  return (
    file.releases.find((r) => r.channel !== "beta" && r.channel !== "testing") ?? file.releases[0]
  );
}

/** The default edition + artifact to offer: first edition, prefer x86_64 ISO. */
export function defaultArtifact(
  release: Release | undefined,
): { edition: Edition; artifact: Artifact } | undefined {
  const edition = release?.editions[0];
  if (!edition) return undefined;
  const artifact =
    edition.artifacts.find((a) => a.arch === "x86_64" && a.format === "iso") ??
    edition.artifacts.find((a) => a.arch === "x86_64") ??
    edition.artifacts[0];
  return artifact ? { edition, artifact } : undefined;
}

const mirrorFiles = import.meta.glob("/src/data/mirrors/*.json", {
  eager: true,
  import: "default",
});

export function getMirrors(slug: string) {
  const raw = mirrorFiles[`/src/data/mirrors/${slug}.json`];
  return raw ? mirrorsFileSchema.parse(raw) : undefined;
}

export function mirrorSlugs(): string[] {
  return Object.keys(mirrorFiles).map((p) => p.replace(/^.*\/|\.json$/g, ""));
}

const historyRaw = import.meta.glob("/src/data/history.json", { eager: true, import: "default" });
const statusRaw = import.meta.glob("/src/data/status.json", { eager: true, import: "default" });

export function getHistory() {
  return historyFileSchema.parse(Object.values(historyRaw)[0] ?? []);
}

export function getStatus() {
  return statusFileSchema.parse(Object.values(statusRaw)[0] ?? {});
}

const popularityRaw = import.meta.glob("/src/data/popularity.json", {
  eager: true,
  import: "default",
});

/** The raw "popular today" file (ADR-0013), or undefined before the first sync. */
export function getPopularity(): PopularityFile | undefined {
  const raw = Object.values(popularityRaw)[0];
  return raw ? popularityFileSchema.parse(raw) : undefined;
}

/** A catalog distro joined with its place in the "popular today" ranking. */
export interface PopularDistro extends PopularityItem {
  distro: Distro;
  /** The English Wikipedia article the views were counted on (for attribution). */
  articleUrl: string;
  /** Change since the day before; `delta` > 0 means it climbed that many places. */
  movement: Movement;
  delta: number;
}

export interface PopularToday {
  /** UTC day (YYYY-MM-DD) the views were counted on, normally yesterday. */
  day: string;
  /** Wikimedia Pageviews API endpoint (pageview data is CC0). */
  source: string;
  /** Wikipedia edition, always "en.wikipedia". */
  project: string;
  /** Most viewed first; ranks are re-numbered 1..n over the distros the site shows. */
  items: PopularDistro[];
}

/**
 * The top `limit` distros by English Wikipedia pageviews on the latest synced
 * day, or undefined when there is no ranking. Slugs missing from the catalog
 * or discontinued are dropped and the rest re-ranked, so ranks have no gaps.
 */
export async function getPopular(limit = 10): Promise<PopularToday | undefined> {
  const file = getPopularity();
  if (!file) return undefined;
  const distros = new Map((await getDistros()).map((d) => [d.id, d]));
  const shown = rerank(
    file.items.filter((i) => distros.get(i.slug)?.data.status === "active"),
  ).slice(0, Math.max(0, limit));
  const items = shown.flatMap((item) => {
    const distro = distros.get(item.slug);
    return distro
      ? [{ ...item, distro, articleUrl: wikipediaUrl(item.article), ...movement(item) }]
      : [];
  });
  return items.length
    ? { day: file.day, source: file.source, project: file.project, items }
    : undefined;
}

export function formatBytes(bytes: number | null, locale: string): string | null {
  if (!bytes) return null;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} ${units[unit]}`;
}

export function formatDate(
  iso: string | null,
  locale: string,
  style: "long" | "medium" = "long",
): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: style, timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

type DocEntry = CollectionEntry<"distroDocs">;
let docs: Map<string, DocEntry> | undefined;

/** A distro document (overview/install) in a locale, or undefined when not written yet. */
export async function getDistroDoc(slug: string, locale: string, doc: "overview" | "install") {
  docs ??= new Map((await getCollection("distroDocs")).map((e) => [e.id, e]));
  return docs.get(`${slug}/${locale}/${doc}`);
}

/**
 * The release series of a version: the last component is dropped from
 * three-part versions ("26.04.1" → "26.04", "3.24.2" → "3.24"); shorter
 * versions are their own series ("44", "22.3").
 */
export function releaseSeries(version: string): string {
  const parts = version.split(".");
  return parts.length >= 3 ? parts.slice(0, 2).join(".") : version;
}

/** One row of release news, standing for every release it groups. */
export interface ReleaseGroup {
  /** Official release date (YYYY-MM-DD) shared by everything in the group. */
  date: string;
  /** The distro the row is about (the parent when flavors are grouped). */
  distro: Distro;
  /** Newest first: the lead version, then other series it shipped that day. */
  versions: string[];
  channel: HistoryEntry["channel"];
  /** Other catalog distros that shipped the same series that day (e.g. Ubuntu flavors), by name. */
  flavors: Distro[];
}

const byVersionDesc = (a: string, b: string) =>
  b.localeCompare(a, "en", { numeric: true, sensitivity: "base" });

/**
 * Release history as rows for people (home "new releases", /releases/):
 * - only the newest point release of a series per distro and month is kept
 *   (26.04 and 26.04.1 in the same month → one row);
 * - releases on the same day collapse into one row: other series of the same
 *   distro become extra versions, and flavors of the same series (one based on
 *   the other, or on the same parent) join their parent's row.
 * Newest first. The RSS feed keeps one item per version and does not use this.
 */
export function groupReleases(
  history: readonly HistoryEntry[],
  distros: readonly Distro[],
): ReleaseGroup[] {
  const bySlug = new Map(distros.map((d) => [d.id, d]));
  const newest = new Map<string, HistoryEntry & { distro: Distro }>();
  for (const entry of history) {
    const distro = bySlug.get(entry.slug);
    if (!distro) continue;
    const key = `${entry.slug}|${releaseSeries(entry.version)}|${entry.date.slice(0, 7)}`;
    const seen = newest.get(key);
    if (!seen || byVersionDesc(entry.version, seen.version) < 0)
      newest.set(key, { ...entry, distro });
  }
  // Parents before their flavors on the same day, so the parent leads the row.
  const depth = (d: Distro) => {
    let n = 0;
    for (let up = d.data.basedOn; up && n < 10; up = bySlug.get(up)?.data.basedOn ?? null) n++;
    return n;
  };
  const entries = [...newest.values()].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      depth(a.distro) - depth(b.distro) ||
      a.distro.data.order - b.distro.data.order ||
      byVersionDesc(a.version, b.version),
  );

  const related = (a: Distro, b: Distro) =>
    a.data.basedOn === b.id ||
    b.data.basedOn === a.id ||
    (a.data.basedOn !== null && a.data.basedOn === b.data.basedOn);

  const groups: ReleaseGroup[] = [];
  let day: ReleaseGroup[] = [];
  for (const entry of entries) {
    if (day[0]?.date !== entry.date) day = [];
    const { distro, version } = entry;
    const own = day.find((g) => g.distro.id === distro.id);
    if (own) {
      own.versions.push(version);
      continue;
    }
    if (day.some((g) => g.flavors.includes(distro))) continue;
    const parent = day.find(
      (g) =>
        releaseSeries(g.versions[0] ?? "") === releaseSeries(version) &&
        [g.distro, ...g.flavors].some((m) => related(m, distro)),
    );
    if (parent) {
      parent.flavors.push(distro);
      continue;
    }
    const group: ReleaseGroup = {
      date: entry.date,
      distro,
      versions: [version],
      channel: entry.channel,
      flavors: [],
    };
    day.push(group);
    groups.push(group);
  }

  for (const group of groups) {
    group.flavors.sort((a, b) => a.data.name.localeCompare(b.data.name, "en"));
  }
  return groups;
}

/** The first `limit` groups, at most one row per distro (flavors count as shown). */
export function latestReleaseGroups(
  groups: readonly ReleaseGroup[],
  limit: number,
): ReleaseGroup[] {
  const shown = new Set<string>();
  const rows: ReleaseGroup[] = [];
  for (const group of groups) {
    if (rows.length >= limit) break;
    const members = [group.distro, ...group.flavors].map((d) => d.id);
    if (members.some((id) => shown.has(id))) continue;
    for (const id of members) shown.add(id);
    rows.push(group);
  }
  return rows;
}

/** The distros for the home slider (ADR-0013/0014). */
export interface TodaysDistros {
  /** true: ranked by yesterday's Wikipedia pageviews; false: editorial picks (no ranks). */
  ranked: boolean;
  /** UTC day the pageviews were counted on (ranked only). */
  day?: string | undefined;
  items: Distro[];
}

/**
 * Editorial picks for a day: active distros in editorial order, `limit` at a
 * time, moving on by `limit` every UTC day (wrapping around the catalog).
 */
export function editorialPicks(distros: readonly Distro[], limit: number, now: Date): Distro[] {
  const active = distros.filter((d) => d.data.status === "active");
  if (active.length === 0) return [];
  const count = Math.min(Math.max(0, limit), active.length);
  const day = Math.floor(now.getTime() / 86_400_000);
  const start = (day * count) % active.length;
  return Array.from({ length: count }, (_, i) => active[(start + i) % active.length]).filter(
    (d): d is Distro => d !== undefined,
  );
}

/**
 * The top `limit` distros of the "popular today" ranking, or, before the
 * first popularity sync, editorial picks that change with the build day.
 */
export async function getTodaysDistros(limit = 5, now = new Date()): Promise<TodaysDistros> {
  const popular = await getPopular(limit);
  if (popular) return { ranked: true, day: popular.day, items: popular.items.map((p) => p.distro) };
  return { ranked: false, items: editorialPicks(await getDistros(), limit, now) };
}
