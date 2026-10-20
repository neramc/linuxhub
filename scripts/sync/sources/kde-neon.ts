/**
 * KDE neon: the official download page (neon.kde.org/download) names the
 * current images on files.kde.org, KDE's Mirrorbits redirector, which sends
 * each visitor to a nearby mirror. The page is the source of truth for what is
 * offered, so editions, directory names and build stamps are read from its
 * links, never from a hard-coded table (KDE renamed the trees desktop/ ->
 * desk/ and bigscreen/ -> big/ once already).
 *
 * Per image:
 * - size and SHA-256: the redirector's own "<file>?mirrorlist" page, which
 *   files.kde.org answers itself from its master copy (a plain GET or HEAD of
 *   the file would be redirected to a mirror). The hash is cross-checked with
 *   "<file>?sha256" (also answered by files.kde.org); a mismatch throws.
 * - checksum file: the build directory's .sha256sum, when its listing has it.
 * - signature (.sig, KDE neon ISO signing key) and torrent: when the page links
 *   them and the build directory has them.
 *
 * Mirrors: the same "?mirrorlist" pages list every healthy mirror that carries
 * a file. A mirror is kept only when it carries all of the offered images, so
 * root + artifact.path is always the file; "?mirrorstats" adds the
 * coordinates, and mirrors it flags as disabled or HTTPS-down are left out.
 * Names are the mirror hosts (the redirector's display names are unreliable).
 *
 * KDE neon has no version numbers: each edition is one dated build
 * (YYYYMMDD-hhmm) on an Ubuntu LTS base, and only one build per channel is
 * kept, so there is one rolling release, versioned by the Desktop build's
 * date (every file keeps its own stamp).
 *
 * Excluded for every distro alike: the Testing, Unstable and Developer editions
 * (daily rebuilds from development branches), the "-current" aliases and
 * .zsync delta files, and whatever the page only mentions inside HTML comments
 * (Korean testing image, Pinebook Remix, source ISOs: not offered). Container
 * images are not ISOs and are linked elsewhere.
 */

import type { Artifact, Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import { getText } from "../http";
import { parseChecksums } from "../lib/checksums";
import { listDirectory } from "../lib/dirlist";
import { type MirrorbitsMirror, mirrorbitsFile, mirrorbitsStats } from "../lib/mirrorbits";
import { defineSource } from "../source";

const DOWNLOAD = "https://neon.kde.org/download";
const ORIGIN = "https://files.kde.org/";
const IMAGES = `${ORIGIN}neon/images/`;

interface Image {
  /** "Desktop", "Mobile", "Bigscreen": as the page names the edition. */
  name: string;
  /** "20261018-1825" */
  stamp: string;
  file: string;
  url: string;
  /** Directory URL of the build, ending with "/". */
  dir: string;
  /** Path below a mirror root: neon/images/<tree>/user/<stamp>/<file>. */
  path: string;
  /** Hrefs the page links for this image. */
  links: Set<string>;
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** "20261018-1825" → "2026-10-18". */
const day = (stamp: string) => `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`;

/** The User Edition images the download page offers, in page order, and the Desktop one. */
async function offeredImages(): Promise<{ images: Image[]; desktop: Image }> {
  const page = (await getText(DOWNLOAD, { accept: "text/html" })).replace(/<!--[\s\S]*?-->/g, "");
  const anchors = [...page.matchAll(/<a\s[^>]*?href="([^"]+)"[^>]*>([^<]*)<\/a>/g)].map((m) => ({
    href: (m[1] ?? "").trim(),
    label: (m[2] ?? "").replace(/\s+/g, " ").trim(),
  }));
  const images: Image[] = [];
  for (const { href, label } of anchors) {
    if (!href.startsWith(IMAGES) || !/\/user\//.test(href) || !href.endsWith(".iso")) continue;
    const parts = href
      .slice(ORIGIN.length)
      .match(/^(neon\/images\/[a-z0-9-]+\/user\/(\d{8}-\d{4})\/)([^/]+)$/);
    const name = label.match(/^KDE neon (.+?) User Edition\b/)?.[1];
    if (!parts?.[1] || !parts[2] || !parts[3] || !name || !parts[3].endsWith(`-${parts[2]}.iso`))
      throw new Error(`unrecognized User Edition link on the download page: ${href} "${label}"`);
    const dir = `${ORIGIN}${parts[1]}`;
    images.push({
      name,
      stamp: parts[2],
      file: parts[3],
      url: href,
      dir,
      path: `${parts[1]}${parts[3]}`,
      links: new Set(),
    });
  }
  if (images.length === 0) throw new Error("no User Edition image on the official download page");
  const desktop = images.find((i) => i.name === "Desktop");
  if (!desktop) throw new Error("no Desktop User Edition image on the official download page");
  const ids = images.map((i) => slug(i.name));
  if (new Set(ids).size !== ids.length) throw new Error("duplicate User Edition on the page");
  for (const image of images)
    for (const { href } of anchors)
      if (href === `${image.url}.sig` || href === `${image.url}.torrent`) image.links.add(href);
  return { images, desktop };
}

export default defineSource({
  slug: "kde-neon",
  hosts: ["files.kde.org"],
  async releases() {
    const { images, desktop } = await offeredImages();
    const editions: Edition[] = [];
    for (const image of images) {
      const listing = await listDirectory(image.dir);
      if (!listing.includes(image.file))
        throw new Error(`${image.file} is linked on the download page but not in ${image.dir}`);
      const info = await mirrorbitsFile(image.url);
      if (!info.size) throw new Error(`no size for ${image.file} on the redirector`);
      const listed = info.sha256;
      const served = parseChecksums(await getText(`${image.url}?sha256`, { noCache: true })).get(
        image.file,
      );
      if (listed && served && listed !== served)
        throw new Error(
          `${image.file}: redirector SHA-256 differs between ?mirrorlist and ?sha256`,
        );
      const sha = served ?? listed;
      if (!sha || !/^[0-9a-f]{64}$/.test(sha))
        throw new Error(`no SHA-256 for ${image.file} on the redirector`);
      const sumFile = image.file.replace(/\.iso$/, ".sha256sum");
      const sig = `${image.url}.sig`;
      const torrent = `${image.url}.torrent`;
      const artifact: Artifact = {
        arch: "x86_64",
        format: "iso",
        file: image.file,
        path: image.path,
        url: image.url,
        size: info.size,
        checksum: {
          type: "sha256",
          value: sha,
          url: listing.includes(sumFile) ? `${image.dir}${sumFile}` : null,
        },
        signatureUrl: image.links.has(sig) && listing.includes(`${image.file}.sig`) ? sig : null,
        torrentUrl:
          image.links.has(torrent) && listing.includes(`${image.file}.torrent`) ? torrent : null,
      };
      editions.push({
        id: slug(image.name),
        name: image.name,
        desktop: "kde",
        kind: image.name === "Desktop" ? "desktop" : "other",
        artifacts: [artifact],
      });
    }

    const date = day(desktop.stamp);
    const releases: Release[] = [
      {
        version: date.replaceAll("-", "."),
        channel: "rolling",
        codename: null,
        releaseDate: date,
        eol: null,
        notesUrl: null,
        editions,
      },
    ];
    return { sources: [DOWNLOAD, IMAGES], releases };
  },

  async mirrors() {
    const { images, desktop } = await offeredImages();
    const lists: MirrorbitsMirror[][] = [];
    for (const image of images) lists.push((await mirrorbitsFile(image.url)).mirrors);
    // Only mirrors that carry every offered image: root + artifact.path is then always the file.
    const common = (lists[0] ?? []).filter((m) =>
      lists.every((list) => list.some((other) => other.root === m.root)),
    );
    if (common.length === 0)
      throw new Error("no HTTPS mirror carries every offered KDE neon image");

    const stats = await mirrorbitsStats(ORIGIN);
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
    if (mirrors.length === 0) throw new Error("every KDE neon mirror is flagged down");
    return {
      sources: [DOWNLOAD, `${ORIGIN}?mirrorstats`, `${desktop.url}?mirrorlist`],
      mirrors,
    };
  },
});
