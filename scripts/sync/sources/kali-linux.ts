/**
 * Kali Linux. The official download page (kali.org/get-kali) decides which
 * point release and which images are offered; the files themselves live on
 * Kali's own infrastructure:
 *   - cdimage.kali.org, the mirrorbits redirector for the installer, live and
 *     VM images (tree kali-<version>/), whose `?mirrorlist` pages give each
 *     direct image's exact size and SHA-256 and every mirror that carries it,
 *     and whose `README?mirrorstats` gives mirror coordinates and health;
 *   - kali.download, Kali's own CDN, for the ARM board, NetHunter Pro,
 *     NetHunter Generic and cloud images (trees arm-images/, nethunterpro-images/,
 *     nethunter-images/, cloud-images/); it publishes no sizes, so those stay
 *     null for run.ts to fill.
 * Checksums come from the SHA256SUMS file next to each image (signed with
 * SHA256SUMS.gpg for the cdimage tree) and must equal the value printed on the
 * download page (and the redirector's own hash); a disagreement throws. The
 * release date comes from the official release history page (kali.org/releases),
 * with the blog feed as fallback.
 *
 * Version. The page offers exactly one point release (Kali is rolling and ships
 * a snapshot every quarter), so that is the only release. cdimage's current/
 * alias can already point at the next one while the page, the blog post and
 * the ARM, NetHunter and cloud trees still lag (2026.3 on 2026-10-20: images
 * on cdimage, nothing else); following the page keeps every edition complete
 * and picks the new release up on the run after the page moves.
 *
 * Torrent-only images (Live, Everything) are published by Kali only as
 * torrents: the .iso itself is not on any server. The page links the torrent,
 * so `url` and `torrentUrl` are that torrent, `file` names the image it
 * delivers (the checksum is that image's), `path` is null and the size is the
 * image length inside the torrent's first bytes (a Range request).
 *
 * Excluded for every distro alike: weekly builds (continuous builds), Docker
 * and LXC containers, WSL (Microsoft Store), Vagrant boxes and cloud
 * marketplace listings (no files); VM images in a format the data schema does
 * not hold: the pre-built VMware, VirtualBox, Hyper-V and QEMU images are .7z
 * archives and FORMATS has no 7z. Deviation: the per-device NetHunter (Android)
 * flash packages (about 80 zips, one per phone and Android ROM) are left out
 * because the page publishes no architecture for them and the schema requires
 * one (a guess would be wrong for the 32-bit devices); the NetHunter Generic
 * ARM64 and ARMhf packages, which name their architecture, are included.
 * NetHunter Pro images other than the amd64 one name no architecture; they are
 * for the Pine64 PinePhone, PinePhone Pro and Qualcomm SDM845 phones (ARM64).
 */

import type { Artifact, Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getText, request } from "../http";
import { parseChecksums } from "../lib/checksums";
import { listDirectory } from "../lib/dirlist";
import {
  type MirrorbitsMirror,
  mirrorbitsFile,
  parseMirrorlist,
  parseMirrorstats,
} from "../lib/mirrorbits";
import { countryCode } from "../lib/mirrors";
import { isoDay } from "../lib/versions";
import { defineSource } from "../source";

const DOWNLOAD = "https://www.kali.org/get-kali/";
const HISTORY = "https://www.kali.org/releases/";
const FEED = "https://www.kali.org/rss.xml";
const CDIMAGE = "https://cdimage.kali.org/";
const MIRRORSTATS = `${CDIMAGE}README?mirrorstats`;

type Arch = Artifact["arch"];
type Format = Artifact["format"];

/** Image type in "kali-linux-<ver>-<type>-<arch>.iso" → edition. Display order. */
const BASE_EDITIONS: {
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
  {
    type: "installer-everything",
    id: "installer-everything",
    name: "Installer (Everything)",
    desktop: "xfce",
    kind: "desktop",
  },
  { type: "installer-purple", id: "purple", name: "Kali Purple", desktop: "xfce", kind: "desktop" },
  { type: "live", id: "live", name: "Live", desktop: "xfce", kind: "live" },
  {
    type: "live-everything",
    id: "live-everything",
    name: "Live (Everything)",
    desktop: "xfce",
    kind: "live",
  },
];

const ARCHES: Record<string, Arch> = { amd64: "x86_64", arm64: "aarch64", armhf: "armhf" };

/** Images (edition id, architecture) the page must keep offering; anything less means the page changed. */
const REQUIRED_BASE: [edition: string, arch: Arch][] = [
  ["installer", "x86_64"],
  ["netinst", "x86_64"],
  ["live", "x86_64"],
];

const BASE_URL =
  /^https:\/\/cdimage\.kali\.org\/kali-(?<version>\d{4}\.\d+)\/kali-linux-\k<version>-(?<type>installer(?:-netinst|-everything|-purple)?|live(?:-everything)?)-(?<arch>amd64|arm64)\.iso(?<torrent>\.torrent)?$/;
const DEVICE_URL =
  /^https:\/\/kali\.download\/(?<tree>arm-images|nethunterpro-images|cloud-images|nethunter-images)\/kali-(?<version>\d{4}\.\d+)\/(?<file>kali-(?:linux|nethunterpro|nethunter)-\k<version>-(?<stem>[a-z0-9.-]+?)\.(?<ext>img\.xz|tar\.xz|zip))$/;

const FORMAT_OF: Record<string, Format> = { "img.xz": "img.xz", "tar.xz": "tar.xz", zip: "zip" };

interface Card {
  url: string;
  label: string;
  /** SHA-256 printed on the card. */
  sha256: string | null;
  /** The card's own torrent link (cards whose main link is a torrent have none). */
  torrent: string | null;
}

/** One offered image of the page, classified. */
interface Offered {
  kind: "base" | "device";
  version: string;
  /** Directory URL holding the image and its SHA256SUMS. */
  dir: string;
  file: string;
  /** The page links only the torrent; the image itself is not on the server. */
  torrentOnly: boolean;
  card: Card;
  arch: Arch;
  format: Format;
  /** Where the image lives: "base" (cdimage) or a kali.download tree. */
  tree: string;
  edition: Omit<Edition, "artifacts">;
}

const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

/** The page's download cards (Hugo output with unquoted attributes). */
function parseCards(html: string): Card[] {
  const cards: Card[] = [];
  for (const part of html.split(/<div class="?download-card(?:--wide)?(?=[\s">])/).slice(1)) {
    const link = part.match(
      /<a href=("?)(https:\/\/[^\s">]+)\1[^>]*>\s*(?:<img[^>]*>\s*)?<h4>([^<]*)<\/h4>/,
    );
    if (!link?.[2]) continue;
    cards.push({
      url: link[2],
      label: decode(link[3] ?? ""),
      sha256: part.match(/<h4>SHA256sum<\/h4>\s*([0-9a-f]{64})\b/i)?.[1]?.toLowerCase() ?? null,
      torrent:
        part.match(/<a href=("?)(https:\/\/[^\s">]+\.torrent)\1[^>]*>\s*torrent\s*<\/a>/i)?.[2] ??
        null,
    });
  }
  return cards;
}

/**
 * Edition and architecture of an image on kali.download from its file stem
 * ("raspberry-pi-arm64", "cloud-genericcloud-amd64", "generic-armhf-full") and
 * its card label. Images that differ only by architecture share an edition.
 * Null for the per-device NetHunter (Android) packages, which the header leaves out.
 */
function deviceImage(tree: string, stem: string, label: string) {
  const slug = stem.replace(/\./g, "-");
  const token = slug.match(/(?:^|-)(amd64|arm64|armhf)$/)?.[1];
  const edition = (id: string, name: string, kind: Edition["kind"], arch: Arch | undefined) => ({
    id,
    name,
    kind,
    arch,
  });
  switch (tree) {
    case "nethunter-images": {
      const generic = slug.match(/^generic-(?<arch>arm64|armhf)-(?<variant>full|minimal)$/)?.groups;
      if (!generic?.arch || !generic.variant) return null;
      const variant = generic.variant === "full" ? "Full" : "Minimal";
      return edition(
        `nethunter-generic-${generic.variant}`,
        `NetHunter Generic (${variant})`,
        "other",
        ARCHES[generic.arch],
      );
    }
    case "nethunterpro-images": {
      // Only the PC image names an architecture; the others are phones (ARM64).
      const device = token === "amd64" ? "AMD64" : (label.match(/\sfor\s+(.+)$/)?.[1] ?? slug);
      return edition(
        `nethunter-pro-${slug}`,
        `NetHunter Pro (${device})`,
        "other",
        ARCHES[token ?? ""] ?? "aarch64",
      );
    }
    case "cloud-images":
      return edition(
        slug.replace(/-(?:amd64|arm64|armhf)$/, ""),
        label.replace(/\s+for\s+(?:x64|x86_64|amd64|arm64|aarch64|armhf)$/i, ""),
        "cloud",
        ARCHES[token ?? ""],
      );
    default:
      return edition(slug, label, "other", ARCHES[token ?? ""]);
  }
}

/** Everything the page offers as an image this source lists (see the header for what it leaves out). */
function classify(cards: Card[]): { version: string; offered: Offered[] } {
  const offered: Offered[] = [];
  for (const card of cards) {
    if (offered.some((o) => o.card.url === card.url)) continue;
    const base = card.url.match(BASE_URL)?.groups;
    if (base?.version && base.type && base.arch) {
      const def = BASE_EDITIONS.find((d) => d.type === base.type);
      const arch = ARCHES[base.arch];
      if (!def || !arch) throw new Error(`unknown Kali image type: ${card.url}`);
      offered.push({
        kind: "base",
        version: base.version,
        dir: `${CDIMAGE}kali-${base.version}/`,
        file:
          card.url
            .split("/")
            .pop()
            ?.replace(/\.torrent$/, "") ?? "",
        torrentOnly: Boolean(base.torrent),
        card,
        arch,
        format: "iso",
        tree: "base",
        edition: { id: def.id, name: def.name, desktop: def.desktop, kind: def.kind },
      });
      continue;
    }
    const device = card.url.match(DEVICE_URL)?.groups;
    if (device?.tree && device.version && device.file && device.stem && device.ext) {
      const format = FORMAT_OF[device.ext];
      const image = deviceImage(device.tree, device.stem, card.label);
      if (!image) continue; // per-device NetHunter (Android) package: see the header
      if (!format || !image.arch)
        throw new Error(`cannot tell format or architecture of ${card.url}`);
      offered.push({
        kind: "device",
        version: device.version,
        dir: `https://kali.download/${device.tree}/kali-${device.version}/`,
        file: device.file,
        torrentOnly: false,
        card,
        arch: image.arch,
        format,
        tree: device.tree,
        edition: { id: image.id, name: image.name, desktop: null, kind: image.kind },
      });
    }
  }
  const versions = [...new Set(offered.map((o) => o.version))];
  if (versions.length !== 1 || !versions[0])
    throw new Error(
      `the Kali download page offers ${versions.length ? `mixed releases (${versions.join(", ")})` : "no point-release images"}`,
    );
  return { version: versions[0], offered };
}

async function offeredImages() {
  const html = await getText(DOWNLOAD, { accept: "text/html" });
  const { version, offered } = classify(parseCards(html));
  for (const [id, arch] of REQUIRED_BASE)
    if (!offered.some((o) => o.tree === "base" && o.edition.id === id && o.arch === arch))
      throw new Error(`Kali ${version} ${id} (${arch}) is no longer offered on the download page`);
  for (const tree of ["arm-images", "nethunterpro-images", "cloud-images", "nethunter-images"])
    if (!offered.some((o) => o.tree === tree))
      throw new Error(`the Kali download page lists no ${tree} images`);
  const notes = html.match(
    new RegExp(`https://www\\.kali\\.org/blog/kali-linux-${version.replace(".", "-")}-release/`),
  )?.[0];
  return { version, offered, notes: notes ?? null };
}

/** "Kali 2026.2 - 29th June, 2026" on the release history page → "2026-06-29". */
function historyDate(html: string, version: string): string | null {
  const text = decode(html.replace(/<[^>]+>/g, " "));
  const m = text.match(
    new RegExp(
      `Kali ${version.replace(".", "\\.")}\\s+-\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+([A-Za-z]+),?\\s+(\\d{4})`,
    ),
  );
  return m?.[1] && m[2] && m[3] ? isoDay(`${m[2]} ${m[1]}, ${m[3]} 00:00:00 UTC`) : null;
}

/** Publication date of the "Kali Linux <version> Release" blog post, if still in the feed. */
function feedDate(xml: string, version: string): string | null {
  for (const item of xml.split("<item>").slice(1)) {
    const title = item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
    if (title.startsWith(`Kali Linux ${version} Release`))
      return isoDay(item.match(/<pubDate>(.+?)<\/pubDate>/)?.[1]);
  }
  return null;
}

/** Official release date; optional, so a missing page or entry leaves it null. */
async function releaseDate(version: string): Promise<string | null> {
  try {
    const date = historyDate(await getText(HISTORY, { accept: "text/html" }), version);
    if (date) return date;
  } catch {
    /* fall back to the blog feed */
  }
  try {
    return feedDate(await getText(FEED, { accept: "application/rss+xml" }), version);
  } catch {
    return null;
  }
}

/**
 * Length of the single file a torrent delivers. Kali's torrents are 0.3 to 1.3 MB of piece
 * hashes behind a short header, so a Range request for the first 4 KB is enough; the
 * torrent must name the image the page says it is.
 */
async function torrentLength(url: string, file: string): Promise<number> {
  const res = await request(url, {
    noCache: true,
    accept: "application/x-bittorrent",
    headers: { range: "bytes=0-4095" },
  });
  const m = res.body.match(/4:infod6:lengthi(\d+)e4:name(\d+):/);
  const length = Number(m?.[1]);
  const named =
    m?.index === undefined
      ? ""
      : res.body.slice(m.index + m[0].length, m.index + m[0].length + Number(m[2]));
  if (!m || !Number.isSafeInteger(length) || length <= 0 || named !== file)
    throw new Error(`${url} does not look like a torrent of ${file}`);
  return length;
}

export default defineSource({
  slug: "kali-linux",
  hosts: ["cdimage.kali.org", "kali.download"],
  async releases(ctx) {
    const { version, offered, notes } = await offeredImages();

    const dirs = [...new Set(offered.map((o) => o.dir))];
    const sums = new Map<string, Map<string, string>>();
    const listings = new Map<string, Set<string>>();
    for (const dir of dirs) {
      sums.set(dir, parseChecksums(await getText(`${dir}SHA256SUMS`, { accept: "text/plain" })));
      listings.set(dir, new Set(await listDirectory(dir)));
    }

    const artifacts = new Map<string, Artifact>();
    for (const image of offered) {
      const sha = sums.get(image.dir)?.get(image.file);
      if (!sha) throw new Error(`${image.file} is not in ${image.dir}SHA256SUMS`);
      if (image.card.sha256 && image.card.sha256 !== sha)
        throw new Error(`${image.file}: SHA-256 differs between the download page and SHA256SUMS`);
      const listing = listings.get(image.dir);
      const served = image.torrentOnly ? `${image.file}.torrent` : image.file;
      if (!listing?.has(served))
        throw new Error(`${served} is linked on the download page but not in ${image.dir}`);

      const torrent = image.torrentOnly ? image.card.url : image.card.torrent;
      if (torrent && !listing.has(torrent.split("/").pop() ?? ""))
        throw new Error(`${torrent} is linked on the download page but not in ${image.dir}`);

      let size: number | null = null;
      if (image.torrentOnly) size = await torrentLength(image.card.url, image.file);
      else if (image.kind === "base") {
        const info = await mirrorbitsFile(image.card.url);
        if (info.sha256 && info.sha256 !== sha)
          throw new Error(`${image.file}: SHA-256 differs between the redirector and SHA256SUMS`);
        size = info.size;
      }
      artifacts.set(image.card.url, {
        arch: image.arch,
        format: image.format,
        file: image.file,
        path: image.kind === "base" && !image.torrentOnly ? `kali-${version}/${image.file}` : null,
        url: image.card.url,
        size,
        checksum: { type: "sha256", value: sha, url: `${image.dir}SHA256SUMS` },
        signatureUrl: listing.has("SHA256SUMS.gpg") ? `${image.dir}SHA256SUMS.gpg` : null,
        torrentUrl: torrent,
      });
    }

    // Installers and live images first (display order above), then the board and cloud images in page order.
    const rank = (o: Offered) =>
      o.kind === "base"
        ? BASE_EDITIONS.findIndex((d) => d.id === o.edition.id)
        : BASE_EDITIONS.length;
    const editions = new Map<string, Edition>();
    for (const image of [...offered].sort((a, b) => rank(a) - rank(b))) {
      const edition = editions.get(image.edition.id) ?? { ...image.edition, artifacts: [] };
      edition.artifacts.push(artifacts.get(image.card.url) as Artifact);
      editions.set(image.edition.id, edition);
    }
    ctx.log(`${version}: ${editions.size} editions, ${artifacts.size} files`);

    const releases: Release[] = [
      {
        version,
        channel: "rolling",
        codename: null,
        releaseDate: await releaseDate(version),
        eol: null,
        notesUrl: notes,
        editions: [...editions.values()],
      },
    ];
    return { sources: [DOWNLOAD, HISTORY, ...dirs], releases };
  },

  async mirrors() {
    const { offered } = await offeredImages();
    // Only images the mirrors carry: root + artifact.path is then the file.
    const direct = offered.filter((o) => o.kind === "base" && !o.torrentOnly);
    if (direct.length === 0) throw new Error("the Kali download page offers no direct ISO");
    const lists: Map<string, MirrorbitsMirror>[] = [];
    for (const image of direct) {
      const html = await getText(`${image.card.url}?mirrorlist`, { accept: "text/html" });
      const seen = new Map<string, MirrorbitsMirror>();
      for (const m of [...parseMirrorlist(html, image.card.url).mirrors, ...countryOnly(html)])
        if (!seen.get(m.root)?.country) seen.set(m.root, m);
      lists.push(seen);
    }
    const common = [...(lists[0]?.values() ?? [])].filter((m) =>
      lists.every((list) => list.has(m.root)),
    );
    if (common.length === 0) throw new Error("no HTTPS mirror carries every offered Kali ISO");

    // Statistics are keyed by the configured URL, with or without a scheme.
    const stats = new Map(
      [...parseMirrorstats(await getText(MIRRORSTATS, { accept: "text/html" }))].map(
        ([url, stat]) => [url.replace(/^https?:\/\//, ""), stat] as const,
      ),
    );
    if (stats.size === 0) throw new Error("the redirector's mirror statistics list no mirrors");
    const mirrors: Mirror[] = [];
    for (const { root, country } of common.sort((a, b) => a.root.localeCompare(b.root))) {
      const stat = stats.get(root.replace(/^https:\/\//, ""));
      if (stat && (!stat.enabled || !stat.httpsUp)) continue;
      // The anycast CDN is listed at 0, 0 (no place): that is no coordinate.
      const placed = stat && (stat.lat !== 0 || stat.lon !== 0) ? stat : null;
      mirrors.push({
        url: root,
        country,
        name: new URL(root).hostname,
        lat: placed?.lat ?? null,
        lon: placed?.lon ?? null,
        score: null,
      });
    }
    if (mirrors.length === 0) throw new Error("every Kali mirror is flagged down");
    return {
      sources: [DOWNLOAD, MIRRORSTATS, ...direct.map((o) => `${o.card.url}?mirrorlist`)],
      mirrors,
    };
  },
});

/**
 * The redirector leaves mirrors restricted to some countries out of the ranked
 * table for visitors elsewhere and lists them under "Excluded Mirrors" with the
 * reason "Country only". They still carry the images, and which ones appear in
 * the ranked table depends on where the sync runs, so they are added back.
 */
function countryOnly(html: string): MirrorbitsMirror[] {
  const tail = html.split(/<h3>\s*Excluded Mirrors\s*<\/h3>/i)[1] ?? "";
  const out: MirrorbitsMirror[] = [];
  for (const row of tail.split(/<tr\b/i).slice(1)) {
    const cells = [...(row.split(/<\/tr>/i)[0] ?? "").matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (c) => c[1] ?? "",
    );
    const text = (i: number) => decode((cells[i] ?? "").replace(/<[^>]+>/g, " "));
    const href = cells[1]?.match(/href="(https:\/\/[^"]+)"/)?.[1];
    if (!href || text(cells.length - 1) !== "Country only") continue;
    out.push({
      root: href.endsWith("/") ? href : `${href}/`,
      country: /^[A-Z]{2}$/.test(text(2)) ? countryCode(text(2)) : null,
    });
  }
  return out;
}
