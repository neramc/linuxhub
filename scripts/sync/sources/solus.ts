/**
 * Solus. Solus is rolling, and its download page (getsol.us/download/) offers
 * exactly one snapshot at a time: the four editions of the newest ISO date.
 * Everything comes from that page and the files it links on the official
 * download host, downloads.getsol.us:
 *
 * - ISO links (isos/<date>/Solus-<Edition>-Release-<date>.iso): the editions
 *   and the snapshot date. All four editions must be present and share one
 *   date, and an edition the module does not know throws, so nothing the page
 *   offers is dropped silently.
 * - Per-ISO "SHA checksum file" (SHA-256, GNU format) from the same folder is
 *   the checksum; the page also links its detached signature ("Checksum
 *   signature file", .sha256sum.sign), which is the artifact's signatureUrl
 *   (it signs the checksum file, as with Debian's SHA256SUMS.sign), and the
 *   .torrent. The magnet link on the page carries the exact size (xl=).
 * - Version and codename: the page states neither, so they come from the
 *   release post the page's blog list links ("Solus 4.9 Released", codename in
 *   "Welcome to Solus 4.9 <em>Serenity</em>"). The post is accepted only when
 *   its published day equals the ISO date, so an announcement of a release
 *   whose ISOs are not on the page yet (or the reverse) fails instead of
 *   mixing versions.
 *
 * Mirrors: Solus publishes no mirror list for the images; downloads.getsol.us
 * (a single Caddy origin) is the only host, so the mirrors file holds the ISO
 * tree of that origin. Solus has no EOL date (rolling), so eol is null.
 *
 * Excluded, for every distro alike: earlier snapshots that remain on the host
 * (4.4 to 4.8, no longer offered on the download page), the beta/, crew/,
 * releasetesters/ and staff/ trees (development and tester builds the page
 * does not link), the "latest" aliases (duplicates of the current ISOs), and
 * the packages/sources lists next to the images. Only x86_64 images exist.
 */

import type { Artifact, Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getText } from "../http";
import { parseChecksums } from "../lib/checksums";
import { originAsMirror } from "../lib/mirrors";
import { defineSource } from "../source";

const SITE = "https://getsol.us";
const PAGE = `${SITE}/download/`;
const ISOS = "https://downloads.getsol.us/isos/";
const TORRENTS = "https://downloads.getsol.us/torrents/";

/** Edition name in the ISO file name → edition. The order is the page's (and display) order. */
const EDITIONS: { name: string; desktop: Desktop }[] = [
  { name: "Budgie", desktop: "budgie" },
  { name: "GNOME", desktop: "gnome" },
  { name: "Plasma", desktop: "kde" },
  { name: "Xfce", desktop: "xfce" },
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A link on the page, quoted or not (the site's HTML is minified). */
const linked = (html: string, url: string) =>
  new RegExp(`href=["']?${esc(url)}(?=["' >])`).test(html);

interface Post {
  url: string;
  version: string;
}

/** Release posts the page links ("/2026/04/solus-4-9-released/"), newest first, in the ISO's month. */
function candidatePosts(html: string, isoDate: string): Post[] {
  const [year, month] = isoDate.split("-");
  const seen = new Set<string>();
  const posts: Post[] = [];
  for (const m of html.matchAll(
    /href=["']?(\/(\d{4})\/(\d{2})\/(?:\d{2}\/)?solus-(\d+(?:-\d+)+)-released\/)(?=["' >])/g,
  )) {
    const [, path, y, mo, ver] = m;
    if (!path || !ver || y !== year || mo !== month || seen.has(path)) continue;
    seen.add(path);
    posts.push({ url: `${SITE}${path}`, version: ver.replace(/-/g, ".") });
  }
  return posts;
}

export default defineSource({
  slug: "solus",
  hosts: ["downloads.getsol.us"],
  async releases(ctx) {
    const html = await getText(PAGE, { accept: "text/html" });

    // The editions the page offers: every ISO link, keyed by edition.
    const offered = new Map<string, { date: string; file: string }>();
    for (const m of html.matchAll(
      new RegExp(
        `href=["']?${esc(ISOS)}(\\d{4}-\\d{2}-\\d{2})/(Solus-([A-Za-z0-9]+)-Release-\\1\\.iso)(?=["' >])`,
        "g",
      ),
    )) {
      const [, date, file, name] = m;
      if (!date || !file || !name) continue;
      if (!EDITIONS.some((e) => e.name === name))
        throw new Error(`${PAGE} offers an unknown Solus edition: ${name}`);
      offered.set(name, { date, file });
    }
    for (const def of EDITIONS)
      if (!offered.has(def.name)) throw new Error(`${PAGE} no longer offers Solus ${def.name}`);
    const dates = new Set([...offered.values()].map((o) => o.date));
    if (dates.size !== 1)
      throw new Error(`${PAGE} offers images of different dates: ${[...dates].join(", ")}`);
    const isoDate = [...dates][0] as string;
    const dir = `${ISOS}${isoDate}/`;

    const editions: Edition[] = [];
    for (const def of EDITIONS) {
      const file = (offered.get(def.name) as { file: string }).file;
      const sumUrl = `${dir}${file}.sha256sum`;
      if (!linked(html, sumUrl)) throw new Error(`${PAGE} links no checksum file for ${file}`);
      const hash = parseChecksums(await getText(sumUrl)).get(file);
      if (!hash || !/^[0-9a-f]{64}$/.test(hash))
        throw new Error(`${sumUrl} has no SHA-256 for ${file}`);
      const size = html.match(new RegExp(`dn=${esc(file)}&(?:amp;)?xl=(\\d+)`))?.[1];
      const signature = `${sumUrl}.sign`;
      const torrent = `${TORRENTS}${file}.torrent`;
      const artifact: Artifact = {
        arch: "x86_64",
        format: "iso",
        file,
        path: `${isoDate}/${file}`,
        url: `${dir}${file}`,
        size: size ? Number(size) : null,
        checksum: { type: "sha256", value: hash, url: sumUrl },
        signatureUrl: linked(html, signature) ? signature : null,
        torrentUrl: linked(html, torrent) ? torrent : null,
      };
      editions.push({
        id: def.name.toLowerCase(),
        name: def.name,
        desktop: def.desktop,
        kind: "desktop",
        artifacts: [artifact],
      });
    }

    // Version, codename and notes: the release post published on the ISO date.
    let release: { post: Post; codename: string | null } | null = null;
    for (const post of candidatePosts(html, isoDate)) {
      const text = await getText(post.url, { accept: "text/html" });
      const day = text.match(
        /<meta property=["']?article:published_time["']? content=["']?(\d{4}-\d{2}-\d{2})T/,
      )?.[1];
      if (day !== isoDate) continue;
      const codename =
        text.match(new RegExp(`Solus ${esc(post.version)} <em>([A-Z][A-Za-z ]{1,30})</em>`))?.[1] ??
        null;
      if (!codename) ctx.log(`no codename in ${post.url}`);
      release = { post, codename };
      break;
    }
    if (!release) throw new Error(`no Solus release post for the ${isoDate} images on ${PAGE}`);

    const releases: Release[] = [
      {
        version: release.post.version,
        channel: "rolling",
        codename: release.codename,
        releaseDate: isoDate,
        eol: null,
        notesUrl: release.post.url,
        editions,
      },
    ];
    return { sources: [PAGE, release.post.url], releases };
  },
  async mirrors() {
    const mirrors: Mirror[] = [originAsMirror(ISOS, "downloads.getsol.us")];
    return { sources: [PAGE], mirrors };
  },
});
