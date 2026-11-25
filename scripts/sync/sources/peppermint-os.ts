/**
 * Peppermint OS: the current builds of the Flagship (Xfce) edition on the Debian
 * (trixie) and Devuan (excalibur) bases, and of the Loaded edition on the Void
 * base (2026-11-24, its own build with applications pre-installed), 64-bit ISOs
 * from the project's SourceForge, mirrors = SourceForge's redirector.
 *
 * Official sources, and what each one is used for:
 * - peppermintos.com: the "Download Peppermint" button of the home page names
 *   the current download page (today /trixie-base-downloads/; it is followed,
 *   not hard-coded, because the page is renamed with each new Debian base). Its
 *   table is the source of truth for what is offered: one column group per base
 *   ("Debian Base (trixie)", "Devuan Base (excalibur)", "Void Base"), one row per
 *   architecture, each cell linking the ISO, its checksum file, its detached
 *   signature and the public key that verifies it (peppermintos_public.key on the
 *   Debian and Devuan cells, the image's own .gpg-key.asc on Void), all on the
 *   project's SourceForge. The home page's "Release Notes" button gives
 *   `notesUrl` (the project's build log).
 * - sourceforge.net/projects/peppermintos/files/ (robots.txt allows the files
 *   pages): each linked file must exist there; the page shows the upload day
 *   and the hashes SourceForge computed. Each artifact's `url` is SourceForge's
 *   /download link, which sends the visitor to a nearby SourceForge mirror.
 *
 * Peppermint OS has no version numbers. Each ISO is rebuilt in place under the
 * same file name, so a build is identified by the day it was published (the
 * project's own build log is dated the same way): one release per base, its
 * version and release date are that day (the newest upload among the base's
 * images), its codename names the base ("Debian trixie", "Devuan excalibur",
 * "Void Linux" — Void is a rolling base and has no codename). No end of support
 * is announced: eol null. Channel stable.
 *
 * Editions: the table's heading names the branch ("Peppermint OS Flagship"),
 * and an ISO whose file name names one ("…-loaded.iso") belongs to that branch
 * instead — the Void base's image is the Loaded build, which the release
 * announcement of 2026-11-24 describes (and promises a Flagship build later).
 *
 * Checksums: the project publishes SHA-512 files (and the page links them), but
 * they can only be read through SourceForge's /download link, which redirects to
 * *.dl.sourceforge.net, a host whose robots.txt disallows all bots. Following it
 * would break the rule that every request is robots-allowed, so the checksum is
 * the strongest hash SourceForge's files page shows for the ISO (SHA-256 when
 * it computed one, else SHA-1, here SHA-1) with `checksum.url` = that page. A
 * checksum file linked by the page that SourceForge does not list throws. The
 * Devuan `.sig` (OpenPGP, key peppermintos_public.key in the same folder) is
 * `signatureUrl`; the Debian build has none. Sizes are not published exactly
 * (SourceForge rounds to 0.1 GB): left null for run.ts.
 *
 * Excluded: the OSSPlanet mirror the page links for the Debian ISO (a stale
 * copy under another layout: its Debian ISO is a different build with a
 * different checksum and its Devuan file has another name, so mirror root +
 * path would not be the file), nightly.peppermintos.org builds (development
 * snapshots), the build log's older Mini/ARM/32-bit builds (not offered any
 * more). The PepVoid image was a test image (peppermintos.org/PepVoid) until
 * 2026-11-24; the page now lists it as a base, so it is read like the rest.
 *
 * Deviations: the download page is the only official list of images, so the
 * edition set and the base columns are read from it and an unknown edition or
 * architecture label throws instead of being skipped.
 */

import type { Artifact, Edition, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getText } from "../http";
import { originAsMirror } from "../lib/mirrors";
import { sourceforgeChecksum, sourceforgeDownloadUrl } from "../lib/mxiso";
import {
  type SfEntry,
  sourceforgeFolder,
  sourceforgeFolderUrl,
  sourceforgeRoot,
} from "../lib/sourceforge";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const HOME = "https://peppermintos.com/";
const PROJECT = "peppermintos";
/** Editions the project names on its download page; an unknown heading is a format change. */
const EDITIONS: Record<string, { name: string; desktop: Desktop }> = {
  flagship: { name: "Flagship", desktop: "xfce" },
  loaded: { name: "Loaded", desktop: "xfce" },
};
const ARCH: Record<string, Artifact["arch"]> = { "64-bit": "x86_64", "32-bit": "i686" };

const SF_FILE = new RegExp(`^https://sourceforge\\.net/projects/${PROJECT}/files/(.+)/download$`);

interface Cell {
  /** SourceForge path of the ISO below the project root, e.g. isos/XFCE/PeppermintOS-Debian-64.iso. */
  iso: string;
  checksumFile: string | null;
  /** Detached OpenPGP signature: .sig (Debian, Devuan) or .asc (Void). */
  signatureFile: string | null;
  /** The project's public key linked next to the image (one per cell, not per image). */
  keyFile: string | null;
}

interface Build {
  /** "Debian" | "Devuan" | "Void" */
  distro: string;
  /** The base's codename ("trixie", "excalibur"); null for a rolling base (Void). */
  codename: string | null;
  edition: string;
  arch: Artifact["arch"];
  cell: Cell;
}

const anchors = (html: string) =>
  [...html.matchAll(/<a\s[^>]*?href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({
    href: m[1] as string,
    text: (m[2] as string).replace(/<[^>]+>/g, "").trim(),
  }));

/** The download page the home page's "Download Peppermint" button points to. */
function downloadPage(home: string): string {
  const link = anchors(home).find(
    (a) => /^Download Peppermint$/i.test(a.text) && a.href.startsWith(HOME),
  );
  if (!link) throw new Error("the Peppermint OS home page has no 'Download Peppermint' button");
  return link.href;
}

/** File names the page links beside an ISO, each with the role it has. */
const fileName = (path: string) => path.split("/").pop() ?? path;
const isKeyFile = (name: string) => name.endsWith(".key") || name.endsWith(".gpg-key.asc");
const isSignatureFile = (name: string) =>
  !isKeyFile(name) && (name.endsWith(".sig") || name.endsWith(".asc"));

/** One cell of the table: the SourceForge links of one image (other hosts are not used). */
function parseCell(html: string, where: string): Cell {
  const files = anchors(html).flatMap((a) => {
    const path = SF_FILE.exec(a.href)?.[1];
    return path ? [path] : [];
  });
  const iso = files.filter((f) => f.endsWith(".iso"));
  if (iso.length !== 1)
    throw new Error(`${where}: expected one SourceForge ISO link, got ${iso.length}`);
  const rest = files.filter((f) => !f.endsWith(".iso"));
  const checksumFile = rest.filter((f) => /sha512/i.test(fileName(f)));
  const signatureFile = rest.filter((f) => isSignatureFile(fileName(f)));
  const keyFile = rest.filter((f) => isKeyFile(fileName(f)));
  if (
    checksumFile.length !== 1 ||
    signatureFile.length > 1 ||
    keyFile.length > 1 ||
    rest.length !== checksumFile.length + signatureFile.length + keyFile.length
  )
    throw new Error(`${where}: unexpected links next to ${iso[0]}`);
  return {
    iso: iso[0] as string,
    checksumFile: checksumFile[0] ?? null,
    signatureFile: signatureFile[0] ?? null,
    keyFile: keyFile[0] ?? null,
  };
}

/** The base columns of a table row ("Debian Base (trixie)", "Void Base"), by column. */
const BASE_HEADER = /^(Debian|Devuan|Void) Base(?:\s*\(([a-z]+)\))?$/i;
const text = (html: string) => html.replace(/<[^>]+>/g, "").trim();

/** The branch an image belongs to: named by its file name ("…-loaded.iso"), else by the table's heading. */
function branchOf(iso: string, heading: string, where: string): string {
  const branch =
    fileName(iso)
      .match(/-(flagship|loaded)\.iso$/i)?.[1]
      ?.toLowerCase() ?? heading;
  if (!EDITIONS[branch]) throw new Error(`${where}: unknown Peppermint OS edition '${branch}'`);
  return branch;
}

/** The base of a release as the page spells it: "Debian trixie"; a rolling base is its own name. */
const releaseBase = (distro: string, codename: string | null) =>
  codename ? `${distro} ${codename}` : `${distro} Linux`;

/** Every image the page's tables offer. */
function parseBuilds(html: string): Build[] {
  const builds: Build[] = [];
  const tables = [...html.matchAll(/<table[\s>][\s\S]*?<\/table>/g)];
  for (const table of tables) {
    const before = html.slice(0, table.index);
    const heading = [...before.matchAll(/<p[^>]*><strong>([^<]+)<\/strong><br\s*\/?>/g)].pop()?.[1];
    const edition = heading
      ?.replace(/^Peppermint OS\s+/i, "")
      .trim()
      .toLowerCase();
    if (!edition || !EDITIONS[edition])
      throw new Error(`the Peppermint OS download page has an unknown edition '${heading ?? ""}'`);
    const rows = [...table[0].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) =>
      [...(r[1] as string).matchAll(/<td>([\s\S]*?)<\/td>/g)].map((c) => c[1] as string),
    );
    // A table holds one column group per base: a header row names the bases of the
    // group, the architecture rows below it fill those columns. The Void base joined
    // the Flagship table as a second group on 2026-11-24.
    let columns: ({ distro: string; codename: string | null } | null)[] = [];
    for (const row of rows) {
      const headers = row.map((cell) => BASE_HEADER.exec(text(cell)));
      if (headers.some(Boolean)) {
        columns = headers.map((m) =>
          m ? { distro: m[1] as string, codename: m[2] ?? null } : null,
        );
        continue;
      }
      const label = text(row[0] ?? "");
      const arch = ARCH[label];
      if (!arch)
        throw new Error(`the Peppermint OS download page has an unknown architecture '${label}'`);
      for (const [i, base] of columns.entries()) {
        if (!base) continue;
        const cell = row[i] ?? "";
        if (!cell.trim() || !anchors(cell).some((a) => SF_FILE.test(a.href))) continue;
        const where = `${base.distro} ${label}`;
        const parsed = parseCell(cell, where);
        builds.push({ ...base, edition: branchOf(parsed.iso, edition, where), arch, cell: parsed });
      }
    }
  }
  if (!builds.length) throw new Error("the Peppermint OS download page offers no image");
  return builds;
}

export default defineSource({
  slug: "peppermint-os",
  hosts: ["sourceforge.net"],
  async releases() {
    const home = await getText(HOME, { accept: "text/html" });
    const page = downloadPage(home);
    const builds = parseBuilds(await getText(page, { accept: "text/html" }));
    const notesUrl = anchors(home).find((a) => /^Release Notes$/i.test(a.text))?.href ?? null;

    const folders = new Map<string, Map<string, SfEntry>>();
    const entryOf = async (path: string): Promise<{ entry: SfEntry; folder: string }> => {
      const folder = path.split("/").slice(0, -1).join("/");
      if (!folders.has(folder))
        folders.set(
          folder,
          new Map((await sourceforgeFolder(PROJECT, folder)).map((e) => [e.name, e])),
        );
      const entry = folders.get(folder)?.get(path.split("/").pop() as string);
      if (entry?.type !== "file")
        throw new Error(`${path} is linked by ${page} but not on the SourceForge files page`);
      return { entry, folder };
    };

    const bases = new Map<string, Build[]>();
    for (const b of builds) {
      const base = releaseBase(b.distro, b.codename);
      bases.set(base, [...(bases.get(base) ?? []), b]);
    }

    const releases: Release[] = [];
    for (const [base, own] of bases) {
      const editions = new Map<string, Edition>();
      let day = "";
      for (const b of own) {
        const { entry, folder } = await entryOf(b.cell.iso);
        if (!entry.date) throw new Error(`SourceForge shows no upload date for ${b.cell.iso}`);
        if (b.cell.checksumFile) await entryOf(b.cell.checksumFile);
        if (b.cell.signatureFile) await entryOf(b.cell.signatureFile);
        if (b.cell.keyFile) await entryOf(b.cell.keyFile);
        const checksum = sourceforgeChecksum(entry, sourceforgeFolderUrl(PROJECT, folder));
        if (!checksum) throw new Error(`SourceForge shows no hash for ${b.cell.iso}`);
        if (entry.date > day) day = entry.date;
        const def = EDITIONS[b.edition] as (typeof EDITIONS)[string];
        const edition = editions.get(b.edition) ?? {
          id: b.edition,
          name: def.name,
          desktop: def.desktop,
          kind: "desktop" as const,
          artifacts: [],
        };
        edition.artifacts.push({
          arch: b.arch,
          format: "iso",
          file: entry.name,
          path: entry.path,
          url: sourceforgeDownloadUrl(PROJECT, entry.path),
          size: null,
          checksum,
          signatureUrl: b.cell.signatureFile
            ? sourceforgeDownloadUrl(PROJECT, b.cell.signatureFile)
            : null,
          torrentUrl: null,
        });
        editions.set(b.edition, edition);
      }
      releases.push({
        version: day,
        channel: "stable",
        codename: base,
        releaseDate: day,
        eol: null,
        notesUrl,
        editions: [...editions.values()],
      });
    }
    releases.sort((a, b) => compareVersions(b.version, a.version));
    return { sources: [page, sourceforgeFolderUrl(PROJECT, "isos/XFCE")], releases };
  },
  async mirrors() {
    return {
      sources: [sourceforgeFolderUrl(PROJECT)],
      mirrors: [originAsMirror(sourceforgeRoot(PROJECT), "SourceForge", null)],
    };
  },
});
