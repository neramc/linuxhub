/**
 * Puppy Linux.
 *
 * Puppy is a family of builds, not one distro, and its official download page
 * is a hand-made table, so this module is a reader of that table plus the
 * places the table points at.
 *
 * Official sources, and what each one is used for:
 * - forum.puppylinux.com/puppy-linux-collection ("Puppy Linux Distro
 *   Collection", the page the Puppy site's Download button opens): the list
 *   of builds, grouped under Debian, Ubuntu, Slackware and Void bases. Each
 *   row gives the base version ("13 - Trixie"), the build's name and bits, a
 *   download location and a forum thread (release announcement, used as the
 *   release's notes link). The ISO names the page prints are stale (it says
 *   TrixiePup64-Wayland-2510.iso while the folder holds ...-2606-261003.iso),
 *   so they are only used for the build's file-name prefix.
 * - sourceforge.net/projects/pb-gh-releases/files/<Folder>/ (the project the
 *   official GitHub builds are transferred to; its files pages are
 *   robots-allowed): per build, the dated ISOs (<Pup>-<version>-<YYMMDD>.iso,
 *   the last three monthly rebuilds), their upload days and the hashes
 *   SourceForge computed. The newest ISO is the current one. The project also
 *   publishes SHA512checksums.txt in each folder (the sync requires it to be
 *   listed), but it can only be read through SourceForge's download redirector,
 *   whose hosts disallow all bots, so the checksum is the strongest hash the
 *   files page shows (SHA-256) and `checksum.url` is that page (the same
 *   treatment as every SourceForge-hosted distro). Sizes are not published
 *   exactly there: null (run.ts fills them).
 * - distro.ibiblio.org/puppylinux/ (the origin of the older tree: Puppy's
 *   landing pages and BookwormPup64): its robots.txt cannot be read from the
 *   environment this module was built in (TLS error on the host), which the
 *   polite client treats as closed. Deviation: the same tree is read from
 *   ftp.nluug.nl/os/Linux/distr/puppylinux/, an official mirror that the Puppy
 *   home page names ("mirrored by several sites"). URLs and `checksum.url`
 *   point at the origin's address of the same path. A landing page (e.g.
 *   ResolutePup64.html) is a redirect page; a redirect to the project's
 *   SourceForge folder makes the row a SourceForge build, any other target
 *   makes it unreadable (below). BookwormPup64 lives in the tree itself: its
 *   newest numbered folder (10.0.12/) holds the ISO and `<iso>-checksum.txt`
 *   (SHA-256).
 * - puppylinux-woof-ce.github.io (home page, "Download Sites"): the official
 *   mirror list of that tree.
 *
 * Shape. Puppy has no single version line, so a release is a base as the page
 * groups it: version = the base version of the row ("13", "12", "26.04",
 * "24.04", "15.0"; Void has none and uses the build version, "22.02", channel
 * rolling), codename = the row's codename when it has one ("Trixie"), editions =
 * the builds of that base (id and name from the page's build name,
 * "TrixiePup64 Wayland"), one ISO each (64-bit x86_64, 32-bit i686). Releases
 * keep the page's order, so the first build on the page (TrixiePup64 Wayland)
 * is the default. The release date is the newest ISO's day. Puppy announces no
 * end of support: eol null. A build the page no longer lists disappears.
 *
 * Exclusions, for the same reasons as everywhere or because they cannot be
 * read (each is named here and any other unreadable row throws):
 * - "Vanilla Dpup 10.0" (64 and 32 bit): linked to GitHub releases of another
 *   project (vanilla-dpup/releases); api.github.com and github.com answer 403
 *   for that repository in the environment this was built in, so its files,
 *   sizes and checksums could not be verified.
 * - "F96-CE": its landing page redirects to a mega.nz folder (a JavaScript
 *   application, no files to read).
 * - Devx and kernel-source SFS files, "Legacy Versions" (the forum's legacy
 *   board, not on the page's table) and the SourceForge folders the page does
 *   not link (BookwormPup64-ghtest, the *_EOL folders).
 *
 * Mirrors: the HTTPS entries of the home page's list (ibiblio's own entry is
 * published as http://, upgraded because the collection page links it as
 * https://; UoC, AARNet and Internode are published as http:// only). They
 * carry the ibiblio tree, so only BookwormPup64 (path set) is mirrored; the
 * SourceForge builds are downloaded from SourceForge's own redirector (path
 * null). Countries are not stated by the list except "USA" for UMBC: set from
 * the operators (ibiblio: UNC Chapel Hill, US; NLUUG/SURF: NL).
 */
import type { Artifact, Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import { getText } from "../http";
import { parseChecksums } from "../lib/checksums";
import { withSlash } from "../lib/mirrors";
import { sourceforgeChecksum, sourceforgeDownloadUrl } from "../lib/mxiso";
import { type SfEntry, sourceforgeFolder, sourceforgeFolderUrl } from "../lib/sourceforge";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const COLLECTION = "https://forum.puppylinux.com/puppy-linux-collection";
const HOME = "https://puppylinux-woof-ce.github.io/";
const PROJECT = "pb-gh-releases";
const IBIBLIO = "https://distro.ibiblio.org/puppylinux/";
/** Official mirror of the ibiblio tree that the home page names; read in place of the origin. */
const NLUUG = "https://ftp.nluug.nl/os/Linux/distr/puppylinux/";

/** Rows of the page that are known not to be readable, with the reason. Any other unreadable row throws. */
const UNREADABLE: Record<string, string> = {
  "Vanilla Dpup 10.0": "GitHub releases of vanilla-dpup/releases cannot be read",
  "F96-CE": "its download is a mega.nz folder",
};

const COUNTRY: Record<string, string> = {
  "distro.ibiblio.org": "US",
  "ftp.nluug.nl": "NL",
  "mirror.lug.umbc.edu": "US",
};

const SF_FOLDER = new RegExp(`^https://sourceforge\\.net/projects/${PROJECT}/files/([^/]+)/$`);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Row {
  base: string;
  rolling: boolean;
  baseVersion: string | null;
  codename: string | null;
  /** "TrixiePup64_Wayland" */
  name: string;
  bits: number;
  link: string;
  /** The ISO name the page prints, only used for the file-name prefix. */
  isoName: string | null;
  forum: string | null;
}

/** The builds of the page's table, in its order. */
function parseCollection(html: string): Row[] {
  const start = html.indexOf("<tbody>");
  const end = html.indexOf("</tbody>", start);
  if (start < 0 || end < 0) throw new Error(`no download table on ${COLLECTION}`);
  const rows: Row[] = [];
  let base: { name: string; rolling: boolean } | null = null;
  for (const tr of html
    .slice(start, end)
    .split(/<tr[\s>]/i)
    .slice(1)) {
    const cells = tr
      .split(/<td[^>]*>/i)
      .slice(1)
      .map((c) => c.replace(/<\/t[dr]>/gi, ""));
    const first = text(cells[0] ?? "");
    if (!first || first === "Distro") continue;
    if (/bgcolor=lightblue/i.test(tr)) {
      const m = first.match(/^(.+?) base\b(.*)$/i);
      if (!m?.[1]) throw new Error(`unreadable base heading "${first}" on ${COLLECTION}`);
      base = { name: m[1], rolling: /rolling/i.test(m[2] ?? "") };
      continue;
    }
    const m = first.match(/^(?:(\d[\d.]*) - )?(?:([A-Za-z]+) - )?(.+?) \((\d+) ?-?bit/);
    if (!base || !m?.[3] || !m[4]) throw new Error(`unreadable row "${first}" on ${COLLECTION}`);
    const anchors = [...(cells[1] ?? "").matchAll(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    const link = anchors[0]?.[1];
    if (!link) throw new Error(`"${first}" has no download link on ${COLLECTION}`);
    rows.push({
      base: base.name,
      rolling: base.rolling,
      baseVersion: m[1] ?? null,
      codename: m[2] ?? null,
      name: m[3],
      bits: Number(m[4]),
      link,
      isoName: text(anchors[0]?.[2] ?? "").match(/^(\S+\.iso)\b/)?.[1] ?? null,
      forum:
        (cells[4] ?? "").match(/href="(https:\/\/forum\.puppylinux\.com\/[^"]+)"/)?.[1] ?? null,
    });
  }
  if (!rows.length) throw new Error(`no builds in the table on ${COLLECTION}`);
  return rows;
}

/** "TrixiePup64-Wayland-2510.iso" → "TrixiePup64-Wayland"; "BookwormPup32_23.12.iso" → "BookwormPup32". */
const prefixOf = (iso: string) => iso.replace(/\.iso$/, "").replace(/[-_]\d[\d.]*$/, "");

/** Where a redirect page (meta refresh or location.href) sends the visitor. */
const redirectOf = (html: string) =>
  html.match(/(?:url=|location\.href=')(https?:\/\/[^'"\s>]+)/i)?.[1] ?? null;

interface TreeEntry {
  name: string;
  date: string | null;
}

/** The entries of an autoindex page of the tree (folders end with "/"), with their day. */
function parseTree(html: string): TreeEntry[] {
  return [
    ...html.matchAll(
      /<td class="link"><a href="([^"]+)"[^>]*>[^<]*<\/a><\/td><td class="size">[^<]*<\/td><td class="date">([^<]*)<\/td>/g,
    ),
  ].map((m) => {
    const d = (m[2] ?? "").match(/^(\d{4})-([A-Za-z]{3})-(\d{2})/);
    const month = d ? MONTHS.indexOf(d[2] ?? "") : -1;
    return {
      name: decodeURIComponent(m[1] ?? ""),
      date: d && month >= 0 ? `${d[1]}-${String(month + 1).padStart(2, "0")}-${d[3]}` : null,
    };
  });
}

interface Build {
  /** Puppy's own version token in the file name ("2606", "26.04"). */
  version: string;
  day: string;
  artifact: Artifact;
}

/** The newest ISO of a SourceForge build folder. */
async function sourceforgeBuild(
  folder: string,
  prefix: string,
  arch: Artifact["arch"],
): Promise<Build> {
  const entries = await sourceforgeFolder(PROJECT, folder);
  if (!entries.some((e) => e.type === "file" && e.name === "SHA512checksums.txt"))
    throw new Error(`${sourceforgeFolderUrl(PROJECT, folder)} lists no SHA512checksums.txt`);
  const pattern = new RegExp(`^${reEscape(prefix)}-(\\d[\\d.]*)-(\\d{6})\\.iso$`);
  const isos = entries
    .filter((e): e is SfEntry => e.type === "file" && pattern.test(e.name))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.name.localeCompare(a.name));
  const iso = isos[0];
  const version = iso ? pattern.exec(iso.name)?.[1] : undefined;
  if (!iso || !version)
    throw new Error(`no ${prefix} ISO in ${sourceforgeFolderUrl(PROJECT, folder)}`);
  if (!iso.date) throw new Error(`SourceForge shows no upload day for ${iso.name}`);
  const checksum = sourceforgeChecksum(iso, sourceforgeFolderUrl(PROJECT, folder));
  if (!checksum) throw new Error(`SourceForge shows no hash for ${iso.name}`);
  return {
    version,
    day: iso.date,
    artifact: {
      arch,
      format: "iso",
      file: iso.name,
      path: null,
      url: sourceforgeDownloadUrl(PROJECT, iso.path),
      size: null,
      checksum,
      signatureUrl: null,
      torrentUrl: null,
    },
  };
}

/** The newest numbered folder of a build in the ibiblio tree (read from the NLUUG mirror). */
async function treeBuild(dir: string, prefix: string, arch: Artifact["arch"]): Promise<Build> {
  const root = `${NLUUG}${dir}`;
  const versions = parseTree(await getText(root, { accept: "text/html" }))
    .map((e) => e.name)
    .filter((n) => /^\d+(\.\d+)+\/$/.test(n))
    .sort((a, b) => compareVersions(b, a));
  const latest = versions[0];
  if (!latest) throw new Error(`no numbered folder in ${root}`);
  const entries = parseTree(await getText(`${root}${latest}`, { accept: "text/html" }));
  const pattern = new RegExp(`^${reEscape(prefix)}_(\\d[\\d.]*)\\.iso$`);
  const iso = entries.find((e) => pattern.test(e.name));
  const version = iso ? pattern.exec(iso.name)?.[1] : undefined;
  if (!iso || !version || !iso.date) throw new Error(`no ${prefix} ISO in ${root}${latest}`);
  const sumName = `${iso.name}-checksum.txt`;
  if (!entries.some((e) => e.name === sumName))
    throw new Error(`${root}${latest} lists no ${sumName}`);
  const value = parseChecksums(await getText(`${root}${latest}${sumName}`)).get(iso.name);
  if (!value || ![32, 40, 64, 128].includes(value.length))
    throw new Error(`${root}${latest}${sumName} does not list ${iso.name}`);
  const path = `${dir}${latest}${iso.name}`;
  return {
    version,
    day: iso.date,
    artifact: {
      arch,
      format: "iso",
      file: iso.name,
      path,
      url: `${IBIBLIO}${path}`,
      size: null,
      checksum: {
        type:
          value.length === 128
            ? "sha512"
            : value.length === 64
              ? "sha256"
              : value.length === 40
                ? "sha1"
                : "md5",
        value,
        url: `${IBIBLIO}${dir}${latest}${sumName}`,
      },
      signatureUrl: null,
      torrentUrl: null,
    },
  };
}

/** What a row's download link leads to. */
type Place =
  | { kind: "sourceforge"; folder: string }
  | { kind: "tree"; dir: string }
  | { kind: "unreadable"; why: string };

async function placeOf(row: Row): Promise<Place> {
  const sf = SF_FOLDER.exec(row.link)?.[1];
  if (sf) return { kind: "sourceforge", folder: sf };
  if (row.link.startsWith(IBIBLIO)) {
    const rel = row.link.slice(IBIBLIO.length);
    if (rel.endsWith("/")) return { kind: "tree", dir: rel };
    // A landing page: a redirect to where the build really is.
    const target = redirectOf(await getText(`${NLUUG}${rel}`, { accept: "text/html" }));
    const folder = target ? SF_FOLDER.exec(target)?.[1] : undefined;
    if (folder) return { kind: "sourceforge", folder };
    return { kind: "unreadable", why: `its landing page leads to ${target ?? "nowhere"}` };
  }
  return { kind: "unreadable", why: `it is linked to ${new URL(row.link).host}` };
}

interface Group {
  version: string;
  codename: string | null;
  channel: Release["channel"];
  day: string;
  notes: string | null;
  editions: Edition[];
}

export default defineSource({
  slug: "puppy-linux",
  hosts: ["sourceforge.net", "distro.ibiblio.org"],
  async releases(ctx) {
    const rows = parseCollection(await getText(COLLECTION, { accept: "text/html" }));
    const groups = new Map<string, Group>();
    const folders = new Set<string>();
    for (const row of rows) {
      const place = await placeOf(row);
      if (place.kind === "unreadable") {
        if (!UNREADABLE[row.name])
          throw new Error(`${COLLECTION} offers ${row.name}, which cannot be read: ${place.why}`);
        ctx.log(`${row.name}: skipped (${UNREADABLE[row.name]})`);
        continue;
      }
      if (!row.isoName) throw new Error(`${row.name} names no ISO on ${COLLECTION}`);
      const arch: Artifact["arch"] | undefined = { 64: "x86_64", 32: "i686" }[row.bits] as
        | Artifact["arch"]
        | undefined;
      if (!arch) throw new Error(`${row.name} is ${row.bits}-bit on ${COLLECTION}`);
      const prefix = prefixOf(row.isoName);
      const build =
        place.kind === "sourceforge"
          ? await sourceforgeBuild(place.folder, prefix, arch)
          : await treeBuild(place.dir, prefix, arch);
      if (place.kind === "sourceforge") folders.add(place.folder);

      const version = row.baseVersion ?? build.version;
      const key = `${row.base} ${version}`;
      const group = groups.get(key) ?? {
        version,
        codename: row.codename,
        channel: row.rolling ? "rolling" : "stable",
        day: build.day,
        notes: row.forum,
        editions: [],
      };
      const id = row.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      group.editions.push({
        id,
        name: row.name.replace(/_/g, " "),
        desktop: /retro/i.test(row.name) ? "jwm" : null,
        kind: "live",
        artifacts: [build.artifact],
      });
      if (build.day > group.day) group.day = build.day;
      groups.set(key, group);
    }
    if (!groups.size) throw new Error(`no readable build on ${COLLECTION}`);

    const releases: Release[] = [...groups.values()].map((g) => ({
      version: g.version,
      channel: g.channel,
      codename: g.codename,
      releaseDate: g.day,
      eol: null,
      notesUrl: g.notes,
      editions: g.editions,
    }));
    return {
      sources: [
        COLLECTION,
        ...[...folders].sort().map((f) => sourceforgeFolderUrl(PROJECT, f)),
        NLUUG,
      ],
      releases,
    };
  },
  async mirrors() {
    const home = await getText(HOME, { accept: "text/html" });
    const at = home.indexOf('id="download-sites"');
    if (at < 0) throw new Error(`no "Download Sites" section on ${HOME}`);
    const stop = home.indexOf("Mirrors may take up to a day", at);
    const section = home.slice(at, stop < 0 ? undefined : stop);
    const mirrors: Mirror[] = [];
    for (const m of section.matchAll(/<a href="(https?:\/\/[^"]*puppylinux\/?)">([^<]+)<\/a>/g)) {
      const url = new URL(m[1] as string);
      // ibiblio is published as http:// here, https:// on the collection page.
      if (url.protocol !== "https:" && url.host !== "distro.ibiblio.org") continue;
      url.protocol = "https:";
      mirrors.push({
        url: withSlash(url.href),
        country: COUNTRY[url.host] ?? null,
        name: text(m[2] as string),
        lat: null,
        lon: null,
        score: null,
      });
    }
    if (!mirrors.length) throw new Error(`no mirror in the "Download Sites" list on ${HOME}`);
    return { sources: [HOME], mirrors };
  },
});
