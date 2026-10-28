/**
 * Linux Mint: every release line that the project's own "All Versions" page
 * lists as currently supported (Linux Mint 22.x and 21.x on Ubuntu, and LMDE 7
 * on Debian), each with its newest point release, plus the project's HWE
 * images and its official mirror list.
 *
 * Official sources, and what each one is used for:
 * - www.linuxmint.com/download_all.php ("All Versions", Currently supported):
 *   the lines and point releases, the code name, the package base, the support
 *   status ("supported until April 2029" → the last day of that month,
 *   periodEnd(); LMDE states no date → null; a line past its date is dropped)
 *   and the edition pages of every release.
 * - www.linuxmint.com/download.php: what the main download page offers now.
 *   The newest Ubuntu-based release must show exactly the editions that the
 *   All Versions page lists for it (the page's commented-out "EDGE" block is
 *   ignored: it is not offered), or the sync throws.
 * - www.linuxmint.com/edition.php?id=N (one per edition): the image's origin
 *   URL (the "Linux Mint" row of its mirror table), the .torrent link, the
 *   release announcement and the release notes link. The page rounds the size
 *   ("2.9GB"), so sizes are left null for run.ts.
 * - pub.linuxmint.io (the ISO origin, also the "Linux Mint" row of the mirror
 *   list): <dir>/sha256sum.txt is the official SHA-256 file (checksum.url) and
 *   sha256sum.txt.gpg its OpenPGP signature (signatureUrl: it signs the
 *   checksum file, not the ISO).
 * - blog.linuxmint.com: the release announcement each edition page links. Its
 *   publication date is the release date (the ISO directory is filled a few
 *   days earlier). endoflife.date is not needed.
 * - www.linuxmint.com/hwe.php: the HWE ISOs ("Hardware Enablement": the
 *   release's own desktop with a newer kernel), offered for the latest
 *   release. The page names the release and the kernels; pub.linuxmint.io/hwe/
 *   has the images and their sha256sum.txt. Every offered kernel becomes
 *   editions "<desktop>-hwe-<kernel>" of that release. Neither the HWE page
 *   nor the edition pages link a torrent for them (the usual torrent URL
 *   answers 404), so torrentUrl is null.
 * - www.linuxmint.com/mirrors.php, table "Download mirrors": the official
 *   mirror list, one root per entry (root + "stable/<version>/<file>",
 *   "debian/<file>" or "hwe/<file>" is the file). Country comes from the
 *   Location column ("World" → null); the list has no coordinates or scores.
 *   The second table ("Repository mirrors") is for apt packages and is not
 *   used. Entries published over plain http are not listed.
 *
 * LMDE: "Linux Mint Debian Edition" is listed in the project's download menu
 * ("Other versions") and in the supported-releases table, so it is a release
 * of this catalog entry. Its version is "LMDE 7" so that a bare "7" is never
 * read as Linux Mint 7 in version lists and release feeds.
 *
 * Deviations from the shared policy: the release date is the announcement's
 * publication day, which can differ by a couple of days from the day the ISO
 * directory was filled (22.3: 2026-01-13 on the blog); the HWE images are
 * editions of the latest release although the main download page only links
 * them ("try an HWE ISO"), because hwe.php is the project's own download page
 * for them; the version string of LMDE is not numeric (see above).
 *
 * Excluded for every distro alike: the 21.3 "edge" ISO (it sits on the server
 * but no download page offers it), the older point releases of each line, the
 * 32-bit images of LMDE 4 to 6 (their lines are not supported), the "testing"
 * tree, and the unreleased future versions. The project publishes only
 * SHA-256, in one file per directory.
 */

import type { Artifact, Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import { DESKTOPS } from "../../../src/lib/taxonomy";
import { getText } from "../http";
import { parseChecksums } from "../lib/checksums";
import { countryCode, withSlash } from "../lib/mirrors";
import { compareVersions, isoDay, periodEnd } from "../lib/versions";
import { defineSource } from "../source";

const SITE = "https://www.linuxmint.com/";
const ALL_PAGE = `${SITE}download_all.php`;
const DOWNLOAD_PAGE = `${SITE}download.php`;
const HWE_PAGE = `${SITE}hwe.php`;
const MIRRORS_PAGE = `${SITE}mirrors.php`;
const ORIGIN = "https://pub.linuxmint.io/";

/** The "Currently supported" table: one group of rows per release. */
interface Row {
  version: string;
  codename: string;
  base: string;
  status: string;
  editions: { id: number; label: string }[];
}

const clean = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#0?34;|&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const withoutComments = (html: string) => html.replace(/<!--[\s\S]*?-->/g, "");

function parseAll(html: string): Row[] {
  const rows: Row[] = [];
  for (const tr of html.split(/<tr[\s>]/i).slice(1)) {
    const link = tr.match(/<a href="edition\.php\?id=(\d+)">([^<]*)<\/a>/);
    if (!link?.[1]) continue;
    const edition = { id: Number(link[1]), label: clean(link[2] ?? "") };
    const cells = [...tr.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)];
    if (/rowspan/.test(cells[0]?.[1] ?? "")) {
      rows.push({
        version: clean(cells[0]?.[2] ?? ""),
        codename: clean(cells[1]?.[2] ?? ""),
        base: clean(cells[3]?.[2] ?? ""),
        status: clean(cells[4]?.[2] ?? ""),
        editions: [edition],
      });
    } else rows[rows.length - 1]?.editions.push(edition);
  }
  if (!rows.length) throw new Error("the Linux Mint All Versions page lists no release");
  for (const r of rows)
    if (!/^\d+(\.\d+)*$/.test(r.version) || !r.codename || !r.base || !r.status)
      throw new Error(`the Linux Mint All Versions table changed (row "${r.version}")`);
  return rows;
}

const isLmde = (row: Row) => /^debian/i.test(row.base);
const lineOf = (row: Row) => `${isLmde(row) ? "lmde" : "mint"}-${row.version.split(".")[0]}`;

/** Edition ids ("edition.php?id=N") that the main download page offers, ignoring commented-out blocks. */
function offeredOnDownloadPage(html: string): number[] {
  return [
    ...new Set(
      [...withoutComments(html).matchAll(/href="edition\.php\?id=(\d+)"/g)].map((m) =>
        Number(m[1]),
      ),
    ),
  ].sort((a, b) => a - b);
}

interface EditionPage {
  /** Image URLs of the origin (pub.linuxmint.io) by architecture. */
  files: { arch: Artifact["arch"]; url: string }[];
  /** Torrent URL by image file name. */
  torrents: Map<string, string>;
  announcement: string | null;
  notes: string | null;
}

function archOf(file: string): Artifact["arch"] {
  if (/-64bit\b/.test(file)) return "x86_64";
  if (/-32bit\b/.test(file)) return "i686";
  throw new Error(`Linux Mint image ${file} names no architecture`);
}

function parseEditionPage(html: string, row: Row, id: number): EditionPage {
  const title = clean(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");
  const wanted = `${isLmde(row) ? "LMDE" : "Linux Mint"} ${row.version} "${row.codename}"`;
  if (!title.startsWith(wanted))
    throw new Error(`Linux Mint edition ${id}: expected "${wanted}", the page says "${title}"`);
  const files = [
    ...new Set(
      [...html.matchAll(/href="(https:\/\/pub\.linuxmint\.io\/[^"]+\.iso)"/g)].map((m) => m[1]),
    ),
  ]
    .filter((u): u is string => Boolean(u))
    .map((url) => ({ arch: archOf(url), url }));
  if (!files.length) throw new Error(`Linux Mint edition ${id} lists no image on ${ORIGIN}`);
  const torrents = new Map<string, string>();
  for (const m of html.matchAll(
    /href="(https:\/\/www\.linuxmint\.com\/torrents\/([^"/]+)\.torrent)"/g,
  ))
    if (m[1] && m[2]) torrents.set(m[2], m[1]);
  return {
    files,
    torrents,
    announcement:
      html.match(
        /<a href="(https:\/\/blog\.linuxmint\.com\/[^"]+)"[^>]*>Release Announcement<\/a>/,
      )?.[1] ?? null,
    notes:
      html.match(
        /<a href="(https:\/\/(?:www\.)?linuxmint\.com\/rel_[^"]+)"[^>]*>Release Notes<\/a>/,
      )?.[1] ?? null,
  };
}

/** Publication day of a blog post: its <time class="entry-date published" datetime="…">. */
function postDay(html: string): string | null {
  return isoDay(html.match(/class="entry-date published" datetime="([^"]+)"/)?.[1]);
}

const dirOf = (url: string) => url.slice(0, url.lastIndexOf("/") + 1);
const fileOf = (url: string) => url.slice(url.lastIndexOf("/") + 1);

/** HWE cards of hwe.php: the release and the kernels its HWE ISOs ship. */
function parseHwePage(html: string): { version: string; kernels: string[] }[] {
  if (!/Available HWE ISOs/.test(html)) throw new Error("the Linux Mint HWE page changed");
  const cards: { version: string; kernels: string[] }[] = [];
  const parts = html.split(/<h6 class="mb-3">Linux Mint (\d+(?:\.\d+)*)<\/h6>/);
  for (let i = 1; i < parts.length; i += 2) {
    const block = (parts[i + 1] ?? "").split(/<h3\b/)[0] ?? "";
    const hwe = block.split("Kernel in HWE ISOs")[1] ?? "";
    const kernels = [...hwe.matchAll(/<strong>(\d+\.\d+)<\/strong>/g)].map((m) => m[1] as string);
    if (!kernels.length) throw new Error(`the Linux Mint HWE page lists no kernel for ${parts[i]}`);
    cards.push({ version: parts[i] as string, kernels });
  }
  return cards;
}

export default defineSource({
  slug: "linux-mint",
  hosts: ["pub.linuxmint.io", "www.linuxmint.com"],
  async releases(ctx) {
    const rows = parseAll(await getText(ALL_PAGE));

    // The newest point release of every line that is not past its end of support.
    const newest = new Map<string, Row>();
    for (const row of rows) {
      const best = newest.get(lineOf(row));
      if (!best || compareVersions(row.version, best.version) > 0) newest.set(lineOf(row), row);
    }
    const planned = [...newest.values()]
      .map((row) => {
        const until = row.status.match(/supported until ([A-Za-z]+ \d{4})/)?.[1];
        const eol = until ? periodEnd(until) : null;
        if (until && !eol) throw new Error(`cannot read the support date "${until}"`);
        return { row, eol };
      })
      .filter((p) => !p.eol || p.eol >= ctx.today)
      .sort(
        (a, b) =>
          Number(isLmde(a.row)) - Number(isLmde(b.row)) ||
          compareVersions(b.row.version, a.row.version),
      );
    if (!planned.some((p) => !isLmde(p.row)))
      throw new Error("no supported Linux Mint release on the All Versions page");

    // The main download page must offer exactly the newest Ubuntu-based release's editions.
    const current = planned.find((p) => !isLmde(p.row))?.row as Row;
    const offered = offeredOnDownloadPage(await getText(DOWNLOAD_PAGE));
    const expected = current.editions.map((e) => e.id).sort((a, b) => a - b);
    if (offered.join() !== expected.join())
      throw new Error(
        `the download page offers editions ${offered.join(", ")}, the All Versions page lists ${expected.join(", ")} for ${current.version}`,
      );

    const sums = new Map<string, Map<string, string>>();
    const checksumsIn = async (dir: string) => {
      let parsed = sums.get(dir);
      if (!parsed) {
        parsed = parseChecksums(await getText(`${dir}sha256sum.txt`));
        sums.set(dir, parsed);
      }
      return parsed;
    };
    const artifact = async (
      dir: string,
      file: string,
      torrent: string | null,
    ): Promise<Artifact> => {
      const sha = (await checksumsIn(dir)).get(file);
      if (!sha || !/^[0-9a-f]{64}$/.test(sha))
        throw new Error(`${dir}sha256sum.txt lists no SHA-256 for ${file}`);
      return {
        arch: archOf(file),
        format: "iso",
        file,
        path: `${dir.slice(ORIGIN.length)}${file}`,
        url: `${dir}${file}`,
        size: null,
        checksum: { type: "sha256", value: sha, url: `${dir}sha256sum.txt` },
        signatureUrl: `${dir}sha256sum.txt.gpg`,
        torrentUrl: torrent,
      };
    };

    const hwe = parseHwePage(await getText(HWE_PAGE));
    const releases: Release[] = [];
    for (const { row, eol } of planned) {
      const editions: Edition[] = [];
      let announcement: string | null = null;
      let notes: string | null = null;
      for (const ed of row.editions) {
        const page = parseEditionPage(await getText(`${SITE}edition.php?id=${ed.id}`), row, ed.id);
        announcement ??= page.announcement;
        notes ??= page.notes;
        const id = ed.label.toLowerCase();
        const artifacts: Artifact[] = [];
        for (const f of page.files) {
          const file = fileOf(f.url);
          artifacts.push(await artifact(dirOf(f.url), file, page.torrents.get(file) ?? null));
        }
        editions.push({
          id,
          name: `${ed.label} Edition`,
          desktop: id in DESKTOPS ? (id as keyof typeof DESKTOPS) : null,
          kind: "desktop",
          artifacts,
        });
      }

      // HWE images of this release, in the order of the page's kernels.
      const card = hwe.find((c) => c.version === row.version);
      if (card) {
        const before = editions.length;
        const base = [...editions];
        for (const kernel of card.kernels) {
          for (const ed of base) {
            const file = `linuxmint-${row.version}-${ed.id}-64bit-hwe-${kernel}.iso`;
            if (!(await checksumsIn(`${ORIGIN}hwe/`)).has(file)) continue;
            editions.push({
              id: `${ed.id}-hwe-${kernel.replace(".", "-")}`,
              name: `${ed.name} (HWE kernel ${kernel})`,
              desktop: ed.desktop,
              kind: "desktop",
              artifacts: [await artifact(`${ORIGIN}hwe/`, file, null)],
            });
          }
        }
        if (editions.length === before)
          throw new Error(
            `the HWE page lists ${row.version} but pub.linuxmint.io/hwe has no image`,
          );
      }

      const date = announcement ? postDay(await getText(announcement)) : null;
      if (announcement && !date)
        throw new Error(`no publication date on the release announcement ${announcement}`);
      releases.push({
        version: isLmde(row) ? `LMDE ${row.version}` : row.version,
        channel: /long term support/i.test(row.status) ? "lts" : "stable",
        codename: row.codename,
        releaseDate: date,
        eol,
        notesUrl: notes,
        editions,
      });
    }
    return { sources: [ALL_PAGE, DOWNLOAD_PAGE, HWE_PAGE, ORIGIN], releases };
  },
  async mirrors() {
    const html = await getText(MIRRORS_PAGE);
    const start = html.search(/<h2[^>]*>\s*Download mirrors\s*<\/h2>/i);
    if (start < 0) throw new Error("the Linux Mint mirror page has no Download mirrors table");
    const table = html.slice(start).split(/<\/table>/i)[0] ?? "";
    const mirrors: Mirror[] = [];
    for (const tr of table.split(/<tr[\s>]/i).slice(1)) {
      const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1] ?? "");
      const link = cells[1]?.match(/<a href="(https?:\/\/[^"]+)"[^>]*>([^<]*)<\/a>/);
      const href = link?.[1];
      if (!href?.startsWith("https://")) continue;
      const place = clean(cells[0] ?? "");
      const country = place === "World" ? null : countryCode(place);
      if (place !== "World" && !country)
        throw new Error(`unknown country "${place}" on the Linux Mint mirror page`);
      mirrors.push({
        url: withSlash(href),
        country,
        name: clean(link?.[2] ?? "") || null,
        lat: null,
        lon: null,
        score: null,
      });
    }
    if (!mirrors.length) throw new Error("the Linux Mint mirror page lists no https mirror");
    return { sources: [MIRRORS_PAGE], mirrors };
  },
});
