/**
 * openSUSE: Tumbleweed (rolling) and the supported Leap releases.
 *
 * Official sources, and what each one is used for:
 * - get.opensuse.org/api/v0/distributions.json: the project's own list of
 *   Leap releases with their state (Stable / RC / EOL). It decides which Leap
 *   lines exist and which one is a numbered pre-release.
 * - get.opensuse.org/leap/<version>/ and get.opensuse.org/tumbleweed/: the
 *   official download pages. They are the source of truth for what is offered
 *   (every architecture, installer, Minimal Virtual Machine, Live, OEM and
 *   Immutable image), so editions are read from the page's own rows (heading
 *   group + label + architecture), never from a hard-coded table. Each row
 *   links the image on download.opensuse.org (openSUSE's MirrorCache
 *   redirector, which sends each visitor to a nearby mirror), its checksum, the
 *   detached signature and, for some installers, a torrent. The modal
 *   "Alternative Downloads" repeats rows that are already on the page; rows are
 *   de-duplicated by URL and the modal is not read. Leap 15.6 has a page but no
 *   download section (it is past its end of life), so it is not offered.
 * - download.opensuse.org/<dir>/?jsontable: MirrorCache's JSON directory
 *   listing, the only place that publishes exact byte sizes. A failing listing
 *   leaves sizes null (run.ts then asks the server).
 * - The per-image checksum file (<image>.sha256 or .sha512, the strongest the
 *   page links): origin host, checksum.url. Its content must name the image;
 *   otherwise the sync throws. The signature is the .asc the page links for it
 *   (a signature of the checksum file, as everywhere else).
 * - endoflife.date/opensuse: release date and end of life of the Leap lines.
 *   openSUSE publishes no machine-readable lifecycle (en.opensuse.org/Lifetime
 *   refuses bots), so this is the only source for those dates.
 * - mirrors.opensuse.org: the official "Mirrors Report" that MirrorCache
 *   generates from the master server's database every 30 minutes.
 *
 * Releases: Tumbleweed as the one rolling snapshot the download page offers
 * (its "-Current.iso" links; the version and date are the snapshot stamp of
 * the x86_64 images, because the other architectures' snapshots lag or lead
 * by days), every Leap line that is not past its end of life (today only
 * 16.0), and the numbered pre-release (Leap 16.1 RC, channel beta) because the
 * get.opensuse.org front page links it and its images are on
 * download.opensuse.org. Not read: Leap Micro and MicroOS, which the front
 * page also offers: they are separate products with their own version streams
 * (the same reason Fedora CoreOS is not part of Fedora's list).
 *
 * Tumbleweed "Current" images: the download page links
 * openSUSE-Tumbleweed-<medium>-<arch>-Current.iso, and the checksum file the
 * redirector serves for it names the snapshot image (…-Snapshot20261020-Media.iso).
 * `url` is the page's Current link (it never goes stale), `file` is the
 * snapshot name (what the redirector delivers and what the checksum names), and
 * `path` keeps the Current alias so mirror entries do not flap with every new
 * snapshot.
 *
 * Mirror paths: set only for the installer and live ISOs that sit in a tree
 * the mirror report covers or directly beside it: Tumbleweed's tumbleweed/iso/
 * (the report's `iso` flag) and Leap's distribution/leap/<version>/offline/
 * (beside the flagged installer/iso). Not set for the appliances/ images (VM,
 * OEM, Raspberry Pi, Immutable): the report does not track them and mirrors
 * leave them out (checked 2026-10-28: of the 20 listed mirrors that robots.txt
 * lets a HEAD through, 3 refused the Tumbleweed appliance and one lacked both
 * appliances and offline/), nor for the ports/ trees (aarch64, i586, ppc,
 * zsystems) and the Leap RC, which the report does not list either. Those are
 * served by the redirector only, which sends each visitor to a mirror that has
 * the file.
 *
 * Excluded for every distro alike: formats the data model does not hold
 * (Hyper-V .vhdx.xz, VMware .vmdk and .ova). Everything else on the page is
 * kept, including the Minimal Virtual Machine, Live, OEM and Immutable images.
 * One page bug is worked around: the Tumbleweed KDE OEM raw image's
 * Checksum/Signature links point at the Leap 16.0 file; its checksum is read
 * from the conventional <image>.sha256 next to it (its content is verified to
 * name the image) and its signature is the <image>.sha256.asc beside it,
 * taken only when that file is a PGP signature block.
 * A row whose image answers 404 (the Leap 16.1 RC page links two images that
 * are not on the server) is skipped and logged; if more than half of a page's
 * images are missing the sync throws.
 *
 * Mirrors: the report's HTTPS entries that carry the `iso` tree of Tumbleweed
 * and of every Leap line listed (the list's own flag, entries it rates
 * "outdated" excluded). Deviation: the mirror list is per distro, so a mirror
 * that carries only Leap (for example Kakao and JAIST) or only Tumbleweed is
 * left out rather than listed for files it does not have. Country from the
 * report; the report has no coordinates or scores. run.ts then checks each
 * mirror for the newest release's file (a Tumbleweed ISO). The report's Leap
 * `iso` flag is the Agama installer tree, not offline/, so a listed mirror can
 * still lack a Leap image (one of 20 probed did).
 */

import type { Artifact, Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getJson, getText, HttpError } from "../http";
import { parseChecksums } from "../lib/checksums";
import { type Cycle, endOfLife } from "../lib/endoflife";
import { countryCode, mapLimit, withSlash } from "../lib/mirrors";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const GET = "https://get.opensuse.org/";
const DOWNLOAD = "https://download.opensuse.org/";
const DISTRIBUTIONS = `${GET}api/v0/distributions.json`;
const MIRROR_REPORT = "https://mirrors.opensuse.org/";
const NOTES = "https://doc.opensuse.org/release-notes/x86_64/openSUSE/";

type Arch = Artifact["arch"];
type Format = Artifact["format"];

const ARCHES: Record<string, Arch> = {
  x86_64: "x86_64",
  i686: "i686",
  i586: "i686",
  aarch64: "aarch64",
  ppc64le: "ppc64le",
  s390x: "s390x",
  riscv64: "riscv64",
};

/** Image formats the data model holds, by file name ending. Everything else is skipped. */
const FORMATS: [string, Format][] = [
  [".iso", "iso"],
  [".raw.xz", "raw.xz"],
  [".qcow2", "qcow2"],
];

/* ---------- download pages ---------- */

interface Row {
  /** Heading group ("" for the installers at the top of the page). */
  group: string;
  arch: Arch;
  /** The row's label as the page spells it, without the size. */
  label: string;
  /** Download link on download.opensuse.org, normalized. */
  url: string;
  checksum: string | null;
  signature: string | null;
  torrent: string | null;
}

const text = (html: string) =>
  html
    .replace(/<svg[\s\S]*?<\/svg>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** Reads a get.opensuse.org download page. */
function parseDownloadPage(html: string, page: string): Row[] {
  // The modal "Alternative Downloads" only repeats rows that are already on the page.
  const body = html.split(/<h5[^>]*>\s*Alternative Downloads/i)[0] ?? html;
  const tokens = [
    ...body.matchAll(/<h([1-5])\b[^>]*>([\s\S]*?)<\/h\1>|<div class="list-group-item\b/g),
  ];
  const rows = new Map<string, Row>();
  let group = "";
  let arch: Arch | null = null;
  for (const [i, token] of tokens.entries()) {
    if (token[1]) {
      const heading = text(token[2] ?? "");
      const code = heading.match(/\(([a-z0-9_]+)\)\s*$/)?.[1];
      if (token[1] === "5" && code) {
        arch = ARCHES[code] ?? null;
        if (!arch) throw new Error(`unknown architecture "${code}" on ${page}`);
      } else if (token[1] === "1" && !/^openSUSE\b/.test(heading)) {
        group = heading.replace(/\.$/, "");
        arch = null;
      }
      continue;
    }
    const chunk = body.slice(token.index, tokens[i + 1]?.index ?? body.length);
    const label = text(chunk.match(/<h6[^>]*>([\s\S]*?)<\/h6>/)?.[1] ?? "")
      .replace(/\(\s*[\d.]+\s*(?:[KMGT]i)?B\s*\)/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!label) throw new Error(`a download row without a label on ${page}`);
    const links = new Map<string, string>();
    for (const a of chunk.matchAll(/<a\s+href="([^"]+)"[^>]*>\s*([^<]*?)\s*<\/a>/g))
      links.set((a[2] ?? "").toLowerCase(), (a[1] ?? "").replace(/&amp;/g, "&"));
    const download = links.get("download");
    if (!download) throw new Error(`row "${label}" has no Download link on ${page}`);
    if (!arch) throw new Error(`row "${label}" is outside an architecture section on ${page}`);
    const url = normalize(download);
    if (!rows.has(url))
      rows.set(url, {
        group,
        arch,
        label,
        url,
        checksum: links.has("checksum") ? normalize(links.get("checksum") as string) : null,
        signature: links.has("signature") ? normalize(links.get("signature") as string) : null,
        torrent: links.has("torrent file") ? normalize(links.get("torrent file") as string) : null,
      });
  }
  return [...rows.values()];
}

/** An https link on download.opensuse.org without double slashes (the page has a few). */
function normalize(href: string): string {
  const u = new URL(href, DOWNLOAD);
  if (u.protocol !== "https:" || u.hostname !== "download.opensuse.org")
    throw new Error(`download link outside download.opensuse.org: ${href}`);
  return `${DOWNLOAD}${u.pathname.replace(/\/{2,}/g, "/").replace(/^\//, "")}${u.search}`;
}

const basename = (url: string) => url.split("?")[0]?.split("/").pop() ?? url;
const dirname = (url: string) => url.slice(0, url.lastIndexOf("/") + 1);
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const formatOf = (url: string): Format | null =>
  FORMATS.find(([ext]) => url.endsWith(ext))?.[1] ?? null;

function classify(
  group: string,
  label: string,
): { kind: Edition["kind"]; desktop: Desktop | null } {
  const desktop: Desktop | null = /\bGNOME\b/i.test(label)
    ? "gnome"
    : /\bKDE\b/i.test(label)
      ? "kde"
      : /\bXfce\b/i.test(label)
        ? "xfce"
        : null;
  if (/network image/i.test(label)) return { kind: "netinst", desktop: null };
  if (/live/i.test(`${group} ${label}`)) return { kind: "live", desktop };
  if (/^OEM\b/i.test(label)) return { kind: desktop ? "desktop" : "other", desktop };
  if (/cloud/i.test(label)) return { kind: "cloud", desktop: null };
  if (/minimal/i.test(group) || /raspberrypi/i.test(label))
    return { kind: "minimal", desktop: null };
  return { kind: "other", desktop };
}

/** Name → size from MirrorCache's JSON directory listing; empty when it is unavailable. */
async function sizesOf(dir: string, log: (m: string) => void): Promise<Map<string, number>> {
  try {
    const data = await getJson<{ data?: { name: string; size?: number }[] }>(`${dir}?jsontable`);
    return new Map(
      (data.data ?? []).flatMap((e) =>
        e.size && !e.name.endsWith("/") ? [[e.name, e.size] as const] : [],
      ),
    );
  } catch (error) {
    log(`no size listing for ${dir}: ${error instanceof Error ? error.message : error}`);
    return new Map();
  }
}

interface Built {
  editions: Edition[];
  /** Resolved image names (checksum file names) with their architecture, for the snapshot stamp. */
  files: { file: string; arch: Arch }[];
}

/** Turns the page's rows into editions: checksums, sizes, signatures, torrents. */
async function buildEditions(
  rows: Row[],
  mirrored: (relativeUrl: string) => boolean,
  log: (m: string) => void,
): Promise<Built> {
  const kept = rows.filter((r) => {
    if (formatOf(r.url)) return true;
    log(`skipped ${basename(r.url)} (format the catalog does not hold)`);
    return false;
  });
  const listings = new Map<string, Map<string, number>>();
  const dirs = [...new Set(kept.map((r) => dirname(r.url)))];
  await mapLimit(dirs, 2, async (dir) => {
    listings.set(dir, await sizesOf(dir, log));
  });

  const found = await mapLimit(kept, 4, async (row) => {
    // The page links <image>.sha256|.sha512 (one row's link points at another release's file).
    const own = (u: string | null) => (u?.startsWith(`${row.url}.`) ? u : null);
    let sumUrl = own(row.checksum);
    if (!sumUrl) {
      if (row.checksum) log(`${basename(row.url)}: the page's checksum link names another file`);
      sumUrl = `${row.url}.sha256`;
    }
    const type: "sha256" | "sha512" | null = sumUrl.endsWith(".sha512")
      ? "sha512"
      : sumUrl.endsWith(".sha256")
        ? "sha256"
        : null;
    if (!type) throw new Error(`unexpected checksum file ${sumUrl}`);
    let listed: Map<string, string>;
    try {
      listed = parseChecksums(await getText(sumUrl));
    } catch (error) {
      // The page links an image that is not on the server (seen on the Leap 16.1 RC page).
      if (!(error instanceof HttpError) || error.status !== 404) throw error;
      log(`${basename(row.url)}: linked on the page but not published (HTTP 404), skipped`);
      return null;
    }
    // The page links another file's signature for this row: take the one next to the checksum.
    let signature = row.signature?.startsWith(`${row.url}.`) ? row.signature : null;
    if (!signature && row.signature) {
      const guess = `${sumUrl}.asc`;
      const armor = await getText(guess).catch(() => "");
      if (armor.includes("BEGIN PGP SIGNATURE")) signature = guess;
    }
    const name = basename(row.url);
    // A "-Current" alias resolves to the snapshot image, and the checksum file names that.
    const alias = name.match(/^(.*)-Current(\.[a-z0-9.]+)$/);
    const file = listed.has(name)
      ? name
      : [...listed.keys()].find(
          (f) =>
            alias &&
            f.startsWith(`${alias[1]}-Snapshot`) &&
            f.endsWith(alias[2] as string) &&
            /^Snapshot\d{8}\b/.test(f.slice((alias[1] as string).length + 1)),
        );
    const hash = file ? listed.get(file) : undefined;
    if (!file || !hash) throw new Error(`${sumUrl} does not name ${name}`);
    const sizes = listings.get(dirname(row.url));
    const rel = row.url.slice(DOWNLOAD.length);
    return {
      row,
      file,
      hash,
      type,
      sumUrl,
      signature,
      size: sizes?.get(file) ?? sizes?.get(name) ?? null,
      rel,
    };
  });

  const resolved = found.filter((r) => r !== null);
  // A few dead links happen; most of the page missing means the page and the server disagree.
  if (resolved.length * 2 < kept.length)
    throw new Error(`only ${resolved.length} of ${kept.length} linked images are published`);

  // The same label in two groups (e.g. "Preconfigured Image (raw)") needs the group to stay unique.
  const groupsOfLabel = new Map<string, Set<string>>();
  for (const { row } of resolved) {
    const set = groupsOfLabel.get(row.label) ?? new Set<string>();
    set.add(row.group);
    groupsOfLabel.set(row.label, set);
  }

  const editions = new Map<string, Edition>();
  for (const r of resolved) {
    const { row } = r;
    const clash = (groupsOfLabel.get(row.label)?.size ?? 0) > 1;
    const where = row.group || "Installer";
    const id = clash ? `${slug(row.label)}-${slug(where)}` : slug(row.label);
    const edition = editions.get(id) ?? {
      id,
      name: clash ? `${row.label} (${where})` : row.label,
      ...classify(row.group, row.label),
      artifacts: [],
    };
    edition.artifacts.push({
      arch: row.arch,
      format: formatOf(row.url) as Format,
      file: r.file,
      path: mirrored(r.rel) ? r.rel : null,
      url: row.url,
      size: r.size,
      checksum: { type: r.type, value: r.hash, url: r.sumUrl },
      signatureUrl: r.signature,
      torrentUrl: row.torrent?.startsWith(`${row.url}.`) ? row.torrent : null,
    });
    editions.set(id, edition);
  }
  return {
    editions: [...editions.values()],
    files: resolved.map((r) => ({ file: r.file, arch: r.row.arch })),
  };
}

/** Fail closed: the installers every openSUSE download page leads with must still be there. */
function requireInstallers(built: Built, page: string) {
  for (const id of ["offline-image", "network-image"]) {
    const x86 = built.editions
      .find((e) => e.id === id)
      ?.artifacts.some((a) => a.arch === "x86_64" && a.format === "iso");
    if (!x86) throw new Error(`${page} no longer offers the x86_64 ${id} ISO`);
  }
}

/* ---------- Leap lines ---------- */

interface Distribution {
  name: string;
  version: string;
  state?: string;
}

interface Lines {
  /** Supported stable Leap versions, newest first. */
  stable: string[];
  /** A Beta/RC newer than the newest stable Leap. */
  prerelease: { version: string; state: string } | null;
  cycles: Map<string, Cycle>;
  eolUrl: string;
}

async function leapLines(today: string): Promise<Lines> {
  const [api, eol] = await Promise.all([
    getJson<Record<string, Distribution[]>>(DISTRIBUTIONS),
    endOfLife("opensuse"),
  ]);
  const cycles = new Map(eol.cycles.map((c) => [c.name, c]));
  const leap = (api.Leap ?? [])
    .filter((d) => /^\d+\.\d+$/.test(d.version))
    .sort((a, b) => compareVersions(b.version, a.version));
  // The API can lag behind the end-of-life date: a line past its EOL is not offered.
  const stable = leap
    .filter((d) => {
      if (d.state !== "Stable") return false;
      const cycle = cycles.get(d.version);
      return cycle?.isMaintained !== false && !(cycle?.eol && cycle.eol < today);
    })
    .map((d) => d.version);
  const pre = leap.find(
    (d) =>
      (d.state === "Beta" || d.state === "RC") && compareVersions(d.version, stable[0] ?? "0") > 0,
  );
  return {
    stable,
    prerelease: pre ? { version: pre.version, state: pre.state ?? "beta" } : null,
    cycles,
    eolUrl: eol.url,
  };
}

/* ---------- Tumbleweed ---------- */

const snapshotOf = (file: string): string | null => file.match(/-Snapshot(\d{8})\b/)?.[1] ?? null;

export default defineSource({
  slug: "opensuse",
  hosts: ["download.opensuse.org"],
  async releases(ctx) {
    const lines = await leapLines(ctx.today);
    const sources = [DISTRIBUTIONS];
    const releases: Release[] = [];

    // Tumbleweed: the page offers the Current images of one snapshot.
    const twPage = `${GET}tumbleweed/`;
    sources.push(twPage);
    const twRows = parseDownloadPage(await getText(twPage, { accept: "text/html" }), twPage);
    if (!twRows.length) throw new Error(`no downloads found on ${twPage}`);
    const tw = await buildEditions(twRows, (rel) => rel.startsWith("tumbleweed/iso/"), ctx.log);
    // The snapshots of the other architectures lag or lead by days: x86_64 names the release.
    const stamp = tw.files
      .filter((f) => f.arch === "x86_64")
      .map((f) => snapshotOf(f.file))
      .filter((s): s is string => s !== null)
      .sort()
      .at(-1);
    if (!stamp) throw new Error(`no x86_64 Tumbleweed snapshot image on ${twPage}`);
    requireInstallers(tw, twPage);
    releases.push({
      version: stamp,
      channel: "rolling",
      codename: null,
      releaseDate: `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`,
      eol: null,
      notesUrl: `${NOTES}Tumbleweed/`,
      editions: tw.editions,
    });

    // Leap: every supported stable line, then the pre-release.
    const leap = [
      ...lines.stable.map((version) => ({ version, state: "Stable", pre: false })),
      ...(lines.prerelease ? [{ ...lines.prerelease, pre: true }] : []),
    ];
    let stableFound = 0;
    for (const line of leap) {
      const page = `${GET}leap/${line.version}/`;
      let rows: Row[];
      try {
        rows = parseDownloadPage(await getText(page, { accept: "text/html" }), page);
      } catch (error) {
        if (line.pre && error instanceof HttpError && error.status === 404) rows = [];
        else throw error;
      }
      if (!rows.length) {
        ctx.log(`Leap ${line.version}: the download page offers no images`);
        continue;
      }
      sources.push(page);
      // Releases get mirror paths for the installer ISOs (not pre-releases).
      const built = await buildEditions(
        rows,
        (rel) => !line.pre && rel.startsWith(`distribution/leap/${line.version}/offline/`),
        ctx.log,
      );
      requireInstallers(built, page);
      const cycle = lines.cycles.get(line.version);
      if (!line.pre) stableFound++;
      releases.push({
        version: line.pre ? `${line.version}-${line.state.toLowerCase()}` : line.version,
        channel: line.pre ? "beta" : "stable",
        codename: null,
        releaseDate: line.pre ? null : (cycle?.releaseDate ?? null),
        eol: line.pre ? null : (cycle?.eol ?? null),
        notesUrl: line.pre ? null : `${NOTES}Leap/${line.version}/`,
        editions: built.editions,
      });
    }
    if (!stableFound) throw new Error(`no stable Leap release with downloads (${DISTRIBUTIONS})`);
    return { sources: [...sources, lines.eolUrl], releases };
  },

  async mirrors(ctx) {
    const lines = await leapLines(ctx.today);
    const html = await getText(MIRROR_REPORT, { accept: "text/html" });
    const head = html.slice(html.indexOf("<thead>"), html.indexOf("</thead>"));
    const columns = [...head.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => text(m[1] ?? ""));
    const column = (name: RegExp) => {
      const i = columns.findIndex((c) => name.test(c));
      if (i < 2) throw new Error(`the mirror report has no column matching ${name}`);
      return i;
    };
    // Tumbleweed and every listed Leap line must carry their iso tree.
    const needed = [
      column(/^Tumbleweed$/),
      ...lines.stable.map((v) => column(new RegExp(`^(?:Leap )?${v.replace(".", "\\.")}$`))),
    ];

    const mirrors = new Map<string, Mirror>();
    for (const row of html.slice(html.indexOf("<tbody>")).split(/<tr>/).slice(1)) {
      const host = row.match(/<a class="hostname" href="[^"]*">([^<]+)<\/a>/)?.[1];
      const https = row.match(/<a class="url" href="(https:\/\/[^"]+)">https<\/a>/)?.[1];
      if (!host || !https) continue;
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1] ?? "");
      const hasIso = (i: number) =>
        [...(cells[i] ?? "").matchAll(/<a class="(repo\w+)"[^>]*>\s*iso\s*<\/a>/g)].some(
          (m) => m[1] !== "repooutdated",
        );
      if (!needed.every(hasIso)) continue;
      const root = withSlash(https);
      mirrors.set(root, {
        url: root,
        country: countryCode(
          row.match(/<div class="country">([a-z]{2})<\/div>/)?.[1]?.toUpperCase(),
        ),
        name: host,
        lat: null,
        lon: null,
        score: null,
      });
    }
    if (!mirrors.size) throw new Error(`no HTTPS mirror carries the ISO trees in ${MIRROR_REPORT}`);
    return {
      sources: [MIRROR_REPORT, DISTRIBUTIONS, lines.eolUrl],
      mirrors: [...mirrors.values()],
    };
  },
});
