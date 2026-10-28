/**
 * Gentoo Linux (rolling; automated builds of installation media, stages and
 * disk images).
 *
 * Official sources, and what each one is used for:
 * - www.gentoo.org/downloads/ and its per-architecture pages
 *   (/downloads/amd64/, arm64, x86, arm, riscv, ppc, s390): the download
 *   pages. They decide what is offered: every file they link under
 *   distfiles.gentoo.org/releases/<arch>/autobuilds/<build>/ is read (the
 *   Minimal Installation CD, the LiveGUI USB image, every stage archive of the
 *   "Stages" and "Stages (advanced)" tabs, the QCOW2 disk images), each with
 *   the build timestamp the page links today. The top page lists the
 *   architecture pages; one this module neither reads nor knowingly leaves out
 *   makes the sync throw.
 * - distfiles.gentoo.org/releases/<arch>/autobuilds/<build>/<file>.DIGESTS: the
 *   checksum file of each image on the origin host (clearsigned; SHA-512 and
 *   BLAKE2b; SHA-512 is used, the strongest type that the site shows commands
 *   for). Each file also has a detached .asc (OpenPGP signature), linked as
 *   its signature when the page links it. Gentoo publishes no torrents.
 * - distfiles.gentoo.org/releases/<arch>/autobuilds/latest-{stage3,iso,qcow2}.txt:
 *   clearsigned lists of "<build>/<file> <bytes>", the only exact sizes the
 *   project publishes (the pages round them). A file that is not in them
 *   (the page can be a few hours ahead of or behind the lists) keeps size null
 *   and run.ts asks the official URL.
 * - api.gentoo.org/mirrors/distfiles.xml: the official source mirror list (the
 *   machine-readable file that www.gentoo.org/downloads/mirrors/, where the
 *   download pages send users, is generated from; both list the same HTTPS
 *   URLs). The page states that the listed mirrors carry the installation
 *   files; the XML adds a per-URL flag for mirrors that hold only part of the
 *   tree.
 *
 * Release: Gentoo has no versions. The images are rebuilt continuously, each
 * architecture and image on its own schedule (amd64 weekly, other
 * architectures at other times, LiveGUI less often), so one rolling release
 * covers what the pages offer today; its version and date (YYYYMMDD) are those
 * of the amd64 Minimal Installation CD, the image most visitors need and the
 * one the download pages list first. Every file keeps its own build timestamp
 * in its name and URL.
 *
 * Architectures: amd64 → x86_64, arm64 → aarch64, x86 (i686, i486) → i686,
 * arm (armv7a_hardfp, armv6j_hardfp: the hard-float ABIs, the data model's one
 * 32-bit ARM label armhf; ARMv6 hard-float is the first-generation Raspberry
 * Pi, as in Alpine's armhf) → armhf, ppc (ppc64le, power9le) → ppc64le, riscv
 * (rv64) → riscv64, s390 → s390x. An edition holds one file per architecture
 * and format, so a stage that is a variant of its architecture (the x32 ABI,
 * i486, armv6j_hardfp, power9le, rv64_lp64, rv64_multilib) is its own
 * edition, named after the variant; the plain stage of each architecture is
 * the same edition ("Stage (openrc)") everywhere. Ids are the file name's
 * tokens without the architecture (stage-musl-hardened-openrc).
 *
 * Exclusions, for the same reasons as everywhere: the Docker images (container
 * images, on Docker Hub), the WSL images (.wsl is no format of the data model),
 * the s390x netboot kernel and initramfs (loader files, no image).
 * Architectures that are not in the data model's list, like Debian's armel and
 * mips: alpha, hppa, loong, m68k, mips, sparc; big-endian ppc and ppc64
 * (stages and install CD); 32-bit RISC-V (rv32); big-endian aarch64
 * (aarch64_be); the soft-float ARM stages (armv4tl, armv5tel, armv6j, armv7a:
 * the armel convention, not armhf).
 *
 * Mirrors: every HTTPS entry of the list that is not flagged partial="y"
 * (country from the group it is in, "UK" being Great Britain; the list has no
 * coordinates or scores; commented-out entries are ignored). An entry counts
 * as HTTPS by its URL, not by the protocol label next to it (one entry is
 * labelled "http" but links an https:// URL). A mirror root holds the same
 * tree as distfiles.gentoo.org, so artifact.path is
 * releases/<arch>/autobuilds/<build>/<file> and root + path is the file. The
 * one partial HTTPS entry (mirror.isoc.org.il) answers 404 for releases/
 * today, which is what the flag says: it is not a mirror of the install
 * media. run.ts then checks each remaining one for the newest amd64 minimal
 * CD and drops the ones that do not carry it. The origin distfiles.gentoo.org
 * (CDN-backed, the host of every artifact URL) is not on the list, so it is
 * not a mirror entry.
 *
 * Fails closed: a page without links, a file name or architecture this module
 * does not know, two files for the same edition, architecture and format, a
 * missing SHA-512, no amd64 Minimal Installation CD and openrc stage, or a
 * mirror list without groups or HTTPS entries throw.
 */

import type { Artifact, Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import { getText, HttpError, RobotsDisallowed } from "../http";
import { countryCode, withSlash } from "../lib/mirrors";
import { defineSource } from "../source";

const SITE = "https://www.gentoo.org/downloads/";
const MIRRORS = "https://api.gentoo.org/mirrors/distfiles.xml";
const RELEASES = "https://distfiles.gentoo.org/releases/";

type Arch = Artifact["arch"];

/** The architecture pages the module reads, and those it leaves out (no architecture of the data model). */
const PAGES = ["amd64", "arm64", "x86", "arm", "riscv", "ppc", "s390"];
const LEFT_OUT_PAGES = ["alpha", "hppa", "loong", "m68k", "mips", "sparc"];

/**
 * Gentoo's architecture name inside a file name → data-model architecture
 * (null: left out). `keep`: the name is a variant of its architecture and part
 * of the edition id.
 */
const SUBARCH: Record<string, { arch: Arch | null; keep: boolean }> = {
  amd64: { arch: "x86_64", keep: false },
  x32: { arch: "x86_64", keep: true },
  arm64: { arch: "aarch64", keep: false },
  aarch64_be: { arch: null, keep: false },
  i686: { arch: "i686", keep: false },
  i486: { arch: "i686", keep: true },
  armv7a_hardfp: { arch: "armhf", keep: false },
  armv7a: { arch: null, keep: false },
  armv4tl: { arch: null, keep: false },
  armv5tel: { arch: null, keep: false },
  armv6j: { arch: null, keep: false },
  armv6j_hardfp: { arch: "armhf", keep: true },
  ppc64le: { arch: "ppc64le", keep: false },
  power9le: { arch: "ppc64le", keep: true },
  ppc: { arch: null, keep: false },
  ppc64: { arch: null, keep: false },
  rv64_lp64d: { arch: "riscv64", keep: false },
  rv64_lp64: { arch: "riscv64", keep: true },
  rv64_multilib: { arch: "riscv64", keep: true },
  rv32_ilp32d: { arch: null, keep: false },
  rv32_ilp32: { arch: null, keep: false },
  s390x: { arch: "s390x", keep: false },
};

/** The name of an install CD / LiveGUI image's architecture → data-model architecture. */
const ISO_ARCH: Record<string, Arch | null> = {
  amd64: "x86_64",
  arm64: "aarch64",
  x86: "i686",
  ppc64le: "ppc64le",
  powerpc: null,
};

const TS = "(?<ts>\\d{8}T\\d{6}Z)";
const INSTALL = new RegExp(`^install-(?<a>[a-z0-9]+)-minimal-${TS}\\.iso$`);
const LIVEGUI = new RegExp(`^livegui-(?<a>[a-z0-9]+)-${TS}\\.iso$`);
const STAGE = new RegExp(`^stage3-(?<rest>[a-z0-9_]+(?:-[a-z0-9_]+)*)-${TS}\\.tar\\.xz$`);
const DISK = new RegExp(`^di-(?<sub>[a-z0-9_]+)-(?<kind>console|cloudinit)-${TS}\\.qcow2$`);
const WSL = new RegExp(`^stage4-[a-z0-9_]+-wsl-[a-z]+-${TS}\\.wsl$`);
const NETBOOT = new RegExp(`^netboot-[a-z0-9]+-(?:initramfs|kernel)-${TS}$`);

/** How the page words a stage's attributes. */
const LABELS: Record<string, string> = {
  desktop: "desktop profile",
  nomultilib: "no multilib",
  selinux: "SELinux",
  llvm: "LLVM",
  splitusr: "split-usr",
  t64: "64-bit time_t",
  ssemath: "SSE math",
};

/** Order of the stage editions: the page's tabs, then the rest by id. */
const STAGE_ORDER = [
  "openrc",
  "systemd",
  "desktop-openrc",
  "desktop-systemd",
  "nomultilib-openrc",
  "nomultilib-systemd",
  "hardened-openrc",
  "hardened-systemd",
  "musl-openrc",
  "musl-systemd",
  "musl-hardened-openrc",
  "musl-hardened-systemd",
  "llvm-openrc",
  "llvm-systemd",
  "musl-llvm-openrc",
  "musl-llvm-systemd",
  "hardened-selinux-openrc",
  "hardened-selinux-systemd",
  "x32-openrc",
  "x32-systemd",
  "openrc-splitusr",
];

interface EditionDef {
  id: string;
  name: string;
  desktop: Edition["desktop"];
  kind: Edition["kind"];
  /** Sort key: boot media, stages, disk images. */
  rank: string;
}

interface Found {
  dir: string;
  ts: string;
  file: string;
  arch: Arch;
  format: Artifact["format"];
  def: EditionDef;
  /** Which latest-*.txt lists the file's size. */
  list: "stage3" | "iso" | "qcow2";
}

/** Classifies a linked file: null when it is deliberately left out, throws when unknown. */
function classify(
  dir: string,
  ts: string,
  file: string,
): Omit<Found, "dir" | "ts" | "file"> | null {
  const where = `${SITE}${dir}/`;
  const install = INSTALL.exec(file)?.groups;
  if (install) {
    const arch = ISO_ARCH[install.a as string];
    if (arch === undefined)
      throw new Error(`${where} links an install CD for an unknown architecture: ${file}`);
    if (arch === null) return null;
    return {
      arch,
      format: "iso",
      list: "iso",
      def: {
        id: "install-minimal",
        name: "Minimal Installation CD",
        desktop: "none",
        kind: "minimal",
        rank: "0-0",
      },
    };
  }
  const gui = LIVEGUI.exec(file)?.groups;
  if (gui) {
    const arch = ISO_ARCH[gui.a as string];
    if (!arch)
      throw new Error(`${where} links a LiveGUI image for an unknown architecture: ${file}`);
    return {
      arch,
      format: "iso",
      list: "iso",
      def: { id: "livegui", name: "LiveGUI USB Image", desktop: "kde", kind: "live", rank: "0-1" },
    };
  }
  const stage = STAGE.exec(file)?.groups;
  if (stage) {
    const [first = "", ...mid] = (stage.rest as string).split("-");
    const base = first.replace(/_musl$/, "");
    const sub = SUBARCH[base];
    if (!sub)
      throw new Error(
        `${where} links a stage for an architecture this module does not know: ${file}`,
      );
    if (sub.arch === null) return null;
    const tokens = [...(base !== first ? ["musl"] : []), ...mid];
    if (!tokens.some((t) => t === "openrc" || t === "systemd"))
      throw new Error(`${where} links a stage without an init system in its name: ${file}`);
    const all = [...(sub.keep ? [base] : []), ...tokens];
    const id = all.join("-").replace(/_/g, "-");
    const rank = STAGE_ORDER.indexOf(id);
    return {
      arch: sub.arch,
      format: "tar.xz",
      list: "stage3",
      def: {
        id: `stage-${id}`,
        name: `Stage (${all.map((t) => LABELS[t] ?? t).join(", ")})`,
        desktop: "none",
        kind: "other",
        rank: `1-${rank < 0 ? `z-${id}` : String(rank).padStart(2, "0")}`,
      },
    };
  }
  const disk = DISK.exec(file)?.groups;
  if (disk) {
    const sub = SUBARCH[disk.sub as string];
    if (!sub?.arch)
      throw new Error(`${where} links a disk image for an unknown architecture: ${file}`);
    const cloud = disk.kind === "cloudinit";
    return {
      arch: sub.arch,
      format: "qcow2",
      list: "qcow2",
      def: {
        id: cloud ? "qcow2-cloudinit" : "qcow2-console",
        name: cloud ? "QCOW2 disk image (cloud-init)" : "QCOW2 disk image (no root password)",
        desktop: "none",
        kind: cloud ? "cloud" : "other",
        rank: cloud ? "2-1" : "2-0",
      },
    };
  }
  if (WSL.test(file) || NETBOOT.test(file)) return null;
  throw new Error(`${where} links a file this module does not know: ${file} (${ts})`);
}

/** Reads the files an architecture page links (the main files, and which have a signature). */
async function readPage(dir: string) {
  const url = `${SITE}${dir}/`;
  const html = await getText(url, { accept: "text/html" });
  const links = new Set<string>();
  const re = new RegExp(
    `href="${RELEASES.replace(/[./]/g, "\\$&")}${dir}/autobuilds/(\\d{8}T\\d{6}Z)/([^"/]+)"`,
    "g",
  );
  for (const m of html.matchAll(re)) links.add(`${m[1]}/${m[2]}`);
  const signed = new Set([...links].filter((l) => l.endsWith(".asc")).map((l) => l.slice(0, -4)));
  const files = [...links].filter((l) => !l.endsWith(".asc")).sort();
  if (!files.length) throw new Error(`no autobuilds links on ${url}`);
  return { url, files, signed };
}

/** The "<build>/<file> <bytes>" lines of a latest-*.txt list. */
function parseSizes(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of text.matchAll(/^(\d{8}T\d{6}Z\/\S+) (\d+)\s*$/gm))
    out.set(m[1] as string, Number(m[2]));
  return out;
}

/** The SHA-512 of `file` in a clearsigned .DIGESTS file ("# SHA512 HASH" sections). */
function sha512Of(text: string, file: string): string | null {
  let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const head = line.match(/^#\s*([A-Z0-9]+)\s+HASH/i);
    if (head) {
      section = (head[1] as string).toUpperCase();
      continue;
    }
    if (section !== "SHA512") continue;
    const hash = line.match(/^([0-9a-f]{128})\s+\*?(\S+)$/i);
    if (hash && hash[2] === file) return (hash[1] as string).toLowerCase();
  }
  return null;
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();

export default defineSource({
  slug: "gentoo",
  hosts: ["distfiles.gentoo.org"],
  async releases(ctx) {
    // The top page lists the architectures: all of them must be accounted for.
    const top = await getText(SITE, { accept: "text/html" });
    const listed = [
      ...new Set(
        [...top.matchAll(/<a href="([a-z0-9]+)\/" class="list-group-item">/g)].map(
          (m) => m[1] as string,
        ),
      ),
    ];
    if (!listed.includes("amd64"))
      throw new Error(`${SITE} no longer lists the architecture pages`);
    const unknown = listed.filter((d) => !PAGES.includes(d) && !LEFT_OUT_PAGES.includes(d));
    if (unknown.length)
      throw new Error(`${SITE} lists architectures this module does not know: ${unknown}`);
    const missing = PAGES.filter((d) => !listed.includes(d));
    if (missing.length) throw new Error(`${SITE} no longer lists: ${missing}`);

    const found: Found[] = [];
    const signed = new Set<string>();
    for (const dir of PAGES) {
      const page = await readPage(dir);
      let kept = 0;
      for (const path of page.files) {
        const [ts = "", file = ""] = path.split("/");
        const item = classify(dir, ts, file);
        if (!item) {
          ctx.log(`left out ${dir}/${path}`);
          continue;
        }
        kept++;
        found.push({ dir, ts, file, ...item });
        if (page.signed.has(path)) signed.add(`${dir}/${path}`);
      }
      if (!kept) throw new Error(`nothing usable on ${page.url}`);
    }

    // One file per edition, architecture and format (the download wizard picks the first).
    const seen = new Set<string>();
    for (const f of found) {
      const key = `${f.def.id}/${f.arch}/${f.format}`;
      if (seen.has(key)) throw new Error(`two files for ${key}: ${f.file}`);
      seen.add(key);
    }
    for (const need of ["install-minimal/x86_64/iso", "stage-openrc/x86_64/tar.xz"])
      if (!seen.has(need)) throw new Error(`no ${need} on ${SITE}amd64/`);

    // Exact sizes from the clearsigned latest-*.txt lists, one per architecture and kind.
    const sizes = new Map<string, number>();
    for (const dir of PAGES) {
      for (const list of ["stage3", "iso", "qcow2"] as const) {
        if (!found.some((f) => f.dir === dir && f.list === list)) continue;
        const url = `${RELEASES}${dir}/autobuilds/latest-${list}.txt`;
        try {
          for (const [path, size] of parseSizes(await getText(url)))
            sizes.set(`${dir}/${path}`, size);
        } catch (error) {
          // Sizes are optional: run.ts asks the official URL for the ones that stay null.
          if (error instanceof RobotsDisallowed || !(error instanceof HttpError)) throw error;
          ctx.log(`no sizes from ${url}: ${error.message}`);
        }
      }
    }

    const byEdition = new Map<string, { def: EditionDef; artifacts: Artifact[] }>();
    for (const f of found) {
      const base = `${RELEASES}${f.dir}/autobuilds/${f.ts}/${f.file}`;
      const digests = `${base}.DIGESTS`;
      const hash = sha512Of(await getText(digests), f.file);
      if (!hash) throw new Error(`${digests} has no SHA-512 for ${f.file}`);
      const entry = byEdition.get(f.def.id) ?? { def: f.def, artifacts: [] };
      entry.artifacts.push({
        arch: f.arch,
        format: f.format,
        file: f.file,
        // Mirrors carry the same tree as distfiles.gentoo.org: root + releases/<arch>/autobuilds/…
        path: `releases/${f.dir}/autobuilds/${f.ts}/${f.file}`,
        url: base,
        size: sizes.get(`${f.dir}/${f.ts}/${f.file}`) ?? null,
        checksum: { type: "sha512", value: hash, url: digests },
        signatureUrl: signed.has(`${f.dir}/${f.ts}/${f.file}`) ? `${base}.asc` : null,
        torrentUrl: null,
      });
      byEdition.set(f.def.id, entry);
    }

    const editions: Edition[] = [...byEdition.values()]
      .sort((a, b) => a.def.rank.localeCompare(b.def.rank) || a.def.id.localeCompare(b.def.id))
      .map(({ def, artifacts }) => ({
        id: def.id,
        name: def.name,
        desktop: def.desktop,
        kind: def.kind,
        artifacts,
      }));

    // The amd64 Minimal Installation CD (checked above) names the release.
    const anchor = found.find((f) => f.def.id === "install-minimal" && f.arch === "x86_64");
    const date = (anchor?.ts ?? "").slice(0, 8);
    if (!date) throw new Error(`no amd64 Minimal Installation CD on ${SITE}amd64/`);
    const release: Release = {
      version: date,
      channel: "rolling",
      codename: null,
      releaseDate: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
      eol: null,
      notesUrl: "https://www.gentoo.org/news/",
      editions,
    };
    return { sources: [SITE, ...PAGES.map((d) => `${SITE}${d}/`)], releases: [release] };
  },
  async mirrors() {
    // Entries that were switched off are kept in the file as XML comments.
    const xml = (await getText(MIRRORS, { accept: "application/xml" })).replace(
      /<!--[\s\S]*?-->/g,
      "",
    );
    if (!/<mirrors>/.test(xml)) throw new Error(`${MIRRORS} is no longer a <mirrors> list`);
    const mirrors = new Map<string, Mirror>();
    const groups = xml.split(/<mirrorgroup\b/).slice(1);
    for (const group of groups) {
      const code = group.match(/^[^>]*\bcountry="([A-Z]{2})"/)?.[1];
      if (!code) throw new Error(`a <mirrorgroup> without a country in ${MIRRORS}`);
      const country = countryCode(code);
      for (const block of group.split(/<mirror>/).slice(1)) {
        const name = decode(block.match(/<name>([^<]*)<\/name>/)?.[1] ?? "");
        // The URL decides what is HTTPS, not the protocol attribute (one entry
        // says "http" but links an https:// URL).
        for (const uri of block.matchAll(/<uri\b([^>]*)>\s*(https:\/\/[^<\s]+)\s*<\/uri>/g)) {
          if (/\bpartial="y"/.test(uri[1] ?? "")) continue;
          const url = withSlash(uri[2] as string);
          mirrors.set(url, {
            url,
            country,
            name: name || new URL(url).hostname,
            lat: null,
            lon: null,
            score: null,
          });
        }
      }
    }
    if (!groups.length || !mirrors.size) throw new Error(`no HTTPS mirrors in ${MIRRORS}`);
    return { sources: [MIRRORS], mirrors: [...mirrors.values()] };
  },
});
