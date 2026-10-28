/**
 * Void Linux (rolling, one image build at a time).
 *
 * Official sources, and what each one is used for:
 * - voidlinux.org/download/: the download page. It decides what is offered:
 *   every file it links under repo-default.voidlinux.org/live/current/ is read,
 *   so the editions, architectures and formats follow the page (live images
 *   for x86_64, i686, aarch64 and Apple Silicon (Asahi), each base and Xfce, in
 *   glibc and musl; the ROOTFS tarballs; the Raspberry Pi platform images and
 *   their PLATFORMFS tarballs). The page also prints the build date of every
 *   target; it has to agree with the date in the file names.
 * - repo-default.voidlinux.org/live/<date>/: the dated directory behind
 *   live/current/ (same files, byte for byte; the listing and sha256sum.txt
 *   are identical). Its URLs are used for the files, the checksum list and the
 *   signature, so a link keeps working after live/current/ moves on to the next
 *   build. sha256sum.txt (BSD style, the list the page tells users to verify)
 *   gives the SHA-256 of every file; sha256sum.sig is the signature of that
 *   list, linked as the signature of each file. The nginx listing of the same
 *   directory gives the exact size in bytes.
 * - xmirror.voidlinux.org/v0/mirrors.json: the machine-readable mirror list
 *   the "Mirrors" page (xmirror.voidlinux.org, linked from the download page
 *   and the handbook) is generated from.
 *
 * Build date: the images are not versioned; the build date (YYYYMMDD, as in
 * the file names) is the version and the release is rolling. The page offers
 * only the current build, so there is one release. live/ also holds older
 * builds (20230628, 20240314, 20250202) and an April Fools "enterprise" live
 * image (20250401); the page links none of those except the current build, so
 * they are not listed.
 *
 * Exclusions, for the same reasons as everywhere: the OCI container images
 * (the page's "containers" tab, hosted on GitHub's registry).
 *
 * Architectures: x86_64, i686 and aarch64 (also the Apple Silicon "asahi"
 * target) map to themselves; armv7l and armv6l (both hard-float, the latter
 * for the first-generation Raspberry Pi and Pi Zero) to armhf, the data
 * model's one 32-bit ARM label (Alpine's ARMv6 "armhf" is mapped the same way).
 * An edition holds one file per architecture and format, so the armv6l files
 * sit in editions of their own ("rootfs-armv6l", "rpi-armv6l", with musl
 * variants) instead of beside the armv7l ones.
 *
 * Mirrors: every enabled HTTPS entry of the list (the Mirrors page shows
 * exactly the enabled ones). Plain-HTTP entries are left out. The list gives a
 * tier, not a score: Tier 1 mirrors are run by the Void infrastructure team
 * and sync straight from the build servers, Tier 2 mirrors carry "no guarantee
 * of freshness or completeness". The tier (lower is better) is stored as the
 * score, which only breaks ties between equally distant mirrors. Country comes
 * from the location text ("Helsinki, Finland"; CDNs have none); the list has
 * no coordinates. run.ts then checks each mirror for the current images and
 * drops the ones that do not carry them.
 *
 * Fails closed: a page without live-image links, a file name this module does
 * not know, build dates that disagree, a file missing from sha256sum.txt, or
 * no x86_64 base/Xfce live image all throw.
 */

import type { Artifact, Edition, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getJson, getText, HttpError, RobotsDisallowed } from "../http";
import { parseChecksums } from "../lib/checksums";
import { countryCode, withSlash } from "../lib/mirrors";
import { defineSource } from "../source";

const PAGE = "https://voidlinux.org/download/";
const ROOT = "https://repo-default.voidlinux.org/";
const MIRRORS = "https://xmirror.voidlinux.org/v0/mirrors.json";

type Arch = Artifact["arch"];

/** Void target name → data-model architecture. */
const ARCHES: Record<string, Arch> = {
  x86_64: "x86_64",
  i686: "i686",
  aarch64: "aarch64",
  asahi: "aarch64",
  armv7l: "armhf",
  armv6l: "armhf",
};

const DATE = "(?<date>\\d{8})";
const LIBC = "(?<musl>-musl)?";
/** The file names the download page links, by kind. */
const PATTERNS: { kind: "live" | "rootfs" | "rpi"; format: Artifact["format"]; re: RegExp }[] = [
  {
    kind: "live",
    format: "iso",
    re: new RegExp(
      `^void-live-(?<target>x86_64|i686|aarch64|asahi)${LIBC}-${DATE}-(?<flavor>base|xfce)\\.iso$`,
    ),
  },
  {
    kind: "rootfs",
    format: "tar.xz",
    re: new RegExp(
      `^void-(?<target>x86_64|i686|aarch64|armv7l|armv6l)${LIBC}-ROOTFS-${DATE}\\.tar\\.xz$`,
    ),
  },
  {
    kind: "rpi",
    format: "img.xz",
    re: new RegExp(`^void-rpi-(?<target>aarch64|armv7l|armv6l)${LIBC}-${DATE}\\.img\\.xz$`),
  },
  {
    kind: "rpi",
    format: "tar.xz",
    re: new RegExp(
      `^void-rpi-(?<target>aarch64|armv7l|armv6l)${LIBC}-PLATFORMFS-${DATE}\\.tar\\.xz$`,
    ),
  },
];

interface EditionDef {
  id: string;
  name: string;
  desktop: Desktop;
  kind: Edition["kind"];
}

/** Edition (id, display name, …) of a file, from its kind, libc and flavor. */
function editionOf(
  kind: "live" | "rootfs" | "rpi",
  musl: boolean,
  target: string,
  flavor: string | undefined,
): EditionDef {
  const libc = musl ? "musl" : "glibc";
  const suffix = musl ? "-musl" : "";
  // armv6l shares armhf with armv7l: its own editions (one file per architecture and format).
  const v6 = target === "armv6l";
  const variant = v6 ? "-armv6l" : "";
  const note = v6 ? ", ARMv6" : "";
  if (kind === "rootfs")
    return {
      id: `rootfs${variant}${suffix}`,
      name: `Rootfs tarball (${libc}${note})`,
      desktop: "none",
      kind: "other",
    };
  if (kind === "rpi")
    return {
      id: `rpi${variant}${suffix}`,
      name: `Raspberry Pi (${libc}${note})`,
      desktop: "none",
      kind: "other",
    };
  const asahi = target === "asahi";
  const xfce = flavor === "xfce";
  return {
    id: `${asahi ? "asahi-" : ""}${flavor}${suffix}`,
    name: `${asahi ? "Apple Silicon " : ""}${xfce ? "Xfce" : "Base"} (${libc})`,
    desktop: xfce ? "xfce" : "none",
    kind: "live",
  };
}

/** Display order of the editions. */
const ORDER = [
  "base",
  "xfce",
  "base-musl",
  "xfce-musl",
  "asahi-base",
  "asahi-xfce",
  "asahi-base-musl",
  "asahi-xfce-musl",
  "rootfs",
  "rootfs-musl",
  "rootfs-armv6l",
  "rootfs-armv6l-musl",
  "rpi",
  "rpi-musl",
  "rpi-armv6l",
  "rpi-armv6l-musl",
];

/** File sizes (bytes) from the nginx listing of a live/<date>/ directory. */
async function sizes(dir: string, log: (m: string) => void): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const html = await getText(dir, { accept: "text/html" });
    for (const m of html.matchAll(/<a href="([^"/]+)">[^<]*<\/a>\s+\S+\s+\S+\s+(\d+)\s*$/gm))
      if (m[1] && m[2]) out.set(decodeURIComponent(m[1]), Number(m[2]));
  } catch (error) {
    // Sizes are optional: run.ts asks the official URL for the ones that stay null.
    if (error instanceof RobotsDisallowed || !(error instanceof HttpError)) throw error;
    log(`no sizes from ${dir}: ${error.message}`);
  }
  return out;
}

export default defineSource({
  slug: "void-linux",
  hosts: ["repo-default.voidlinux.org"],
  async releases(ctx) {
    const page = await getText(PAGE, { accept: "text/html" });
    const linked = [
      ...new Set(
        [
          ...page.matchAll(
            /href="https:\/\/repo-default\.voidlinux\.org\/live\/current\/([^"/]+)"/g,
          ),
        ]
          .map((m) => m[1] as string)
          .filter((f) => f !== "sha256sum.txt" && f !== "sha256sum.sig"),
      ),
    ];
    if (!linked.length) throw new Error(`no live/current/ file links on ${PAGE}`);

    const files = linked.flatMap((file) => {
      for (const p of PATTERNS) {
        const g = p.re.exec(file)?.groups;
        if (g) return [{ file, p, g }];
      }
      throw new Error(`${PAGE} links a file this module does not know: ${file}`);
    });

    const dates = new Set(files.map((f) => f.g.date as string));
    if (dates.size !== 1)
      throw new Error(`expected one build date on ${PAGE}, got ${[...dates].join(", ")}`);
    const date = [...dates][0] as string;
    const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    const shown = new Set(
      [...page.matchAll(/<small>(\d{4}-\d{2}-\d{2})<\/small>/g)].map((m) => m[1]),
    );
    if (shown.size !== 1 || !shown.has(iso))
      throw new Error(
        `build date on ${PAGE} (${[...shown].join(", ") || "none"}) differs from the files (${iso})`,
      );

    // The dated directory holds the same files as live/current/ at a path that never changes.
    const dirPath = `live/${date}/`;
    const dir = `${ROOT}${dirPath}`;
    const sums = `${dir}sha256sum.txt`;
    const sig = `${dir}sha256sum.sig`;
    // The page links the signature of the checksum list next to the list itself.
    const signed = page.includes("/live/current/sha256sum.sig");
    const hashes = parseChecksums(await getText(sums));
    const size = await sizes(dir, ctx.log);

    const byEdition = new Map<string, { def: EditionDef; artifacts: Artifact[] }>();
    for (const { file, p, g } of files) {
      const arch = ARCHES[g.target as string];
      if (arch === undefined) throw new Error(`unknown Void target ${g.target} in ${file}`);
      const hash = hashes.get(file);
      if (!hash || !/^[0-9a-f]{64}$/.test(hash))
        throw new Error(`${sums} has no SHA-256 for ${file}`);
      const def = editionOf(p.kind, Boolean(g.musl), g.target as string, g.flavor);
      const entry = byEdition.get(def.id) ?? { def, artifacts: [] };
      entry.artifacts.push({
        arch,
        format: p.format,
        file,
        path: `${dirPath}${file}`,
        url: `${dir}${file}`,
        size: size.get(file) ?? null,
        checksum: { type: "sha256", value: hash, url: sums },
        signatureUrl: signed ? sig : null,
        torrentUrl: null,
      });
      byEdition.set(def.id, entry);
    }

    for (const id of ["base", "xfce"])
      if (!byEdition.get(id)?.artifacts.some((a) => a.arch === "x86_64"))
        throw new Error(`no x86_64 ${id} live image on ${PAGE}`);
    const unknown = [...byEdition.keys()].filter((id) => !ORDER.includes(id));
    if (unknown.length) throw new Error(`editions missing from the display order: ${unknown}`);

    const editions: Edition[] = ORDER.flatMap((id) => {
      const entry = byEdition.get(id);
      return entry ? [{ ...entry.def, artifacts: entry.artifacts }] : [];
    });
    const release: Release = {
      version: date,
      channel: "rolling",
      codename: null,
      releaseDate: iso,
      eol: null,
      notesUrl: "https://voidlinux.org/news/",
      editions,
    };
    return { sources: [PAGE, sums, dir], releases: [release] };
  },
  async mirrors() {
    const list =
      await getJson<{ base_url: string; location: string; tier: number; enabled: boolean }[]>(
        MIRRORS,
      );
    if (!Array.isArray(list)) throw new Error(`${MIRRORS} is not a list`);
    const byUrl = new Map<string, (typeof list)[number]>();
    for (const m of list)
      if (m.enabled && m.base_url.startsWith("https://")) byUrl.set(withSlash(m.base_url), m);
    if (!byUrl.size) throw new Error(`no enabled HTTPS mirrors in ${MIRRORS}`);
    return {
      sources: [MIRRORS],
      mirrors: [...byUrl].map(([url, m]) => ({
        url,
        // "Helsinki, Finland" → FI; global CDNs have no country.
        country: countryCode(m.location.split(",").pop()),
        name: new URL(url).hostname,
        lat: null,
        lon: null,
        // Tier 1 (Void infrastructure team) before Tier 2.
        score: m.tier,
      })),
    };
  },
});
