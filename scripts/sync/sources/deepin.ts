/**
 * deepin: the releases the official download page offers, with the images,
 * sizes and checksums of deepin's own release repository, and the official
 * ISO mirror table.
 *
 * Official sources used:
 * - www.deepin.org/en/download/: decides which releases and architectures
 *   exist. Every release card links the architecture's folder in the release
 *   repository and its SHA256SUMS/MD5SUMS; those links are the list (today the
 *   newest release and the "Legacy Release" line, deepin 23). It also links
 *   the BitTorrent file of each image (storage.deepin.org).
 * - cdimage.deepin.com/releases/<version>/<arch>/: the release repository.
 *   The folder listing prints the exact size of each file in bytes; SHA256SUMS
 *   (the strongest published; MD5SUMS also exists) holds the checksum. Every
 *   image the page links must be in both, or the sync throws.
 * - www.deepin.org/en/wp-json/wp/v2/posts: the project's own post "deepin
 *   <version> Release Note", for the release date (its publication day) and
 *   the notes link. No post (yet): date and link stay null.
 * - www.deepin.org/en/mirrors/releases/: the official ISO mirror table
 *   (grouped by country). HTTPS entries only. Its text states which deepin
 *   generation the mirrors carry ("provides deepin 25 installation images"):
 *   only images of that generation and newer get a mirror path; older images
 *   (deepin 23) are offered from the release repository alone, because the
 *   list does not claim the mirrors carry them. The release repository
 *   itself is listed above the table as "Official ISO Repository"; it is the
 *   artifacts' own url, not a mirror entry.
 *
 * Not included (the page offers them, the policy or the data model leaves
 * them out): LoongArch images (loong64 / loongarch64: no such architecture in
 * the catalog's taxonomy), the WSL image (a GitHub release, provider-specific
 * format), the single-board-computer images of the deepin-ports SIG (separate
 * project pages, per-board), the stand-alone "Live System" rescue image
 * (not a deepin release, MD5 over http only), SourceForge (a second download
 * channel; the release repository and mirror table are the primary ones),
 * deepin 20.9 and older (linked only as a plain folder under "Previous
 * Versions", no release card, no support statement), and the intermediate
 * point releases that only exist as folders of the release repository (25.0.1,
 * 25.0.10, 25.1.0).
 *
 * deepin publishes no end-of-support dates and endoflife.date has no deepin
 * product, so eol is null. The riscv64 image is marked "Technology Preview"
 * on the page but belongs to the stable release and is included.
 */

import type { Artifact, Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import { getJson, getText } from "../http";
import { parseChecksums } from "../lib/checksums";
import { countryCode, withSlash } from "../lib/mirrors";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const PAGE = "https://www.deepin.org/en/download/";
const RELEASES = "https://cdimage.deepin.com/releases/";
const POSTS = "https://www.deepin.org/en/wp-json/wp/v2/posts";
const MIRRORS = "https://www.deepin.org/en/mirrors/releases/";

const ARCHES: Record<string, Artifact["arch"]> = {
  amd64: "x86_64",
  arm64: "aarch64",
  riscv64: "riscv64",
};
/** Architectures the page offers that the catalog has no place for. */
const UNSUPPORTED_ARCHES = new Set(["loong64", "loongarch64"]);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const major = (version: string) => Number(version.split(".")[0]);

/** Visible text of an HTML fragment. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** "file → size in bytes" from the release repository's autoindex (exact sizes are printed in bytes). */
function sizes(html: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of html.matchAll(/<a href="([^"?/]+)">[^<]*<\/a>\s+\S+\s+\S+\s+(\d+)\s*$/gm)) {
    if (m[1] && m[2]) out.set(decodeURIComponent(m[1]), Number(m[2]));
  }
  return out;
}

/** The deepin generation the official mirror table says its mirrors carry ("deepin 25 installation images"). */
function mirroredFrom(html: string): number {
  const n = html.match(/provides\s+deepin\s+(\d+)\s+installation\s+images/i)?.[1];
  if (!n)
    throw new Error(
      "the official mirror page no longer says which deepin images the mirrors carry",
    );
  return Number(n);
}

/** Date and link of the official "deepin <version> Release Note" post; nulls when there is none. */
async function releaseNote(version: string): Promise<{ date: string | null; url: string | null }> {
  const posts = await getJson<{ date: string; link: string; title: { rendered: string } }[]>(
    `${POSTS}?search=${encodeURIComponent(version)}&per_page=20&_fields=date,link,title`,
  );
  const title = new RegExp(`^deepin\\s+${escapeRe(version)}\\s+Release\\s+Note`, "i");
  const post = posts.find((p) => title.test(text(p.title.rendered)));
  if (post?.link.startsWith("https://"))
    return {
      date: /^\d{4}-\d{2}-\d{2}/.test(post.date) ? post.date.slice(0, 10) : null,
      url: post.link,
    };
  return { date: null, url: null };
}

export default defineSource({
  slug: "deepin",
  hosts: ["cdimage.deepin.com", "storage.deepin.org"],

  async releases(ctx) {
    // The page: which release folders (version + architecture) it links, and the torrents.
    const page = await getText(PAGE, { accept: "text/html" });
    const offered = new Map<string, string[]>();
    for (const m of page.matchAll(
      /href="https:\/\/cdimage\.deepin\.com\/releases\/(\d+(?:\.\d+)+)\/([a-z0-9]+)\/SHA256SUMS"/g,
    )) {
      const [, version, dir] = m;
      if (!version || !dir) continue;
      const dirs = offered.get(version) ?? [];
      if (!dirs.includes(dir)) dirs.push(dir);
      offered.set(version, dirs);
    }
    if (offered.size === 0)
      throw new Error("the deepin download page links no release folder with a SHA256SUMS");
    const torrents = new Map<string, string>();
    for (const m of page.matchAll(
      /href="(https:\/\/storage\.deepin\.org\/[^"]+\.iso\.torrent)"/g,
    )) {
      const url = m[1] ?? "";
      torrents.set(
        decodeURIComponent(
          url
            .split("/")
            .pop()
            ?.replace(/\.torrent$/, "") ?? "",
        ),
        url,
      );
    }

    const carriedFrom = mirroredFrom(await getText(MIRRORS, { accept: "text/html" }));
    const versions = [...offered.keys()].sort((a, b) => compareVersions(b, a));
    const releases: Release[] = [];
    for (const version of versions) {
      const artifacts: Artifact[] = [];
      for (const dirName of offered.get(version) ?? []) {
        const arch = ARCHES[dirName];
        if (!arch) {
          if (UNSUPPORTED_ARCHES.has(dirName)) {
            ctx.log(`${version}/${dirName}: architecture not in the catalog, left out`);
            continue;
          }
          throw new Error(`deepin ${version}: unknown architecture folder "${dirName}"`);
        }
        const dir = `${RELEASES}${version}/${dirName}/`;
        const listing = await getText(dir, { accept: "text/html" });
        const file = `deepin-desktop-community-${version}-${dirName}.iso`;
        const size = sizes(listing).get(file);
        const sha = parseChecksums(await getText(`${dir}SHA256SUMS`)).get(file);
        if (!size || !sha)
          throw new Error(
            `deepin ${version}/${dirName}: ${file} is linked but not in the folder or its SHA256SUMS`,
          );
        artifacts.push({
          arch,
          format: "iso",
          file,
          path: major(version) >= carriedFrom ? `${version}/${dirName}/${file}` : null,
          url: `${dir}${file}`,
          size,
          checksum: { type: "sha256", value: sha, url: `${dir}SHA256SUMS` },
          signatureUrl: null,
          torrentUrl: torrents.get(file) ?? null,
        });
      }
      if (artifacts.length === 0) continue;

      const editions: Edition[] = [
        { id: "desktop", name: "Desktop", desktop: "dde", kind: "desktop", artifacts },
      ];
      const note = await releaseNote(version);
      releases.push({
        version,
        channel: "stable",
        codename: null,
        releaseDate: note.date,
        eol: null,
        notesUrl: note.url,
        editions,
      });
    }
    const newest = releases[0];
    if (!newest?.editions.some((e) => e.artifacts.some((a) => a.arch === "x86_64")))
      throw new Error("no x86_64 deepin image on the download page");
    return { sources: [PAGE, RELEASES, POSTS], releases };
  },

  async mirrors() {
    const html = await getText(MIRRORS, { accept: "text/html" });
    const table = html.match(/<table class="dm-table">([\s\S]*?)<\/table>/)?.[1];
    if (!table) throw new Error("mirror table not found on the official mirror page");
    const mirrors: Mirror[] = [];
    let country: string | null = null;
    for (const row of table.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/g)) {
      const [, attrs = "", body = ""] = row;
      if (/\bdm-country\b/.test(attrs)) {
        const heading = text(body);
        country = countryCode(heading);
        if (!country) throw new Error(`deepin mirror table: unknown country "${heading}"`);
        continue;
      }
      if (!/\bdm-name\b/.test(body)) continue; // header row
      const https = body.match(/href="(https:\/\/[^"]+)"/)?.[1];
      if (!https) continue; // HTTP/FTP-only mirror
      if (!country) throw new Error("deepin mirror table: a mirror before any country heading");
      const url = withSlash(https);
      if (mirrors.some((m) => m.url === url)) continue;
      mirrors.push({
        url,
        country,
        name:
          text(body.match(/class="dm-name"[^>]*>([\s\S]*?)<\/td>/)?.[1] ?? "") ||
          new URL(url).hostname,
        lat: null,
        lon: null,
        score: null,
      });
    }
    if (mirrors.length === 0) throw new Error("the deepin mirror table lists no HTTPS mirror");
    return { sources: [MIRRORS], mirrors };
  },
});
