/**
 * Registry of per-distro sync sources. Every module in this directory
 * (except index/tests) default-exports a DistroSource or an array of them;
 * they are discovered automatically so adding a distro is one new file.
 */
import { readdirSync } from "node:fs";
import type { DistroSource } from "../source";

const files = readdirSync(import.meta.dir).filter(
  (f) => f.endsWith(".ts") && f !== "index.ts" && !f.endsWith(".test.ts"),
);
const loaded = await Promise.all(
  files.map(
    async (f) => (await import(`./${f}`)).default as DistroSource | DistroSource[] | undefined,
  ),
);

export const SOURCES: DistroSource[] = loaded
  .flatMap((m) => (Array.isArray(m) ? m : m ? [m] : []))
  .sort((a, b) => a.slug.localeCompare(b.slug));

const dupes = SOURCES.map((s) => s.slug).filter((s, i, all) => all.indexOf(s) !== i);
if (dupes.length) throw new Error(`duplicate sync sources: ${dupes.join(", ")}`);
