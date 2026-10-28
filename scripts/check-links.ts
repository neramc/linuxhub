/**
 * Checks every internal link of the static build: each root-relative href/src
 * must be a built file or page, and each same-page "#fragment" must name an
 * id on that page. /api/ routes are on-demand functions and are skipped.
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
process.exit(broken.size ? 1 : 0);
