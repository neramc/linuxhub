/**
 * Debian.
 *
 * Official sources, and what each one is used for:
 * - debian.org/releases/ (release table): which lines exist, their codenames and
 *   the end of Debian's free security support. `eol` is the table's "End of LTS"
 *   (Debian LTS is a Debian project, not a paid add-on), so a line is listed
 *   until its LTS ends: 13 trixie and 12 bookworm today. Lines whose LTS ended
 *   (11 bullseye, 2026-08-31) and lines that only have third-party paid ELTS are
 *   dropped, like any other past-EOL line. Dates still "TBA" (14 forky, 15 duke)
 *   are skipped.
 * - debian.org/releases/<codename>/ : the point release ("Debian 13.7 was
 *   released on ...") and its date. releases/<codename>/debian-installer/ is
 *   the per-release download page; with debian.org/distrib/ (stable) and
 *   debian.org/CD/live/ it defines what is offered.
 * - cdimage.debian.org: the files. Stable images sit in debian-cd/current/
 *   (iso-cd, iso-dvd) and debian-cd/current-live/; older lines keep theirs in
 *   cdimage/archive/<point>/. Checksums are the directory's SHA512SUMS (SHA256SUMS
 *   is only the fallback), signed in SHA512SUMS.sign. A torrent exists next to
 *   most images (bt-cd, bt-dvd, bt-hybrid); its "length" is the exact image size
 *   (the first 4 KB is requested), which is how sizes are published because
 *   cdimage.debian.org's robots.txt forbids HEAD on *.iso for bots.
 * - cloud.debian.org: the cloud images the download page links (stable only).
 * - mirror-master.debian.org Mirrors.masterlist: the machine-readable source of
 *   the debian-cd mirror list on debian.org/CD/http-ftp/.
 *
 * Editions, per the download pages: "netinst" (every architecture with an
 * installer image), "DVD-1" (the complete installer, same architectures), the
 * live images of stable ("Other live ISO" is the whole iso-hybrid directory:
 * GNOME, Xfce, KDE, Cinnamon, LXDE, LXQt, MATE, Debian Junior, Standard) and the
 * stable cloud images of the download page (generic = "OpenStack provider",
 * nocloud = "local QEMU virtual machine"; each as qcow2 and raw, the raw disk
 * image being format `img` like Tails' raw USB image). Live and cloud images
 * are only offered for stable: the oldstable install page lists neither.
 *
 * Exclusions, for the same reasons as everywhere: source DVDs; discs after the
 * first; Blu-ray, 16 GB and jigdo sets (jigdo is no image format of the data
 * model); netboot, hd-media and the "tiny CD" directories (directory links of
 * installer components, no single image); debian-edu and debian-mac netinst
 * variants (in iso-cd but named by no download page); the other cloud variants
 * of the directory (genericcloud, ec2, azure, raspi; tar.xz) that the page does
 * not link; marketplace links (EC2, Azure) which carry no file; testing builds. The
 * architectures armel, mips64el and mipsel (oldstable only) are not in the data
 * model's architecture list, so those images are left out.
 *
 * Cloud images are rebuilt every one to two weeks under a fixed `latest/` name.
 * A user who downloads after a rebuild would see a checksum mismatch, so the
 * dated build directory whose SHA512SUMS equals latest/'s is used for the URL,
 * the file name and the checksum. cloud.debian.org publishes no sizes (the
 * directory index rounds them) and robots.txt forbids HEAD on qcow2 and raw, so
 * sizes stay null; the signature of SHA512SUMS is linked when the directory has
 * one (none today).
 *
 * Mirrors: every Mirrors.masterlist entry with a CDImage-http path (cdimage.
 * debian.org itself is listed on the official page as the Swedish server). The
 * list carries no HTTPS flag, so HTTPS is assumed and run.ts drops the ones that
 * do not answer. The six mirrors that restrict CDImage-architecture to
 * amd64/i386 are left out: a mirror root plus an artifact path must be the file
 * for every architecture. Mirror paths exist only for stable images (older
 * lines live in the archive, which mirrors do not carry).
 *
 * Fails closed when the release table or one of the pages changes shape, when
 * the page offers an image that its checksum file lacks, when the installer
 * images are not the point release the release page names, or when the cloud
 * latest/ directory matches none of the newest builds.
 */

import type { Artifact, Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getText, HttpError, request } from "../http";
import { parseChecksums } from "../lib/checksums";
import { debianArch } from "../lib/debarch";
import { listDirectory } from "../lib/dirlist";
import { countryCode, withSlash } from "../lib/mirrors";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const WWW = "https://www.debian.org/";
const CD = "https://cdimage.debian.org/";
const CLOUD = "https://cloud.debian.org/images/cloud/";
const RELEASES_PAGE = `${WWW}releases/`;
const DOWNLOAD_PAGE = `${WWW}distrib/`;
const LIVE_PAGE = `${WWW}CD/live/`;
const MASTERLIST = "https://mirror-master.debian.org/status/Mirrors.masterlist";
const LIVE_DIR = `${CD}debian-cd/current-live/amd64/iso-hybrid/`;

/** Live flavors in the order of the download page ("Other live ISO" adds the rest). */
const LIVE: { flavor: string; name: string; desktop: Desktop }[] = [
  { flavor: "gnome", name: "Live GNOME", desktop: "gnome" },
  { flavor: "xfce", name: "Live Xfce", desktop: "xfce" },
  { flavor: "kde", name: "Live KDE", desktop: "kde" },
  { flavor: "cinnamon", name: "Live Cinnamon", desktop: "cinnamon" },
  { flavor: "lxde", name: "Live LXDE", desktop: "lxde" },
  { flavor: "lxqt", name: "Live LXQt", desktop: "lxqt" },
  { flavor: "mate", name: "Live MATE", desktop: "mate" },
  // Debian Junior boots IceWM with LightDM (checked in the image's package list).
  { flavor: "debian-junior", name: "Live Debian Junior", desktop: "icewm" },
  { flavor: "standard", name: "Live Standard", desktop: "none" },
];

/** The two cloud image variants the download page links, with its wording. */
const CLOUD_VARIANTS: Record<string, { id: string; name: string }> = {
  generic: { id: "cloud-generic", name: "Cloud generic (OpenStack)" },
  nocloud: { id: "cloud-nocloud", name: "Cloud nocloud (local QEMU)" },
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const strip = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** "September 12th, 2026" → "2026-09-12"; anything else → null. */
function longDate(text: string): string | null {
  const m = text.match(/^([A-Z][a-z]+) (\d{1,2})(?:st|nd|rd|th)?, (\d{4})$/);
  const month = m?.[1] ? MONTHS.indexOf(m[1]) : -1;
  if (!m?.[2] || !m[3] || month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

interface Line {
  major: string;
  codename: string;
  endOfLts: string;
  /** The release table calls it the current stable release. */
  stable: boolean;
}

/** Lines of the release table whose LTS has not ended on `today`, newest first. */
function supportedLines(html: string, today: string): Line[] {
  if (!html.includes("End of LTS")) throw new Error(`no "End of LTS" column on ${RELEASES_PAGE}`);
  const lines: Line[] = [];
  for (const row of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = [...(row[1] ?? "").matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) =>
      strip(c[1] ?? ""),
    );
    const [major, codename, released, , endOfLts, , status] = cells;
    if (!major || !/^\d+$/.test(major) || !codename || !status) continue;
    // Not yet released (TBA) or no end of LTS known.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(released ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(endOfLts ?? ""))
      continue;
    if ((endOfLts ?? "") < today) continue;
    lines.push({
      major,
      codename: codename.toLowerCase(),
      endOfLts: endOfLts ?? "",
      stable: /Current stable release/i.test(status),
    });
  }
  lines.sort((a, b) => Number(b.major) - Number(a.major));
  if (!lines.some((l) => l.stable))
    throw new Error(`no current stable release in the table on ${RELEASES_PAGE}`);
  return lines;
}

async function exists(url: string): Promise<boolean> {
  try {
    await request(url, { method: "HEAD", noCache: true });
    return true;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return false;
    throw error;
  }
}

interface Sums {
  /** The checksum file (the strongest one the directory publishes). */
  url: string;
  type: "sha512" | "sha256";
  values: Map<string, string>;
  signatureUrl: string | null;
}

/** SHA512SUMS (else SHA256SUMS) of an image directory, with its signature when it exists. */
async function sumsOf(dir: string): Promise<Sums> {
  for (const [name, type] of [
    ["SHA512SUMS", "sha512"],
    ["SHA256SUMS", "sha256"],
  ] as const) {
    let body: string;
    try {
      body = await getText(`${dir}${name}`);
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) continue;
      throw error;
    }
    const values = parseChecksums(body);
    if (!values.size) throw new Error(`${dir}${name} lists no files`);
    const signatureUrl = (await exists(`${dir}${name}.sign`)) ? `${dir}${name}.sign` : null;
    return { url: `${dir}${name}`, type, values, signatureUrl };
  }
  throw new Error(`no SHA512SUMS or SHA256SUMS in ${dir}`);
}

/**
 * The image's torrent (same name + ".torrent" in the sibling bt-* directory) and
 * the exact size its metadata states. null = no torrent is published.
 */
async function torrentOf(url: string): Promise<{ url: string; size: number | null } | null> {
  try {
    const res = await request(url, {
      headers: { range: "bytes=0-4095" },
      noCache: true,
    });
    // Single-file torrent: the info dictionary starts with its "length".
    const length = res.body.match(/4:infod6:lengthi(\d+)e/)?.[1];
    return { url, size: length ? Number(length) : null };
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}

interface Image {
  /** Directory URL on the download page ("…/iso-cd/"). */
  dir: string;
  /** Sibling torrent directory ("bt-cd"). */
  bt: string;
  file: string;
  arch: Artifact["arch"];
  /** Path below a debian-cd mirror root; null when mirrors do not carry the file. */
  path: string | null;
  sums: Sums;
}

async function artifact(image: Image): Promise<Artifact> {
  const sum = image.sums.values.get(image.file);
  if (!sum) throw new Error(`${image.dir}${image.file} is offered but not in ${image.sums.url}`);
  const torrent = await torrentOf(
    `${image.dir.replace(/\/[^/]+\/$/, `/${image.bt}/`)}${image.file}.torrent`,
  );
  return {
    arch: image.arch,
    format: "iso",
    file: image.file,
    path: image.path,
    url: `${image.dir}${image.file}`,
    size: torrent?.size ?? null,
    checksum: { type: image.sums.type, value: sum, url: image.sums.url },
    signatureUrl: image.sums.signatureUrl,
    torrentUrl: torrent?.url ?? null,
  };
}

interface InstallerPage {
  /** Tree the page links ("…/debian-cd/current" or "…/cdimage/archive/12.15.0"). */
  base: string;
  /** Debian architecture → netinst file name. */
  netinst: Map<string, string>;
  /** Architectures with a DVD set. */
  dvd: Set<string>;
}

const TREE = String.raw`https://cdimage\.debian\.org/(?:debian-cd/current|cdimage/archive/[0-9.]+)`;

function parseInstallerPage(html: string, page: string): InstallerPage {
  const netinst = new Map<string, string>();
  let base = "";
  for (const m of html.matchAll(
    new RegExp(`href="(${TREE})/([a-z0-9]+)/iso-cd/(debian-[0-9.]+-\\2-netinst\\.iso)"`, "g"),
  )) {
    if (base && base !== m[1]) throw new Error(`${page} links images from two trees`);
    base = m[1] ?? "";
    netinst.set(m[2] ?? "", m[3] ?? "");
  }
  const dvd = new Set<string>();
  // "source" is the source DVD, not an architecture.
  for (const m of html.matchAll(new RegExp(`href="${TREE}/([a-z0-9]+)/iso-dvd/"`, "g")))
    if (m[1] !== "source") dvd.add(m[1] ?? "");
  if (!base || !netinst.has("amd64") || !dvd.has("amd64"))
    throw new Error(`no amd64 netinst and DVD links on ${page}`);
  return { base, netinst, dvd };
}

async function installerEditions(
  line: Line,
  version: string,
  installer: InstallerPage,
  page: string,
): Promise<Edition[]> {
  // Only stable's images are in the debian-cd tree that the mirrors carry.
  const mirrored = installer.base.endsWith("/debian-cd/current");
  const netinst: Artifact[] = [];
  const dvd: Artifact[] = [];
  for (const [debArch, netinstFile] of [...installer.netinst].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const arch = debianArch(debArch, page);
    if (!arch) continue;
    const cdDir = `${installer.base}/${debArch}/iso-cd/`;
    const cdSums = await sumsOf(cdDir);
    const isoVersion = netinstFile.match(/^debian-([0-9.]+)-/)?.[1] ?? "";
    if (!isoVersion.startsWith(`${version}.`))
      throw new Error(
        `${page} links ${netinstFile} but the release page names Debian ${version}: wait for the images`,
      );
    netinst.push(
      await artifact({
        dir: cdDir,
        bt: "bt-cd",
        file: netinstFile,
        arch,
        path: mirrored ? `${isoVersion}/${debArch}/iso-cd/${netinstFile}` : null,
        sums: cdSums,
      }),
    );
    if (!installer.dvd.has(debArch)) continue;
    const dvdDir = `${installer.base}/${debArch}/iso-dvd/`;
    const dvdSums = await sumsOf(dvdDir);
    const dvdFile = [...dvdSums.values.keys()].find((f) =>
      new RegExp(`^debian-${isoVersion.replace(/\./g, "\\.")}-${debArch}-DVD-1\\.iso$`).test(f),
    );
    if (!dvdFile)
      throw new Error(`${page} offers a ${debArch} DVD set but ${dvdSums.url} has no DVD-1`);
    dvd.push(
      await artifact({
        dir: dvdDir,
        bt: "bt-dvd",
        file: dvdFile,
        arch,
        path: mirrored ? `${isoVersion}/${debArch}/iso-dvd/${dvdFile}` : null,
        sums: dvdSums,
      }),
    );
  }
  if (!netinst.length) throw new Error(`no netinst images for Debian ${line.major}`);
  const editions: Edition[] = [
    { id: "netinst", name: "netinst", desktop: null, kind: "netinst", artifacts: netinst },
  ];
  if (dvd.length)
    editions.push({ id: "dvd-1", name: "DVD-1", desktop: null, kind: "other", artifacts: dvd });
  return editions;
}

const titleCase = (s: string) =>
  s
    .split("-")
    .map((w) => (w[0]?.toUpperCase() ?? "") + w.slice(1))
    .join(" ");

/** The live images of stable: the whole iso-hybrid directory the page's "Other live ISO" links. */
async function liveEditions(major: string): Promise<Edition[]> {
  const page = await getText(LIVE_PAGE);
  if (!page.includes(`href="${LIVE_DIR}"`))
    throw new Error(`${LIVE_PAGE} no longer links ${LIVE_DIR}`);
  const sums = await sumsOf(LIVE_DIR);
  const found = new Map<string, { file: string; version: string }>();
  for (const file of sums.values.keys()) {
    const m = file.match(/^debian-live-([0-9.]+)-amd64-([a-z0-9-]+)\.iso$/);
    if (m?.[1] && m[2]) found.set(m[2], { file, version: m[1] });
  }
  const order = [
    ...LIVE.map((l) => l.flavor),
    ...[...found.keys()].filter((f) => !LIVE.some((l) => l.flavor === f)).sort(),
  ];
  const editions: Edition[] = [];
  for (const flavor of order) {
    const hit = found.get(flavor);
    if (!hit) continue;
    if (!hit.version.startsWith(`${major}.`))
      throw new Error(`${LIVE_DIR} holds ${hit.file}, not a Debian ${major} image`);
    const known = LIVE.find((l) => l.flavor === flavor);
    editions.push({
      id: `live-${flavor}`,
      name: known?.name ?? `Live ${titleCase(flavor)}`,
      desktop: known?.desktop ?? null,
      kind: "live",
      artifacts: [
        await artifact({
          dir: LIVE_DIR,
          bt: "bt-hybrid",
          file: hit.file,
          arch: "x86_64",
          path: `${hit.version}-live/amd64/iso-hybrid/${hit.file}`,
          sums,
        }),
      ],
    });
  }
  if (!editions.length) throw new Error(`no live images in ${LIVE_DIR}`);
  for (const l of LIVE)
    if (l.flavor !== "standard" && l.flavor !== "debian-junior" && !found.has(l.flavor))
      throw new Error(`the live image ${l.name} vanished from ${LIVE_DIR}`);
  return editions;
}

/** Cloud image file types the download page links, with the data model's format for each. */
const CLOUD_FORMATS: Record<string, Artifact["format"]> = { qcow2: "qcow2", raw: "img" };

/** The cloud images the download page links (qcow2 and raw), from their newest dated build. */
async function cloudEditions(codename: string, major: string): Promise<Edition[]> {
  const page = await getText(DOWNLOAD_PAGE);
  const wanted: { variant: string; debArch: string; ext: string; name: string }[] = [];
  for (const m of page.matchAll(
    new RegExp(
      `href="${CLOUD.replace(/\./g, "\\.")}${codename}/latest/debian-${major}-([a-z]+)-([a-z0-9]+)\\.([a-z0-9]+)"`,
      "g",
    ),
  )) {
    const [, variant = "", debArch = "", ext = ""] = m;
    if (!(ext in CLOUD_FORMATS))
      throw new Error(
        `${DOWNLOAD_PAGE} links a .${ext} cloud image that is not mapped to a format`,
      );
    wanted.push({ variant, debArch, ext, name: `debian-${major}-${variant}-${debArch}` });
  }
  if (!wanted.length) throw new Error(`no ${codename} cloud image links on ${DOWNLOAD_PAGE}`);

  const latest = parseChecksums(await getText(`${CLOUD}${codename}/latest/SHA512SUMS`));
  for (const w of wanted)
    if (!latest.has(`${w.name}.${w.ext}`))
      throw new Error(`latest/SHA512SUMS has no ${w.name}.${w.ext}`);

  // Pin the build that latest/ currently is, so URL and checksum stay valid after a rebuild.
  const builds = (await listDirectory(`${CLOUD}${codename}/`))
    .map((n) => n.match(/^(\d{8}-\d+)\/$/)?.[1])
    .filter((n): n is string => Boolean(n))
    .sort((a, b) => compareVersions(b, a))
    .slice(0, 3);
  let build: string | null = null;
  let dated = new Map<string, string>();
  for (const candidate of builds) {
    const sums = parseChecksums(await getText(`${CLOUD}${codename}/${candidate}/SHA512SUMS`));
    if (
      wanted.every(
        (w) => sums.get(`${w.name}-${candidate}.${w.ext}`) === latest.get(`${w.name}.${w.ext}`),
      )
    ) {
      build = candidate;
      dated = sums;
      break;
    }
  }
  if (!build)
    throw new Error(`cloud latest/ matches none of the newest builds (${builds.join(", ")})`);

  const dir = `${CLOUD}${codename}/${build}/`;
  const sumsUrl = `${dir}SHA512SUMS`;
  const signatureUrl = (await exists(`${sumsUrl}.sign`)) ? `${sumsUrl}.sign` : null;
  const variants = [...new Set(wanted.map((w) => w.variant))].sort();
  const editions: Edition[] = [];
  for (const variant of variants) {
    const names = CLOUD_VARIANTS[variant] ?? { id: `cloud-${variant}`, name: `Cloud ${variant}` };
    const artifacts: Artifact[] = [];
    // qcow2 before raw, architectures alphabetically.
    for (const w of wanted
      .filter((x) => x.variant === variant)
      .sort((a, b) => a.debArch.localeCompare(b.debArch) || a.ext.localeCompare(b.ext))) {
      const arch = debianArch(w.debArch, DOWNLOAD_PAGE);
      if (!arch) continue;
      const file = `${w.name}-${build}.${w.ext}`;
      const value = dated.get(file);
      if (!value) throw new Error(`${sumsUrl} has no ${file}`);
      artifacts.push({
        arch,
        format: CLOUD_FORMATS[w.ext] as Artifact["format"],
        file,
        path: null,
        url: `${dir}${file}`,
        // Not published: the checksum list and the build JSON carry no sizes (the directory
        // index rounds them) and robots.txt forbids HEAD on qcow2 and raw.
        size: null,
        checksum: { type: "sha512", value, url: sumsUrl },
        signatureUrl,
        torrentUrl: null,
      });
    }
    if (artifacts.length) editions.push({ ...names, desktop: null, kind: "cloud", artifacts });
  }
  return editions;
}

export default defineSource({
  slug: "debian",
  hosts: ["cdimage.debian.org", "cloud.debian.org"],
  async releases(ctx) {
    const table = await getText(RELEASES_PAGE);
    const lines = supportedLines(table, ctx.today);
    const sources = [RELEASES_PAGE];
    const releases: Release[] = [];
    for (const line of lines) {
      const releasePage = `${WWW}releases/${line.codename}/`;
      const installerPage = `${releasePage}debian-installer/`;
      sources.push(releasePage, installerPage);
      const text = strip(await getText(releasePage));
      const named = text.match(
        /Debian (\d+\.\d+) was released on ([A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?, \d{4})/,
      );
      const version = named?.[1];
      const releaseDate = named?.[2] ? longDate(named[2]) : null;
      if (!version || !releaseDate || !version.startsWith(`${line.major}.`))
        throw new Error(`no "Debian ${line.major}.x was released on <date>" on ${releasePage}`);

      const installer = parseInstallerPage(await getText(installerPage), installerPage);
      const editions = await installerEditions(line, version, installer, installerPage);
      if (line.stable) {
        sources.push(LIVE_PAGE, DOWNLOAD_PAGE);
        editions.push(...(await liveEditions(line.major)));
        editions.push(...(await cloudEditions(line.codename, line.major)));
      }
      releases.push({
        version,
        channel: "stable",
        codename: (line.codename[0]?.toUpperCase() ?? "") + line.codename.slice(1),
        releaseDate,
        eol: line.endOfLts,
        notesUrl: `${releasePage}releasenotes`,
        editions,
      });
    }
    return { sources, releases };
  },
  async mirrors() {
    const text = await getText(MASTERLIST);
    const mirrors = new Map<string, Mirror>();
    for (const block of text.split(/\n\s*\n/)) {
      const field = (name: string) =>
        block.match(new RegExp(`^${name}:[ \\t]*(\\S.*)$`, "m"))?.[1]?.trim();
      const site = field("Site");
      const path = field("CDImage-http");
      if (!site || !path) continue;
      // A mirror that carries only some architectures cannot serve every artifact path.
      if (field("CDImage-architecture")) continue;
      const country = field("Country");
      const url = `https://${site}${withSlash(path.startsWith("/") ? path : `/${path}`)}`;
      mirrors.set(url, {
        url,
        country: countryCode(country?.split(/\s+/)[0]) ?? countryCode(country),
        name: site,
        lat: null,
        lon: null,
        score: null,
      });
    }
    if (!mirrors.size) throw new Error(`no CDImage-http entries in ${MASTERLIST}`);
    return {
      sources: [MASTERLIST],
      mirrors: [...mirrors.values()].sort((a, b) => a.url.localeCompare(b.url)),
    };
  },
});
