/**
 * Alpine Linux.
 *
 * Official sources, and what each one is used for:
 * - alpinelinux.org/releases.json (the data behind alpinelinux.org/releases/):
 *   the release branches with their end-of-support date, and every point
 *   release with its date and announcement. A line is listed while its
 *   eol_date has not passed (v3.21 until 2026-11-01, …); the newest point
 *   release of the line is the one offered.
 * - dl-cdn.alpinelinux.org/alpine/v<branch>/releases/<arch>/latest-releases.yaml:
 *   the list the alpinelinux.org/downloads/ page is generated from, per
 *   branch and architecture: file name, exact size, SHA-256 and SHA-512 of
 *   every image. The point release is the one these files carry (when the CDN
 *   is ahead of releases.json for a few hours, the CDN wins and the date
 *   comes from the YAML).
 * - The .sha512 file next to every image on the CDN (the project publishes
 *   .sha256 and .sha512; SHA-512, the strongest, is used, as everywhere in
 *   the catalog): it is `checksum.url` and the digest is read from it; if the
 *   YAML disagrees the sync throws. The .asc next to the image is the PGP
 *   signature. Alpine publishes no torrents.
 * - alpinelinux.org/downloads/: the page that offers the images. Every ISO and
 *   .img.gz it links for the current stable release must be in the result,
 *   otherwise the sync throws (nothing offered may be missing).
 * - alpinelinux.org/cloud/ ("Download or Launch Cloud Images", linked from the
 *   downloads page): the cloud images, one variant per architecture,
 *   firmware (BIOS, UEFI, Limine), bootstrap system (Tiny Cloud, cloud-init)
 *   and machine type (virtual, bare metal). Each variant is built as QCOW2;
 *   the page offers the same build as VHD (AWS, Azure) and raw.tar.gz (GCP),
 *   which are provider-specific formats the data model does not hold, so
 *   only the QCOW2 (Generic, NoCloud, OCI) is listed. The page shows the
 *   newest build of every line (cloud images follow the ISOs by several hours,
 *   so a line can briefly show the previous point release's cloud images); the
 *   exact size comes from the variant's .yaml metadata, linked on the page,
 *   and the .qcow2.sha512 file (a bare digest) is the checksum.
 * - mirrors.alpinelinux.org/mirrors.json: the official mirror list (the data
 *   of the "mirrors" page and MIRRORS.txt): name, free-text location, URLs.
 *
 * Exclusions, for the same reasons as everywhere: "Mini root filesystem"
 * (for containers and chroots); "Netboot" (kernel, initramfs and modloop, no
 * image); every .tar.gz (the data model has no tar.gz format): the netboot
 * and Generic U-Boot tarballs and the Raspberry Pi tarball (its .img.gz disk
 * image is listed); VHD and raw.tar.gz cloud images. loongarch64 (Standard
 * ISO) is offered but the data model has no such architecture, so it is left
 * out until it has one. There are no release candidates on the CDN today; the
 * downloads page links none.
 *
 * Architectures: x86 → i686, armv7 → armhf (the catalog's one 32-bit ARM
 * label). Alpine's own armhf (ARMv6, first-generation Raspberry Pis) is also
 * armhf, so the two Raspberry Pi images that map to it sit in two editions
 * ("Raspberry Pi": aarch64 and armhf; "Raspberry Pi (armv7)": armv7), because
 * the download wizard offers one file per architecture and format.
 *
 * Mirrors: every entry that has an HTTPS URL (the list carries no flag for
 * which mirrors hold releases/; run.ts checks each one). The CDN
 * dl-cdn.alpinelinux.org is itself the first entry, and the official download
 * links point to it, so the strategy stays "redirector" while the list is
 * still offered. The country is the last part of the location text; the list
 * gives no coordinates or score. Deviation: locations that name no country
 * (a city or a Canadian province) are resolved by a small fixed table here.
 */
import type { Artifact, Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import { getJson, getText } from "../http";
import { countryCode, withSlash } from "../lib/mirrors";
import { compareVersions, isoDay } from "../lib/versions";
import { defineSource } from "../source";

const SITE = "https://alpinelinux.org/";
const RELEASES_JSON = `${SITE}releases.json`;
const DOWNLOADS = `${SITE}downloads/`;
const CLOUD_PAGE = `${SITE}cloud/`;
const CDN = "https://dl-cdn.alpinelinux.org/alpine/";
const MIRRORS_JSON = "https://mirrors.alpinelinux.org/mirrors.json";

/** Alpine architecture directory → data-model architecture. */
const ARCHES: [string, Artifact["arch"]][] = [
  ["x86_64", "x86_64"],
  ["aarch64", "aarch64"],
  ["x86", "i686"],
  ["armhf", "armhf"],
  ["armv7", "armhf"],
  ["riscv64", "riscv64"],
  ["ppc64le", "ppc64le"],
  ["s390x", "s390x"],
];
/** Offered by Alpine, no architecture of the data model. */
const UNSUPPORTED_ARCHES = ["loongarch64"];

interface FlavorDef {
  /** flavor in latest-releases.yaml */
  flavor: string;
  ext: "iso" | "img.gz";
  format: Artifact["format"];
  /** The Alpine architectures this edition holds; absent = all of the flavor's. */
  only?: string[];
  id: string;
  name: string;
  kind: Edition["kind"];
}

/** The images the downloads page offers, in its order (Netboot, Mini root filesystem, Generic U-Boot excluded). */
const FLAVORS: FlavorDef[] = [
  {
    flavor: "alpine-standard",
    ext: "iso",
    format: "iso",
    id: "standard",
    name: "Standard",
    kind: "minimal",
  },
  {
    flavor: "alpine-extended",
    ext: "iso",
    format: "iso",
    id: "extended",
    name: "Extended",
    kind: "server",
  },
  {
    flavor: "alpine-rpi",
    ext: "img.gz",
    format: "img.gz",
    only: ["aarch64", "armhf"],
    id: "raspberry-pi",
    name: "Raspberry Pi",
    kind: "other",
  },
  {
    flavor: "alpine-rpi",
    ext: "img.gz",
    format: "img.gz",
    only: ["armv7"],
    id: "raspberry-pi-armv7",
    name: "Raspberry Pi (armv7)",
    kind: "other",
  },
  {
    flavor: "alpine-virt",
    ext: "iso",
    format: "iso",
    id: "virtual",
    name: "Virtual",
    kind: "other",
  },
  { flavor: "alpine-xen", ext: "iso", format: "iso", id: "xen", name: "Xen", kind: "other" },
];

/** Without these in every line the page has changed shape. */
const REQUIRED: [string, string][] = [
  ["alpine-standard", "x86_64"],
  ["alpine-extended", "x86_64"],
  ["alpine-virt", "x86_64"],
];

interface Entry {
  flavor?: string;
  file?: string;
  version?: string;
  date?: string;
  size?: string;
  sha256?: string;
  sha512?: string;
}

/**
 * latest-releases.yaml is a flat list of maps. Parsed by line so hashes and
 * dates always stay strings (a YAML parser may turn them into numbers/dates).
 */
function parseReleaseList(yaml: string): Entry[] {
  return yaml
    .split(/^-\s*$/m)
    .slice(1)
    .map((block) => {
      const entry: Record<string, string> = {};
      for (const m of block.matchAll(/^ {2}([a-z0-9_]+):[ \t]*(\S.*?)\s*$/gm)) {
        if (m[1] && m[2] && m[2] !== "|") entry[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
      }
      return entry as Entry;
    });
}

interface Branch {
  rel_branch?: string;
  arches?: string[];
  eol_date?: string;
  releases?: { version?: string; date?: string; notes?: string }[];
}

interface Line {
  branch: string;
  eol: string;
  /** Architectures the branch is built for (releases.json). */
  arches: string[];
  releases: { version: string; date: string | null; notes: string | null }[];
}

/** The supported lines of releases.json, newest first. */
function supportedLines(data: { release_branches?: Branch[] }, today: string): Line[] {
  if (!Array.isArray(data.release_branches))
    throw new Error(`no release_branches in ${RELEASES_JSON}`);
  const lines: Line[] = [];
  for (const b of data.release_branches) {
    const branch = b.rel_branch?.match(/^v(\d+\.\d+)$/)?.[1];
    const eol = isoDay(b.eol_date);
    if (!branch || !eol || eol < today) continue;
    const releases = (b.releases ?? []).flatMap((r) =>
      r.version && /^\d+\.\d+\.\d+$/.test(r.version)
        ? [{ version: r.version, date: isoDay(r.date), notes: r.notes ?? null }]
        : [],
    );
    const arches = (b.arches ?? []).filter((a): a is string => typeof a === "string");
    if (releases.length) lines.push({ branch, eol, arches, releases });
  }
  if (!lines.length) throw new Error(`no supported release branch in ${RELEASES_JSON}`);
  return lines.sort((a, b) => compareVersions(b.branch, a.branch));
}

/** The digest in a .sha256/.sha512 file: "<hex>  <file>" or the bare "<hex>". */
function digestOf(text: string, length: number): string | null {
  const m = text.trim().match(new RegExp(`^([0-9a-fA-F]{${length}})(?:\\s|$)`));
  return m?.[1]?.toLowerCase() ?? null;
}

/** A checksum from the .sha512 file next to the image, compared with the other official copy. */
async function sha512Of(url: string, expected: string | undefined): Promise<string> {
  const sumUrl = `${url}.sha512`;
  const hash = digestOf(await getText(sumUrl), 128);
  if (!hash) throw new Error(`${sumUrl} has no SHA-512`);
  if (expected && hash !== expected.toLowerCase())
    throw new Error(`SHA-512 of ${url} differs between ${sumUrl} and the release metadata`);
  return hash;
}

const hex = (value: string | undefined, length: number) =>
  value && new RegExp(`^[0-9a-fA-F]{${length}}$`).test(value) ? value.toLowerCase() : null;

/** The ISO/disk-image editions of one line, from its per-architecture latest-releases.yaml. */
async function imageEditions(
  line: Line,
  log: (message: string) => void,
): Promise<{ version: string; date: string | null; editions: Edition[] }> {
  const byEdition = new Map<string, Artifact[]>();
  let version = "";
  let date: string | null = null;
  const seen = new Set<string>();
  for (const [dir, arch] of ARCHES) {
    // An architecture the branch is not built for has no directory.
    if (!line.arches.includes(dir)) continue;
    const base = `${CDN}v${line.branch}/releases/${dir}/`;
    const entries = parseReleaseList(await getText(`${base}latest-releases.yaml`));
    for (const e of entries) {
      for (const def of FLAVORS) {
        if (e.flavor !== def.flavor || !e.file?.endsWith(`.${def.ext}`)) continue;
        if (def.only && !def.only.includes(dir)) continue;
        const v = e.version?.match(/^\d+\.\d+\.\d+$/)?.[0];
        if (!v || e.file !== `${def.flavor}-${v}-${dir}.${def.ext}`)
          throw new Error(
            `unexpected entry ${e.file} (${e.version}) in ${base}latest-releases.yaml`,
          );
        if (!version) {
          version = v;
          date = isoDay(e.date);
        } else if (v !== version)
          throw new Error(`v${line.branch} has ${version} and ${v} images (${base})`);
        const size = Number(e.size);
        const sha512 = hex(e.sha512, 128);
        if (!(size > 0) || !sha512)
          throw new Error(`${e.file} has no size or SHA-512 in ${base}latest-releases.yaml`);
        const url = `${base}${e.file}`;
        const list = byEdition.get(def.id) ?? [];
        list.push({
          arch,
          format: def.format,
          file: e.file,
          path: `v${line.branch}/releases/${dir}/${e.file}`,
          url,
          size,
          checksum: { type: "sha512", value: await sha512Of(url, sha512), url: `${url}.sha512` },
          signatureUrl: `${url}.asc`,
          torrentUrl: null,
        });
        byEdition.set(def.id, list);
        seen.add(`${def.flavor} ${dir}`);
      }
    }
  }
  for (const [flavor, dir] of REQUIRED)
    if (!seen.has(`${flavor} ${dir}`))
      throw new Error(
        `no ${flavor} image for ${dir} in v${line.branch} (${CDN}v${line.branch}/releases/${dir}/latest-releases.yaml)`,
      );
  if (!version) throw new Error(`no images found for v${line.branch}`);
  const known = line.releases.find((r) => r.version === version);
  if (!known) log(`releases.json does not list ${version} yet; using the date of the images`);
  const editions: Edition[] = FLAVORS.filter((f) => byEdition.has(f.id)).map((f) => ({
    id: f.id,
    name: f.name,
    desktop: "none",
    kind: f.kind,
    artifacts: byEdition.get(f.id) ?? [],
  }));
  return { version, date: known?.date ?? date, editions };
}

/* ---------- cloud images ---------- */

interface CloudVariant {
  /** "3.24.3" of the section of the page. */
  release: string;
  arch: Artifact["arch"];
  firmware: string;
  bootstrap: string;
  machine: string;
  file: string;
  url: string;
  metaUrl: string;
  signatureUrl: string | null;
}

const CLOUD_ARCHES: Record<string, Artifact["arch"]> = { x86_64: "x86_64", aarch64: "aarch64" };
const BOOTSTRAP: Record<string, string> = { tiny: "Tiny Cloud", cloudinit: "cloud-init" };
const FIRMWARE: Record<string, string> = { bios: "BIOS", uefi: "UEFI", limine: "Limine" };
const MACHINE: Record<string, string> = { vm: "", metal: "bare metal" };

const token = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** The QCOW2 variants of alpinelinux.org/cloud/, one per heading "arch • firmware • bootstrap • machine". */
function parseCloudPage(html: string): CloudVariant[] {
  const out: CloudVariant[] = [];
  const sections = html.split(/<h2 title="End of Life: [^"]*">/).slice(1);
  for (const section of sections) {
    const release = section.match(/^(\d+\.\d+\.\d+)<\/h2>/)?.[1];
    if (!release) throw new Error(`unreadable release section on ${CLOUD_PAGE}`);
    for (const chunk of section.split('class="image-variant').slice(1)) {
      const heading = chunk.match(/<b title="Released:[^"]*">\s*([^<]+?)\s*<\/b>/)?.[1];
      const parts = heading?.split("•").map((p) => p.trim());
      if (parts?.length !== 4)
        throw new Error(`unreadable cloud variant heading "${heading}" on ${CLOUD_PAGE}`);
      const [archName, firmware, bootstrap, machine] = parts as [string, string, string, string];
      const arch = CLOUD_ARCHES[archName];
      if (!arch) throw new Error(`unknown cloud architecture "${archName}" on ${CLOUD_PAGE}`);
      const links = [...chunk.matchAll(/href="(https:\/\/dl-cdn\.alpinelinux\.org\/[^"]+)"/g)].map(
        (m) => (m[1] as string).replaceAll("&#x2F;", "/"),
      );
      const url = links.find((l) => l.endsWith(".qcow2"));
      const meta = links.find((l) => l.endsWith(".yaml"));
      if (!url || !meta)
        throw new Error(`cloud variant "${heading}" has no QCOW2 or metadata link`);
      const file = url.split("/").pop() as string;
      if (!file.startsWith(`alpine-${release}-${archName}-`))
        throw new Error(`unexpected cloud image ${file} in the ${release} section`);
      out.push({
        release,
        arch,
        firmware,
        bootstrap,
        machine,
        file,
        url,
        metaUrl: meta,
        signatureUrl: links.includes(`${url}.asc`) ? `${url}.asc` : null,
      });
    }
  }
  return out;
}

/** The QCOW2 entry (file, exact size, SHA-512) of a variant's .yaml metadata. */
function metaQcow2(yaml: string, file: string): { size: number; sha512: string } {
  const block = yaml.match(/^ {2}qcow2:\n((?: {4}.*\n?)+)/m)?.[1] ?? "";
  const named = block.match(/^ {4}file: (\S+)/m)?.[1];
  const size = Number(block.match(/^ {4}size: (\d+)/m)?.[1]);
  const sha512 = hex(block.match(/^ {4}sha512: (\S+)/m)?.[1], 128);
  if (named !== file || !(size > 0) || !sha512)
    throw new Error(`metadata of ${file} has no QCOW2 size or SHA-512`);
  return { size, sha512 };
}

/** Cloud editions of one line: its newest build on the cloud page. */
async function cloudEditions(variants: CloudVariant[], branch: string): Promise<Edition[]> {
  const ofBranch = variants.filter((v) => v.release.startsWith(`${branch}.`));
  const release = ofBranch.map((v) => v.release).sort((a, b) => compareVersions(b, a))[0];
  const byEdition = new Map<string, Edition>();
  for (const v of ofBranch.filter((x) => x.release === release)) {
    const id = [
      "cloud",
      token(v.bootstrap),
      v.machine === "vm" ? "" : token(v.machine),
      token(v.firmware),
    ]
      .filter(Boolean)
      .join("-");
    const label = [
      BOOTSTRAP[v.bootstrap] ?? v.bootstrap,
      MACHINE[v.machine] ?? v.machine,
      FIRMWARE[v.firmware] ?? v.firmware,
    ]
      .filter(Boolean)
      .join(", ");
    const edition = byEdition.get(id) ?? {
      id,
      name: `Cloud image (${label})`,
      desktop: "none" as const,
      kind: "cloud" as const,
      artifacts: [],
    };
    const meta = metaQcow2(await getText(v.metaUrl), v.file);
    edition.artifacts.push({
      arch: v.arch,
      format: "qcow2",
      file: v.file,
      path: `v${branch}/releases/cloud/${v.file}`,
      url: v.url,
      size: meta.size,
      checksum: {
        type: "sha512",
        value: await sha512Of(v.url, meta.sha512),
        url: `${v.url}.sha512`,
      },
      signatureUrl: v.signatureUrl,
      torrentUrl: null,
    });
    byEdition.set(id, edition);
  }
  return [...byEdition.values()];
}

/** Every ISO and .img.gz that the downloads page links must be in the result. */
function checkDownloadsPage(html: string, releases: Release[], newest: string) {
  const shown = html.match(/Current Alpine Version\s*<strong>(\d+\.\d+\.\d+)<\/strong>/)?.[1];
  if (!shown) throw new Error(`no "Current Alpine Version" on ${DOWNLOADS}`);
  // Right after a release the page (and releases.json) can lag the CDN by hours.
  if (shown !== newest) return;
  const have = new Set(
    releases
      .find((r) => r.version === newest)
      ?.editions.flatMap((e) => e.artifacts.map((a) => a.url)) ?? [],
  );
  const offered = [
    ...html.matchAll(/href="(https:&#x2F;&#x2F;dl-cdn\.alpinelinux\.org[^"]+\.(?:iso|img\.gz))"/g),
  ].map((m) => (m[1] as string).replaceAll("&#x2F;", "/"));
  if (!offered.length) throw new Error(`no image links on ${DOWNLOADS}`);
  const missing = offered.filter(
    (u) => !have.has(u) && !UNSUPPORTED_ARCHES.some((a) => u.includes(`-${a}.`)),
  );
  if (missing.length)
    throw new Error(
      `${DOWNLOADS} offers ${missing.length} image(s) that are not in the result: ${missing[0]}`,
    );
}

export default defineSource({
  slug: "alpine-linux",
  hosts: ["dl-cdn.alpinelinux.org"],
  async releases(ctx) {
    const lines = supportedLines(await getJson(RELEASES_JSON), ctx.today);
    const cloudPage = parseCloudPage(await getText(CLOUD_PAGE, { accept: "text/html" }));
    if (!cloudPage.length) throw new Error(`no cloud images on ${CLOUD_PAGE}`);

    const releases: Release[] = [];
    for (const [i, line] of lines.entries()) {
      const images = await imageEditions(line, ctx.log);
      const cloud = await cloudEditions(cloudPage, line.branch);
      if (i === 0 && !cloud.length)
        throw new Error(`${CLOUD_PAGE} has no cloud image for v${line.branch}`);
      const known = line.releases.find((r) => r.version === images.version);
      releases.push({
        version: images.version,
        channel: "stable",
        codename: null,
        releaseDate: images.date,
        eol: line.eol,
        notesUrl: known?.notes ? `${SITE}${known.notes.replace(/\.md$/, ".html")}` : null,
        editions: [...images.editions, ...cloud],
      });
    }
    // The downloads page lists the newest line's images; none of them may be missing.
    const newest = releases[0] as Release;
    checkDownloadsPage(await getText(DOWNLOADS, { accept: "text/html" }), releases, newest.version);
    return {
      sources: [
        RELEASES_JSON,
        DOWNLOADS,
        CLOUD_PAGE,
        ...lines.map((l) => `${CDN}v${l.branch}/releases/`),
      ],
      releases,
    };
  },
  async mirrors() {
    const data =
      await getJson<{ urls?: string[]; location?: string; name?: string }[]>(MIRRORS_JSON);
    if (!Array.isArray(data)) throw new Error(`unexpected ${MIRRORS_JSON}`);
    const seen = new Set<string>();
    const mirrors: Mirror[] = [];
    for (const m of data) {
      const https = m.urls?.find((u) => u.startsWith("https://"));
      if (!https) continue;
      const url = withSlash(https);
      if (seen.has(url)) continue;
      seen.add(url);
      mirrors.push({
        url,
        country: locationCountry(m.location),
        name: m.name?.trim() || new URL(url).hostname,
        lat: null,
        lon: null,
        score: null,
      });
    }
    if (!mirrors.length) throw new Error(`no HTTPS mirrors in ${MIRRORS_JSON}`);
    return { sources: [MIRRORS_JSON], mirrors };
  },
});

/** Locations of the list that name no country, exactly as the list spells them. */
const CITY_COUNTRY: Record<string, string> = {
  "Akihabara, Tokyo": "JP",
  Chisinau: "MD",
  Graz: "AT",
  "Montreal, QC": "CA",
  "Nouméa, New Caladonia": "NC",
  "Phnom Penh": "KH",
  "Toronto, Ontario": "CA",
};

/** "Aalborg, Denmark" → DK; the country is the last part of the text. */
function locationCountry(location: string | undefined): string | null {
  if (!location) return null;
  const last = location.split(",").pop()?.trim() ?? "";
  return countryCode(last) ?? countryCode(location) ?? CITY_COUNTRY[location.trim()] ?? null;
}
