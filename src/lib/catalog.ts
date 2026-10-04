/**
 * Site-side access to the catalog and synced data. All functions run at build
 * time (static output).
 */
import { type CollectionEntry, getCollection, getEntry } from "astro:content";
import type {
  Artifact,
  Edition,
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
