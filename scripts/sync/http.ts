/**
 * Polite HTTP client for the data sync (docs/data-sources.md, CLAUDE.md rule 6):
 * - identifies itself with a descriptive User-Agent and contact URL
 * - checks robots.txt before every request (cached per host) and refuses
 *   disallowed URLs, including every redirect target (redirects are
 *   followed by hand: HTTPS only, robots-checked, paced per host)
 * - serializes requests per host with at least 1 s between them, or the
 *   host's Crawl-delay when larger
 * - retries 429/5xx/network errors with exponential backoff (never 4xx),
 *   waiting at least as long as the server's Retry-After (capped at 60 s)
 * - revalidates with ETag / Last-Modified, keeping bodies in .cache/
 * - can record every response of a source run as a fixture and replay it
 *   without network (scripts/sync/sources.test.ts)
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import robotsParser from "robots-parser";

const SITE = process.env.SITE_URL ?? "https://github.com/neramc/linuxhub";
export const USER_AGENT = `LinuxhubBot/1.0 (+${SITE.replace(/\/$/, "")}/about/#bot)`;
const UA_TOKEN = "LinuxhubBot";
const MIN_INTERVAL_MS = 1000;
const TIMEOUT_MS = 30_000;
const RETRIES = 2;
const MAX_RETRY_AFTER_MS = 60_000;

// Node-compatible (no Bun globals): the fixture replay test runs under Vitest.
const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), ".cache");
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
const CACHE_INDEX = join(CACHE_DIR, "index.json");

export class HttpError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export class RobotsDisallowed extends HttpError {}

/** A redirect we will not follow (not HTTPS, or too many hops). */
export class RedirectRefused extends HttpError {}

const MAX_REDIRECTS = 10;

type CacheEntry = { etag?: string; lastModified?: string; body: string };
let cacheIndex: Record<string, Omit<CacheEntry, "body">> | null = null;

function loadCache() {
  if (cacheIndex) return cacheIndex;
  try {
    cacheIndex = JSON.parse(readFileSync(CACHE_INDEX, "utf8"));
  } catch {
    cacheIndex = {};
  }
  return cacheIndex as Record<string, Omit<CacheEntry, "body">>;
}

function bodyPath(url: string) {
  return join(CACHE_DIR, `${createHash("sha256").update(url).digest("hex").slice(0, 24)}.body`);
}

function readCached(url: string): CacheEntry | null {
  const meta = loadCache()[url];
  if (!meta || !existsSync(bodyPath(url))) return null;
  return { ...meta, body: readFileSync(bodyPath(url), "utf8") };
}

function writeCached(url: string, entry: CacheEntry) {
  if (!entry.etag && !entry.lastModified) return;
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(bodyPath(url), entry.body);
  const index = loadCache();
  index[url] = {
    ...(entry.etag ? { etag: entry.etag } : {}),
    ...(entry.lastModified ? { lastModified: entry.lastModified } : {}),
  };
  writeFileSync(CACHE_INDEX, JSON.stringify(index));
}

/* ---------- fixtures (record / replay) ---------- */

/**
 * `record`: every response (and every refusal: HTTP 4xx, robots.txt) is also
 * written to <dir>/<slug>/<hash>.json.gz, the slug being the source that is
 * running (withFixtureScope). `replay`: responses come only from there and no
 * request leaves the machine; a missing fixture is an error. Set from the
 * SYNC_HTTP_RECORD / SYNC_HTTP_REPLAY environment variables (a directory) or
 * with useFixtures().
 */
type FixtureMode = "off" | "record" | "replay";
let fixtureMode: FixtureMode = process.env.SYNC_HTTP_REPLAY
  ? "replay"
  : process.env.SYNC_HTTP_RECORD
    ? "record"
    : "off";
let fixtureDir = process.env.SYNC_HTTP_REPLAY ?? process.env.SYNC_HTTP_RECORD ?? "";
const fixtureScope = new AsyncLocalStorage<string>();

export function useFixtures(mode: FixtureMode, dir = "") {
  fixtureMode = mode;
  fixtureDir = dir;
}

/** Runs `fn` with its requests filed under `slug` when recording or replaying. */
export function withFixtureScope<T>(slug: string, fn: () => Promise<T>): Promise<T> {
  return fixtureScope.run(slug, fn);
}

interface Fixture {
  method: string;
  url: string;
  finalUrl?: string;
  status: number;
  headers?: Record<string, string>;
  body?: string;
  /** robots.txt refused the URL (or one of its redirect targets). */
  robots?: false;
  /** A redirect was refused (RedirectRefused). */
  refused?: string;
}

const KEPT_HEADERS = ["content-type", "content-length", "last-modified", "etag"];

function fixturePath(method: string, url: string): string {
  const slug = fixtureScope.getStore() ?? "_shared";
  const hash = createHash("sha256").update(`${method} ${url}`).digest("hex").slice(0, 24);
  return join(fixtureDir, slug, `${hash}.json.gz`);
}

/**
 * Pages that greet the visitor ("Your IP address is …") would put the
 * recording machine's address in the repository: replace it. No source
 * reads it.
 */
export function redactVisitorIp(body: string): string {
  return body.replace(
    /(IP address(?: is)?:?\s*(?:<[a-z]+>)?)(?:(?:\d{1,3}\.){3}\d{1,3}|[0-9a-f]*:[0-9a-f:]{2,})/gi,
    "$10.0.0.0",
  );
}

function saveFixture(fixture: Fixture) {
  if (fixtureMode !== "record") return;
  if (fixture.body) fixture.body = redactVisitorIp(fixture.body);
  const path = fixturePath(fixture.method, fixture.url);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, gzipSync(JSON.stringify(fixture), { level: 9 }));
}

function replayFixture(method: string, url: string): FetchResult {
  const path = fixturePath(method, url);
  if (!existsSync(path)) throw new HttpError(`no fixture for ${method} ${url} (${path})`, url);
  const f = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as Fixture;
  if (f.robots === false) {
    stats.blocked++;
    throw new RobotsDisallowed(`robots.txt disallows ${url}`, url);
  }
  if (f.refused) throw new RedirectRefused(f.refused, url);
  if (f.status >= 400) throw new HttpError(`HTTP ${f.status} for ${url}`, url, f.status);
  return {
    url,
    finalUrl: f.finalUrl ?? url,
    status: f.status,
    headers: new Headers(f.headers ?? {}),
    body: f.body ?? "",
    fromCache: false,
  };
}

/* ---------- per-host pacing ---------- */

const hostQueues = new Map<string, Promise<unknown>>();
const hostLast = new Map<string, number>();
const hostDelay = new Map<string, number>();

function schedule<T>(host: string, task: () => Promise<T>): Promise<T> {
  const prev = hostQueues.get(host) ?? Promise.resolve();
  const run = prev
    .catch(() => undefined)
    .then(async () => {
      const wait =
        (hostLast.get(host) ?? 0) + (hostDelay.get(host) ?? MIN_INTERVAL_MS) - Date.now();
      if (wait > 0) await sleep(wait);
      try {
        return await task();
      } finally {
        hostLast.set(host, Date.now());
      }
    });
  hostQueues.set(host, run);
  return run;
}

/* ---------- robots.txt ---------- */

type Robots = ReturnType<typeof robotsParser>;
const robotsCache = new Map<string, Promise<Robots>>();
/** Origins whose robots.txt gave no usable answer this run (closed to the sync). */
const robotsUnreadable = new Set<string>();

async function robotsFor(url: URL): Promise<Robots> {
  const origin = url.origin;
  let pending = robotsCache.get(origin);
  if (!pending) {
    pending = (async () => {
      const robotsUrl = `${origin}/robots.txt`;
      // 4xx (incl. 404): no restrictions. A 5xx or no answer after the retries:
      // be conservative and treat the host as disallow-all for this run.
      let text: string | null = null;
      for (let attempt = 0; attempt <= RETRIES; attempt++) {
        if (attempt > 0) await sleep(2 ** attempt * 1000);
        try {
          const res = await schedule(url.host, () =>
            fetch(robotsUrl, {
              headers: { "user-agent": USER_AGENT },
              signal: AbortSignal.timeout(TIMEOUT_MS),
              redirect: "follow",
            }),
          );
          if (res.status >= 500) continue;
          text = res.ok ? await res.text() : "";
          break;
        } catch {
          // A one-off network error must not close a host for the whole run: retry.
        }
      }
      if (text === null) robotsUnreadable.add(origin);
      const robots = robotsParser(robotsUrl, text ?? "User-agent: *\nDisallow: /");
      const delay = robots.getCrawlDelay(UA_TOKEN);
      if (delay && delay * 1000 > MIN_INTERVAL_MS)
        hostDelay.set(url.host, Math.min(delay, 30) * 1000);
      return robots;
    })();
    robotsCache.set(origin, pending);
  }
  return pending;
}

/**
 * Rules a host publishes that some networks hide: github.com disallows
 * "/*\/download" for every bot, which covers release assets, but a proxy can
 * answer robots.txt for github.com itself (a 403 there reads as "no rules").
 * Applying the rule here keeps the sync's requests, and its results, the same
 * on every network.
 */
const PUBLISHED_DISALLOW: { host: string; path: RegExp }[] = [
  { host: "github.com", path: /^\/[^/]+\/[^/]+\/releases\/download\// },
];

/**
 * Why a URL is closed, for logs and the failing-sources issue: a robots.txt
 * that says so, or one that could not be read (a server error or no answer
 * after the retries closes the host for the run).
 */
function refusal(url: string, what = ""): string {
  const { origin } = new URL(url);
  return robotsUnreadable.has(origin)
    ? `robots.txt of ${origin} could not be read (server error or no answer), so the host is closed for this run: ${what}${url}`
    : `robots.txt disallows ${what}${url}`;
}

export async function isAllowed(url: string): Promise<boolean> {
  // Replays answer from the recorded refusals instead (request()).
  if (fixtureMode === "replay") return true;
  const u = new URL(url);
  if (PUBLISHED_DISALLOW.some((r) => u.host === r.host && r.path.test(u.pathname))) return false;
  const robots = await robotsFor(u);
  return robots.isAllowed(url, UA_TOKEN) !== false;
}

/* ---------- fetch ---------- */

export interface FetchOptions {
  method?: "GET" | "HEAD";
  /** Accept header; defaults to any. */
  accept?: string;
  /** Extra headers (e.g. GitHub token). */
  headers?: Record<string, string>;
  /** Skip the ETag cache (for HEAD or tiny responses). */
  noCache?: boolean;
  /** Retries after 429/5xx/network errors (default 2). */
  retries?: number;
  /** Per-attempt timeout (default 30 s). */
  timeoutMs?: number;
}

export interface FetchResult {
  url: string;
  finalUrl: string;
  status: number;
  headers: Headers;
  body: string;
  fromCache: boolean;
}

/** Retry-After (delta-seconds or HTTP-date) in ms, capped; null when absent or invalid. */
function retryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(ms) && ms > 0 ? Math.min(ms, MAX_RETRY_AFTER_MS) : null;
}

const stats = { requests: 0, notModified: 0, blocked: 0 };

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/**
 * Fetches `url`, following redirects by hand so every hop is HTTPS, allowed
 * by its host's robots.txt and paced like any other request. Credentials
 * and revalidation headers are not carried to another host.
 */
async function fetchPolitely(
  url: string,
  init: { method: string; headers: Record<string, string>; timeoutMs: number },
): Promise<{ res: Response; finalUrl: string }> {
  let current = url;
  let headers = init.headers;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const target = current;
    const res = await schedule(new URL(target).host, () =>
      fetch(target, {
        method: init.method,
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(init.timeoutMs),
      }),
    );
    const location = REDIRECTS.has(res.status) ? res.headers.get("location") : null;
    if (!location) return { res, finalUrl: target };
    await res.body?.cancel();
    const next = new URL(location, target);
    if (next.protocol !== "https:")
      throw new RedirectRefused(`redirect to a non-HTTPS URL (${next.href})`, url);
    if (!(await isAllowed(next.href))) {
      stats.blocked++;
      throw new RobotsDisallowed(refusal(next.href, "the redirect target "), url);
    }
    if (next.host !== new URL(target).host) {
      const { authorization: _a, "if-none-match": _e, "if-modified-since": _m, ...rest } = headers;
      headers = rest;
    }
    current = next.href;
  }
  throw new RedirectRefused(`more than ${MAX_REDIRECTS} redirects`, url);
}
export const httpStats = () => ({ ...stats });

export async function request(url: string, options: FetchOptions = {}): Promise<FetchResult> {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new HttpError("only https is allowed", url);
  const method = options.method ?? "GET";
  if (fixtureMode === "replay") return replayFixture(method, url);
  if (!(await isAllowed(url))) {
    stats.blocked++;
    saveFixture({ method, url, status: 0, robots: false });
    throw new RobotsDisallowed(refusal(url), url);
  }
  const cached = method === "GET" && !options.noCache ? readCached(url) : null;
  const headers: Record<string, string> = {
    "user-agent": USER_AGENT,
    accept: options.accept ?? "*/*",
    ...options.headers,
  };
  if (cached?.etag) headers["if-none-match"] = cached.etag;
  if (cached?.lastModified) headers["if-modified-since"] = cached.lastModified;

  let lastError: unknown;
  let retryAfter = 0;
  for (let attempt = 0; attempt <= (options.retries ?? RETRIES); attempt++) {
    if (attempt > 0) await sleep(Math.max(2 ** attempt * 1000, retryAfter));
    try {
      const { res, finalUrl } = await fetchPolitely(url, {
        method,
        headers,
        timeoutMs: options.timeoutMs ?? TIMEOUT_MS,
      });
      stats.requests++;
      if (res.status === 304 && cached) {
        stats.notModified++;
        saveFixture({ method, url, finalUrl, status: 200, body: cached.body });
        return {
          url,
          finalUrl,
          status: 200,
          headers: res.headers,
          body: cached.body,
          fromCache: true,
        };
      }
      if (res.status === 429 || res.status >= 500) {
        retryAfter = retryAfterMs(res.headers.get("retry-after")) ?? 0;
        lastError = new HttpError(`HTTP ${res.status}`, url, res.status);
        continue;
      }
      if (!res.ok) {
        saveFixture({ method, url, status: res.status });
        throw new HttpError(`HTTP ${res.status} for ${url}`, url, res.status);
      }
      const body = method === "HEAD" ? "" : await res.text();
      saveFixture({
        method,
        url,
        finalUrl,
        status: res.status,
        headers: Object.fromEntries(
          KEPT_HEADERS.flatMap((h) => {
            const v = res.headers.get(h);
            return v === null ? [] : [[h, v]];
          }),
        ),
        body,
      });
      if (method === "GET" && !options.noCache) {
        writeCached(url, {
          etag: res.headers.get("etag") ?? undefined,
          lastModified: res.headers.get("last-modified") ?? undefined,
          body,
        } as CacheEntry);
      }
      return {
        url,
        finalUrl,
        status: res.status,
        headers: res.headers,
        body,
        fromCache: false,
      };
    } catch (error) {
      if (error instanceof RobotsDisallowed) {
        saveFixture({ method, url, status: 0, robots: false });
        throw error;
      }
      if (error instanceof RedirectRefused) {
        saveFixture({ method, url, status: 0, refused: error.message });
        throw error;
      }
      if (error instanceof HttpError && error.status && error.status < 500 && error.status !== 429)
        throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new HttpError(String(lastError), url);
}

export async function getText(url: string, options?: FetchOptions): Promise<string> {
  return (await request(url, options)).body;
}

export async function getJson<T = unknown>(url: string, options?: FetchOptions): Promise<T> {
  const body = await getText(url, { accept: "application/json", ...options });
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new HttpError(`invalid JSON from ${url}`, url);
  }
}

/** Content-Length via HEAD, or null when unavailable/disallowed. */
export async function headSize(url: string): Promise<number | null> {
  try {
    const res = await request(url, { method: "HEAD", noCache: true });
    const len = Number(res.headers.get("content-length"));
    return Number.isFinite(len) && len > 0 ? len : null;
  } catch {
    return null;
  }
}
