/**
 * Mageia: the supported releases and their installation media.
 *
 * Official sources, and what each one is used for:
 * - www.mageia.org/en/downloads/alternative/: the static list behind the
 *   download page (the page itself is a JavaScript picker over the same
 *   files). Its "Latest stable release" section is what is offered today and
 *   decides the editions, architectures and which images have a torrent.
 *   "Previous releases" is read too, but a line listed there is kept only
 *   while it is still supported (the overlap after a new release), and "Test
 *   release" (Cauldron network installers) is a continuous development build
 *   and excluded for every distro alike. Sizes are printed rounded ("5.3 GB"),
 *   so they stay null and run.ts asks the server.
 * - www.mageia.org/en/downloads/get/?q=<file>: the page the download button
 *   opens (it forwards to a nearby mirror after a few seconds). It names where
 *   the file lives in the mirror tree, links the signature of the checksum file
 *   for ISOs and lists every mirror that carries the file (HTTPS, HTTP, FTP).
 *   It also prints the visitor's IP address, which the module ignores.
 * - mirrors.kernel.org/mageia/: a first-tier official mirror of the project's
 *   tree (rsync.mageia.org is the project's own, rsync-only master, so no HTTP
 *   origin exists). It is the reference for `url`, for the checksum file
 *   (<name>.iso.sha512; the strongest the data model holds, the tree also has
 *   md5 and sha3-512), for its detached signature (<name>.iso.sha512.gpg; the
 *   page links it for ISOs; the network installers have none, neither on the
 *   page nor in the tree) and for the torrents (iso/<version>/torrents/). Each
 *   SHA-512 is compared with the same file on a second first-tier mirror
 *   (distrib-coffee.ipsl.jussieu.fr); a difference throws.
 *   Deviation: the get pages print their own SHA-512 for every image. For the
 *   six ISOs it equals the mirrors' file; for the four network installers it
 *   does not (checked 2026-10-28: the page shows another value than the
 *   .sha512 that three first-tier mirrors serve, whose time stamp equals the
 *   image's). The files next to the images are used, since the page's values
 *   cannot be checked without downloading an image, and the difference is
 *   logged on every run.
 * - www.mageia.org/en/support/ (lifecycle text) for the end of support of the
 *   current line ("Mageia 10 will be supported until March 31st, 2028"), and
 *   endoflife.date/mageia for the release date and for lines whose end is not
 *   stated as a date. Deviation: the release announcement (blog.mageia.org)
 *   has no stable place to read the date from (titles differ per release and
 *   posts are dated a day off), so the release date is endoflife.date's.
 *   The blog's "End of Support for Mageia 9" (2026-09-25) confirms that
 *   Mageia 9 is unsupported since 30 September 2026, so it is not offered
 *   (the support page still lists it as receiving updates; its text is stale).
 * - mirrors.mageia.org/api/mageia.<version>.<arch>.list: the mirror database
 *   the mirror pages are generated from; used for country, latitude and
 *   longitude of each mirror (its lists cover the distrib tree only).
 *
 * Offered media today (Mageia 10): Classical DVD installer (x86_64, i686),
 * Live Plasma and Live GNOME (x86_64 only), Live Xfce (x86_64, i686) and the
 * network installers, free and with nonfree firmware (x86_64, i686). Excluded
 * for every distro alike: Cauldron, releases past their support, the all/
 * hd_grub boot images of the installer tree (not on the download page) and
 * pre-releases (none is on the download page at the moment).
 *
 * Downloads: `url` is the file on the reference mirror, not the get page,
 * which is HTML. `path` is the file below any mirror root.
 *
 * Mirrors: the HTTPS entries that the get pages list for the images, only
 * those present on the page of every offered image (so root + path is a file
 * for each artifact); location data from the mirror database as published,
 * including its mistakes (mirrors.nju.edu.cn is filed under India). run.ts
 * then checks each mirror for the newest ISO.
 */

import type { Artifact, Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getText } from "../http";
import { parseChecksums } from "../lib/checksums";
import { parseEnglishDay } from "../lib/dates";
import { listDirectory } from "../lib/dirlist";
import { type Cycle, endOfLife } from "../lib/endoflife";
import { countryCode, mapLimit } from "../lib/mirrors";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const SITE = "https://www.mageia.org/en/";
const ALTERNATIVE = `${SITE}downloads/alternative/`;
const GET = `${SITE}downloads/get/?q=`;
const SUPPORT = `${SITE}support/`;
/** First-tier official mirror whose tree is the reference for URLs, checksums, signatures and torrents. */
const REFERENCE = "https://mirrors.kernel.org/mageia/";
/** A second first-tier official mirror (source: rsync.mageia.org) to cross-check the checksum files. */
const CROSS = "https://distrib-coffee.ipsl.jussieu.fr/pub/linux/Mageia/";
const API = "https://mirrors.mageia.org/api/";

type Arch = Artifact["arch"];

const ARCHES: Record<string, Arch> = { x86_64: "x86_64", i686: "i686", i586: "i686" };

const DESKTOPS: Record<string, Desktop> = { Plasma: "kde", GNOME: "gnome", Xfce: "xfce" };

const decode = (s: string) => s.replace(/&amp;/g, "&");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/* ---------- the list of offered images ---------- */

interface Offer {
  file: string;
  /** "10", "7.1": the number in the file name. */
  version: string;
  medium: "classical" | "live" | "netinstall";
  /** Live spin as the file name spells it ("Plasma"). */
  spin: string | null;
  nonfree: boolean;
  /** Architecture as the tree spells it (x86_64, i686, i586). */
  rawArch: string;
  /** The list links a torrent for it. */
  torrent: boolean;
}

/**
 * Reads the alternative-downloads page: images of the stable and previous
 * releases. The stable section must parse completely; the archive also holds
 * the file names of releases from 2011 on, whose unparsable names are returned
 * so that a name of a still supported line cannot go unnoticed.
 */
function parseOffers(html: string) {
  const section = (id: string, strict: boolean) => {
    const body = html.match(new RegExp(`<div id="${id}">([\\s\\S]*?)</table>`))?.[1];
    if (body === undefined) throw new Error(`${ALTERNATIVE} has no "${id}" section any more`);
    const offers: Offer[] = [];
    const unparsed: string[] = [];
    for (const row of body.matchAll(
      /<tr>\s*<td><a [^>]*href="\.\.\/get\/\?q=([^"&]+)"[^>]*>[^<]*<\/a><\/td>\s*<td>([\s\S]*?)<\/td>/g,
    )) {
      const file = decode(row[1] ?? "");
      const m = file.match(
        /^Mageia-(\d+(?:\.\d+)?)-(?:Live-([A-Za-z0-9]+)-|(netinstall(?:-nonfree)?)-)?([a-z0-9_]+)\.iso$/,
      );
      if (!m?.[1] || !m[4] || !ARCHES[m[4]]) {
        if (strict) throw new Error(`${ALTERNATIVE}: unrecognised image ${file}`);
        unparsed.push(file);
        continue;
      }
      offers.push({
        file,
        version: m[1],
        medium: m[2] ? "live" : m[3] ? "netinstall" : "classical",
        spin: m[2] ?? null,
        nonfree: m[3] === "netinstall-nonfree",
        rawArch: m[4],
        torrent: /torrent=1/.test(row[2] ?? ""),
      });
    }
    return { offers, unparsed };
  };
  const current = section("Current", true).offers;
  if (!current.length) throw new Error(`${ALTERNATIVE} lists no current release`);
  // "Test release" (Cauldron) is a development build; it is not read.
  const archive = html.includes('id="Archives"')
    ? section("Archives", false)
    : { offers: [], unparsed: [] };
  return { current, previous: archive.offers, unparsed: archive.unparsed };
}

/* ---------- lifecycle ---------- */

/** "Mageia 10 will be supported until March 31st, 2028." → { "10": "2028-03-31" }. */
function supportDates(html: string): Map<string, string> {
  const out = new Map<string, string>();
  const t = text(html);
  for (const m of t.matchAll(
    /Mageia (\d+(?:\.\d+)?) will be supported until ([A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?,? \d{4})/g,
  )) {
    const day = parseEnglishDay(m[2] ?? "");
    if (m[1] && day) out.set(m[1], day);
  }
  return out;
}

interface Line {
  version: string;
  offers: Offer[];
  releaseDate: string | null;
  eol: string | null;
}

/** The supported release lines with the images the page offers for them. */
async function supportedLines(today: string, log: (m: string) => void) {
  const [altHtml, supportHtml, eol] = await Promise.all([
    getText(ALTERNATIVE, { accept: "text/html" }),
    getText(SUPPORT, { accept: "text/html" }),
    endOfLife("mageia"),
  ]);
  const { current, previous, unparsed } = parseOffers(altHtml);
  const official = supportDates(supportHtml);
  const cycles = new Map<string, Cycle>(eol.cycles.map((c) => [c.name, c]));

  const byVersion = (offers: Offer[]) => {
    const out = new Map<string, Offer[]>();
    for (const o of offers) out.set(o.version, [...(out.get(o.version) ?? []), o]);
    return out;
  };
  const lines: Line[] = [];
  const consider = (offers: Offer[], stable: boolean) => {
    for (const [version, list] of byVersion(offers)) {
      const cycle = cycles.get(version.split(".")[0] ?? "");
      const end = official.get(version) ?? cycle?.eol ?? null;
      if (official.has(version) && cycle?.eol && cycle.eol !== end)
        log(
          `Mageia ${version}: end of support ${end} on the support page, ${cycle.eol} on endoflife.date`,
        );
      // The newest release is always offered; an older one only while its support lasts.
      if (stable ? end !== null && end < today : end === null || end < today) continue;
      lines.push({ version, offers: list, releaseDate: cycle?.releaseDate ?? null, eol: end });
    }
  };
  consider(current, true);
  consider(previous, false);
  for (const file of unparsed) {
    const version = file.match(/^Mageia-(\d+(?:\.\d+)?)-/i)?.[1];
    const end = version && (official.get(version) ?? cycles.get(version.split(".")[0] ?? "")?.eol);
    if (end && end >= today)
      throw new Error(`${ALTERNATIVE}: unrecognised image ${file} of a supported line`);
  }
  if (!lines.length) throw new Error(`no supported Mageia release on ${ALTERNATIVE}`);
  lines.sort((a, b) => compareVersions(b.version, a.version));
  return { lines, sources: [ALTERNATIVE, SUPPORT, eol.url] };
}

/* ---------- the get page of one image ---------- */

interface GetPage {
  /** Where the image lives below a mirror root ("iso/10/<dir>/<file>" or "distrib/…"). */
  path: string;
  /** The SHA-512 the page prints (null when it does not). */
  shown: string | null;
  /** The page links the signature of the SHA-512 file. */
  signed: boolean;
  /** Roots of the mirrors that carry the image over HTTPS. */
  roots: string[];
}

async function readGetPage(file: string): Promise<GetPage> {
  const url = `${GET}${encodeURIComponent(file)}`;
  const html = await getText(url, { accept: "text/html" });
  const where = html.match(/If the download does not start, <a href="(https:\/\/[^"]+)"/)?.[1];
  const path = where?.match(/\/((?:iso|distrib)\/[^?#]+)$/)?.[1];
  if (!path?.endsWith(`/${file}`)) throw new Error(`${url} no longer names where ${file} is`);
  const shown =
    html.match(
      new RegExp(`sha512sum ${esc(file)}\\s*<strong>([0-9a-f]{128})\\s+${esc(file)}`),
    )?.[1] ?? null;
  const roots = new Set<string>();
  for (const m of html.matchAll(
    /<a href="(https:\/\/[^"]+)" rel="nofollow" class="mirror-link"><span class="p">HTTPS<\/span>/g,
  )) {
    const href = decode(m[1] ?? "");
    if (href.endsWith(`/${path}`)) roots.add(href.slice(0, -path.length));
  }
  if (!roots.size) throw new Error(`${url} lists no HTTPS mirror`);
  return {
    path,
    shown,
    signed: new RegExp(`href="https://[^"]+/${esc(file)}\\.sha512\\.gpg"`).test(html),
    roots: [...roots],
  };
}

/** The SHA-512 in a checksum file of the reference tree, which a second first-tier mirror must repeat. */
async function sha512Of(
  url: string,
  file: string,
  otherUrl: string,
  log: (m: string) => void,
): Promise<string> {
  const hash = parseChecksums(await getText(url)).get(file);
  if (hash?.length !== 128) throw new Error(`${url} does not list ${file}`);
  let other: string | undefined;
  try {
    other = parseChecksums(await getText(otherUrl)).get(file);
  } catch (error) {
    log(`not cross-checked (${otherUrl}): ${error instanceof Error ? error.message : error}`);
  }
  if (other && other !== hash)
    throw new Error(`SHA-512 of ${file} differs between ${url} and ${otherUrl}`);
  return hash;
}

const EDITION_ORDER = ["classical", "live", "netinstall"];

function editionOf(o: Offer): Omit<Edition, "artifacts"> {
  if (o.medium === "classical")
    return { id: "classical", name: "Classical", desktop: null, kind: "other" };
  if (o.medium === "live") {
    const spin = o.spin as string;
    return {
      id: `live-${spin.toLowerCase()}`,
      name: `Live ${spin}`,
      desktop: DESKTOPS[spin] ?? null,
      kind: "live",
    };
  }
  return o.nonfree
    ? {
        id: "netinstall-nonfree",
        name: "Network installer + nonfree firmware",
        desktop: null,
        kind: "netinst",
      }
    : { id: "netinstall", name: "Network installer", desktop: null, kind: "netinst" };
}

export default defineSource({
  slug: "mageia",
  hosts: ["mirrors.kernel.org"],
  async releases(ctx) {
    const { lines, sources } = await supportedLines(ctx.today, ctx.log);
    const releases: Release[] = [];
    for (const line of lines) {
      // Fail closed: the Classical installer and the network installer are always offered.
      for (const medium of ["classical", "netinstall"])
        if (!line.offers.some((o) => o.medium === medium && o.rawArch === "x86_64"))
          throw new Error(`Mageia ${line.version}: no x86_64 ${medium} image on ${ALTERNATIVE}`);

      const torrents = new Set(
        line.offers.some((o) => o.torrent)
          ? await listDirectory(`${REFERENCE}iso/${line.version}/torrents/`)
          : [],
      );
      const built = await mapLimit(line.offers, 4, async (offer) => {
        const page = await readGetPage(offer.file);
        const url = `${REFERENCE}${page.path}`;
        const sumUrl = `${url}.sha512`;
        const hash = await sha512Of(sumUrl, offer.file, `${CROSS}${page.path}.sha512`, ctx.log);
        if (page.shown && page.shown !== hash)
          ctx.log(
            `${offer.file}: ${GET}… prints another SHA-512 than the mirrors' file (mirrors used)`,
          );
        const torrent = `${offer.file.replace(/\.iso$/, "")}.torrent`;
        if (offer.torrent && !torrents.has(torrent))
          ctx.log(`${offer.file}: torrent linked on the page but not in the tree`);
        const artifact: Artifact = {
          arch: ARCHES[offer.rawArch] as Arch,
          format: "iso",
          file: offer.file,
          path: page.path,
          url,
          size: null,
          checksum: { type: "sha512", value: hash, url: sumUrl },
          signatureUrl: page.signed ? `${sumUrl}.gpg` : null,
          torrentUrl:
            offer.torrent && torrents.has(torrent)
              ? `${REFERENCE}iso/${line.version}/torrents/${torrent}`
              : null,
        };
        return { offer, artifact };
      });

      const editions = new Map<string, Edition>();
      for (const { offer, artifact } of built) {
        const def = editionOf(offer);
        const edition = editions.get(def.id) ?? { ...def, artifacts: [] };
        edition.artifacts.push(artifact);
        editions.set(def.id, edition);
      }
      const rank = (e: Edition) => EDITION_ORDER.findIndex((m) => e.id.startsWith(m));
      releases.push({
        version: line.version,
        channel: "stable",
        codename: null,
        releaseDate: line.releaseDate,
        eol: line.eol,
        notesUrl: `https://wiki.mageia.org/en/Mageia_${line.version}_Release_Notes`,
        editions: [...editions.values()].sort(
          (a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id),
        ),
      });
    }
    return { sources: [...sources, GET], releases };
  },

  async mirrors(ctx) {
    const { lines, sources } = await supportedLines(ctx.today, ctx.log);
    const offers = lines.flatMap((l) => l.offers);
    // A mirror must carry every offered image, so root + path is a file for each artifact.
    const pages = await mapLimit(offers, 4, (o) => readGetPage(o.file));
    const [first, ...rest] = pages;
    const roots = (first?.roots ?? []).filter((r) => rest.every((p) => p.roots.includes(r)));
    if (!roots.length) throw new Error("no HTTPS mirror carries every offered Mageia image");

    // Location data from the mirror database (lists per version and architecture).
    const wanted = lines.flatMap((l) =>
      [...new Set(l.offers.map((o) => o.rawArch))].sort().map((arch) => ({
        version: l.version,
        arch,
        url: `${API}mageia.${l.version}.${arch}.list`,
      })),
    );
    const known = new Map<string, Mirror>();
    for (const w of await mapLimit(wanted, 2, async (w) => ({
      ...w,
      body: await getText(w.url, { accept: "text/plain" }),
    }))) {
      const suffix = `distrib/${w.version}/${w.arch}`;
      for (const line of w.body.split(/\r?\n/)) {
        const url = line.match(/(?:^|,)url=(\S+)$/)?.[1];
        if (!url?.startsWith("https://") || !url.endsWith(suffix)) continue;
        const field = (k: string) => line.match(new RegExp(`(?:^|,)${k}=([^,]*)`))?.[1]?.trim();
        const num = (k: string) => {
          const v = field(k);
          return v && Number.isFinite(Number(v)) ? Number(v) : null;
        };
        const root = url.slice(0, -suffix.length);
        if (!known.has(root))
          known.set(root, {
            url: root,
            country: countryCode(field("country")),
            name: new URL(url).hostname,
            lat: num("latitude"),
            lon: num("longitude"),
            score: null,
          });
      }
    }
    const mirrors = roots.map(
      (root) =>
        known.get(root) ?? {
          url: root,
          country: null,
          name: new URL(root).hostname,
          lat: null,
          lon: null,
          score: null,
        },
    );
    const unknown = mirrors.filter((m) => !known.has(m.url)).length;
    if (unknown) ctx.log(`${unknown} mirrors are not in the mirror database (no location)`);
    return { sources: [...sources, ...wanted.map((w) => w.url)], mirrors };
  },
});
