/**
 * Kali Linux: the official SHA256SUMS of the current release on
 * cdimage.kali.org (Kali's download redirector, which hands each visitor to
 * a nearby mirror) lists every image and its torrent; the signed
 * SHA256SUMS.gpg sits next to it. Some images (e.g. "everything", and at
 * times the live images) are published as torrents only, so the release
 * directory listing decides which images are directly downloadable. Sizes
 * come from a HEAD request to kali.download (Kali's own CDN); the release
 * date from the official kali.org blog feed's release announcement.
 */

import type { Artifact, Edition, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getText, headSize } from "../http";
import { parseChecksums } from "../lib/checksums";
import { listDirectory } from "../lib/dirlist";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const CDIMAGE = "https://cdimage.kali.org/";
const CDN = "https://kali.download/base-images/";
const FEED = "https://www.kali.org/rss.xml";

/** Image type in "kali-linux-<ver>-<type>-<arch>.iso" → edition. Display order. */
const EDITIONS: {
  type: string;
  id: string;
  name: string;
  desktop: Desktop | null;
  kind: Edition["kind"];
}[] = [
  { type: "installer", id: "installer", name: "Installer", desktop: "xfce", kind: "desktop" },
  {
    type: "installer-netinst",
    id: "netinst",
    name: "NetInstaller",
    desktop: null,
    kind: "netinst",
  },
  { type: "live", id: "live", name: "Live", desktop: "xfce", kind: "live" },
  {
    type: "installer-everything",
    id: "installer-everything",
    name: "Installer (everything)",
    desktop: "xfce",
    kind: "desktop",
  },
  {
    type: "live-everything",
    id: "live-everything",
    name: "Live (everything)",
    desktop: "xfce",
    kind: "live",
  },
  { type: "installer-purple", id: "purple", name: "Kali Purple", desktop: "xfce", kind: "desktop" },
];

const ARCHES: Record<string, Artifact["arch"]> = { amd64: "x86_64", arm64: "aarch64" };

/** Publication date of the "Kali Linux <version> Release" post, if still in the feed. */
async function announced(version: string): Promise<string | null> {
  try {
    const xml = await getText(FEED, { accept: "application/rss+xml" });
    for (const item of xml.split("<item>").slice(1)) {
      const title = item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
      if (!title.startsWith(`Kali Linux ${version} Release`)) continue;
      const date = item.match(/<pubDate>(.+?)<\/pubDate>/)?.[1];
      const d = date ? new Date(date) : null;
      return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
    }
  } catch {
    /* the date is optional */
  }
  return null;
}

export default defineSource({
  slug: "kali-linux",
  hosts: ["cdimage.kali.org", "kali.download"],
  async releases() {
    const sums = parseChecksums(await getText(`${CDIMAGE}current/SHA256SUMS`));
    const version = [...sums.keys()]
      .map((f) => f.match(/^kali-linux-(\d{4}\.\d+[a-z]?)-/)?.[1])
      .filter((v): v is string => Boolean(v))
      .sort((a, b) => compareVersions(b, a))[0];
    if (!version) throw new Error("no images in current/SHA256SUMS");
    const dir = `${CDIMAGE}kali-${version}/`;
    const cdnDir = `${CDN}kali-${version}/`;
    // Only images that are actually on the server (torrent-only ones are skipped).
    const listed = new Set(await listDirectory(dir));

    const editions: Edition[] = [];
    for (const def of EDITIONS) {
      const artifacts: Artifact[] = [];
      for (const [kaliArch, arch] of Object.entries(ARCHES)) {
        const file = `kali-linux-${version}-${def.type}-${kaliArch}.iso`;
        const sha = sums.get(file);
        if (!sha || !listed.has(file)) continue;
        artifacts.push({
          arch,
          format: "iso",
          file,
          path: null,
          url: `${dir}${file}`,
          size: await headSize(`${cdnDir}${file}`),
          checksum: { type: "sha256", value: sha, url: `${dir}SHA256SUMS` },
          signatureUrl: `${dir}SHA256SUMS.gpg`,
          torrentUrl: listed.has(`${file}.torrent`) ? `${dir}${file}.torrent` : null,
        });
      }
      if (artifacts.length)
        editions.push({
          id: def.id,
          name: def.name,
          desktop: def.desktop,
          kind: def.kind,
          artifacts,
        });
    }
    if (!editions.length) throw new Error(`no installer/live images for Kali ${version}`);

    const releases: Release[] = [
      {
        version,
        channel: "rolling",
        codename: null,
        releaseDate: await announced(version),
        eol: null,
        notesUrl: `https://www.kali.org/blog/kali-linux-${version.replace(".", "-")}-release/`,
        editions,
      },
    ];
    return { sources: [`${CDIMAGE}current/`, dir, FEED], releases };
  },
});
