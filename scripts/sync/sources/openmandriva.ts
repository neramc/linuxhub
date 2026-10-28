/**
 * OpenMandriva Lx: the current Rock release (6.0) and the rolling ROME release
 * (26.09), every image the project's download pages offer, served by the
 * project's mirrorbits redirector with its official mirror list.
 *
 * Official sources, and what each one is used for:
 * - openmandriva.org/release-picking, /info-rock and /info-rome (the download
 *   pages): the source of truth for what is offered. The picker names the
 *   Rock and ROME pages (they are followed, not hard-coded); each page links
 *   every published image on mirror.openmandriva.org/release_current/ with the
 *   project's label ("Plasma 6, X11", "Plasma 6 Slim, X11", "LXQt", "GNOME", …)
 *   and architecture. Labels become editions; a page with no image, an image
 *   outside the redirector or a Rock page that names two versions throws.
 * - abf-downloads.openmandriva.org/release_current/ (ABF, the project's build
 *   service and the origin every mirror syncs from): the directory listings
 *   give each image's exact size and upload day, and the project's checksum
 *   files: `6.0/sha256sums` for Rock and `ROME/<image>.sha256sum` for ROME
 *   (`checksum.url`). Every offered image must be in a listing and in its
 *   checksum file, otherwise the sync throws. mirror.openmandriva.org/downloads
 *   (the mirror portal) prints the SHA-256 of the ROME images as well; where it
 *   prints one, it must equal ABF's.
 * - openmandriva.org/en/news/ (the announcements): "OpenMandriva ROME 26.09
 *   Released" names the ROME release and its day, "OpenMandriva Lx 6.0 Rock The
 *   Spring Release" the Rock release day; each article is `notesUrl`. The
 *   newest ROME announcement names the release (ROME images carry only the
 *   build dates of their snapshots, 20260927 and 20260928, not a version). The
 *   first three pages of the news list are read; a release whose announcement
 *   is not there takes the newest upload day of its images on ABF, and ROME
 *   without any announcement throws.
 * - wiki.openmandriva.org/en/distribution/releases: the code name of a numbered
 *   release ("OpenMandriva Lx 6.0 Codename Vanadium"). Optional: null when the
 *   page does not give one or cannot be read. ROME has none.
 * - mirror.openmandriva.org (mirrorbits): `<image>?mirrorlist` lists the HTTPS
 *   mirrors that carry an image, `?mirrorstats` their coordinates and health.
 *
 * Mirrors: a mirror is kept only when it carries every offered image (Rock and
 * ROME), so root + artifact.path is always the file; mirrors the statistics
 * flag as disabled or HTTPS-down are left out. Names are the mirror hosts. The
 * list includes ABF itself, which mirrorbits lists as a mirror.
 *
 * Releases and editions: ROME is rolling (channel rolling, no EOL) and is
 * listed first, being the flagship the downloads page names; Rock 6.0 is
 * stable. The project states no end of support for 6.0 ("will eventually reach
 * EOL after the new version is released"): eol null. The "znver1" images
 * (builds tuned for AMD CPUs newer than 2017) are architecture x86_64, which
 * is all the data model holds, so each is its own edition with "(znver1)" in
 * its name; the generic x86_64 image of the same desktop is the edition
 * without it. The Slim images are kind "minimal".
 *
 * Excluded: Cooker (the development branch), the on-demand builds the pages
 * only link to the build service (ROME Plasma 6 Slim and Plasma 5 images, the
 * Spins page's ROME/Cooker spins, the ROME server image), the server images
 * that sit in the 6.0 directory but that the Server page says do not exist for
 * Rock, the SourceForge copy of the tree (mirror.openmandriva.org is the
 * project's own redirector), Metalink files (not torrents), and earlier ROME
 * snapshots (the ROME directory holds only the current set; the .bak copies are
 * not offered). No signatures or torrents are published: both null.
 */

import type { Artifact, Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getText, HttpError } from "../http";
import { parseChecksums } from "../lib/checksums";
import { parseEnglishDay } from "../lib/dates";
import { type MirrorbitsMirror, mirrorbitsFile, mirrorbitsStats } from "../lib/mirrorbits";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const SITE = "https://www.openmandriva.org/";
const NEWS = `${SITE}en/news/`;
const WIKI_RELEASES = "https://wiki.openmandriva.org/en/distribution/releases";
/** The mirrorbits redirector the download pages link; root + path is the file on every mirror. */
const REDIRECTOR = "https://mirror.openmandriva.org/";
/** ABF: where the images are built and published; every mirror syncs from it. */
const ORIGIN = "https://abf-downloads.openmandriva.org/";
const NEWS_PAGES = 3;
const ROME_DIR = "release_current/ROME/";

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&rsquo;|&#8217;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

interface Offer {
  /** The project's label: "Plasma 6, X11". */
  label: string;
  /** "x86_64" or "znver1". */
  arch: string;
  /** Path below the redirector / mirror root: release_current/6.0/openmandriva-6.0-lxqt.x86_64.iso. */
  path: string;
  file: string;
}

/** Every image a download page links (the project's `iso-lien` links). */
function parseOffers(html: string, page: string): Offer[] {
  const offers: Offer[] = [];
  for (const m of html.matchAll(
    /<a class="iso-lien" href="([^"]+)">([\s\S]*?)<span class="iso-arch">([^<]+)<\/span>\s*<\/a>/g,
  )) {
    const href = m[1] ?? "";
    if (!href.startsWith(REDIRECTOR) || !href.endsWith(".iso"))
      throw new Error(`${page} links ${href}, which is not an ISO on ${REDIRECTOR}`);
    const path = href.slice(REDIRECTOR.length);
    offers.push({
      label: text(m[2] ?? ""),
      arch: text(m[3] ?? ""),
      path,
      file: path.split("/").pop() as string,
    });
  }
  if (offers.length === 0) throw new Error(`${page} links no image`);
  return offers;
}

/** The Rock and ROME pages the release picker links. */
function pickerPages(html: string): { rock: string; rome: string } {
  const find = (name: string) => {
    for (const m of html.matchAll(/<a href="(\/info-[a-z]+)">[\s\S]*?<h5[^>]*>([^<]+)<\/h5>/g))
      if ((m[2] ?? "").trim().toUpperCase() === name) return new URL(m[1] ?? "", SITE).href;
    throw new Error(`the OpenMandriva release picker no longer links ${name}`);
  };
  return { rock: find("ROCK"), rome: find("ROME") };
}

interface Listing {
  size: number;
  /** Upload day (UTC). */
  day: string;
}

/** An nginx directory listing of ABF: file name → exact size and day. */
async function listing(dir: string): Promise<Map<string, Listing>> {
  const html = await getText(`${ORIGIN}${dir}`, { accept: "text/html" });
  const files = new Map<string, Listing>();
  for (const m of html.matchAll(
    /<a href="([^"?#/][^"?#]*)">[^<]*<\/a>\s+(\d{2}-[A-Za-z]{3}-\d{4}) \d{2}:\d{2}\s+(\d+)\s*$/gm,
  )) {
    const day = parseEnglishDay((m[2] ?? "").replace(/-/g, " "));
    if (day) files.set(decodeURIComponent(m[1] ?? ""), { size: Number(m[3]), day });
  }
  if (files.size === 0) throw new Error(`${ORIGIN}${dir} lists no file`);
  return files;
}

/** File name → SHA-256 printed by the mirror portal (only the ones it prints). */
function parsePortal(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of html.split(/<tr>/).slice(1)) {
    const file = row.match(/<td class="file">([^<]+)<\/td>/)?.[1];
    const sum = row.match(/SHA256:\s*([0-9a-f]{64})/i)?.[1];
    if (file && sum) out.set(file, sum.toLowerCase());
  }
  return out;
}

/** Keeps the SHA-256 entries of a parsed checksum file (a different digest length is a format change). */
function sha256Only(sums: Map<string, string>): Map<string, string> {
  for (const [file, sum] of sums)
    if (!/^[0-9a-f]{64}$/.test(sum)) throw new Error(`the checksum of ${file} is not a SHA-256`);
  return sums;
}

interface Announcement {
  title: string;
  url: string;
  day: string | null;
}

/** The announcements of the first news pages, newest first. */
async function announcements(need: (found: Announcement[]) => boolean): Promise<Announcement[]> {
  const found: Announcement[] = [];
  for (let page = 1; page <= NEWS_PAGES; page++) {
    const html = await getText(page === 1 ? NEWS : `${NEWS}page/${page}/`, { accept: "text/html" });
    for (const m of html.matchAll(
      /<span class="card-title"><a href="(\/en\/news\/article\/[^"]+)">([^<]+)<\/a><\/span>\s*<p[^>]*><abbr[^>]*>([^<]+)<\/abbr>/g,
    ))
      found.push({
        title: text(m[2] ?? ""),
        url: new URL(m[1] ?? "", SITE).href,
        day: parseEnglishDay(text(m[3] ?? "")),
      });
    if (need(found)) break;
  }
  return found;
}

const romeRelease = (a: Announcement) =>
  /^OpenMandriva ROME (\d{2}\.\d{2}) Released$/i.exec(a.title);
const rockRelease = (a: Announcement, version: string) =>
  a.title.startsWith(`OpenMandriva Lx ${version} `) && !/candidate|beta|alpha/i.test(a.title);

/** "OpenMandriva Lx 6.0 Codename Vanadium": version → code name (optional extra). */
async function codenames(): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  try {
    const page = text(await getText(WIKI_RELEASES, { accept: "text/html" }));
    for (const m of page.matchAll(
      /OpenMandriva Lx (\d+\.\d+)(?: \([^)]*\))? Codename ([A-Za-z]+)/g,
    ))
      names.set(m[1] as string, m[2] as string);
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
  }
  return names;
}

const DESKTOPS: [RegExp, Desktop][] = [
  [/^Plasma/i, "kde"],
  [/^LXQt/i, "lxqt"],
  [/^GNOME/i, "gnome"],
  [/^Xfce/i, "xfce"],
  [/^COSMIC/i, "cosmic"],
];

function editionOf(offer: Offer): Omit<Edition, "artifacts"> {
  const znver1 = offer.arch === "znver1";
  const id = `${offer.label} ${znver1 ? "znver1" : ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return {
    id,
    name: znver1 ? `${offer.label} (znver1)` : offer.label,
    desktop: DESKTOPS.find(([re]) => re.test(offer.label))?.[1] ?? null,
    kind: /\bslim\b/i.test(offer.label) ? "minimal" : "desktop",
  };
}

/** The pages' offers: what the Rock and ROME pages link, and the pages' addresses. */
async function offered(): Promise<{
  rock: Offer[];
  rome: Offer[];
  pages: { rock: string; rome: string };
}> {
  const pages = pickerPages(await getText(`${SITE}release-picking`, { accept: "text/html" }));
  const rock = parseOffers(await getText(pages.rock, { accept: "text/html" }), pages.rock);
  const rome = parseOffers(await getText(pages.rome, { accept: "text/html" }), pages.rome);
  return { rock, rome, pages };
}

function artifactOf(
  offer: Offer,
  files: Map<string, Listing>,
  sum: string | undefined,
  checksumUrl: string,
): Artifact {
  const info = files.get(offer.file);
  if (!info) throw new Error(`${offer.path} is linked by the download page but not on ${ORIGIN}`);
  if (!sum) throw new Error(`no SHA-256 for ${offer.file} in ${checksumUrl}`);
  return {
    arch: "x86_64",
    format: "iso",
    file: offer.file,
    path: offer.path,
    url: `${REDIRECTOR}${offer.path}`,
    size: info.size,
    checksum: { type: "sha256", value: sum, url: checksumUrl },
    signatureUrl: null,
    torrentUrl: null,
  };
}

function editionsOf(offers: Offer[], artifact: (offer: Offer) => Artifact): Edition[] {
  const editions = new Map<string, Edition>();
  for (const offer of offers) {
    const edition = editionOf(offer);
    const own = editions.get(edition.id) ?? { ...edition, artifacts: [] };
    own.artifacts.push(artifact(offer));
    editions.set(edition.id, own);
  }
  return [...editions.values()];
}

export default defineSource({
  slug: "openmandriva",
  hosts: ["openmandriva.org"],
  async releases() {
    const { rock, rome, pages } = await offered();

    const rockVersions = [
      ...new Set(rock.map((o) => o.file.match(/^openmandriva-(\d+\.\d+)-/)?.[1])),
    ];
    const rockVersion = rockVersions[0];
    if (rockVersions.length !== 1 || !rockVersion)
      throw new Error(
        `the Rock page offers images of ${rockVersions.join(", ")}: expected one version`,
      );

    if (!rock.every((o) => o.path.startsWith(`release_current/${rockVersion}/`)))
      throw new Error(`the Rock page links an image outside release_current/${rockVersion}/`);
    if (!rome.every((o) => o.path === `${ROME_DIR}${o.file}`))
      throw new Error(`the ROME page links an image outside ${ROME_DIR}`);

    const news = await announcements(
      (found) =>
        found.some((a) => romeRelease(a)) && found.some((a) => rockRelease(a, rockVersion)),
    );
    const romeNews = news
      .filter((a) => romeRelease(a))
      .sort((a, b) => compareVersions(romeRelease(b)?.[1] ?? "0", romeRelease(a)?.[1] ?? "0"))[0];
    const romeVersion = romeNews ? romeRelease(romeNews)?.[1] : undefined;
    if (!romeNews || !romeVersion)
      throw new Error(
        `no "OpenMandriva ROME YY.MM Released" announcement in the first ${NEWS_PAGES} news pages`,
      );
    const rockNews = news.find((a) => rockRelease(a, rockVersion));
    const names = await codenames();

    const portal = parsePortal(await getText(`${REDIRECTOR}downloads`, { accept: "text/html" }));

    // Rock: one checksum file for the whole release.
    const rockDirs = new Map<string, Listing>();
    const rockSums = `${ORIGIN}release_current/${rockVersion}/sha256sums`;
    for (const dir of new Set(rock.map((o) => `${o.path.split("/").slice(0, -1).join("/")}/`)))
      for (const [file, info] of await listing(dir)) rockDirs.set(file, info);
    const rockHashes = sha256Only(parseChecksums(await getText(rockSums)));

    // ROME: one checksum file per image.
    const romeFiles = await listing(ROME_DIR);
    const romeHashes = new Map<string, string>();
    for (const offer of rome) {
      const url = `${ORIGIN}${offer.path}.sha256sum`;
      const sum = sha256Only(parseChecksums(await getText(url))).get(offer.file);
      if (sum) romeHashes.set(offer.file, sum);
    }

    for (const [file, sum] of portal) {
      const official = romeHashes.get(file) ?? rockHashes.get(file);
      if (official && official !== sum)
        throw new Error(`${ORIGIN} and the mirror portal disagree on ${file}`);
    }

    const newest = (offers: Offer[], files: Map<string, Listing>) =>
      offers
        .map((o) => files.get(o.file)?.day ?? "")
        .sort()
        .pop() || null;

    const releases: Release[] = [
      {
        version: romeVersion,
        channel: "rolling",
        codename: null,
        releaseDate: romeNews.day ?? newest(rome, romeFiles),
        eol: null,
        notesUrl: romeNews.url,
        editions: editionsOf(rome, (o) =>
          artifactOf(o, romeFiles, romeHashes.get(o.file), `${ORIGIN}${o.path}.sha256sum`),
        ),
      },
      {
        version: rockVersion,
        channel: "stable",
        codename: names.get(rockVersion) ?? null,
        releaseDate: rockNews?.day ?? newest(rock, rockDirs),
        eol: null,
        notesUrl: rockNews?.url ?? null,
        editions: editionsOf(rock, (o) =>
          artifactOf(o, rockDirs, rockHashes.get(o.file), rockSums),
        ),
      },
    ];
    return {
      sources: [
        `${SITE}release-picking`,
        pages.rock,
        pages.rome,
        NEWS,
        `${ORIGIN}release_current/`,
        `${REDIRECTOR}downloads`,
        WIKI_RELEASES,
      ],
      releases,
    };
  },

  async mirrors() {
    const { rock, rome, pages } = await offered();
    const lists: MirrorbitsMirror[][] = [];
    for (const offer of [...rome, ...rock])
      lists.push((await mirrorbitsFile(`${REDIRECTOR}${offer.path}`)).mirrors);
    // Only mirrors that carry every offered image: root + artifact.path is then always the file.
    const common = (lists[0] ?? []).filter((m) =>
      lists.every((list) => list.some((other) => other.root === m.root)),
    );
    if (common.length === 0)
      throw new Error("no HTTPS mirror carries every offered OpenMandriva image");

    const stats = await mirrorbitsStats(REDIRECTOR);
    if (stats.size === 0) throw new Error("the redirector's mirror statistics list no mirrors");
    const mirrors: Mirror[] = [];
    for (const { root, country } of common.sort((a, b) => a.root.localeCompare(b.root))) {
      const stat = stats.get(root);
      if (stat && (!stat.enabled || !stat.httpsUp)) continue;
      mirrors.push({
        url: root,
        country,
        name: new URL(root).hostname,
        lat: stat?.lat ?? null,
        lon: stat?.lon ?? null,
        score: null,
      });
    }
    if (mirrors.length === 0) throw new Error("every OpenMandriva mirror is flagged down");
    return {
      sources: [pages.rock, pages.rome, `${REDIRECTOR}?mirrorstats`],
      mirrors,
    };
  },
});
