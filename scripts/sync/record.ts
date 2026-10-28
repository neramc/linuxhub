/**
 * Records a source's official responses as offline fixtures:
 * `bun scripts/sync/record.ts --only=a,b` (default: every source).
 *
 * For each source it clears scripts/sync/fixtures/<slug>/, runs releases()
 * and mirrors() against the live official servers through the polite client
 * (recording every response and refusal), checks the results like run.ts,
 * and writes expected.json.gz: the day and the exact results. The Vitest
 * suite (sources.test.ts) replays the fixtures without network and expects
 * the same results, so every parser is tested the same way.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { mirrorsFileSchema, releasesFileSchema } from "../../src/lib/data-schemas";
import { checkMirrors, checkReleases } from "./checks";
import { useFixtures, withFixtureScope } from "./http";
import type { DistroSource, SyncContext } from "./source";
import { SOURCES } from "./sources";

export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

export interface Expected {
  today: string;
  releases: Awaited<ReturnType<NonNullable<DistroSource["releases"]>>> | null;
  mirrors: Awaited<ReturnType<NonNullable<DistroSource["mirrors"]>>> | null;
}

/** Schema and semantic problems of a source's results, as run.ts would see them. */
export function problems(source: DistroSource, expected: Expected): string[] {
  const out: string[] = [];
  if (expected.releases) {
    const parsed = releasesFileSchema.safeParse({
      slug: source.slug,
      sources: expected.releases.sources,
      updated: expected.today,
      releases: expected.releases.releases,
    });
    if (!parsed.success)
      out.push(...parsed.error.issues.map((i) => `releases ${i.path.join(".")} ${i.message}`));
    else out.push(...checkReleases(parsed.data, source).map((p) => `releases ${p}`));
  }
  if (expected.mirrors) {
    const parsed = mirrorsFileSchema.safeParse({
      slug: source.slug,
      sources: expected.mirrors.sources,
      updated: expected.today,
      mirrors: expected.mirrors.mirrors,
    });
    if (!parsed.success)
      out.push(...parsed.error.issues.map((i) => `mirrors ${i.path.join(".")} ${i.message}`));
    else out.push(...checkMirrors(parsed.data).map((p) => `mirrors ${p}`));
  }
  return out;
}

if (import.meta.main) {
  const only = process.argv
    .find((a) => a.startsWith("--only="))
    ?.slice(7)
    .split(",")
    .filter(Boolean);
  const selected = SOURCES.filter((s) => !only || only.includes(s.slug));
  if (only && selected.length !== only.length) {
    console.error(`Unknown source(s): ${only.filter((o) => !SOURCES.some((s) => s.slug === o))}`);
    process.exit(2);
  }
  const today = new Date().toISOString().slice(0, 10);
  useFixtures("record", FIXTURES);
  let failed = 0;
  await Promise.all(
    selected.map(async (source) => {
      const dir = join(FIXTURES, source.slug);
      rmSync(dir, { recursive: true, force: true });
      const ctx: SyncContext = { today, log: (m) => console.log(`[${source.slug}] ${m}`) };
      try {
        const expected: Expected = await withFixtureScope(source.slug, async () => ({
          today,
          releases: source.releases ? await source.releases(ctx) : null,
          mirrors: source.mirrors ? await source.mirrors(ctx) : null,
        }));
        const found = problems(source, expected);
        if (found.length) throw new Error(found.slice(0, 5).join("; "));
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          join(dir, "expected.json.gz"),
          gzipSync(JSON.stringify(expected), { level: 9 }),
        );
        console.log(`recorded ${source.slug}`);
      } catch (error) {
        failed++;
        console.error(`FAILED ${source.slug}: ${error instanceof Error ? error.message : error}`);
      }
    }),
  );
  process.exit(failed ? 1 : 0);
}
