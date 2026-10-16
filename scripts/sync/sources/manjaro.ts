/**
 * Manjaro: the official download page (manjaro.org/products/download/x86/)
 * embeds Manjaro's ISO index (the iso-info file-info.json; its GitLab raw
 * URL is closed to bots by robots.txt) in its Nuxt payload. The index lists
 * each official edition's image, minimal image, checksum file, PGP signature
 * and torrent on download.manjaro.org (Manjaro's CDN). The digest comes from
 * the official checksum file next to each image; sizes from a HEAD request.
 */

import type { Artifact, Edition, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getText, headSize } from "../http";
import { checksumType, parseChecksums } from "../lib/checksums";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const PAGE = "https://manjaro.org/products/download/x86/";

interface Image {
  image?: string;
  torrent?: string;
  checksum?: string;
  signature?: string;
}

type Entry = Image & { minimal?: Image };
type FileInfo = { official?: Record<string, Entry> };

/**
 * The page's Nuxt payload (/_payload.json, named by the page's data-src) is a
 * flat array; the ISO index is one of its strings, stored as raw JSON text.
 */
async function fileInfo(): Promise<FileInfo> {
  const html = await getText(PAGE, { accept: "text/html" });
  const src = html.match(/id="__NUXT_DATA__"[^>]*data-src="([^"]+)"/)?.[1] ?? "_payload.json";
  const payloadUrl = new URL(src.replace(/&amp;/g, "&"), PAGE).href;
  const payload: unknown = JSON.parse(await getText(payloadUrl, { accept: "application/json" }));
  for (const item of Array.isArray(payload) ? payload : []) {
    if (typeof item !== "string" || !item.trimStart().startsWith("{")) continue;
    try {
      const parsed = JSON.parse(item) as FileInfo;
      if (parsed.official && typeof parsed.official === "object") return parsed;
    } catch {
      /* not the index */
    }
  }
  throw new Error(`no ISO index in ${payloadUrl}`);
}

/** Official editions (file-info.json "official" keys), in display order. */
const EDITIONS: { key: string; id: string; name: string; desktop: Desktop }[] = [
  { key: "plasma", id: "kde", name: "KDE Plasma", desktop: "kde" },
  { key: "xfce", id: "xfce", name: "Xfce", desktop: "xfce" },
  { key: "gnome", id: "gnome", name: "GNOME", desktop: "gnome" },
];

const HOST = "download.manjaro.org";
const onHost = (url: string | undefined): url is string =>
  Boolean(url && /^https:\/\//.test(url) && new URL(url).hostname === HOST);

/** "manjaro-kde-26.1.1-260825-linux71.iso" → { version: "26.1.1", date: "2026-08-25" }. */
function parseName(file: string): { version: string; date: string } | null {
  const m = file.match(
    /^manjaro-[a-z0-9]+-(\d+\.\d+(?:\.\d+)?)-(?:minimal-)?(\d{2})(\d{2})(\d{2})-/,
  );
  return m ? { version: m[1] as string, date: `20${m[2]}-${m[3]}-${m[4]}` } : null;
}

async function artifact(img: Image): Promise<Artifact | null> {
  if (!onHost(img.image) || !onHost(img.checksum)) return null;
  const file = img.image.split("/").pop() ?? img.image;
  const hash = parseChecksums(await getText(img.checksum)).get(file);
  if (!hash) return null;
  return {
    arch: "x86_64",
    format: "iso",
    file,
    path: null,
    url: img.image,
    size: await headSize(img.image),
    checksum: { type: checksumType(hash), value: hash, url: img.checksum },
    signatureUrl: onHost(img.signature) ? img.signature : null,
    torrentUrl: onHost(img.torrent) ? img.torrent : null,
  };
}

export default defineSource({
  slug: "manjaro",
  hosts: [HOST],
  async releases() {
    const info = await fileInfo();
    const official = info.official ?? {};
    const editions: Edition[] = [];
    const seen: { version: string; date: string }[] = [];

    for (const def of EDITIONS) {
      const entry = official[def.key];
      if (!entry) continue;
      for (const [img, minimal] of [
        [entry, false],
        [entry.minimal, true],
      ] as const) {
        if (!img) continue;
        const a = await artifact(img);
        if (!a) continue;
        const parsed = parseName(a.file);
        if (parsed) seen.push(parsed);
        editions.push({
          id: minimal ? `${def.id}-minimal` : def.id,
          name: minimal ? `${def.name} (minimal)` : def.name,
          desktop: def.desktop,
          kind: minimal ? "minimal" : "desktop",
          artifacts: [a],
        });
      }
    }
    // The newest ISO version among the official editions names the release.
    const newest = seen.sort((a, b) => compareVersions(b.version, a.version))[0];
    if (!newest || !editions.length)
      throw new Error("no official Manjaro images in the download index");
    const releases: Release[] = [
      {
        version: newest.version,
        channel: "rolling",
        codename: null,
        releaseDate: seen
          .filter((s) => s.version === newest.version)
          .map((s) => s.date)
          .sort()[0] as string,
        eol: null,
        notesUrl: "https://forum.manjaro.org/c/announcements/11",
        editions,
      },
    ];
    return { sources: [PAGE], releases };
  },
});
