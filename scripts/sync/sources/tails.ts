/**
 * Tails: one supported line, the newest stable release (older versions are
 * unsupported the moment a new one ships), offered as a USB image (.img) and
 * an ISO, amd64 only.
 *
 * Official sources:
 * - tails.net/install/v2/Tails/amd64/stable/latest.json: the description the
 *   download page itself compares downloads against ("the checksum of our
 *   images"): version, file URLs, exact sizes and SHA-256. It is the checksum
 *   publication, so it is also `checksum.url`.
 * - tails.net/install/download/: the page that offers the images. It must link
 *   exactly the files latest.json lists; it also links the detached OpenPGP
 *   signature of each (tails.net/torrents/files/<file>.sig). Anything else
 *   throws, so a half-updated site never produces data.
 * - tails.net/news/version_<v>/: the release announcement (release date).
 * - download.tails.net: Tails' Mirrorbits redirector (the "HTTP mirror pool",
 *   it sends each visitor to a nearby mirror, picked by IP geolocation).
 *   "<file>?mirrorlist" is answered by the redirector itself: the master
 *   copy's size and SHA-256 (cross-checked with latest.json; a mismatch
 *   throws) and every mirror that carries the file. "?mirrorstats" adds the
 *   mirrors' coordinates and health.
 *
 * Mirrors: those the redirector lists for BOTH images, so root + artifact.path
 * is always the file; mirrors the redirector flags as disabled or with HTTPS
 * down are left out. Names are the mirror hosts.
 *
 * Not included: pre-releases (the test/RC images are announced as news posts
 * and are not linked from the download page), BitTorrent (404 for every
 * current image; Tails no longer publishes torrents, torrentUrl stays null),
 * EOL (null: a Tails version is supported until the next one is out; there is
 * no dated end), endoflife.date (not needed: the announcement gives the date).
 *
 * tails.net asks for a 20 s Crawl-delay (robots.txt); the polite client
 * waits that long between its requests to the host, so a run of this source
 * takes a couple of minutes by design.
 */

import type { Artifact, Mirror, Release } from "../../../src/lib/data-schemas";
import { getJson, getText, HttpError } from "../http";
import { type MirrorbitsMirror, mirrorbitsFile, mirrorbitsStats } from "../lib/mirrorbits";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const SITE = "https://tails.net/";
const LATEST = `${SITE}install/v2/Tails/amd64/stable/latest.json`;
const DOWNLOAD = `${SITE}install/download/`;
/** Mirrorbits root: root + artifact.path (below) is the file on the redirector and on every mirror. */
const REDIRECTOR = "https://download.tails.net/tails/";

interface Latest {
  installations?: {
    version?: string;
    "installation-paths"?: {
      type?: string;
      "target-files"?: { url?: string; size?: number; sha256?: string }[];
    }[];
  }[];
}

interface Image {
  format: Artifact["format"];
  file: string;
  url: string;
  /** Path below a mirror root: stable/tails-amd64-<v>/<file>. */
  path: string;
  size: number;
  sha256: string;
}

const FORMATS: Record<string, Artifact["format"]> = { img: "img", iso: "iso" };

/** The current version and its images, from latest.json. */
async function current(): Promise<{ version: string; images: Image[] }> {
  const data = await getJson<Latest>(LATEST);
  const install = [...(data.installations ?? [])]
    .filter((i) => i.version)
    .sort((a, b) => compareVersions(b.version ?? "0", a.version ?? "0"))[0];
  const version = install?.version;
  if (!install || !version) throw new Error("no installation in Tails latest.json");

  const images: Image[] = [];
  for (const p of install["installation-paths"] ?? []) {
    const format = FORMATS[p.type ?? ""];
    if (!format) throw new Error(`Tails latest.json lists an unknown image type "${p.type}"`);
    const target = p["target-files"]?.[0];
    if (
      !target?.url?.startsWith(REDIRECTOR) ||
      !target.size ||
      !/^[0-9a-f]{64}$/i.test(target.sha256 ?? "")
    )
      throw new Error(`Tails latest.json: unexpected ${p.type} entry for ${version}`);
    const path = target.url.slice(REDIRECTOR.length);
    const file = path.split("/").pop() ?? path;
    if (
      file !== `tails-amd64-${version}.${p.type}` ||
      path !== `stable/tails-amd64-${version}/${file}`
    )
      throw new Error(`Tails latest.json: unexpected file name ${target.url}`);
    images.push({
      format,
      file,
      url: target.url,
      path,
      size: target.size,
      sha256: (target.sha256 as string).toLowerCase(),
    });
  }
  if (images.length !== 2 || new Set(images.map((i) => i.format)).size !== 2)
    throw new Error(`Tails latest.json for ${version} does not list one USB image and one ISO`);
  return { version, images };
}

/** Detached-signature links of the images on the download page; throws unless it links every image. */
async function signatures(images: Image[]): Promise<Map<string, string>> {
  const page = await getText(DOWNLOAD, { accept: "text/html" });
  const links = new Set([...page.matchAll(/href="\s*([^"\s]+)\s*"/g)].map((m) => m[1] ?? ""));
  const out = new Map<string, string>();
  for (const image of images) {
    if (!links.has(image.url))
      throw new Error(`the Tails download page does not link ${image.url}`);
    const sig = `${SITE}torrents/files/${image.file}.sig`;
    if (links.has(sig)) out.set(image.file, sig);
  }
  return out;
}

export default defineSource({
  slug: "tails",
  hosts: ["tails.net", "download.tails.net"],

  async releases(ctx) {
    const { version, images } = await current();
    const sigs = await signatures(images);

    // The redirector's own copy must agree with latest.json.
    const artifacts: Artifact[] = [];
    for (const image of images) {
      const master = await mirrorbitsFile(image.url);
      if (master.sha256 && master.sha256 !== image.sha256)
        throw new Error(
          `${image.file}: SHA-256 differs between latest.json and download.tails.net`,
        );
      if (master.size && master.size !== image.size)
        throw new Error(`${image.file}: size differs between latest.json and download.tails.net`);
      artifacts.push({
        arch: "x86_64",
        format: image.format,
        file: image.file,
        path: image.path,
        url: image.url,
        size: image.size,
        checksum: { type: "sha256", value: image.sha256, url: LATEST },
        signatureUrl: sigs.get(image.file) ?? null,
        torrentUrl: null,
      });
    }

    // Release date: the announcement's publication day.
    const notesUrl = `${SITE}news/version_${version}/`;
    let releaseDate: string | null = null;
    try {
      const news = await getText(notesUrl, { accept: "text/html" });
      releaseDate =
        news.match(
          /<time\b[^>]*\bdatetime="(\d{4}-\d{2}-\d{2})[^"]*"[^>]*\bclass="[^"]*\bdt-published\b/,
        )?.[1] ??
        news.match(
          /<time\b[^>]*\bclass="[^"]*\bdt-published\b[^"]*"[^>]*\bdatetime="(\d{4}-\d{2}-\d{2})/,
        )?.[1] ??
        null;
      if (!releaseDate) throw new Error(`no publication date on the Tails ${version} announcement`);
    } catch (error) {
      // Not announced yet: the release goes out without a date, never with a guessed one.
      if (!(error instanceof HttpError && error.status === 404)) throw error;
      ctx.log(`no announcement at ${notesUrl} yet; release date unknown`);
    }

    const releases: Release[] = [
      {
        version,
        channel: "stable",
        codename: null,
        releaseDate,
        eol: null,
        notesUrl: releaseDate ? notesUrl : null,
        editions: [{ id: "tails", name: "Tails", desktop: "gnome", kind: "live", artifacts }],
      },
    ];
    return { sources: [LATEST, DOWNLOAD, notesUrl], releases };
  },

  async mirrors() {
    const { images } = await current();
    const lists: MirrorbitsMirror[][] = [];
    for (const image of images) lists.push((await mirrorbitsFile(image.url)).mirrors);
    const common = (lists[0] ?? []).filter((m) =>
      lists.every((list) => list.some((other) => other.root === m.root)),
    );
    if (common.length === 0) throw new Error("no HTTPS mirror carries both Tails images");

    const stats = await mirrorbitsStats(REDIRECTOR);
    if (stats.size === 0)
      throw new Error("the Tails redirector's mirror statistics list no mirrors");
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
    if (mirrors.length === 0) throw new Error("every Tails mirror is flagged down");
    return {
      sources: [`${REDIRECTOR}?mirrorstats`, `${(images[0] as Image).url}?mirrorlist`],
      mirrors,
    };
  },
});
