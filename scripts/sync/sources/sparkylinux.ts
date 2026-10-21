/**
 * SparkyLinux: the stable line (Sparky 8, Debian 13), the oldstable line
 * (Sparky 7, Debian 12) and the semi-rolling line (Debian testing: the newest
 * snapshot, plus the previous one while the download page still offers it),
 * every edition the project's download pages list, ISOs and ARM images from the
 * project's SourceForge, mirrors = SourceForge's redirector.
 *
 * Official sources, and what each one is used for:
 * - sparkylinux.org/download/{stable,rolling,oldstable}/ (the download pages):
 *   the source of truth for what is offered. Each table is one set of images;
 *   its first cell names the version, its "Mirror 1"/"SourceForge" row links
 *   each image on the project's SourceForge. Editions and architectures are read
 *   from the image names (`sparkylinux-<version>-<x86_64|i686|i686-pae>-<flavour>.iso`,
 *   `[image_<date>-]sparkylinux-<version>-<arm64|armhf>[-cli].zip`); an unknown
 *   flavour or a name that does not parse throws. A page without a table, or a
 *   table whose version differs from its file names, throws.
 * - repo.sparkylinux.org (the package repository index): its columns are the
 *   branches the project still maintains (`core`, `testing (semi-rolling)`,
 *   `stable`, `oldstable`). A download page whose branch has no column is past
 *   its end of support and is not read: today `oldoldstable` (Sparky 6, Debian
 *   11), whose repositories the project removed ("Sparky 6 ... EOL", news of
 *   2026-10-01). The project states no end date for the lines it maintains: eol null.
 * - sparkylinux.org/sparky-<version with dashes>/ (the release announcement):
 *   the publication day (JSON-LD `datePublished`, UTC) is the release date and
 *   the page is `notesUrl`. When no such post exists, the release date is the
 *   earliest upload day of the release's images on SourceForge.
 * - wiki.sparkylinux.org code_names: "Sparky 8 “The Seven Sisters”". A numbered
 *   release gets the name of its major; the rolling line gets the name of the
 *   next major ("Sparky 9 “Tiamat”", the Debian testing line the rolling ISOs
 *   follow). A missing name is null.
 * - sourceforge.net/projects/sparkylinux/files/ (robots.txt allows the files
 *   pages): every linked image must exist in its folder. The page shows the
 *   upload day and the hashes SourceForge computed; the `<image>.sig` (detached
 *   signature), `<image>.allsums.txt` (the project's checksum file) and
 *   `torrents/<image>.torrent` next to or below it give `signatureUrl`,
 *   `checksum.url` and `torrentUrl` when the folder lists them.
 *
 * Checksums: the project publishes `<image>.allsums.txt` (md5, sha1 and sha
 * sums), but it can only be read through SourceForge's /download link, which
 * redirects to a *.dl.sourceforge.net host whose robots.txt disallows all bots.
 * Following it would break the rule that every request is robots-allowed, so
 * the value is the strongest hash SourceForge shows for the image (SHA-256, or
 * SHA-1 for the older files SourceForge has not hashed with SHA-256), and
 * `checksum.url` is the project's allsums file, which contains it. An image with
 * no allsums file or no hash on SourceForge throws. Sizes are only given rounded
 * ("2.21 GB"): left null for run.ts.
 *
 * ARM images are published per point release of their own: the Sparky 7 line's
 * ARM64/ARMHF images are 7.7 (the 7.8 announcement says so), 8.4's are dated
 * image_2026-08-09. They are editions ("Openbox (ARM)", "CLI (ARM)") of the
 * line's newest release. 32-bit images (i686 and i686-pae) are arch i686. The
 * rolling line's special editions (GameOver, Multimedia, Rescue) are their own
 * snapshot (2026.06), which the rolling page lists below the current one.
 *
 * Excluded: the development page (2026.01~dev2 Labwc: a development build),
 * oldoldstable (past EOL, see above), the "Mirror 2" rows (archive.org, a flat
 * layout: mirror root + path would not be the file, and only the newest
 * releases are there), the torrent links of the oldstable page (they point to
 * distrowatch.com: never used; SourceForge has no torrent for those files, so
 * torrentUrl is null), package lists, and images that exist on SourceForge but
 * the page does not link.
 */

import type { Artifact, Edition, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getText, HttpError } from "../http";
import { originAsMirror } from "../lib/mirrors";
import { sourceforgeChecksum, sourceforgeDownloadUrl } from "../lib/mxiso";
import { sourceforgeLinkPath, sourceforgeTree } from "../lib/sfproject";
import { sourceforgeFolderUrl, sourceforgeRoot } from "../lib/sourceforge";
import { compareVersions, isoDay } from "../lib/versions";
import { defineSource } from "../source";

const SITE = "https://sparkylinux.org/";
const REPO = "https://repo.sparkylinux.org/";
const CODE_NAMES = "https://wiki.sparkylinux.org/doku.php/code_names";
const PROJECT = "sparkylinux";

/** Download page → the repository column that says the branch is maintained. */
const BRANCHES = [
  { page: "stable", column: "stable", channel: "stable" },
  { page: "rolling", column: "testing", channel: "rolling" },
  { page: "oldstable", column: "oldstable", channel: "stable" },
  { page: "oldoldstable", column: "oldoldstable", channel: "stable" },
] as const;

interface Flavour {
  id: string;
  name: string;
  desktop: Desktop | null;
  kind: Edition["kind"];
}

/** Flavours the project names in its image names; an unknown one is a format change. */
const FLAVOURS: Record<string, Flavour> = {
  lxqt: { id: "lxqt", name: "LXQt", desktop: "lxqt", kind: "desktop" },
  mate: { id: "mate", name: "MATE", desktop: "mate", kind: "desktop" },
  xfce: { id: "xfce", name: "Xfce", desktop: "xfce", kind: "desktop" },
  kde: { id: "kde", name: "KDE Plasma", desktop: "kde", kind: "desktop" },
  minimalgui: {
    id: "minimalgui",
    name: "MinimalGUI (Openbox)",
    desktop: "openbox",
    kind: "minimal",
  },
  "minimalgui-labwc": {
    id: "minimalgui-labwc",
    name: "MinimalGUI (Labwc)",
    desktop: null,
    kind: "minimal",
  },
  minimalcli: { id: "minimalcli", name: "MinimalCLI", desktop: "none", kind: "minimal" },
  gameover: { id: "gameover", name: "GameOver", desktop: null, kind: "desktop" },
  multimedia: { id: "multimedia", name: "Multimedia", desktop: null, kind: "desktop" },
  rescue: { id: "rescue", name: "Rescue", desktop: null, kind: "other" },
  "arm-openbox": { id: "arm-openbox", name: "Openbox (ARM)", desktop: "openbox", kind: "desktop" },
  "arm-cli": { id: "arm-cli", name: "CLI (ARM)", desktop: "none", kind: "minimal" },
};

const ARCH: Record<string, Artifact["arch"]> = {
  x86_64: "x86_64",
  i686: "i686",
  "i686-pae": "i686",
  arm64: "aarch64",
  armhf: "armhf",
};

/** sparkylinux-8.4-x86_64-lxqt.iso, sparkylinux-8.4-i686-pae-minimalgui.iso */
const PC_IMAGE = /^sparkylinux-(\d+(?:\.\d+)+)-(x86_64|i686-pae|i686)-([a-z-]+)\.iso$/;
/** image_2026-08-09-sparkylinux-8.4-arm64-cli.zip, sparkylinux-7.7-armhf.zip */
const ARM_IMAGE =
  /^(?:image_\d{4}-\d{2}-\d{2}-)?sparkylinux-(\d+(?:\.\d+)+)-(arm64|armhf)(-cli)?\.zip$/;

interface Image {
  version: string;
  flavour: string;
  arch: Artifact["arch"];
  /** Path below the SourceForge files root, e.g. lxqt/sparkylinux-8.4-x86_64-lxqt.iso. */
  path: string;
}

interface ImageSet {
  /** The version the table's first cell names. */
  version: string;
  images: Image[];
}

function imageOf(path: string): Image {
  const name = path.split("/").pop() ?? path;
  const pc = PC_IMAGE.exec(name);
  if (pc?.[1] && pc[2] && pc[3] && FLAVOURS[pc[3]] && ARCH[pc[2]])
    return { version: pc[1], flavour: pc[3], arch: ARCH[pc[2]] as Artifact["arch"], path };
  const arm = ARM_IMAGE.exec(name);
  if (arm?.[1] && arm[2] && ARCH[arm[2]])
    return {
      version: arm[1],
      flavour: arm[3] ? "arm-cli" : "arm-openbox",
      arch: ARCH[arm[2]] as Artifact["arch"],
      path,
    };
  throw new Error(`the Sparky download pages offer an unknown image ${path}`);
}

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The tables of one download page: version and linked images (the "Mirror 1" / "SourceForge" row). */
function parsePage(html: string, page: string): ImageSet[] {
  const sets: ImageSet[] = [];
  for (const table of html.matchAll(/<table[\s>][\s\S]*?<\/table>/g)) {
    const rows = [...table[0].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) =>
      [...(r[1] ?? "").matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1] ?? ""),
    );
    const version = text(rows[0]?.[0] ?? "").match(/^\d+(?:\.\d+)+/)?.[0];
    const links = rows.find((r) => /^(?:Mirror 1|SourceForge)$/i.test(text(r[0] ?? "")));
    if (!version || !links)
      throw new Error(`a table of the Sparky ${page} download page has no version or image row`);
    const images: Image[] = [];
    for (const cell of links.slice(1)) {
      const hrefs = [...cell.matchAll(/href="([^"]+)"/g)].map((m) => m[1] ?? "");
      const path = hrefs.map((h) => sourceforgeLinkPath(PROJECT, h)).find(Boolean);
      if (!path) continue;
      const image = imageOf(path);
      if (image.version !== version)
        throw new Error(`${path} is in the ${version} table of the Sparky ${page} download page`);
      images.push(image);
    }
    if (images.length === 0) throw new Error(`the Sparky ${page} download page links no image`);
    sets.push({ version, images });
  }
  if (sets.length === 0) throw new Error(`the Sparky ${page} download page has no table`);
  return sets;
}

/** The branches the package repository index lists (lower case: "core", "testing (semi-rolling)", "stable", …). */
function parseRepoColumns(html: string): string[] {
  const columns = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    text(m[1] ?? "").toLowerCase(),
  );
  if (!columns.includes("stable") || !columns.some((c) => c.startsWith("testing")))
    throw new Error("the Sparky repository index no longer lists the stable and testing branches");
  return columns;
}

/** Major version → code name: `Sparky 8 “The Seven Sisters” (based on Debian 13 “Trixie”)`. */
function parseCodeNames(html: string): Map<number, string> {
  const names = new Map<number, string>();
  for (const m of text(html).matchAll(/Sparky (\d+) [“"]([^”"]+)[”"]/g))
    if (!names.has(Number(m[1]))) names.set(Number(m[1]), m[2] as string);
  if (names.size === 0) throw new Error("the Sparky code names page lists no release");
  return names;
}

/** The release announcement for a version, or null when the project has no such post. */
async function announcement(version: string): Promise<{ url: string; day: string } | null> {
  const url = `${SITE}sparky-${version.replace(/\./g, "-")}/`;
  try {
    const html = await getText(url, { accept: "text/html" });
    const day = isoDay(html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1]);
    return day ? { url, day } : null;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}

export default defineSource({
  slug: "sparkylinux",
  hosts: ["sourceforge.net"],
  async releases(ctx) {
    const columns = parseRepoColumns(await getText(REPO, { accept: "text/html" }));
    const names = parseCodeNames(await getText(CODE_NAMES, { accept: "text/html" }));
    const tree = sourceforgeTree(PROJECT);

    const pages: string[] = [];
    const lines: {
      channel: "stable" | "rolling";
      page: string;
      version: string;
      images: Image[];
    }[] = [];
    for (const branch of BRANCHES) {
      if (!columns.some((c) => c.startsWith(branch.column))) {
        ctx.log(`${branch.page} is not in the repository index: past its end of support`);
        continue;
      }
      const page = `${SITE}download/${branch.page}/`;
      pages.push(page);
      const sets = parsePage(await getText(page, { accept: "text/html" }), branch.page);
      if (branch.channel === "rolling") {
        // Every snapshot is a release of its own; the newest two are kept.
        const versions = [...new Set(sets.map((s) => s.version))]
          .sort((a, b) => compareVersions(b, a))
          .slice(0, 2);
        for (const version of versions)
          lines.push({
            channel: "rolling",
            page: branch.page,
            version,
            images: sets.filter((s) => s.version === version).flatMap((s) => s.images),
          });
      } else {
        // One release per line: its newest point release; ARM images may be an older point release.
        const version = sets
          .map((s) => s.version)
          .sort((a, b) => compareVersions(b, a))[0] as string;
        lines.push({
          channel: "stable",
          page: branch.page,
          version,
          images: sets.flatMap((s) => s.images),
        });
      }
    }
    if (lines.length === 0) throw new Error("no Sparky download page is for a maintained branch");

    const stableMajor = Number(
      lines.find((l) => l.channel === "stable" && l.page === "stable")?.version.split(".")[0],
    );
    const releases: Release[] = [];
    for (const line of lines) {
      const editions = new Map<string, Edition>();
      const days: string[] = [];
      for (const image of line.images) {
        const entry = await tree.entry(image.path);
        if (!entry)
          throw new Error(
            `${image.path} is linked by the Sparky download page but not on SourceForge`,
          );
        if (entry.date) days.push(entry.date);
        const sums = await tree.entry(`${image.path}.allsums.txt`);
        if (!sums) throw new Error(`no ${image.path}.allsums.txt on SourceForge`);
        const checksum = sourceforgeChecksum(entry, sourceforgeDownloadUrl(PROJECT, sums.path));
        if (!checksum) throw new Error(`SourceForge shows no hash for ${image.path}`);
        const sig = await tree.entry(`${image.path}.sig`);
        const torrent = await tree.entry(`torrents/${entry.name}.torrent`);
        const def = FLAVOURS[image.flavour] as Flavour;
        const edition = editions.get(def.id) ?? {
          id: def.id,
          name: def.name,
          desktop: def.desktop,
          kind: def.kind,
          artifacts: [],
        };
        edition.artifacts.push({
          arch: image.arch,
          format: image.path.endsWith(".zip") ? "zip" : "iso",
          file: entry.name,
          path: entry.path,
          url: sourceforgeDownloadUrl(PROJECT, entry.path),
          size: null,
          checksum,
          signatureUrl: sig ? sourceforgeDownloadUrl(PROJECT, sig.path) : null,
          torrentUrl: torrent ? sourceforgeDownloadUrl(PROJECT, torrent.path) : null,
        });
        editions.set(def.id, edition);
      }

      const post = await announcement(line.version);
      const major =
        line.channel === "rolling" ? stableMajor + 1 : Number(line.version.split(".")[0]);
      releases.push({
        version: line.version,
        channel: line.channel,
        codename: names.get(major) ?? null,
        releaseDate: post?.day ?? days.sort()[0] ?? null,
        eol: null,
        notesUrl: post?.url ?? null,
        editions: [...editions.values()],
      });
    }
    // The project's default download is the stable line: numbered releases first, then the snapshots.
    releases.sort(
      (a, b) =>
        Number(a.channel === "rolling") - Number(b.channel === "rolling") ||
        compareVersions(b.version, a.version),
    );
    return {
      sources: [...pages, REPO, CODE_NAMES, sourceforgeFolderUrl(PROJECT)],
      releases,
    };
  },
  async mirrors() {
    return {
      sources: [sourceforgeFolderUrl(PROJECT)],
      mirrors: [originAsMirror(sourceforgeRoot(PROJECT), "SourceForge", null)],
    };
  },
});
