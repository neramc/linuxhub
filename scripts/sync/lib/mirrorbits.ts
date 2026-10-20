/**
 * Mirrorbits redirectors (KDE's files.kde.org, Kali's cdimage.kali.org, …).
 *
 * `<file>?mirrorlist` is answered by the redirector itself and never
 * redirects: the file's exact size, the hashes it computed from its master
 * copy, and every mirror that carries the file. A plain GET or HEAD of the
 * file URL redirects to a mirror (and would download the image), so callers
 * never request one. `?mirrorstats` adds each mirror's coordinates.
 *
 * Parsing does not depend on the HTML template: the size comes from
 * "(N bytes)", hashes from their label, and mirror rows from anchors whose
 * href ends with the file's path (root = href minus that path).
 */
import { getText } from "../http";
import { countryCode } from "./mirrors";

export interface MirrorbitsMirror {
  /** Mirror root, ending with "/": root + the file's path below the redirector is the file. */
  root: string;
  country: string | null;
}

export interface MirrorbitsFile {
  size: number | null;
  sha256: string | null;
  sha1: string | null;
  md5: string | null;
  mirrors: MirrorbitsMirror[];
}

const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');

/** Reads a mirrorbits `?mirrorlist` page (exported for tests). */
export function parseMirrorlist(html: string, fileUrl: string): MirrorbitsFile {
  // The page names the file it resolved (an alias such as current/ resolves to the dated file).
  const named = html.match(/The file <b>(\/[^<]+)<\/b>/)?.[1];
  const path = decode(named ?? decodeURI(new URL(fileUrl).pathname));
  const text = decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
  const size = text.match(/\((\d+) bytes\)/)?.[1];
  const hash = (label: string, length: number) =>
    text.match(new RegExp(`\\b${label}\\b\\s+([0-9a-f]{${length}})\\b`, "i"))?.[1]?.toLowerCase() ??
    null;
  const mirrors = new Map<string, MirrorbitsMirror>();
  for (const row of html.split(/<tr\b/i).slice(1)) {
    const body = row.split(/<\/tr>/i)[0] ?? "";
    for (const m of body.matchAll(/href\s*=\s*"([^"]+)"/gi)) {
      const href = decode(m[1] ?? "");
      if (!/^https:\/\//.test(href) || !decodeURI(href).endsWith(path)) continue;
      const root = `${decodeURI(href).slice(0, -path.length)}/`;
      const cell = [...body.matchAll(/<td[^>]*>\s*([A-Z]{2})\s*<\/td>/g)].map((c) => c[1]);
      mirrors.set(root, { root, country: countryCode(cell[0] ?? null) });
    }
  }
  return {
    size: size ? Number(size) : null,
    sha256: hash("SHA256", 64),
    sha1: hash("SHA1", 40),
    md5: hash("MD5", 32),
    mirrors: [...mirrors.values()],
  };
}

export async function mirrorbitsFile(fileUrl: string): Promise<MirrorbitsFile> {
  const html = await getText(`${fileUrl}?mirrorlist`, { accept: "text/html" });
  const file = parseMirrorlist(html, fileUrl);
  if (file.size === null && file.mirrors.length === 0)
    throw new Error(`not a mirrorbits mirror list: ${fileUrl}?mirrorlist`);
  return file;
}

export interface MirrorbitsStat {
  lat: number;
  lon: number;
  enabled: boolean;
  httpsUp: boolean;
}

/** Reads `?mirrorstats` (exported for tests): mirror root → coordinates and health. */
export function parseMirrorstats(html: string): Map<string, MirrorbitsStat> {
  const out = new Map<string, MirrorbitsStat>();
  for (const block of html.matchAll(/\{[^{}]*"lat"[^{}]*\}/g)) {
    const b = block[0];
    const num = (k: string) => Number(b.match(new RegExp(`"${k}"\\s*:\\s*(-?[\\d.]+)`))?.[1]);
    const bool = (k: string) => b.match(new RegExp(`"${k}"\\s*:\\s*(true|false)`))?.[1] === "true";
    const url = b.match(/"URL"\s*:\s*"([^"]+)"/)?.[1]?.replace(/\\\//g, "/");
    const lat = num("lat");
    const lon = num("lon");
    if (!url || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    out.set(url.endsWith("/") ? url : `${url}/`, {
      lat,
      lon,
      enabled: bool("enabled"),
      httpsUp: bool("httpsUp"),
    });
  }
  return out;
}

export async function mirrorbitsStats(base: string): Promise<Map<string, MirrorbitsStat>> {
  return parseMirrorstats(await getText(`${base.replace(/\/?$/, "/")}?mirrorstats`));
}
