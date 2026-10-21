/**
 * antiX: every maintained line (26 "Stephen Kapos", 23 "Arditi del Popolo") with
 * its newest release, each flavour in 64-bit and 32-bit.
 *
 * Official sources, and what each one is used for:
 * - antixlinux.com/download/ (the download page): the current release ("antiX-26.1
 *   - Released 29 September 2026"), the images it offers (Full and Core, 64 and
 *   32 bit, each linked to SourceForge), the md5/sha256 it publishes and the
 *   official mirror list (the "Manual Download links" section). The page must
 *   link exactly the images the file tree holds, with the sha256 it prints;
 *   anything else throws.
 * - rsync-mxlinux.org/ANTIX/Final/: the project's master copy of the ISO tree
 *   (the mirror network rsyncs from it; the same server serves MX Linux).
 *   <release>/ holds each image with its `<file>.sha256` (the official
 *   checksum, `checksum.url`), `.sig` (detached signature) and `.zsync`;
 *   `path` = ANTIX/Final/<release>/[<set>/]<file> is the file below every
 *   mirror root. Its sha256 must equal the page's and SourceForge's.
 * - sourceforge.net/projects/antix-linux/files/Final/ (the project's own
 *   SourceForge, robots.txt allows the files pages): the headline download,
 *   `url` is the /download link the page uses. SourceForge's own SHA-256 of each
 *   file is cross-checked; a file missing there throws.
 * - l2.mxrepo.com/torrents/: the torrent files of the current images.
 * - endoflife.date: which series are maintained, their codename and EOL, and the
 *   release date of an older series' newest release when its README names none.
 *   `notesUrl` is endoflife.date's link to the series' official announcement.
 *
 * Releases: the page's release (26.1), plus the newest release of every other
 * maintained series that the master tree keeps (23.2, EOL 2028-06-30). antiX
 * 23.2 comes as two sets built from one tree: the sysVinit images (README.txt)
 * and the runit images (runit-antiX-23.2/README2.txt), each in Full, Base,
 * Core and Net; they are separate editions ("Full (sysVinit)", "Full (runit)").
 * antiX 26 ships all inits in one image, so its editions carry no init name.
 *
 * Excluded: the init-diversity respin by a community member (announced on the
 * site, not part of the tree), SourceForge Testing/, superseded releases of a
 * series (antiX-26 once 26.1 exists), unmaintained series, .md5/.zsync files.
 * The release date is the page's (26.1) or the release README's ("antiX-23.2
 * release with sysVinit 06 October 2024"), parsed in UTC.
 *
 * Mirrors: the https entries of the page's list (on 2026-10-21, 75 of its 115
 * entries are published as http only and are not listed), mirror root = the entry's URL
 * before "ANTIX/Final/"; country is the entry's first words ("Canada - UBC").
 * When one root is listed twice (mirror.us.oneandone.net), the first entry wins.
 * SourceForge is the page's "Any/CDN" entry: it is the official link of each
 * artifact, not a mirror root.
 *
 * Sizes are not published (the index rounds them): left null for run.ts.
 */

import type { Artifact, Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getText } from "../http";
import { type Cycle, endOfLife } from "../lib/endoflife";
import { countryCode } from "../lib/mirrors";
import {
  MX_ISO_MASTER,
  masterFolder,
  masterSha256,
  mirrorRoot,
  sourceforgeDownloadUrl,
  torrentUrls,
} from "../lib/mxiso";
import { type SfEntry, sourceforgeFolder, sourceforgeFolderUrl } from "../lib/sourceforge";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const PROJECT = "antix-linux";
const PAGE = "https://antixlinux.com/download/";
const TREE = "ANTIX/Final/";

const FLAVOURS: { id: string; name: string; desktop: Desktop; kind: Edition["kind"] }[] = [
  { id: "full", name: "Full", desktop: "icewm", kind: "desktop" },
  { id: "base", name: "Base", desktop: "icewm", kind: "minimal" },
  { id: "core", name: "Core", desktop: "none", kind: "minimal" },
  { id: "net", name: "Net", desktop: "none", kind: "netinst" },
];
const INITS = { sysvinit: "sysVinit", runit: "runit" } as const;
const ARCH_ORDER: Artifact["arch"][] = ["x86_64", "i686"];

/** antiX-26.1_x64-full.iso, antiX-23.2-net_386-net.iso, antiX-23.2-runit-net_x64-net.iso */
const ISO = /^antiX-(\d+(?:\.\d+)*)(-runit)?(-net)?_(x64|386)-(full|base|core|net)\.iso$/;

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** "29 September 2026" / "06 October 2024" → ISO day (UTC); null when there is none. */
function longDate(text: string): string | null {
  const m = text.match(/\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/);
  const month = MONTHS.indexOf((m?.[2] ?? "").toLowerCase());
  if (!m || month < 0) return null;
  return new Date(Date.UTC(Number(m[3]), month, Number(m[1]))).toISOString().slice(0, 10);
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8217;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

interface PageRelease {
  version: string;
  date: string;
  /** File name → the sha256 the page prints. */
  sha256: Map<string, string>;
  /** File names the page links to SourceForge. */
  offered: Set<string>;
}

/** The download page's release; throws when its structure is not recognised. */
function parsePage(html: string): PageRelease {
  const head = html.match(/antiX-(\d+(?:\.\d+)*)\s*-\s*Released\s+([^<]+)</);
  const date = head?.[2] ? longDate(head[2]) : null;
  if (!head?.[1] || !date) throw new Error("the antiX download page no longer names a release");
  const version = head[1];
  const base = `https://sourceforge.net/projects/${PROJECT}/files/Final/antiX-${version}/`;
  const offered = new Set<string>();
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const href = m[1] ?? "";
    if (href.startsWith(base) && href.endsWith("/download"))
      offered.add(href.slice(base.length, -"/download".length));
  }
  const sha256 = new Map<string, string>();
  const block = html.match(/sha256:\s*([\s\S]*?)<\/pre>/)?.[1] ?? "";
  for (const line of block.split(/\r?\n/)) {
    const m = line.trim().match(/^([0-9a-f]{64})\s+(\S+)$/);
    if (m?.[1] && m[2]) sha256.set(m[2], m[1]);
  }
  if (!offered.size || !sha256.size)
    throw new Error(`the antiX download page lists no ${version} images or sha256 sums`);
  return { version, date, sha256, offered };
}

interface Image {
  file: string;
  /** Path below the master / SourceForge tree: ANTIX/Final/<this>. */
  rel: string;
  init: keyof typeof INITS | null;
  flavour: (typeof FLAVOURS)[number];
  arch: Artifact["arch"];
  sf: SfEntry;
  /** Names in the image's master folder (to find its .sha256 and .sig). */
  names: Set<string>;
}

/** Folder of a release in the master tree, with the runit set's subfolder when it has one. */
async function releaseImages(
  version: string,
): Promise<{ images: Image[]; twoSets: boolean; readme: boolean }> {
  const folder = `antiX-${version}`;
  const top = await masterFolder(`${TREE}${folder}`);
  const runitDir = top.find((n) => n.endsWith("/") && n.startsWith("runit-"))?.slice(0, -1);
  const places = [
    { dir: folder, names: top, init: runitDir ? ("sysvinit" as const) : null },
    ...(runitDir
      ? [
          {
            dir: `${folder}/${runitDir}`,
            names: await masterFolder(`${TREE}${folder}/${runitDir}`),
            init: "runit" as const,
          },
        ]
      : []),
  ];
  const images: Image[] = [];
  for (const place of places) {
    const sfEntries = await sourceforgeFolder(PROJECT, `Final/${place.dir}`);
    const sf = new Map(sfEntries.map((e) => [e.name, e]));
    for (const file of place.names.filter((n) => n.endsWith(".iso"))) {
      const m = ISO.exec(file);
      const flavour = FLAVOURS.find((f) => f.id === m?.[5]);
      const runit = Boolean(m?.[2]);
      if (!m || !flavour || m[1] !== version || Boolean(m[3]) !== (flavour.id === "net"))
        throw new Error(`unexpected image ${file} in the antiX ${version} release folder`);
      if (runit !== (place.init === "runit"))
        throw new Error(`${file} is in the wrong antiX ${version} folder`);
      const entry = sf.get(file);
      if (!entry) throw new Error(`${file} is on ${MX_ISO_MASTER} but not on SourceForge`);
      images.push({
        file,
        rel: `${place.dir}/${file}`,
        init: place.init,
        flavour,
        arch: m[4] === "x64" ? "x86_64" : "i686",
        sf: entry,
        names: new Set(place.names),
      });
    }
  }
  return { images, twoSets: Boolean(runitDir), readme: top.includes("README.txt") };
}

/** The newest release folder of a series in the master tree. */
function newestFolder(folders: string[], series: string): string | undefined {
  const versions: string[] = [];
  for (const f of folders) {
    const v = f.match(/^antiX-(\d+(?:\.\d+)*)\/$/)?.[1];
    if (v && (v === series || v.startsWith(`${series}.`))) versions.push(v);
  }
  return versions.sort((a, b) => compareVersions(b, a))[0];
}

async function artifactOf(
  image: Image,
  torrents: Map<string, string>,
  page: PageRelease | null,
): Promise<Artifact> {
  const path = `${TREE}${image.rel}`;
  if (!image.names.has(`${image.file}.sha256`))
    throw new Error(`no ${image.file}.sha256 on ${MX_ISO_MASTER}`);
  const sha = await masterSha256(path);
  const others: [string, string | null | undefined][] = [
    ["SourceForge", image.sf.sha256],
    ["the download page", page?.sha256.get(image.file)],
  ];
  for (const [who, value] of others)
    if (value && value !== sha)
      throw new Error(`${who} and ${MX_ISO_MASTER} disagree on ${image.file}`);
  if (page && !page.sha256.has(image.file))
    throw new Error(`the antiX download page prints no sha256 for ${image.file}`);
  return {
    arch: image.arch,
    format: "iso",
    file: image.file,
    path,
    url: sourceforgeDownloadUrl(PROJECT, `Final/${image.rel}`),
    size: null,
    checksum: { type: "sha256", value: sha, url: `${MX_ISO_MASTER}${path}.sha256` },
    signatureUrl: image.names.has(`${image.file}.sig`) ? `${MX_ISO_MASTER}${path}.sig` : null,
    torrentUrl: torrents.get(image.file) ?? null,
  };
}

async function editionsOf(
  images: Image[],
  twoSets: boolean,
  torrents: Map<string, string>,
  page: PageRelease | null,
): Promise<Edition[]> {
  const editions: Edition[] = [];
  for (const flavour of FLAVOURS) {
    for (const init of twoSets ? (["sysvinit", "runit"] as const) : [null]) {
      const own = images
        .filter((i) => i.flavour === flavour && i.init === init)
        .sort((a, b) => ARCH_ORDER.indexOf(a.arch) - ARCH_ORDER.indexOf(b.arch));
      if (!own.length) continue;
      const artifacts: Artifact[] = [];
      for (const image of own) artifacts.push(await artifactOf(image, torrents, page));
      editions.push({
        id: init ? `${flavour.id}-${init}` : flavour.id,
        name: init ? `${flavour.name} (${INITS[init]})` : flavour.name,
        desktop: flavour.desktop,
        kind: flavour.kind,
        artifacts,
      });
    }
  }
  return editions;
}

/** The https entries of the download page's mirror list. */
function parseMirrors(html: string): Mirror[] {
  const start = html.indexOf("Manual Download links");
  const end = html.indexOf("Many thanks to all our mirrors");
  if (start < 0 || end < start) throw new Error("the antiX download page lost its mirror list");
  const mirrors = new Map<string, Mirror>();
  let entries = 0;
  for (const m of html
    .slice(start, end)
    .matchAll(/<a class="external text" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    entries++;
    const href = decode(m[1] ?? "");
    if (!href.startsWith("https://") || new URL(href).hostname.endsWith("sourceforge.net"))
      continue;
    const root = mirrorRoot(href, TREE);
    if (!root || mirrors.has(root)) continue;
    mirrors.set(root, {
      url: root,
      country: countryCode(decode(m[2] ?? "").split(" - ")[0]),
      name: new URL(root).hostname,
      lat: null,
      lon: null,
      score: null,
    });
  }
  if (!entries || !mirrors.size) throw new Error("the antiX download page lists no https mirror");
  return [...mirrors.values()];
}

export default defineSource({
  slug: "antix",
  hosts: ["sourceforge.net", "rsync-mxlinux.org", "mxrepo.com"],
  async releases(ctx) {
    const page = parsePage(await getText(PAGE, { accept: "text/html" }));
    const eol = await endOfLife("antix");
    const series = new Map<string, Cycle | undefined>(
      eol.cycles
        .filter(
          (c) =>
            /^\d+$/.test(c.name) &&
            (!c.eol || c.eol >= ctx.today) &&
            (c.releaseDate ?? "") <= ctx.today,
        )
        .map((c) => [c.name, c]),
    );
    const pageSeries = page.version.split(".")[0] as string;
    if (!series.has(pageSeries)) series.set(pageSeries, undefined);

    const folders = await masterFolder(TREE.replace(/\/$/, ""));
    const torrents = await torrentUrls();
    const releases: Release[] = [];
    for (const name of [...series.keys()].sort((a, b) => compareVersions(b, a))) {
      const cycle = series.get(name);
      const version = newestFolder(folders, name);
      if (!version)
        throw new Error(
          `antiX series ${name} is maintained but ${MX_ISO_MASTER}${TREE} has no ${name}.x`,
        );
      const current = name === pageSeries;
      if (current && version !== page.version)
        throw new Error(
          `the antiX download page offers ${page.version} but the tree's newest is ${version}`,
        );

      const found = await releaseImages(version);
      let images = found.images;
      let date: string | null;
      if (current) {
        // The page offers exactly these files; others in the folder are not offered.
        for (const file of page.offered)
          if (!images.some((i) => i.file === file))
            throw new Error(`the antiX download page offers ${file} which the tree lacks`);
        images = images.filter((i) => page.offered.has(i.file));
        date = page.date;
      } else {
        const readme = found.readme
          ? await getText(`${MX_ISO_MASTER}${TREE}antiX-${version}/README.txt`)
          : "";
        date =
          longDate(readme.split(/\r?\n/)[0] ?? "") ??
          (cycle?.latest === version ? cycle.latestDate : null);
      }
      releases.push({
        version,
        channel: "stable",
        codename: cycle?.codename ?? null,
        releaseDate: date,
        eol: cycle?.eol ?? null,
        notesUrl: cycle?.link ?? null,
        editions: await editionsOf(images, found.twoSets, torrents, current ? page : null),
      });
    }
    return {
      sources: [
        PAGE,
        sourceforgeFolderUrl(PROJECT, "Final"),
        `${MX_ISO_MASTER}${TREE}`,
        eol.url,
        "https://l2.mxrepo.com/torrents/",
      ],
      releases,
    };
  },
  async mirrors() {
    return { sources: [PAGE], mirrors: parseMirrors(await getText(PAGE, { accept: "text/html" })) };
  },
});
