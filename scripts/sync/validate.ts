/**
 * Validates everything in src/data/ against the shared schemas and the
 * per-source host allowlists. Run in CI and by the sync workflow before
 * committing: `bun run sync:validate`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  historyFileSchema,
  mirrorsFileSchema,
  popularityFileSchema,
  releasesFileSchema,
  statusFileSchema,
} from "../../src/lib/data-schemas";
import { popularityProblems } from "../../src/lib/popularity";
import { checkMirrors, checkReleases } from "./checks";
import { SOURCES } from "./sources";
import { DATA_DIR, HISTORY_PATH, POPULARITY_PATH, STATUS_PATH } from "./store";
import { WIKIPEDIA_ARTICLES } from "./wikipedia-articles";

const errors: string[] = [];
const bySlug = new Map(SOURCES.map((s) => [s.slug, s]));
const catalog = new Set(
  readdirSync(join(DATA_DIR, "..", "content", "distros"))
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => f.replace(/\.yaml$/, "")),
);

function each(dir: string, fn: (slug: string, data: unknown) => void) {
  const path = join(DATA_DIR, dir);
  if (!existsSync(path)) return;
  for (const file of readdirSync(path).filter((f) => f.endsWith(".json"))) {
    const slug = file.replace(/\.json$/, "");
    try {
      fn(slug, JSON.parse(readFileSync(join(path, file), "utf8")));
    } catch (error) {
      errors.push(`${dir}/${file}: ${error instanceof Error ? error.message : error}`);
    }
  }
}

each("releases", (slug, data) => {
  const parsed = releasesFileSchema.safeParse(data);
  if (!parsed.success)
    return void errors.push(`releases/${slug}: ${parsed.error.issues[0]?.message}`);
  if (parsed.data.slug !== slug) errors.push(`releases/${slug}: slug mismatch`);
  if (!catalog.has(slug)) errors.push(`releases/${slug}: not in the catalog`);
  const source = bySlug.get(slug);
  if (!source) return void errors.push(`releases/${slug}: no sync source registered`);
  for (const p of checkReleases(parsed.data, source)) errors.push(`releases/${slug}: ${p}`);
});

each("mirrors", (slug, data) => {
  const parsed = mirrorsFileSchema.safeParse(data);
  if (!parsed.success)
    return void errors.push(`mirrors/${slug}: ${parsed.error.issues[0]?.message}`);
  if (!catalog.has(slug)) errors.push(`mirrors/${slug}: not in the catalog`);
  for (const p of checkMirrors(parsed.data)) errors.push(`mirrors/${slug}: ${p}`);
});

for (const [path, schema] of [
  [HISTORY_PATH, historyFileSchema],
  [STATUS_PATH, statusFileSchema],
] as const) {
  if (!existsSync(path)) continue;
  const parsed = schema.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) errors.push(`${path}: ${parsed.error.issues[0]?.message}`);
}

// "Popular today" (ADR-0013): every catalog distro needs a mapping entry (null = no article),
// and the ranking may only name catalog distros under their mapped article.
for (const slug of catalog)
  if (!Object.hasOwn(WIKIPEDIA_ARTICLES, slug))
    errors.push(
      `popularity: ${slug} has no entry in scripts/sync/wikipedia-articles.ts (null when there is no article)`,
    );
if (existsSync(POPULARITY_PATH)) {
  const parsed = popularityFileSchema.safeParse(JSON.parse(readFileSync(POPULARITY_PATH, "utf8")));
  if (!parsed.success)
    errors.push(
      `popularity.json: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`,
    );
  else {
    for (const p of popularityProblems(parsed.data)) errors.push(`popularity.json: ${p}`);
    for (const item of parsed.data.items) {
      if (!catalog.has(item.slug))
        errors.push(`popularity.json: ${item.slug} is not in the catalog`);
      else if (WIKIPEDIA_ARTICLES[item.slug] !== item.article)
        errors.push(
          `popularity.json: ${item.slug} uses "${item.article}", the mapping says ${JSON.stringify(WIKIPEDIA_ARTICLES[item.slug] ?? null)} (run bun run sync -- --kind=popularity)`,
        );
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  console.error(`\n✗ ${errors.length} problem(s) in src/data`);
  process.exit(1);
}
console.log("✓ src/data is valid");
