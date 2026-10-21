/**
 * MX Linux: every maintained line (25 "Infinity", 23 "Libretto") with its newest
 * point release, each edition in each official architecture.
 *
 * Official sources, and what each one is used for:
 * - sourceforge.net/projects/mx-linux/files/ (the project's own SourceForge,
 *   robots.txt allows the files pages): the headline download and the list of
 *   images. Final/{Xfce,KDE,Fluxbox}/ is the current release (its README.txt:
 *   "MX-25.3 is the current release", what to download). Old/MX-<version>/ keeps
 *   the previous series. Each artifact's `url` is SourceForge's /download link,
 *   which sends the visitor to a nearby SourceForge mirror. SourceForge also
 *   shows the SHA-256/SHA-1/MD5 it computed for every file.
 * - rsync-mxlinux.org: the project's master copy of the ISO tree that its mirror
 *   network rsyncs from (the "MX-Master" entry of the official mirror monitor).
 *   MX/Final/<Edition>/ holds each image with its `<file>.sha256` (the official
 *   checksum, cross-checked with SourceForge's own SHA-256; a mismatch throws),
 *   `.sig` (detached signature) and the file itself, so `path` =
 *   MX/Final/<Edition>/<file> is the file below every mirror root. A file that
 *   SourceForge lists but the master lacks throws (the mirrors could not serve
 *   it). Old/ is not on the master: the previous series has `path: null` and is
 *   offered from SourceForge only.
 * - l2.mxrepo.com/torrents/: the project's torrent files (current images only).
 * - endoflife.date: which series are maintained, their codename, EOL and the
 *   release date of the newest point release (when it is the one listed; else
 *   the SourceForge upload day of the Xfce 64-bit ISO). `notesUrl` is
 *   endoflife.date's link to the series' official announcement.
 * - rsync-mxlinux.org/mirmon/ (linked from the project's wiki, "Detailed ISO
 *   list"): the official ISO mirror monitor. Mirrors: the https rows whose last
 *   probe is "ok" and whose age is not flagged stale; the country is the
 *   monitor's region. Most of its sites are published as http only (85 of 103
 *   on 2026-10-21) and are not listed: a mirror is only listed over https.
 *
 * Editions: Xfce, Xfce AHS (advanced hardware support: newer kernel, Mesa and
 * firmware), KDE, Fluxbox (each x86_64; the older series also has 32-bit Xfce and
 * Fluxbox), and the Raspberry Pi respin (arm64 zip, the Xfce desktop on a
 * Raspberry Pi OS base). Formats: iso, and zip for the Raspberry Pi respin.
 *
 * Checksums: the master's `.sha256` for every ISO of the current release. The
 * Raspberry Pi respin has no checksum file, and the previous series' files are
 * only on SourceForge (no SHA-256 computed for its ISOs, SHA-1 is the strongest
 * there), so those use SourceForge's own hash and `checksum.url` is the files
 * page that shows it. Sizes are not published (the master's index rounds them):
 * left null for run.ts.
 *
 * Excluded: Snapshots/ (monthly roll-ups of the current release without their
 * own version, treated like weekly/daily builds), Community_Respins/ (made by
 * community members), Testing/, .zsync/.delta update files.
 *
 * Deviations: the official download page (mxlinux.org/download-links/) and the
 * blog answer HTTP 403 to LinuxhubBot, so the offered set could not be compared
 * with it. The set is the project's own release tree (the README.txt beside
 * the images, the master and SourceForge listings); an unknown image file in a
 * release folder throws instead of being skipped. The previous series 23.6 is
 * included as a maintained line (EOL 2028-06-10) although its images are in
 * SourceForge's Old/ folder only.
 */

import type { Artifact, Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getText } from "../http";
import { type Cycle, endOfLife } from "../lib/endoflife";
import { countryCode } from "../lib/mirrors";
import {
  MX_ISO_MASTER,
  masterFolder,
  masterSha256,
  sourceforgeChecksum,
  sourceforgeDownloadUrl,
  torrentUrls,
} from "../lib/mxiso";
import { type SfEntry, sourceforgeFolder, sourceforgeFolderUrl } from "../lib/sourceforge";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const PROJECT = "mx-linux";
const MIRMON = `${MX_ISO_MASTER}mirmon/index.html`;
const DIRS = ["Xfce", "KDE", "Fluxbox"] as const;
type Dir = (typeof DIRS)[number];

const EDITIONS: Record<string, { name: string; desktop: Desktop; dir: Dir }> = {
  xfce: { name: "Xfce", desktop: "xfce", dir: "Xfce" },
  "xfce-ahs": { name: "Xfce AHS", desktop: "xfce", dir: "Xfce" },
  kde: { name: "KDE", desktop: "kde", dir: "KDE" },
  fluxbox: { name: "Fluxbox", desktop: "fluxbox", dir: "Fluxbox" },
  "raspberry-pi": { name: "Raspberry Pi respin", desktop: "xfce", dir: "Xfce" },
};
const ARCH_ORDER: Artifact["arch"][] = ["x86_64", "i686", "aarch64"];

/** MX-25.3_Xfce_x64.iso, MX-25.3_Xfce_ahs_x64.iso, MX-23.6_386.iso, MX-23.6.1_KDE_x64.iso, MX-25.3_fluxbox_x64.iso */
const ISO = /^MX-(\d+(?:\.\d+)*)(?:_(Xfce|KDE|fluxbox))?(_ahs)?_(x64|386)\.iso$/;
/** mx25.3_rpi_respin_arm64.zip */
const RPI = /^mx(\d+(?:\.\d+)*)_rpi_respin_arm64\.zip$/;
/** Files that accompany an image (checksums, signatures, update files, readmes). */
const COMPANION = /(\.(sha256|sha256\.asc|sig|zsync|md5|delta)|^README[^/]*)$/i;

interface Image {
  dir: Dir;
  file: string;
  /** Path below the SourceForge project root, e.g. Final/Xfce/MX-25.3_Xfce_x64.iso. */
  sfPath: string;
  entry: SfEntry;
  /** Names in the same SourceForge folder (to find .sig files). */
  siblings: Set<string>;
  version: string;
  edition: string;
  arch: Artifact["arch"];
  format: Artifact["format"];
}

function classify(dir: Dir, entry: SfEntry, siblings: Set<string>): Image | null {
  const name = entry.name;
  const iso = ISO.exec(name);
  const rpi = RPI.exec(name);
  if (!iso && !rpi) {
    if (COMPANION.test(name)) return null;
    throw new Error(`unexpected file ${entry.path} in the MX Linux release folder`);
  }
  let edition: string;
  let arch: Artifact["arch"];
  let version: string;
  let format: Artifact["format"];
  if (rpi) {
    [version, edition, arch, format] = [rpi[1] as string, "raspberry-pi", "aarch64", "zip"];
  } else if (iso) {
    const [, v, flavor, ahs, bits] = iso;
    version = v as string;
    arch = bits === "x64" ? "x86_64" : "i686";
    format = "iso";
    if (!flavor || flavor === "Xfce") edition = ahs ? "xfce-ahs" : "xfce";
    else if (ahs) throw new Error(`unknown MX Linux image ${entry.path}`);
    else edition = flavor.toLowerCase();
  } else return null;
  if (EDITIONS[edition]?.dir !== dir)
    throw new Error(`MX Linux image ${entry.path} is in an unexpected folder`);
  return {
    dir,
    file: name,
    sfPath: entry.path,
    entry,
    siblings,
    version,
    edition,
    arch,
    format,
  };
}

/** Every image in <base>/{Xfce,KDE,Fluxbox}/ of the SourceForge project. */
async function sourceforgeImages(base: string): Promise<Image[]> {
  const images: Image[] = [];
  for (const dir of DIRS) {
    const entries = await sourceforgeFolder(PROJECT, `${base}/${dir}`);
    const siblings = new Set(entries.map((e) => e.name));
    for (const e of entries) {
      if (e.type !== "file") continue;
      const image = classify(dir, e, siblings);
      if (image) images.push(image);
    }
  }
  if (!images.length) throw new Error(`no MX Linux images in SourceForge ${base}/`);
  return images;
}

/** The release's version: the Xfce ISO's (the flagship); every image must belong to it. */
function releaseVersion(images: Image[], where: string): string {
  const flagship = images.find((i) => i.edition === "xfce" && i.arch === "x86_64");
  if (!flagship) throw new Error(`no Xfce 64-bit image in ${where}`);
  const v = flagship.version;
  for (const i of images)
    if (i.version !== v && !i.version.startsWith(`${v}.`))
      throw new Error(`${i.sfPath} is not part of MX-${v}`);
  for (const id of Object.keys(EDITIONS))
    if (!images.some((i) => i.edition === id))
      throw new Error(`MX Linux ${v} has no ${EDITIONS[id]?.name} image in ${where}`);
  return v;
}

function editionsOf(images: Image[], artifactOf: (i: Image) => Artifact): Edition[] {
  return Object.entries(EDITIONS).flatMap(([id, e]) => {
    const own = images
      .filter((i) => i.edition === id)
      .sort((a, b) => ARCH_ORDER.indexOf(a.arch) - ARCH_ORDER.indexOf(b.arch));
    if (!own.length) return [];
    return [
      {
        id,
        name: e.name,
        desktop: e.desktop,
        kind: "desktop" as const,
        artifacts: own.map(artifactOf),
      },
    ];
  });
}

/** The current release: images from SourceForge Final/, checksums and signatures from the master. */
async function currentArtifacts(
  images: Image[],
  torrents: Map<string, string>,
): Promise<(i: Image) => Artifact> {
  const onMaster = new Map<Dir, Set<string>>();
  for (const dir of DIRS) onMaster.set(dir, new Set(await masterFolder(`MX/Final/${dir}`)));
  const built = new Map<string, Artifact>();
  for (const i of images) {
    const names = onMaster.get(i.dir) as Set<string>;
    if (!names.has(i.file))
      throw new Error(`${i.file} is on SourceForge but not on ${MX_ISO_MASTER}MX/Final/${i.dir}/`);
    const path = `MX/Final/${i.dir}/${i.file}`;
    let checksum: Artifact["checksum"];
    if (names.has(`${i.file}.sha256`)) {
      const sha = await masterSha256(path);
      if (i.entry.sha256 && i.entry.sha256 !== sha)
        throw new Error(`SourceForge and ${MX_ISO_MASTER}${path}.sha256 disagree on ${i.file}`);
      checksum = { type: "sha256", value: sha, url: `${MX_ISO_MASTER}${path}.sha256` };
    } else if (i.format === "iso") {
      throw new Error(`no ${i.file}.sha256 on ${MX_ISO_MASTER}MX/Final/${i.dir}/`);
    } else {
      // Raspberry Pi respin: no checksum file; SourceForge's SHA-256 of the same file.
      checksum = sourceforgeChecksum(i.entry, sourceforgeFolderUrl(PROJECT, `Final/${i.dir}`));
    }
    built.set(i.sfPath, {
      arch: i.arch,
      format: i.format,
      file: i.file,
      path,
      url: sourceforgeDownloadUrl(PROJECT, i.sfPath),
      size: null,
      checksum,
      signatureUrl: names.has(`${i.file}.sig`) ? `${MX_ISO_MASTER}${path}.sig` : null,
      torrentUrl: torrents.get(i.file) ?? null,
    });
  }
  return (i) => built.get(i.sfPath) as Artifact;
}

/** The previous series: SourceForge Old/MX-<version>/ only (not on the mirrors). */
function oldArtifact(torrents: Map<string, string>): (i: Image) => Artifact {
  return (i) => {
    const checksum = sourceforgeChecksum(
      i.entry,
      sourceforgeFolderUrl(PROJECT, i.sfPath.split("/").slice(0, -1).join("/")),
    );
    if (!checksum) throw new Error(`SourceForge shows no hash for ${i.sfPath}`);
    return {
      arch: i.arch,
      format: i.format,
      file: i.file,
      path: null,
      url: sourceforgeDownloadUrl(PROJECT, i.sfPath),
      size: null,
      checksum,
      signatureUrl: i.siblings.has(`${i.file}.sig`)
        ? sourceforgeDownloadUrl(PROJECT, `${i.sfPath}.sig`)
        : null,
      torrentUrl: torrents.get(i.file) ?? null,
    };
  };
}

/** SourceForge upload date of the Xfce 64-bit ISO (the flagship): the fallback release date. */
const flagshipDate = (images: Image[]) =>
  images.find((i) => i.edition === "xfce" && i.arch === "x86_64")?.entry.date ?? null;

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** Rows of the official ISO mirror monitor (mirmon) that can serve the images over https. */
function parseMirmon(html: string): Mirror[] {
  const total = html.match(/(\d+) sites in \d+ regions/)?.[1];
  const start = html.indexOf("<H2>report</H2>");
  if (!total || start < 0) throw new Error("the MX Linux mirror monitor page changed (no report)");
  let region = "";
  let rows = 0;
  const mirrors = new Map<string, Mirror>();
  for (const part of html.slice(start).split(/(?=<TR>)/)) {
    const head = part.match(/^<TR><TH COLSPAN=5 BGCOLOR=YELLOW><A NAME="[^"]*">([^<]*)<\/A>/);
    if (head) {
      region = decode(head[1] as string);
      continue;
    }
    const row = part.match(
      /<TD ALIGN=RIGHT><A HREF="([^"]+)">[^<]+<\/A>[\s\S]*?<TD>(\w+)<\/TD>\s*<TD ALIGN=RIGHT>([\s\S]*?)<\/TD>\s*<TD ALIGN=RIGHT>[\s\S]*?<\/TD>\s*<TD>([\s\S]*?)<\/TD>/,
    );
    if (!row) continue;
    rows++;
    const [, href, type, age, status] = row as unknown as [string, string, string, string, string];
    // https only; the monitor's own flags: last probe "ok" (not "no time"), age not marked stale (red).
    if (
      type !== "https" ||
      status.replace(/<[^>]+>/g, "").trim() !== "ok" ||
      /COLOR="?RED/i.test(age)
    )
      continue;
    const url = href.endsWith("/") ? href : `${href}/`;
    if (mirrors.has(url)) continue;
    const name = region.replace(/\s*-\s*\d+ sites$/, "").replace(/\s*\(iso\)$/, "");
    mirrors.set(url, {
      url,
      country: countryCode(name),
      name: new URL(url).hostname,
      lat: null,
      lon: null,
      score: null,
    });
  }
  if (rows !== Number(total))
    throw new Error(`MX Linux mirror monitor: parsed ${rows} sites, the page says ${total}`);
  if (!mirrors.size) throw new Error("the MX Linux mirror monitor lists no https mirror");
  return [...mirrors.values()];
}

export default defineSource({
  slug: "mx-linux",
  hosts: ["sourceforge.net", "rsync-mxlinux.org", "mxrepo.com"],
  async releases(ctx) {
    const eol = await endOfLife("mxlinux");
    const supported = eol.cycles.filter(
      (c) =>
        /^\d+$/.test(c.name) &&
        (!c.eol || c.eol >= ctx.today) &&
        (c.releaseDate ?? "") <= ctx.today,
    );
    const torrents = await torrentUrls();

    const final = await sourceforgeImages("Final");
    const finalVersion = releaseVersion(final, "SourceForge Final/");
    const finalCycle = finalVersion.split(".")[0] as string;
    const cycles = new Map<string, Cycle | undefined>(supported.map((c) => [c.name, c]));
    if (!cycles.has(finalCycle)) cycles.set(finalCycle, undefined);

    const releases: Release[] = [];
    for (const name of [...cycles.keys()].sort((a, b) => compareVersions(b, a))) {
      const cycle = cycles.get(name);
      let version: string;
      let images: Image[];
      let artifactOf: (i: Image) => Artifact;
      if (name === finalCycle) {
        version = finalVersion;
        images = final;
        artifactOf = await currentArtifacts(final, torrents);
      } else {
        if (!cycle?.latest) throw new Error(`endoflife.date names no newest MX Linux ${name}.x`);
        version = cycle.latest;
        images = await sourceforgeImages(`Old/MX-${version}`);
        if (releaseVersion(images, `SourceForge Old/MX-${version}/`) !== version)
          throw new Error(`SourceForge Old/MX-${version}/ holds another version`);
        artifactOf = oldArtifact(torrents);
      }
      releases.push({
        version,
        channel: "stable",
        codename: cycle?.codename ?? null,
        releaseDate: (cycle?.latest === version ? cycle.latestDate : null) ?? flagshipDate(images),
        eol: cycle?.eol ?? null,
        notesUrl: cycle?.link ?? null,
        editions: editionsOf(images, artifactOf),
      });
    }
    return {
      sources: [
        sourceforgeFolderUrl(PROJECT, "Final"),
        MX_ISO_MASTER,
        eol.url,
        "https://l2.mxrepo.com/torrents/",
      ],
      releases,
    };
  },
  async mirrors() {
    return {
      sources: [MIRMON],
      mirrors: parseMirmon(await getText(MIRMON, { accept: "text/html" })),
    };
  },
});
