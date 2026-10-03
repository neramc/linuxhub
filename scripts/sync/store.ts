/**
 * Reads/writes src/data/**. Output is deterministic (fixed key order from the
 * schemas, sorted arrays) so a run only produces a git diff when facts change.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type HistoryEntry,
  historyFileSchema,
  type MirrorsFile,
  mirrorsFileSchema,
  type ReleasesFile,
  releasesFileSchema,
  type StatusFile,
  statusFileSchema,
} from "../../src/lib/data-schemas";

export const DATA_DIR = join(import.meta.dir, "..", "..", "src", "data");
export const releasesPath = (slug: string) => join(DATA_DIR, "releases", `${slug}.json`);
export const mirrorsPath = (slug: string) => join(DATA_DIR, "mirrors", `${slug}.json`);
export const HISTORY_PATH = join(DATA_DIR, "history.json");
export const STATUS_PATH = join(DATA_DIR, "status.json");

function readJson(path: string): unknown {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function readReleases(slug: string): ReleasesFile | undefined {
  const raw = readJson(releasesPath(slug));
  return raw === undefined ? undefined : releasesFileSchema.parse(raw);
}

export function readMirrors(slug: string): MirrorsFile | undefined {
  const raw = readJson(mirrorsPath(slug));
  return raw === undefined ? undefined : mirrorsFileSchema.parse(raw);
}

export function readHistory(): HistoryEntry[] {
  return historyFileSchema.parse(readJson(HISTORY_PATH) ?? []);
}

export function readStatus(): StatusFile {
  return statusFileSchema.parse(readJson(STATUS_PATH) ?? {});
}

/** Same content ignoring the `updated` stamp? */
export function sameContent<T extends { updated: string }>(a: T | undefined, b: T): boolean {
  if (!a) return false;
  return JSON.stringify({ ...a, updated: "" }) === JSON.stringify({ ...b, updated: "" });
}

export function writeReleases(file: ReleasesFile) {
  writeJson(releasesPath(file.slug), releasesFileSchema.parse(file));
}

export function writeMirrors(file: MirrorsFile) {
  writeJson(mirrorsPath(file.slug), mirrorsFileSchema.parse(file));
}

export function writeHistory(entries: HistoryEntry[]) {
  writeJson(HISTORY_PATH, historyFileSchema.parse(entries));
}

export function writeStatus(status: StatusFile) {
  const sorted = Object.fromEntries(Object.entries(status).sort(([a], [b]) => a.localeCompare(b)));
  writeJson(STATUS_PATH, statusFileSchema.parse(sorted));
}
