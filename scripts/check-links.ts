/**
 * Checks every internal link of the static build: each root-relative href/src
 * must be a built file or page, and each same-page "#fragment" must name an
 * id on that page. /api/ routes are on-demand functions and are skipped.
 * Also checks sitemap.xml against the build (ADR-0020): every URL in it is a
 * built page, and every built page that search engines may index (no
 * robots noindex) is in it.
 * Usage: bun scripts/check-links.ts [dist/client]
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? "dist/client";
if (!existsSync(root)) {
  console.error(`${root} does not exist: run bun run build first`);
  process.exit(2);
}

const pages: string[] = [];
(function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith(".html")) pages.push(path);
  }
})(root);

function built(url: string): boolean {
  const path = decodeURIComponent(url.split(/[?#]/)[0] ?? "");
  if (path.startsWith("/api/")) return true;
  const file = join(root, path);
  return (
    (existsSync(file) && statSync(file).isFile()) ||
    existsSync(join(file, "index.html")) ||
    existsSync(`${file}.html`)
  );
}

const broken = new Map<string, string[]>();
const add = (key: string, page: string) => broken.set(key, [...(broken.get(key) ?? []), page]);
let links = 0;
for (const file of pages) {
  const page = file.slice(root.length);
  const html = readFileSync(file, "utf8");
  for (const [, raw = ""] of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const url = raw.replace(/&amp;/g, "&");
    if (!url.startsWith("/") || url.startsWith("//")) continue;
    links++;
    if (!built(url)) add(url, page);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const [, id = ""] of html.matchAll(/\shref="#([^"]+)"/g))
    if (!ids.has(decodeURIComponent(id))) add(`#${id}`, page);
}

console.log(`${pages.length} pages, ${links} internal links, ${broken.size} broken`);
for (const [target, from] of broken)
  console.log(`  ${target} (on ${from.length} page(s), e.g. ${from[0]})`);

// sitemap.xml ⇄ indexable pages.
const sitemapFile = join(root, "sitemap.xml");
const sitemap = existsSync(sitemapFile) ? readFileSync(sitemapFile, "utf8") : "";
const listed = new Set(
  [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc = ""]) => new URL(loc).pathname),
);
const indexable = pages
  .filter((file) => !/<meta name="robots" content="noindex/.test(readFileSync(file, "utf8")))
  .map((file) =>
    file
      .slice(root.length)
      .replace(/index\.html$/, "")
      .replace(/\.html$/, "/"),
  )
  .filter((path) => path !== "/404/");
// The old address stays as an index that names /sitemap.xml.
const index = existsSync(join(root, "sitemap-index.xml"))
  ? readFileSync(join(root, "sitemap-index.xml"), "utf8")
  : "";
const indexed = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
  ([, loc = ""]) => new URL(loc).pathname,
);
if (indexed.join() !== "/sitemap.xml")
  console.log(
    `  sitemap-index.xml should name /sitemap.xml only, names: ${indexed.join(", ") || "nothing"}`,
  );
const unlisted = indexable.filter((path) => !listed.has(path));
const missing = [...listed].filter((path) => !built(path));
console.log(
  `sitemap.xml: ${listed.size} URLs, ${unlisted.length} indexable pages missing, ${missing.length} not built`,
);
for (const path of unlisted) console.log(`  not in sitemap: ${path}`);
for (const path of missing) console.log(`  in sitemap, not built: ${path}`);
process.exit(
  broken.size ||
    unlisted.length ||
    missing.length ||
    !listed.size ||
    indexed.join() !== "/sitemap.xml"
    ? 1
    : 0,
);
