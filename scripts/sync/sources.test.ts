/**
 * Every distro is held to the same standard (docs/data-sources.md, "동등한 대우"):
 * each catalog distro has a sync source with releases() and mirrors(), and
 * each source's parsers are replayed offline against the official responses
 * recorded by scripts/sync/record.ts, expecting exactly the recorded results.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { useFixtures, withFixtureScope } from "./http";
import { type Expected, FIXTURES, problems } from "./record";
import { SOURCES } from "./sources";

const catalogDir = join(dirname(fileURLToPath(import.meta.url)), "../../src/content/distros");
const catalog = readdirSync(catalogDir)
  .filter((f) => f.endsWith(".yaml"))
  .map((f) => f.replace(/\.yaml$/, ""));

describe("every catalog distro has a full sync source", () => {
  it.each(catalog)("%s", (slug) => {
    const source = SOURCES.find((s) => s.slug === slug);
    expect(source, `scripts/sync/sources/${slug}.ts`).toBeDefined();
    expect(typeof source?.releases).toBe("function");
    expect(typeof source?.mirrors).toBe("function");
  });
});

describe("sources replay their recorded official responses", () => {
  useFixtures("replay", FIXTURES);
  it.each(SOURCES.map((s) => [s.slug, s] as const))("%s", async (slug, source) => {
    const path = join(FIXTURES, slug, "expected.json.gz");
    expect(existsSync(path), `record it: bun scripts/sync/record.ts --only=${slug}`).toBe(true);
    const expected = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as Expected;
    const ctx = { today: expected.today, log: () => {} };
    const actual = await withFixtureScope(slug, async () => ({
      today: expected.today,
      releases: source.releases ? await source.releases(ctx) : null,
      mirrors: source.mirrors ? await source.mirrors(ctx) : null,
    }));
    expect(problems(source, actual)).toEqual([]);
    expect(JSON.parse(JSON.stringify(actual))).toEqual(expected);
  });
});
