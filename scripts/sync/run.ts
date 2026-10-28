/**
 * Data sync entry point:
 * `bun run sync [--only=a,b] [--kind=all|releases|mirrors|popularity[,…]] [--dry-run] [--out=DIR]`
 *
 * Each distro source runs independently. A failing source never touches its
 * existing data; it is marked in src/data/status.json (failingSince) so the
 * site can flag stale data and the workflow can open an issue.
 *
 * Every distro gets the same treatment after its source returns (docs/data-sources.md
 * "동등한 대우"): missing artifact sizes are filled from the previous data or one
 * HEAD on the official URL, and every mirror is checked over HTTPS against the
 * newest release's file before it is kept (a listed mirror that gives no answer
 * keeps its place for a few days, so one bad connection changes no data).
 *
 * `--dry-run` writes nothing; `--out=DIR` writes the candidate files to
 * DIR/releases and DIR/mirrors instead of src/data (no status or history),
 * for reviewing a source. `SYNC_HTTP_RECORD=DIR` records the responses as
 * fixtures per source (scripts/sync/http.ts).
 *
 * `popularity` (ADR-0013) is not per-distro: it ignores --only, never touches
 * status.json, and keeps src/data/popularity.json when it fails.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
  HistoryEntry,
  Mirror,
  MirrorsFile,
  ReleasesFile,
  StatusFile,
} from "../../src/lib/data-schemas";
import { mirrorsFileSchema, releasesFileSchema } from "../../src/lib/data-schemas";
import { checkMirrors, checkReleases } from "./checks";
import {
  HttpError,
  headSize,
  httpStats,
  isAllowed,
  RobotsDisallowed,
  request,
  withFixtureScope,
} from "./http";
import { mapLimit } from "./lib/mirrors";
import { compareVersions } from "./lib/versions";
import { syncPopularity } from "./popularity";
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
const KINDS = ["releases", "mirrors", "popularity"] as const;
type Kind = (typeof KINDS)[number];
const requested = (args.get("kind") ?? "all").split(",").filter(Boolean);
const unknownKinds = requested.filter((k) => k !== "all" && !KINDS.includes(k as Kind));
if (unknownKinds.length) {
  console.error(`Unknown kind(s): ${unknownKinds.join(", ")} (use all, ${KINDS.join(", ")})`);
  process.exit(2);
}
const kinds = new Set<Kind>(requested.includes("all") ? KINDS : (requested as Kind[]));
const outDir = args.get("out") ? resolve(args.get("out") as string) : null;
const dryRun = args.get("dry-run") === "true" || outDir !== null;
const today = new Date().toISOString().slice(0, 10);
const HISTORY_LIMIT = 300;
/** A source that takes longer than this fails (its data stays) instead of holding up the run. */
const SOURCE_TIMEOUT_MS = 12 * 60_000;

type Outcome = {
  slug: string;
  kind: Kind;
  result: "changed" | "unchanged" | "failed";
  detail?: string;
};

const status: StatusFile = readStatus();

/** A listed mirror that gives no answer stays this many days (mirrors are checked daily). */
const SILENT_GRACE_DAYS = 3;
/**
 * The first day each listed mirror gave no answer, per distro. It lives in the
 * HTTP cache directory, which the workflow restores between runs, so it is not
 * data: losing it only restarts the grace period.
 */
const SILENCE_FILE = join(import.meta.dir, ".cache", "mirror-silence.json");
const silence: Record<string, Record<string, string>> = (() => {
  try {
    return existsSync(SILENCE_FILE) ? JSON.parse(readFileSync(SILENCE_FILE, "utf8")) : {};
  } catch {
    return {};
  }
})();
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
      // Rolling snapshots (e.g. monthly ISOs) are only news after the first import,
      // and at most once a month per distro: a daily snapshot (Tumbleweed, Gentoo)
      // must not push every other distro out of the shared history.
      if (!prev) continue;
      const month = (r.releaseDate ?? today).slice(0, 7);
      if (
        history.some((h) => h.slug === slug && h.channel === "rolling" && h.date.startsWith(month))
      )
        continue;
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

const ARCH_ORDER = ["x86_64", "aarch64", "i686", "armhf", "riscv64", "ppc64le", "s390x"];

/** Stable artifact order: x86_64 first (the default most people need), then other arches. */
function normalizeOrder(releases: ReleasesFile["releases"]): ReleasesFile["releases"] {
  return releases.map((r) => ({
    ...r,
    editions: r.editions.map((e) => ({
      ...e,
      artifacts: [...e.artifacts].sort(
        (a, b) =>
          ARCH_ORDER.indexOf(a.arch) - ARCH_ORDER.indexOf(b.arch) || a.file.localeCompare(b.file),
      ),
    })),
  }));
}

type Artifact = ReleasesFile["releases"][number]["editions"][number]["artifacts"][number];
const artifactsOf = (releases: ReleasesFile["releases"]): Artifact[] =>
  releases.flatMap((r) => r.editions.flatMap((e) => e.artifacts));

/**
 * Same for every distro: an artifact without a published size keeps the size
 * we already know for the same URL and checksum, else gets one HEAD on its
 * official URL (robots-aware, paced), else one on the same file at up to
 * five listed official mirrors that robots.txt lets us ask (when the
 * official host may not be asked). Unknown stays null.
 */
async function fillSizes(
  slug: string,
  prev: ReleasesFile | undefined,
  releases: ReleasesFile["releases"],
) {
  const known = new Map<string, number>();
  for (const a of artifactsOf(prev?.releases ?? []))
    if (a.size && a.checksum) known.set(`${a.url} ${a.checksum.value}`, a.size);
  const mirrors = currentMirrors(slug)?.mirrors ?? [];
  const missing = artifactsOf(releases).filter((a) => a.size === null);
  await mapLimit(missing, 4, async (a) => {
    a.size = (a.checksum && known.get(`${a.url} ${a.checksum.value}`)) || (await headSize(a.url));
    // Up to five listed mirrors that robots.txt lets us ask (many official
    // mirrors disallow bots; those are skipped without a request).
    let asked = 0;
    for (const m of a.path ? mirrors : []) {
      if (a.size || asked >= 5) break;
      const url = `${m.url}${a.path}`;
      if (!(await isAllowed(url))) continue;
      asked++;
      a.size = await headSize(url);
    }
  });
}

function candidatePath(kind: "releases" | "mirrors", slug: string) {
  return join(outDir ?? "", kind, `${slug}.json`);
}

/** The releases file mirrors are checked against: this run's candidate under --out, else src/data. */
function currentReleases(slug: string): ReleasesFile | undefined {
  if (outDir && existsSync(candidatePath("releases", slug)))
    return releasesFileSchema.parse(
      JSON.parse(readFileSync(candidatePath("releases", slug), "utf8")),
    );
  return readReleases(slug);
}

/** The mirror list sizes may be read from: this run's candidate under --out, else src/data. */
function currentMirrors(slug: string): MirrorsFile | undefined {
  if (outDir && existsSync(candidatePath("mirrors", slug)))
    return mirrorsFileSchema.parse(
      JSON.parse(readFileSync(candidatePath("mirrors", slug), "utf8")),
    );
  return readMirrors(slug);
}

/**
 * A distro's first run syncs releases before any mirror list exists, so sizes
 * that only a mirror can give stay null; once its mirror list is in, fill
 * them the same way, so a first run is as complete as later ones.
 */
async function topUpSizes(slug: string) {
  const file = currentReleases(slug);
  if (!file || artifactsOf(file.releases).every((a) => a.size !== null || !a.path)) return;
  const before = JSON.stringify(file);
  await fillSizes(slug, undefined, file.releases);
  if (JSON.stringify(file) === before) return;
  if (outDir) writeCandidate("releases", file);
  else if (!dryRun) writeReleases(file);
}

/** Path (under a mirror root) of the newest non-pre-release's first mirrored file, x86_64 first. */
function probePath(releases: ReleasesFile | undefined): string | null {
  const stable = (releases?.releases ?? []).filter(
    (r) => r.channel !== "beta" && r.channel !== "testing",
  );
  const newest = [...stable].sort((a, b) => compareVersions(b.version, a.version))[0];
  return newest ? (artifactsOf([newest]).find((a) => a.path)?.path ?? null) : null;
}

/**
 * Same for every distro: each listed mirror gets one HTTPS HEAD for the newest
 * release's file. 2xx/3xx keeps it. 404/410 (it does not carry the release)
 * and no HTTPS answer at all drop it. A mirror we may not check (robots.txt)
 * or that refuses HEAD keeps its place on the official list's word.
 */
async function verifyMirrors(slug: string, mirrors: Mirror[], ctx: SyncContext) {
  const path = probePath(currentReleases(slug));
  if (!path) {
    ctx.log("mirrors not checked: no release file with a mirror path");
    return mirrors;
  }
  const verdicts = await mapLimit(mirrors, 16, async (m): Promise<"ok" | "gone" | "silent"> => {
    try {
      const res = await request(`${m.url}${path}`, {
        method: "HEAD",
        noCache: true,
        retries: 1,
        timeoutMs: 15_000,
      });
      return res.status < 400 ? "ok" : "gone";
    } catch (error) {
      if (error instanceof RobotsDisallowed) return "ok";
      if (error instanceof HttpError && error.status)
        return error.status === 404 || error.status === 410 ? "gone" : "ok";
      return "silent";
    }
  });
  // No answer at all (network error, timeout): a mirror the data already lists keeps its
  // place until it has been silent for SILENT_GRACE_DAYS, so one bad connection does not
  // change the data; a mirror that is not listed yet must answer before it is added.
  const listed = new Set(readMirrors(slug)?.mirrors.map((m) => m.url));
  const since: Record<string, string> = {};
  const kept = mirrors.filter((m, i) => {
    if (verdicts[i] !== "silent") return verdicts[i] === "ok";
    since[m.url] = silence[slug]?.[m.url] ?? today;
    return (
      listed.has(m.url) &&
      Date.parse(today) - Date.parse(since[m.url] ?? today) < SILENT_GRACE_DAYS * 86_400_000
    );
  });
  if (Object.keys(since).length) silence[slug] = since;
  else delete silence[slug];
  const answered = verdicts.filter((v) => v === "ok").length;
  const held = kept.length - answered;
  ctx.log(
    `mirrors: ${answered} of ${mirrors.length} answer for ${path}${held ? ` (${held} silent, kept)` : ""}`,
  );
  return kept;
}

async function syncReleases(source: DistroSource, ctx: SyncContext) {
  if (!source.releases) return;
  try {
    const result = await source.releases(ctx);
    result.releases = normalizeOrder(result.releases);
    const prev = readReleases(source.slug);
    await fillSizes(source.slug, prev, result.releases);
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
    if (outDir) writeCandidate("releases", next);
    if (sameContent(prev, next)) {
      outcomes.push({ slug: source.slug, kind: "releases", result: "unchanged" });
      return;
    }
    recordHistory(source.slug, prev, next);
    if (!dryRun) writeReleases(next);
    outcomes.push({
      slug: source.slug,
      kind: "releases",
      result: "changed",
      detail: describe(next),
    });
  } catch (error) {
    markFailure(source.slug, "releases", error);
  }
}

async function syncMirrors(source: DistroSource, ctx: SyncContext) {
  if (!source.mirrors) return;
  try {
    const result = await source.mirrors(ctx);
    const mirrors = [...(await verifyMirrors(source.slug, result.mirrors, ctx))].sort(
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
    if (outDir) writeCandidate("mirrors", next);
    if (sameContent(prev, next)) {
      outcomes.push({ slug: source.slug, kind: "mirrors", result: "unchanged" });
      return;
    }
    if (!dryRun) writeMirrors(next);
    outcomes.push({
      slug: source.slug,
      kind: "mirrors",
      result: "changed",
      detail: `${next.mirrors.length} mirrors`,
    });
  } catch (error) {
    markFailure(source.slug, "mirrors", error);
  }
}

function writeCandidate(kind: "releases" | "mirrors", file: ReleasesFile | MirrorsFile) {
  mkdirSync(join(outDir ?? "", kind), { recursive: true });
  writeFileSync(candidatePath(kind, file.slug), `${JSON.stringify(file, null, 2)}\n`);
}

/** "24.04.3 lts: 4 editions, 9 files (9 checksums, 9 sizes)" per release, for the log. */
function describe(file: ReleasesFile): string {
  return file.releases
    .map((r) => {
      const files = artifactsOf([r]);
      return `${r.version} ${r.channel}: ${r.editions.length} editions, ${files.length} files (${files.filter((a) => a.checksum).length} checksums, ${files.filter((a) => a.size).length} sizes)`;
    })
    .join("; ");
}

/** Rejects after `ms` so one stuck source cannot hold up the others. */
function timeLimit<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: Timer | undefined;
  return Promise.race([
    work,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${ms / 60_000} min`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

const selected = SOURCES.filter((s) => !only || only.includes(s.slug));
if (only && selected.length !== only.length) {
  const missing = only.filter((slug) => !SOURCES.some((s) => s.slug === slug));
  console.error(`Unknown source(s): ${missing.join(", ")}`);
  process.exit(2);
}

async function runPopularity() {
  const ctx: SyncContext = { today, log: (m) => console.log(`[popularity] ${m}`) };
  try {
    const { result, detail } = await syncPopularity(ctx, { dryRun });
    outcomes.push({ slug: "*", kind: "popularity", result, detail });
  } catch (error) {
    const detail = (error instanceof Error ? error.message : String(error)).slice(0, 300);
    outcomes.push({ slug: "*", kind: "popularity", result: "failed", detail });
  }
}

const perDistro = kinds.has("releases") || kinds.has("mirrors");
const started = Date.now();
await Promise.all([
  ...(perDistro ? selected : []).map((source) => {
    const ctx: SyncContext = { today, log: (m) => console.log(`[${source.slug}] ${m}`) };
    return withFixtureScope(source.slug, async () => {
      if (kinds.has("releases"))
        await timeLimit(syncReleases(source, ctx), SOURCE_TIMEOUT_MS).catch((e) =>
          markFailure(source.slug, "releases", e),
        );
      if (kinds.has("mirrors"))
        await timeLimit(syncMirrors(source, ctx), SOURCE_TIMEOUT_MS).catch((e) =>
          markFailure(source.slug, "mirrors", e),
        );
      if (kinds.has("releases") && kinds.has("mirrors")) await topUpSizes(source.slug);
    });
  }),
  ...(kinds.has("popularity") ? [runPopularity()] : []),
]);

history = history
  .sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      a.slug.localeCompare(b.slug) ||
      compareVersions(b.version, a.version),
  )
  .slice(0, HISTORY_LIMIT);

if (!dryRun && perDistro) {
  writeHistory(history);
  writeStatus(status);
  mkdirSync(join(import.meta.dir, ".cache"), { recursive: true });
  writeFileSync(SILENCE_FILE, `${JSON.stringify(silence, null, 2)}\n`);
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
