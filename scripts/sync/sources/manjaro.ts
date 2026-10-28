/**
 * Manjaro.
 *
 * Official sources, and what each one is used for:
 * - manjaro.org/products/download/x86/ and /arm/: the official download
 *   pages. Both are prerendered Nuxt pages whose /_payload.json (named by the
 *   page's data-src) carries Manjaro's ISO index (iso-info file-info.json; the
 *   GitLab raw URL of that file is closed to bots by robots.txt). The index
 *   lists, per image, the file, torrent, checksum file and signature the page
 *   links. The x86 page defines the x86_64 editions (Official: KDE Plasma,
 *   Xfce, GNOME; Community: Cinnamon, i3; each with its minimal image), the
 *   ARM page the aarch64 images (17 boards with GNOME, KDE Plasma, MATE,
 *   Minimal, Sway and Xfce; Pinephone and Pinephone Pro with Phosh and Plasma
 *   Mobile).
 * - download.manjaro.org (Manjaro's CDN, the origin of every ISO) and
 *   github.com/manjaro-arm, github.com/manjaro-pinephone (the project's
 *   release assets for the ARM images): the files and, next to each, the
 *   checksum file the page links (.sha256 or .sha512 for ISOs, .sha1 or .sha256
 *   for ARM images), the .sig signature and the .torrent when the index lists
 *   them. A checksum file that does not name its image throws.
 *
 * The page decides what is offered (as for every distro): releases follow the
 * versions in the file names the page links. Today that is 26.1.0 for the
 * official ISOs, 25.0.3 for the community ISOs, 23.02 for the ARM boards and
 * Beta 32 / Beta 14 for the phones; a newer ISO build that sits on the CDN
 * but is not linked yet (26.1.2) is picked up once the page links it. Each
 * version string is its own release (rolling for the numbered ones; channel
 * `beta` for the phone images, which the project itself labels Beta 32 and
 * Beta 14). Deviation from the usual "at most two rolling snapshots": the
 * page offers four different image sets at four versions, and each is listed
 * with the version its files carry rather than relabelled.
 *
 * Exclusions, for the same reasons as everywhere: Sway WM on the x86 page is
 * only a link to a community project's own site (manjaro-sway.download), no
 * image of the index; the "Sway" ARM image is included. Package-repository
 * mirrors (repo.manjaro.org) do not carry ISOs, so the only mirror is the CDN.
 *
 * Sizes are not published (run.ts HEADs each file); the release date of the
 * ISOs is the YYMMDD in the file name, and the ARM and phone images have no
 * published date (GitHub's release API is closed to the sync), so it is null.
 * Edition ids are the files' own names (ISO: edition key, "-minimal" for the
 * minimal image; ARM: the file name between "Manjaro-ARM-" and the version).
 */

import type { Artifact, Edition, Release } from "../../../src/lib/data-schemas";
import { DESKTOPS, type Desktop } from "../../../src/lib/taxonomy";
import { getText } from "../http";
import { checksumType, parseChecksums } from "../lib/checksums";
import { mapLimit, originAsMirror } from "../lib/mirrors";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const X86_PAGE = "https://manjaro.org/products/download/x86/";
const ARM_PAGE = "https://manjaro.org/products/download/arm/";
const CDN = "https://download.manjaro.org/";
const NOTES = "https://forum.manjaro.org/c/announcements/11";
const HOSTS = ["download.manjaro.org", "github.com"];

interface Image {
  image?: string;
  torrent?: string;
  checksum?: string;
  signature?: string;
  /** Set instead of `image` when the entry only links a community project's own site. */
  custom?: string;
}

type Entry = Image & { minimal?: Image };
interface FileInfo {
  official?: Record<string, Entry>;
  community?: Record<string, Entry>;
  arm?: Record<string, Record<string, Entry>>;
}

/**
 * A page's Nuxt payload (/_payload.json, named by the page's data-src) is a
 * flat array; the ISO index is one of its strings, stored as raw JSON text.
 */
async function fileInfo(page: string, section: keyof FileInfo): Promise<FileInfo> {
  const html = await getText(page, { accept: "text/html" });
  const src = html.match(/id="__NUXT_DATA__"[^>]*data-src="([^"]+)"/)?.[1] ?? "_payload.json";
  const payloadUrl = new URL(src.replace(/&amp;/g, "&"), page).href;
  const payload: unknown = JSON.parse(await getText(payloadUrl, { accept: "application/json" }));
  for (const item of Array.isArray(payload) ? payload : []) {
    if (typeof item !== "string" || !item.trimStart().startsWith("{")) continue;
    try {
      const parsed = JSON.parse(item) as FileInfo;
      if (parsed[section] && typeof parsed[section] === "object") return parsed;
    } catch {
      /* not the index */
    }
  }
  throw new Error(`no "${section}" ISO index in ${payloadUrl}`);
}

interface EditionDef {
  id: string;
  name: string;
  desktop: Desktop | null;
}

/** x86 editions by index key; an unknown key still gets a plain entry. */
const X86: Record<string, EditionDef> = {
  plasma: { id: "kde", name: "KDE Plasma", desktop: "kde" },
  xfce: { id: "xfce", name: "Xfce", desktop: "xfce" },
  gnome: { id: "gnome", name: "GNOME", desktop: "gnome" },
  cinnamon: { id: "cinnamon", name: "Cinnamon", desktop: "cinnamon" },
  i3: { id: "i3", name: "i3", desktop: "i3" },
};

/** ARM desktops by index key. */
const ARM: Record<string, { name: string; desktop: Desktop | null; kind: Edition["kind"] }> = {
  gnome: { name: "GNOME", desktop: "gnome", kind: "desktop" },
  plasma: { name: "KDE Plasma", desktop: "kde", kind: "desktop" },
  mate: { name: "MATE", desktop: "mate", kind: "desktop" },
  minimal: { name: "Minimal", desktop: "none", kind: "minimal" },
  sway: { name: "Sway", desktop: "sway", kind: "desktop" },
  xfce: { name: "Xfce", desktop: "xfce", kind: "desktop" },
  phosh: { name: "Phosh", desktop: null, kind: "other" },
  "plasma-mobile": { name: "Plasma Mobile", desktop: "kde", kind: "other" },
};

const fileOf = (url: string) => decodeURIComponent(new URL(url).pathname.split("/").pop() ?? url);

function officialUrl(url: string | undefined, what: string): string {
  if (!url) throw new Error(`the index has no ${what}`);
  const u = new URL(url);
  if (u.protocol !== "https:" || !HOSTS.includes(u.hostname))
    throw new Error(`${what} ${url} is not on an official Manjaro host`);
  return url;
}

/** What a release is made of while the index is read. */
interface Item {
  version: string;
  channel: Release["channel"];
  date: string | null;
  notesUrl: string | null;
  edition: Edition;
}

/** Reads one linked image: its checksum file names it; signature and torrent are optional. */
async function artifact(
  img: Image,
  arch: Artifact["arch"],
  format: Artifact["format"],
  path: string | null,
): Promise<Artifact> {
  const url = officialUrl(img.image, "image link");
  const file = fileOf(url);
  const sumUrl = officialUrl(img.checksum, `checksum link for ${file}`);
  const hash = parseChecksums(await getText(sumUrl)).get(file);
  if (!hash) throw new Error(`${sumUrl} does not list ${file}`);
  return {
    arch,
    format,
    file,
    path,
    url,
    size: null,
    checksum: { type: checksumType(hash), value: hash, url: sumUrl },
    signatureUrl: img.signature ? officialUrl(img.signature, `signature link for ${file}`) : null,
    torrentUrl: img.torrent ? officialUrl(img.torrent, `torrent link for ${file}`) : null,
  };
}

/** "manjaro-kde-26.1.0-minimal-260812-linux71.iso" → { version: "26.1.0", date: "2026-08-12" }. */
function parseIso(file: string): { version: string; date: string } {
  const m = file.match(
    /^manjaro-[a-z0-9]+-(\d+\.\d+(?:\.\d+)?)-(?:minimal-)?(\d{2})(\d{2})(\d{2})-/,
  );
  if (!m) throw new Error(`unexpected Manjaro ISO name ${file}`);
  return { version: m[1] as string, date: `20${m[2]}-${m[3]}-${m[4]}` };
}

/** The ISOs of one section of the x86 page (official or community) with their minimal images. */
async function isoItems(section: Record<string, Entry>): Promise<Item[]> {
  const jobs: { def: EditionDef; img: Image; minimal: boolean }[] = [];
  for (const [key, entry] of Object.entries(section)) {
    const def = X86[key] ?? {
      id: key,
      name: key,
      desktop: key in DESKTOPS ? (key as Desktop) : null,
    };
    // Sway WM links a community project's own site instead of an image.
    if (!entry.image && entry.custom) continue;
    jobs.push({ def, img: entry, minimal: false });
    if (entry.minimal) jobs.push({ def, img: entry.minimal, minimal: true });
  }
  return mapLimit(jobs, 4, async ({ def, img, minimal }): Promise<Item> => {
    const url = officialUrl(img.image, `image link of ${def.name}`);
    const parsed = parseIso(fileOf(url));
    const a = await artifact(img, "x86_64", "iso", new URL(url).pathname.slice(1));
    return {
      ...parsed,
      channel: "rolling",
      notesUrl: NOTES,
      edition: {
        id: minimal ? `${def.id}-minimal` : def.id,
        name: minimal ? `${def.name} (minimal)` : def.name,
        desktop: def.desktop,
        kind: minimal ? "minimal" : "desktop",
        artifacts: [a],
      },
    };
  });
}

/** "Manjaro-ARM-xfce-rpi4-23.02.img.xz" → version "23.02" (rolling); "…-pinephone-beta32.img.xz" → "beta32" (beta). */
function parseArm(file: string): { id: string; version: string; channel: Release["channel"] } {
  const m = file.match(/^Manjaro-ARM-(.+)-(\d{2}\.\d{2}|beta\d+)\.img\.xz$/);
  if (!m) throw new Error(`unexpected Manjaro ARM image name ${file}`);
  const version = m[2] as string;
  return {
    id: (m[1] as string).toLowerCase(),
    version,
    channel: version.startsWith("beta") ? "beta" : "rolling",
  };
}

/** The ARM page's boards: one edition per board and desktop (a board's images differ only by desktop). */
async function armItems(boards: Record<string, Record<string, Entry>>): Promise<Item[]> {
  const jobs = Object.entries(boards).flatMap(([board, desktops]) =>
    Object.entries(desktops).map(([key, img]) => ({ board, key, img })),
  );
  return mapLimit(jobs, 4, async ({ board, key, img }): Promise<Item> => {
    const url = officialUrl(img.image, `image link of ${board} ${key}`);
    const parsed = parseArm(fileOf(url));
    const def = ARM[key] ?? { name: key, desktop: null, kind: "other" as const };
    // The release page of a GitHub release asset: …/<org>/<repo>/releases/download/<tag>/<file>.
    const tag = url.match(/^(https:\/\/github\.com\/[^/]+\/[^/]+)\/releases\/download\/([^/]+)\//);
    return {
      version: parsed.version,
      channel: parsed.channel,
      date: null,
      notesUrl: tag ? `${tag[1]}/releases/tag/${tag[2]}` : null,
      edition: {
        id: parsed.id,
        name: `${board} (${def.name})`,
        desktop: def.desktop,
        kind: def.kind,
        artifacts: [await artifact(img, "aarch64", "img.xz", null)],
      },
    };
  });
}

/** One release per version string; the date is the earliest the files give, the notes link only when one page covers them all. */
function releasesOf(items: Item[]): Release[] {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const key = `${item.channel}:${item.version}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const releases = [...groups.values()].map((group): Release => {
    const first = group[0] as Item;
    const dates = group.flatMap((i) => i.date ?? []).sort();
    const notes = new Set(group.map((i) => i.notesUrl));
    return {
      version: first.version,
      channel: first.channel,
      codename: null,
      releaseDate: dates[0] ?? null,
      eol: null,
      notesUrl: notes.size === 1 ? (first.notesUrl ?? null) : null,
      editions: group.map((i) => i.edition),
    };
  });
  // Numbered rolling images first, newest version first; betas last.
  return releases.sort(
    (a, b) =>
      Number(a.channel === "beta") - Number(b.channel === "beta") ||
      compareVersions(b.version, a.version),
  );
}

export default defineSource({
  slug: "manjaro",
  hosts: HOSTS,
  async releases() {
    const x86 = await fileInfo(X86_PAGE, "official");
    const arm = await fileInfo(ARM_PAGE, "arm");
    const official = x86.official ?? {};
    for (const key of ["plasma", "xfce", "gnome"])
      if (!official[key]?.image) throw new Error(`the x86 page no longer offers ${key}`);
    const boards = arm.arm ?? {};
    if (!Object.keys(boards).length) throw new Error("the ARM page offers no boards");

    const items = [
      ...(await isoItems(official)),
      ...(await isoItems(x86.community ?? {})),
      ...(await armItems(boards)),
    ];
    return { sources: [X86_PAGE, ARM_PAGE], releases: releasesOf(items) };
  },
  async mirrors() {
    // ISOs are served only by Manjaro's CDN; repo.manjaro.org lists package mirrors.
    return {
      sources: [X86_PAGE],
      mirrors: [originAsMirror(CDN, "download.manjaro.org")],
    };
  },
});
