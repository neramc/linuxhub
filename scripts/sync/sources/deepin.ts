/**
 * deepin: images, sizes and SHA-256 from the official release repository
 * cdimage.deepin.com/releases/<version>/<arch>/ (directory listing +
 * SHA256SUMS); the release date and notes link from the "deepin <version>
 * Release Note" post via the deepin.org WordPress REST API. Mirrors: the
 * official ISO mirror table on deepin.org (grouped by country), HTTPS
 * entries only. Each mirror root carries the same tree as /releases/.
 */

import type { Artifact, Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import { getJson, getText } from "../http";
import { parseChecksums } from "../lib/checksums";
import { listDirectory } from "../lib/dirlist";
import { countryCode, withSlash } from "../lib/mirrors";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const RELEASES = "https://cdimage.deepin.com/releases/";
const POSTS = "https://www.deepin.org/en/wp-json/wp/v2/posts";
const MIRRORS = "https://www.deepin.org/en/mirrors/releases/";

const ARCHES: Record<string, Artifact["arch"]> = {
  amd64: "x86_64",
  arm64: "aarch64",
  riscv64: "riscv64",
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "file → size in bytes" from an nginx autoindex page (exact sizes are printed in bytes). */
function sizes(html: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of html.matchAll(/<a href="([^"?/]+)">[^<]*<\/a>\s+\S+\s+\S+\s+(\d+)\s*$/gm)) {
    if (m[1] && m[2]) out.set(decodeURIComponent(m[1]), Number(m[2]));
  }
  return out;
}

/** Date and link of the official "deepin <version> Release Note" post. */
async function releaseNote(version: string): Promise<{ date: string | null; url: string | null }> {
  try {
    const posts = await getJson<{ date: string; link: string; title: { rendered: string } }[]>(
      `${POSTS}?search=${encodeURIComponent(version)}&per_page=20&_fields=date,link,title`,
    );
    const title = new RegExp(`^deepin\\s+${escapeRe(version)}\\s+Release\\s+Note`, "i");
    const post = posts.find((p) => title.test(p.title.rendered));
    if (post?.link.startsWith("https://"))
      return { date: post.date.slice(0, 10) || null, url: post.link };
  } catch {
    /* the date is optional */
  }
  return { date: null, url: null };
}

export default defineSource({
  slug: "deepin",
  hosts: ["cdimage.deepin.com"],
  async releases() {
    const versions = (await listDirectory(RELEASES))
      .map((name) => name.match(/^(\d+(?:\.\d+)+)\/$/)?.[1])
      .filter((v): v is string => Boolean(v))
      .sort((a, b) => compareVersions(b, a));

    // Newest release directory that actually carries desktop images.
    for (const version of versions.slice(0, 2)) {
      const arches = await listDirectory(`${RELEASES}${version}/`);
      const artifacts: Artifact[] = [];
      for (const [deepinArch, arch] of Object.entries(ARCHES)) {
        if (!arches.includes(`${deepinArch}/`)) continue;
        const dir = `${RELEASES}${version}/${deepinArch}/`;
        const listing = await getText(dir, { accept: "text/html" });
        const file = `deepin-desktop-community-${version}-${deepinArch}.iso`;
        if (!listing.includes(`href="${file}"`) || !listing.includes('href="SHA256SUMS"')) continue;
        const sha = parseChecksums(await getText(`${dir}SHA256SUMS`)).get(file);
        if (!sha) continue;
        artifacts.push({
          arch,
          format: "iso",
          file,
          path: `${version}/${deepinArch}/${file}`,
          url: `${dir}${file}`,
          size: sizes(listing).get(file) ?? null,
          checksum: { type: "sha256", value: sha, url: `${dir}SHA256SUMS` },
          signatureUrl: null,
          torrentUrl: null,
        });
      }
      if (!artifacts.length) continue;

      const editions: Edition[] = [
        { id: "desktop", name: "Desktop", desktop: "dde", kind: "desktop", artifacts },
      ];
      const note = await releaseNote(version);
      const releases: Release[] = [
        {
          version,
          channel: "stable",
          codename: null,
          releaseDate: note.date,
          eol: null,
          notesUrl: note.url,
          editions,
        },
      ];
      return { sources: [RELEASES, POSTS], releases };
    }
    throw new Error("no deepin desktop images in the newest release directories");
  },
  async mirrors() {
    const html = await getText(MIRRORS, { accept: "text/html" });
    const table = html.match(/<table class="dm-table">([\s\S]*?)<\/table>/)?.[1];
    if (!table) throw new Error("mirror table not found on the official mirror page");
    const mirrors: Mirror[] = [];
    let country: string | null = null;
    for (const row of table.split(/<tr\b/).slice(1)) {
      if (/class="dm-country"/.test(row)) {
        country = countryCode(row.replace(/<[^>]+>/g, " ").trim());
        continue;
      }
      const name = row
        .match(/class="dm-name"[^>]*>([\s\S]*?)<\/td>/)?.[1]
        ?.replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .trim();
      const https = [...row.matchAll(/href="(https:\/\/[^"]+)"/g)].map((m) => m[1])[0];
      if (!https) continue; // HTTP/FTP-only mirror
      const url = withSlash(https);
      if (mirrors.some((m) => m.url === url)) continue;
      mirrors.push({
        url,
        country,
        name: name || new URL(url).hostname,
        lat: null,
        lon: null,
        score: null,
      });
    }
    return { sources: [MIRRORS], mirrors };
  },
});
