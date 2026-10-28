/**
 * Registry of per-distro sync sources. Every module in this directory
 * (except index/tests) default-exports a DistroSource or an array of them;
 * they are discovered automatically so adding a distro is one new file.
 * Bun and Node (Vitest) both load it.
 */
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { DistroSource } from "../source";

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter(
  (f) => f.endsWith(".ts") && f !== "index.ts" && !f.endsWith(".test.ts"),
);
const loaded = await Promise.all(
  files.map(
    async (f) =>
      (await import(pathToFileURL(join(here, f)).href)).default as
        | DistroSource
        | DistroSource[]
        | undefined,
  ),
);

export const SOURCES: DistroSource[] = loaded
  .flatMap((m) => (Array.isArray(m) ? m : m ? [m] : []))
  .sort((a, b) => a.slug.localeCompare(b.slug));

const dupes = SOURCES.map((s) => s.slug).filter((s, i, all) => all.indexOf(s) !== i);
if (dupes.length) throw new Error(`duplicate sync sources: ${dupes.join(", ")}`);
