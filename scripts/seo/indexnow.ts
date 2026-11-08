/**
 * Tells IndexNow which pages a production deploy changed (ADR-0020), so new
 * releases and edits reach Bing, Naver and the other engines that share
 * IndexNow submissions without waiting for their next crawl. The pages come
 * from the files changed between the previous production commit and this one
 * (changedPages); the key is public/<KEY>.txt, served at the site root.
 * Run by .github/workflows/indexnow.yml after each production deploy.
 *
 * Usage: SITE_URL=https://… bun scripts/seo/indexnow.ts <from-sha|""> <to-sha> [--dry-run]
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

export const KEY = "b26e3336ffae790029ee6eec37086deb";
export const ENDPOINT = "https://api.indexnow.org/indexnow";

type Locale = "ko" | "en";
const BOTH: readonly Locale[] = ["ko", "en"];
/** Pages that list or link most of the site: what a change to shared code or styles touches first. */
const HUBS = ["/", "/distros/", "/releases/", "/learn/"];

/** A page path without its locale prefix, in the locales it changed in. */
export interface ChangedPage {
  path: string;
  locales: readonly Locale[];
}

/** Does this file exist in the checkout? (Injected so tests need no files.) */
export type Exists = (file: string) => boolean;

/**
 * The pages a set of changed files (paths relative to the repository root;
 * deleted files left out by the caller) changes. Mirror lists, the sync
 * status and anything outside the site's sources change no page.
 */
export function changedPages(files: readonly string[], exists: Exists): ChangedPage[] {
  const pages = new Map<string, Set<Locale>>();
  const add = (path: string, locales: readonly Locale[] = BOTH) => {
    const set = pages.get(path) ?? new Set<Locale>();
    for (const l of locales) set.add(l);
    pages.set(path, set);
  };
  // A distro's page, and its install guide in the locales where one is written.
  const distro = (slug: string) => {
    if (!exists(`src/content/distros/${slug}.yaml`)) return;
    add(`/distros/${slug}/`);
    const guides = BOTH.filter((l) => exists(`src/content/distro-docs/${slug}/${l}/install.mdx`));
    if (guides.length) add(`/distros/${slug}/install/`, guides);
  };
  for (const file of files) {
    const release = /^src\/data\/releases\/([a-z0-9-]+)\.json$/.exec(file);
    const entry = /^src\/content\/distros\/([a-z0-9-]+)\.yaml$/.exec(file);
    const doc = /^src\/content\/distro-docs\/([a-z0-9-]+)\/(ko|en)\/(overview|install)\.mdx$/.exec(
      file,
    );
    const chapter = /^src\/content\/learn\/(ko|en)\/([a-z0-9-]+)\.mdx$/.exec(file);
    const shot = /^src\/assets\/screenshots\/([a-z0-9-]+)\.\w+$/.exec(file);
    if (release) distro(release[1] ?? "");
    else if (file === "src/data/history.json") {
      add("/");
      add("/releases/");
    } else if (file === "src/data/popularity.json") add("/");
    else if (file.startsWith("src/data/")) continue;
    else if (entry) {
      distro(entry[1] ?? "");
      add("/distros/");
    } else if (doc) {
      const [, slug = "", locale, kind] = doc;
      if (exists(`src/content/distros/${slug}.yaml`))
        add(`/distros/${slug}/${kind === "install" ? "install/" : ""}`, [locale as Locale]);
    } else if (chapter) {
      const locale = chapter[1] as Locale;
      add(`/learn/${chapter[2]}/`, [locale]);
      add("/learn/", [locale]);
    } else if (shot) distro(shot[1] ?? "");
    else if (/^(src|public)\//.test(file) || file === "astro.config.mjs")
      for (const hub of HUBS) add(hub);
  }
  return [...pages].map(([path, locales]) => ({
    path,
    locales: BOTH.filter((l) => locales.has(l)),
  }));
}

/** Absolute URLs of `pages` on `site` (Korean at the root, English under /en). */
export function pageUrls(pages: readonly ChangedPage[], site: string): string[] {
  const origin = new URL(site).origin;
  return pages.flatMap((p) => p.locales.map((l) => `${origin}${l === "en" ? "/en" : ""}${p.path}`));
}

/** Files added or modified between two commits (renames as their new path). */
function changedFiles(from: string, to: string): string[] {
  const out = execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMR", `${from}..${to}`], {
    encoding: "utf8",
  });
  return out.split("\n").filter(Boolean);
}

async function main() {
  const [from = "", to = "HEAD"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const dryRun = process.argv.includes("--dry-run");
  const site = process.env.SITE_URL;
  if (!site) throw new Error("SITE_URL must be the canonical origin, e.g. https://linuxhub.kro.kr");
  // Without a previous production commit (the first deploy), the hub pages.
  const pages = from
    ? changedPages(changedFiles(from, to), existsSync)
    : HUBS.map((path) => ({ path, locales: BOTH }));
  const urlList = pageUrls(pages, site).slice(0, 10_000);
  console.log(
    `${urlList.length} changed page(s)${urlList.length ? `:\n  ${urlList.join("\n  ")}` : ""}`,
  );
  if (!urlList.length || dryRun) return;
  const { host, origin } = new URL(site);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "user-agent": `LinuxhubBot/1.0 (+${origin}/about/#bot)`,
    },
    body: JSON.stringify({ host, key: KEY, keyLocation: `${origin}/${KEY}.txt`, urlList }),
    signal: AbortSignal.timeout(30_000),
  });
  // 200: received; 202: received, key not checked yet.
  console.log(`IndexNow: HTTP ${res.status}`);
  if (!res.ok)
    throw new Error(`IndexNow answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

if (import.meta.main) await main();
