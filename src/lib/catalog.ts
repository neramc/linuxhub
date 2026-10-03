/**
 * Site-side access to the catalog and synced data. All functions run at build
 * time (static output).
 */
import { type CollectionEntry, getCollection, getEntry } from "astro:content";
import type { Artifact, Edition, Release, ReleasesFile } from "./data-schemas";
import { historyFileSchema, mirrorsFileSchema, statusFileSchema } from "./data-schemas";

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
