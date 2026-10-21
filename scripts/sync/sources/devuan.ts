/**
 * Devuan GNU+Linux.
 *
 * Official sources, and what each one is used for:
 * - devuan.org/os/releases (release table): which stable lines exist, their
 *   codenames, the current stable/oldstable suites, the line's release date and
 *   whether the line is still "Maintained" (older ones read "Archived"). Cross-
 *   checked with the LATEST_STABLE_IS_<CODENAME> marker of files.devuan.org: if
 *   the two name different stable releases the run fails.
 * - files.devuan.org (the release archive): the images and their checksums.
 *   Each line has installer-iso/ (netinstall, server, desktop), desktop-live/
 *   and minimal-live/. SHA-256 only (the project publishes nothing stronger):
 *   a SHA256SUMS.txt per directory, or one `<image>.sha256` per image in the
 *   live directories of recent releases, each with a detached PGP signature
 *   (.asc) made by the release developer, which is linked as the signature.
 *   Sizes are not published (the index rounds them): run.ts fills them from the
 *   official URL.
 * - devuan.org/get-devuan: the download page. It defines the editions
 *   (desktop-live, netinstall, server, desktop, minimal-live; a missing or an
 *   unknown one fails the run) and the official list of HTTPS ISO mirrors.
 * - endoflife.date: the end of security support (`eol`) and the date of the
 *   newest point release, matched by codename. Devuan publishes neither. A line
 *   is listed while the table calls it Maintained and its EOL is not past, so
 *   Excalibur 6 and Daedalus 5 today (Chimaera 4 is Archived and past EOL).
 *
 * Release date: the date of the listed version. endoflife.date gives it when its
 * newest point release is the one the images carry; the first release of a line
 * (x.0 / x.0.0) takes the official table's date; otherwise it stays null, because
 * Devuan announces no date for other point releases.
 *
 * Editions: what the download page offers, in every architecture the archive
 * holds for that edition (amd64 for Excalibur; amd64 and i386 for Daedalus).
 * The page's ISO guide is for the current stable; oldstable is taken from the
 * same archive layout. Excluded, as for every distro: the discs after the first
 * of the CD set (cd2 to cd5, pool1), source and netboot trees (directories, no
 * image), the community ARM images (embedded/, not Devuan's own), the testing
 * suite Freia, and Devuan's release-wide torrent (one torrent of the whole
 * release tree, not of one image), so `torrentUrl` stays null.
 *
 * Mirrors: the page's HTTPS list as published, with the entries commented out
 * as down or broken left out. It names no country, coordinates or score, so
 * those stay null (machine-readable lists on pkgmaster.devuan.org and
 * git.devuan.org are closed to bots by robots.txt). Every mirror carries the
 * files.devuan.org tree, so `path` is the archive path.
 *
 * Known upstream quirk, left as published: Daedalus' amd64 netinstall was
 * rebuilt in April 2024 but its SHA256SUMS.txt still dates from September 2023.
 * Nothing is downloaded here to compare, so the published value is used.
 *
 * Fails closed when the release table, the download page or the archive layout
 * change shape, when an image has no checksum, or when a known edition of the
 * current stable vanished.
 */

import type { Artifact, Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import { ARCHITECTURES, type Architecture, type Desktop } from "../../../src/lib/taxonomy";
import { getText, HttpError } from "../http";
import { parseChecksums } from "../lib/checksums";
import { debianArch } from "../lib/debarch";
import { listDirectory } from "../lib/dirlist";
import { type Cycle, endOfLife } from "../lib/endoflife";
import { withSlash } from "../lib/mirrors";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const ROOT = "https://files.devuan.org/";
const RELEASES_PAGE = "https://www.devuan.org/os/releases";
const DOWNLOAD_PAGE = "https://www.devuan.org/get-devuan";

interface EditionDef {
  /** The `<type>` of "devuan_<codename>_<version>_<arch>_<type>.iso" and the name on the download page. */
  type: string;
  /** Directory of the release that holds the image. */
  dir: string;
  id: string;
  name: string;
  desktop: Desktop | null;
  kind: Edition["kind"];
}

/** In the order of the download page. */
const EDITIONS: EditionDef[] = [
  {
    type: "desktop-live",
    dir: "desktop-live",
    id: "desktop-live",
    name: "Desktop Live",
    // "Explore the default Xfce desktop before installing."
    desktop: "xfce",
    kind: "live",
  },
  {
    type: "netinstall",
    dir: "installer-iso",
    id: "netinstall",
    name: "Netinstall",
    desktop: null,
    kind: "netinst",
  },
  {
    type: "server",
    dir: "installer-iso",
    id: "server",
    name: "Server (CD1)",
    desktop: null,
    kind: "server",
  },
  {
    type: "desktop",
    dir: "installer-iso",
    id: "desktop",
    name: "Desktop DVD",
    // "Several desktop choices" on one disc.
    desktop: null,
    kind: "desktop",
  },
  {
    type: "minimal-live",
    dir: "minimal-live",
    id: "minimal-live",
    name: "Minimal Live",
    // "Console-based recovery tool".
    desktop: "none",
    kind: "live",
  },
];

/** Discs after the first of a set (cd2…cd5) and the package pool disc: not offered as images. */
const EXTRA_DISC = /^(?:cd\d+|pool\d+)$/;

const IMAGE = /^devuan_([a-z]+)_(\d+(?:\.\d+)+)_([a-z0-9]+)_([a-z0-9-]+)\.iso$/;

const withoutComments = (html: string) => html.replace(/<!--[\s\S]*?-->/g, "");

const strip = (html: string) =>
  withoutComments(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

interface Line {
  /** "Excalibur" */
  name: string;
  /** "excalibur" */
  codename: string;
  /** "stable", "oldstable" or "" for older lines. */
  suite: string;
  /** The line's first release, from the table. */
  released: string;
  /** The table's status is "Maintained" (older lines read "Archived"). */
  maintained: boolean;
}

/** The "Stable releases" table of devuan.org/os/releases, newest first (the page's order). */
function stableLines(html: string): Line[] {
  const start = html.indexOf("Stable releases");
  if (start < 0) throw new Error(`no "Stable releases" table on ${RELEASES_PAGE}`);
  const end = html.indexOf("In development", start);
  const section = withoutComments(html.slice(start, end < 0 ? undefined : end));
  const lines: Line[] = [];
  for (const row of section.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = [...(row[1] ?? "").matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) =>
      strip(c[1] ?? ""),
    );
    if (cells.length < 6) continue;
    const [release, suite, released, , , status] = cells;
    const name = release?.match(/^([A-Za-z]+) \d+$/)?.[1];
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(released ?? ""))
      throw new Error(`unexpected row "${cells.join(" | ")}" in the table on ${RELEASES_PAGE}`);
    lines.push({
      name,
      codename: name.toLowerCase(),
      suite: suite ?? "",
      released: released ?? "",
      maintained: status === "Maintained",
    });
  }
  if (!lines.some((l) => l.suite === "stable"))
    throw new Error(`no stable release in the table on ${RELEASES_PAGE}`);
  return lines;
}

/**
 * Edition names the download page's ISO guide defines (`<em><strong>netinstall</strong></em>`).
 * The next section ("Installation Media": netboot, embedded) links directories and
 * community images, not Devuan's own images, and is not read.
 */
function offeredEditions(html: string): Set<string> {
  const start = html.indexOf('id="iso-guide-for-');
  if (start < 0) throw new Error(`no ISO guide on ${DOWNLOAD_PAGE}`);
  const end = html.indexOf("<h2", start + 1);
  const guide = html.slice(start, end < 0 ? undefined : end);
  return new Set(
    [...guide.matchAll(/<em><strong>([a-z-]+)<\/strong><\/em>/g)].map((m) => m[1] ?? ""),
  );
}

async function listing(url: string): Promise<string[] | null> {
  try {
    return await listDirectory(url);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}

interface Image {
  file: string;
  version: string;
  arch: Architecture;
  type: string;
  sha256: string;
  checksumUrl: string;
  signatureUrl: string | null;
  /** Archive path below the root. */
  path: string;
}

/**
 * The first-disc images of one image directory with their SHA-256: from the
 * directory's SHA256SUMS.txt, else from one `<image>.sha256` per image.
 */
async function imagesIn(codename: string, dir: string): Promise<Image[]> {
  const url = `${ROOT}devuan_${codename}/${dir}/`;
  const names = await listing(url);
  if (!names) return [];
  const types = new Set(EDITIONS.filter((e) => e.dir === dir).map((e) => e.type));
  const found: { file: string; version: string; arch: Architecture; type: string }[] = [];
  for (const file of names) {
    const m = file.match(IMAGE);
    if (m?.[1] !== codename || !m[2] || !m[3] || !m[4]) continue;
    if (!types.has(m[4])) {
      if (EXTRA_DISC.test(m[4])) continue;
      throw new Error(
        `${url}${file}: unknown image type "${m[4]}" (not an edition of ${DOWNLOAD_PAGE})`,
      );
    }
    const arch = debianArch(m[3], url);
    if (arch) found.push({ file, version: m[2], arch, type: m[4] });
  }

  const listSums = names.includes("SHA256SUMS.txt")
    ? parseChecksums(await getText(`${url}SHA256SUMS.txt`))
    : null;
  const images: Image[] = [];
  for (const f of found) {
    let sha256: string | undefined;
    let checksumUrl: string;
    if (listSums) {
      checksumUrl = `${url}SHA256SUMS.txt`;
      sha256 = listSums.get(f.file);
    } else {
      checksumUrl = `${url}${f.file}.sha256`;
      if (names.includes(`${f.file}.sha256`))
        sha256 = parseChecksums(await getText(checksumUrl)).get(f.file);
    }
    if (!sha256)
      throw new Error(`${url}${f.file} is published without a checksum (${checksumUrl})`);
    images.push({
      ...f,
      sha256,
      checksumUrl,
      signatureUrl: names.includes(`${checksumUrl.slice(url.length)}.asc`)
        ? `${checksumUrl}.asc`
        : null,
      path: `devuan_${codename}/${dir}/${f.file}`,
    });
  }
  return images;
}

/** The date of `version`: see the module header. */
function releaseDate(version: string, line: Line, cycle: Cycle | undefined): string | null {
  if (cycle?.latest === version && cycle.latestDate) return cycle.latestDate;
  return /^\d+\.0(?:\.0)?$/.test(version) ? line.released : null;
}

async function release(
  line: Line,
  cycle: Cycle | undefined,
  current: boolean,
  root: string[],
): Promise<Release> {
  const base = `${ROOT}devuan_${line.codename}/`;
  if (!root.includes(`devuan_${line.codename}/`))
    throw new Error(
      `${RELEASES_PAGE} lists ${line.name} as maintained but ${ROOT} has no ${line.codename} tree`,
    );
  const subdirs = (await listing(base)) ?? [];
  const images: Image[] = [];
  for (const dir of [...new Set(EDITIONS.map((e) => e.dir))])
    if (subdirs.includes(`${dir}/`)) images.push(...(await imagesIn(line.codename, dir)));

  const editions: Edition[] = [];
  for (const def of EDITIONS) {
    const artifacts: Artifact[] = [];
    for (const arch of Object.keys(ARCHITECTURES) as Architecture[]) {
      // The newest image of this edition and architecture (a list can still hold older point releases).
      const image = images
        .filter((i) => i.type === def.type && i.arch === arch)
        .sort((a, b) => compareVersions(b.version, a.version))[0];
      if (!image) continue;
      artifacts.push({
        arch,
        format: "iso",
        file: image.file,
        path: image.path,
        url: `${ROOT}${image.path}`,
        // Not published; run.ts fills it from the official URL.
        size: null,
        checksum: { type: "sha256", value: image.sha256, url: image.checksumUrl },
        signatureUrl: image.signatureUrl,
        torrentUrl: null,
      });
    }
    // The download page's ISO guide is for amd64: the current stable must have every edition in it.
    if (current && !artifacts.some((a) => a.arch === "x86_64"))
      throw new Error(`the ${def.type} images of ${line.name} vanished from ${base}${def.dir}/`);
    if (artifacts.length)
      editions.push({
        id: def.id,
        name: def.name,
        desktop: def.desktop,
        kind: def.kind,
        artifacts,
      });
  }
  const version = images.map((i) => i.version).sort((a, b) => compareVersions(b, a))[0];
  if (!version || !editions.length) throw new Error(`no images for ${line.name} in ${base}`);

  return {
    version,
    channel: "stable",
    codename: line.name,
    releaseDate: releaseDate(version, line, cycle),
    eol: cycle?.eol ?? null,
    notesUrl: subdirs.includes("Release_notes.txt") ? `${base}Release_notes.txt` : null,
    editions,
  };
}

export default defineSource({
  slug: "devuan",
  hosts: ["files.devuan.org"],
  async releases(ctx) {
    const lines = stableLines(await getText(RELEASES_PAGE));
    const root = await listDirectory(ROOT);
    const stable = lines.find((l) => l.suite === "stable");
    const marker = root
      .map((name) => name.match(/^LATEST_STABLE_IS_([A-Z]+)$/)?.[1]?.toLowerCase())
      .find((c): c is string => Boolean(c));
    if (!stable || marker !== stable.codename)
      throw new Error(
        `${RELEASES_PAGE} says ${stable?.name} is stable but ${ROOT} says ${marker ?? "nothing"}`,
      );

    const offered = offeredEditions(await getText(DOWNLOAD_PAGE));
    for (const def of EDITIONS)
      if (!offered.has(def.type)) throw new Error(`${DOWNLOAD_PAGE} no longer offers ${def.type}`);
    for (const type of offered)
      if (!EDITIONS.some((e) => e.type === type))
        throw new Error(`${DOWNLOAD_PAGE} offers a new edition "${type}": map it first`);

    const eol = await endOfLife("devuan");
    const byCodename = new Map(eol.cycles.map((c) => [(c.codename ?? "").toLowerCase(), c]));

    const releases: Release[] = [];
    for (const line of lines) {
      const cycle = byCodename.get(line.codename);
      if (!line.maintained || (cycle?.eol && cycle.eol < ctx.today)) continue;
      releases.push(await release(line, cycle, line === stable, root));
    }
    if (!releases.length) throw new Error(`no maintained Devuan release in ${RELEASES_PAGE}`);
    releases.sort((a, b) => compareVersions(b.version, a.version));
    return { sources: [RELEASES_PAGE, ROOT, DOWNLOAD_PAGE, eol.url], releases };
  },
  async mirrors() {
    const html = withoutComments(await getText(DOWNLOAD_PAGE));
    const start = html.indexOf("<h4>HTTPS mirrors</h4>");
    if (start < 0) throw new Error(`no "HTTPS mirrors" list on ${DOWNLOAD_PAGE}`);
    const end = html.indexOf("<h4>", start + 1);
    const section = html.slice(start, end < 0 ? undefined : end);
    const mirrors = new Map<string, Mirror>();
    for (const m of section.matchAll(/<a href="(https:\/\/[^"]+)"/g)) {
      const url = withSlash(m[1] ?? "");
      mirrors.set(url, {
        url,
        country: null,
        name: new URL(url).hostname,
        lat: null,
        lon: null,
        score: null,
      });
    }
    if (!mirrors.size) throw new Error(`no HTTPS mirrors on ${DOWNLOAD_PAGE}`);
    return {
      sources: [DOWNLOAD_PAGE],
      mirrors: [...mirrors.values()].sort((a, b) => a.url.localeCompare(b.url)),
    };
  },
});
