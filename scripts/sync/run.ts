/**
 * Data sync entry point: `bun run sync [--only=a,b] [--kind=releases|mirrors|all] [--dry-run]`
 *
 * Each distro source runs independently. A failing source never touches its
 * existing data; it is marked in src/data/status.json (failingSince) so the
 * site can flag stale data and the workflow can open an issue.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  HistoryEntry,
  MirrorsFile,
  ReleasesFile,
  StatusFile,
} from "../../src/lib/data-schemas";
import { mirrorsFileSchema, releasesFileSchema } from "../../src/lib/data-schemas";
import { checkMirrors, checkReleases } from "./checks";
import { httpStats } from "./http";
import { compareVersions } from "./lib/versions";
import type { DistroSource, SyncContext } from "./source";
import { SOURCES } from "./sources";
import {
  readHistory,
  readMirrors,
  readReleases,
  readStatus,
  sameContent,
  writeHistory,
  writeMirrors,
  writeReleases,
  writeStatus,
} from "./store";

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k ?? "", v ?? "true"] as const;
  }),
);
const only = args.get("only")?.split(",").filter(Boolean);
const kind = args.get("kind") ?? "all";
const dryRun = args.get("dry-run") === "true";
const today = new Date().toISOString().slice(0, 10);
const HISTORY_LIMIT = 300;

type Outcome = {
  slug: string;
  kind: "releases" | "mirrors";
  result: "changed" | "unchanged" | "failed";
  detail?: string;
};

const status: StatusFile = readStatus();
let history: HistoryEntry[] = readHistory();
const outcomes: Outcome[] = [];

function statusEntry(slug: string) {
  status[slug] ??= {};
  return status[slug];
}

function markFailure(slug: string, k: "releases" | "mirrors", error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
  const entry = statusEntry(slug);
  entry[k] = { failingSince: entry[k]?.failingSince ?? today, lastError: message };
  outcomes.push({ slug, kind: k, result: "failed", detail: message });
}

function markSuccess(slug: string, k: "releases" | "mirrors") {
  const entry = statusEntry(slug);
  entry[k] = { failingSince: null, lastError: null };
}

/** Rejects data whose newest stable version is older than what we have (upstream glitch). */
function regressed(prev: ReleasesFile | undefined, next: ReleasesFile): string | null {
  if (!prev) return null;
  const newest = (f: ReleasesFile) =>
    f.releases
      .filter((r) => r.channel !== "beta" && r.channel !== "testing")
      .map((r) => r.version)
      .sort((a, b) => compareVersions(b, a))[0];
  const a = newest(prev);
  const b = newest(next);
  return a && b && compareVersions(b, a) < 0 ? `newest version went backwards (${a} → ${b})` : null;
}

function recordHistory(slug: string, prev: ReleasesFile | undefined, next: ReleasesFile) {
  const known = new Set(prev?.releases.map((r) => `${r.channel}:${r.version}`) ?? []);
  for (const r of next.releases) {
    if (known.has(`${r.channel}:${r.version}`)) continue;
    if (r.channel === "rolling") {
      // Rolling snapshots (e.g. monthly ISOs) are only news after the first import.
      if (!prev) continue;
    } else if (!prev && !r.releaseDate) continue;
    if (history.some((h) => h.slug === slug && h.version === r.version && h.channel === r.channel))
      continue;
    history.push({
      slug,
      version: r.version,
      channel: r.channel,
      date: r.releaseDate ?? today,
      detected: today,
    });
  }
}

async function syncReleases(source: DistroSource, ctx: SyncContext) {
  if (!source.releases) return;
  try {
    const result = await source.releases(ctx);
    const prev = readReleases(source.slug);
    const draft: ReleasesFile = {
      slug: source.slug,
      sources: result.sources,
      updated: today,
      releases: result.releases,
    };
    const parsed = releasesFileSchema.safeParse(draft);
    if (!parsed.success)
      throw new Error(
        `schema: ${parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")} ${i.message}`)
          .join("; ")}`,
      );
    const next = parsed.data;
    const problems = checkReleases(next, source);
    const regression = regressed(prev, next);
    if (regression) problems.push(regression);
    if (problems.length) throw new Error(problems.slice(0, 5).join("; "));
    markSuccess(source.slug, "releases");
    if (sameContent(prev, next)) {
      outcomes.push({ slug: source.slug, kind: "releases", result: "unchanged" });
      return;
    }
    recordHistory(source.slug, prev, next);
    if (!dryRun) writeReleases(next);
    outcomes.push({ slug: source.slug, kind: "releases", result: "changed" });
  } catch (error) {
    markFailure(source.slug, "releases", error);
  }
}

async function syncMirrors(source: DistroSource, ctx: SyncContext) {
  if (!source.mirrors) return;
  try {
    const result = await source.mirrors(ctx);
    const mirrors = [...result.mirrors].sort(
      (a, b) => (a.country ?? "ZZ").localeCompare(b.country ?? "ZZ") || a.url.localeCompare(b.url),
    );
    const prev = readMirrors(source.slug);
    const parsed = mirrorsFileSchema.safeParse({
      slug: source.slug,
      sources: result.sources,
      updated: today,
      mirrors,
    });
    if (!parsed.success)
      throw new Error(
        `schema: ${parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")} ${i.message}`)
          .join("; ")}`,
      );
    const next: MirrorsFile = parsed.data;
    if (next.mirrors.length === 0) throw new Error("official mirror list came back empty");
    if (prev && next.mirrors.length < prev.mirrors.length * 0.5)
      throw new Error(`mirror count dropped from ${prev.mirrors.length} to ${next.mirrors.length}`);
    const problems = checkMirrors(next);
    if (problems.length) throw new Error(problems.slice(0, 5).join("; "));
    markSuccess(source.slug, "mirrors");
    if (sameContent(prev, next)) {
      outcomes.push({ slug: source.slug, kind: "mirrors", result: "unchanged" });
      return;
    }
    if (!dryRun) writeMirrors(next);
    outcomes.push({ slug: source.slug, kind: "mirrors", result: "changed" });
  } catch (error) {
    markFailure(source.slug, "mirrors", error);
  }
}

const selected = SOURCES.filter((s) => !only || only.includes(s.slug));
if (only && selected.length !== only.length) {
  const missing = only.filter((slug) => !SOURCES.some((s) => s.slug === slug));
  console.error(`Unknown source(s): ${missing.join(", ")}`);
  process.exit(2);
}

const started = Date.now();
await Promise.all(
  selected.map(async (source) => {
    const ctx: SyncContext = { today, log: (m) => console.log(`[${source.slug}] ${m}`) };
    if (kind === "all" || kind === "releases") await syncReleases(source, ctx);
    if (kind === "all" || kind === "mirrors") await syncMirrors(source, ctx);
  }),
);

history = history
  .sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      a.slug.localeCompare(b.slug) ||
      compareVersions(b.version, a.version),
  )
  .slice(0, HISTORY_LIMIT);

if (!dryRun) {
  writeHistory(history);
  writeStatus(status);
}

const failed = outcomes.filter((o) => o.result === "failed");
const changed = outcomes.filter((o) => o.result === "changed");
for (const o of outcomes)
  console.log(
    `${o.result.padEnd(9)} ${o.kind.padEnd(8)} ${o.slug}${o.detail ? ` — ${o.detail}` : ""}`,
  );
const stats = httpStats();
console.log(
  `\n${changed.length} changed, ${outcomes.length - changed.length - failed.length} unchanged, ${failed.length} failed · ${stats.requests} requests (${stats.notModified} not modified, ${stats.blocked} blocked by robots.txt) · ${((Date.now() - started) / 1000).toFixed(1)}s`,
);

// Report for the workflow: sources failing for ≥ 18 h (about 3 scheduled runs).
const stale = Object.entries(status).flatMap(([slug, s]) =>
  (["releases", "mirrors"] as const)
    .filter(
      (k) => s[k]?.failingSince && Date.parse(today) - Date.parse(s[k]?.failingSince ?? today) >= 0,
    )
    .map((k) => ({ slug, kind: k, since: s[k]?.failingSince, error: s[k]?.lastError })),
);
const reportDir = join(import.meta.dir, ".cache");
mkdirSync(reportDir, { recursive: true });
writeFileSync(
  join(reportDir, "report.json"),
  JSON.stringify({ today, changed, failed, failing: stale }, null, 2),
);
