/**
 * Ubuntu and its official flavors Kubuntu, Xubuntu, Lubuntu and Ubuntu MATE.
 *
 * Official sources, and what each one is used for:
 * - Ubuntu project documentation, "List of releases" (ubuntu.com/project/docs/
 *   release-team/list-of-releases/): version, code name, release date of every
 *   point release, end of standard support (month → last day, periodEnd()),
 *   release notes. This replaces endoflife.date, which is not needed here.
 * - releases.ubuntu.com/<line>/ (Ubuntu's amd64 desktop and server) and
 *   cdimage.ubuntu.com/ubuntu/releases/<point>/release/ (every other Ubuntu
 *   architecture, the Raspberry Pi and RISC-V images): the files, SHA-256 from
 *   the directory's SHA256SUMS (signature = SHA256SUMS.gpg), .torrent from the
 *   autoindex. releases.ubuntu.com/streams/v1/ (simplestreams) publishes exact
 *   sizes for the amd64 ISOs; every other size is left to run.ts.
 * - Each flavor's own download page (Kubuntu, Xubuntu, Ubuntu MATE) decides what is
 *   offered (file names named on it) and states how long each release is supported;
 *   the files, checksums and torrents come from
 *   cdimage.ubuntu.com/<flavor>/releases/<point>/release/. Flavors support an LTS for
 *   3 years, so they offer fewer lines than Ubuntu. Kubuntu/Ubuntu MATE say "until
 *   <month> <year>" (→ last day of the month); Xubuntu's release pages give the
 *   exact day. Lubuntu is the exception, see below.
 *
 * Ubuntu: every supported line, each with its newest point release. Editions are
 * the install media of the download pages (Desktop, Server for every
 * architecture, Server 64k page size, Raspberry Pi Desktop/Server, the RISC-V
 * preinstalled server image and the per-board images of 24.04), taken from the
 * release's two image trees; the download pages link both trees as "alternative
 * and previous releases", so older lines get the same set as far as they have it.
 * Per edition and architecture the newest file wins (24.04 desktop amd64 is the
 * 24.04.5.1 respin, the server image is 24.04.5). The line's version and date
 * are the official point release.
 *
 * Exclusions, for the same reasons as everywhere: WSL (.wsl) and netboot
 * archives (formats outside the data model, not install media), source,
 * `preinstalled-server-amd64/arm64` (not on any download page), `amd64v3` (not
 * on the download pages), Ubuntu Core (build-it-yourself IoT product with its own
 * versions), the cloud page (links to cloud marketplaces, no files), betas and
 * dailies (the 26.10 beta files still sit next to the final ones; the download
 * pages do not link pre-releases), Ubuntu Pro. The s390x page asks visitors to
 * accept terms before the download; the ISO itself is a public file in the
 * release tree, so it is listed.
 *
 * Lubuntu (changed 2026-10-28). lubuntu.me/robots.txt is now "User-agent: * /
 * Disallow: /", so nothing on lubuntu.me (download page, release announcements) is
 * read any more. Lubuntu is rebuilt from what bots may read:
 * - Lines and files: the Ubuntu release table says which Ubuntu lines exist;
 *   cdimage.ubuntu.com/lubuntu/releases/ (Canonical's image host for the flavor)
 *   says which of them Lubuntu published (`<version>/release/`; `beta/` is never
 *   read, dailies and pre-releases are excluded as for every distro). Per line the
 *   newest version directory with a `release/` wins, and the newest desktop ISO per
 *   architecture of its SHA256SUMS (a file of another kind or variant, none today,
 *   makes the source fail so that someone decides on an edition for it). The old
 *   page offered exactly these desktop amd64 ISOs on 2026-10-20 (26.10, 26.04.1,
 *   24.04.5), as does the tree.
 * - End of support: the Ubuntu project documentation ("Ubuntu releases",
 *   ubuntu.com/project/docs/release-team/ubuntu-releases/) states "Flavors
 *   generally support their releases for 3 years in LTS versions (although there
 *   can be exceptions)", read from the page on every run (the number comes from the
 *   sentence; the source fails when it is gone). An LTS therefore ends the last day
 *   of the month 3 years after its release month (the "YY.MM" of the version names
 *   it): 26.04 → 2029-04-30, 24.04 → 2027-04-30. An interim release ends with
 *   Ubuntu's own end of standard support (nine months, the release table):
 *   26.10 → 2027-07-31. Deviation: this is the project-wide rule, not the date the
 *   Lubuntu team announces (the statement allows exceptions); when the Lubuntu
 *   page was last read (2026-10-20) it said July 2027 (26.10), April 2029 (26.04.1)
 *   and April 2027 (24.04.5), the same dates.
 * - Release notes: the "Lubuntu Release Notes" link in Ubuntu's own release notes
 *   (documentation.ubuntu.com/release-notes/<line>/, "Official flavors"); a line
 *   whose notes name none (26.10 today) links those Ubuntu release notes instead.
 *   The links are stored for readers, nothing on lubuntu.me is fetched.
 * - Release dates are Ubuntu's (same day), as for the other flavors.
 *
 * Mirrors. Ubuntu: Launchpad's list of official "CD Image" mirrors (enabled,
 * status Official, HTTPS); they mirror releases.ubuntu.com, so only the amd64
 * images carry a mirror path. Flavors: images exist only on Canonical's
 * cdimage server. Kubuntu and Xubuntu publish a mirror list (HTTPS entries whose
 * layout is `<root>/<flavor>/releases/<point>/release/` are kept); Lubuntu and
 * Ubuntu MATE name cdimage.ubuntu.com only, so that is their single origin. Its
 * country is "United Kingdom"/"England" on the Kubuntu and Xubuntu pages (same
 * server), so GB is used for it for all four.
 *
 * Fails closed (the sync then keeps its last good data) when the release table or
 * a flavor page changes shape, when a page offers a file the directory has no
 * checksum or listing for, when an offered flavor release has no end of support,
 * or when a supported Ubuntu line has no desktop or server amd64 image. Lubuntu:
 * when the flavor support sentence is gone, when no supported release is found in
 * its tree, when a release directory has no image of its line or no desktop amd64
 * ISO, or holds an image kind this source has no edition for.
 *
 * Scope notes:
 * - The pages link just the two newest Ubuntu releases for Raspberry Pi, ARM,
 *   POWER, s390x and RISC-V, and name the older releases only as "previous
 *   releases" (trees). Older supported lines therefore get every image of the
 *   same offered categories that their trees hold (22.04: arm64, ppc64el, s390x,
 *   riscv64 and Raspberry Pi images; 24.04: also the generic RISC-V image next to
 *   the per-board ones the RISC-V page lists).
 * - Release dates of the flavors' point releases are Ubuntu's (same day).
 * - A supported Ubuntu line that Lubuntu has not published (no `release/` directory in
 *   its tree) is not offered until it is.
 * - Xubuntu's "Minimal, RISC-V 64-bit (experimental)" torrent is on its page, so
 *   that ISO is listed.
 */

import type { Artifact, Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getJson, getText, HttpError } from "../http";
import { listDirectory } from "../lib/dirlist";
import { countryCode, originAsMirror, withSlash } from "../lib/mirrors";
import {
  anchors,
  CDIMAGE_HOST,
  currentLines,
  FLAVOR_POLICY_URL,
  flavorLtsYears,
  flavorSupportEnd,
  type ImageDir,
  imageArtifact,
  imageDir,
  imagesMentioned,
  lineVersions,
  newestBy,
  parseDate,
  parseImageName,
  RELEASE_LIST_URL,
  RELEASES_HOST,
  type UbuntuImage,
  type UbuntuRelease,
  ubuntuReleaseList,
} from "../lib/ubuntu";
import { compareVersions, periodEnd } from "../lib/versions";
import {
  type DistroSource,
  defineSource,
  type MirrorsResult,
  type ReleasesResult,
  type SyncContext,
} from "../source";

const HOSTS = ["releases.ubuntu.com", "cdimage.ubuntu.com"];

interface EditionDef {
  id: string;
  name: string;
  desktop: Desktop | null;
  kind: Edition["kind"];
  /** Display order within a release. */
  order: number;
}

function toEditions(groups: Map<string, { def: EditionDef; artifacts: Artifact[] }>): Edition[] {
  return [...groups.values()]
    .sort((a, b) => a.def.order - b.def.order || a.def.id.localeCompare(b.def.id))
    .map(({ def, artifacts }) => ({
      id: def.id,
      name: def.name,
      desktop: def.desktop,
      kind: def.kind,
      artifacts: artifacts.sort((a, b) => a.file.localeCompare(b.file)),
    }));
}

/* ---------- Ubuntu ---------- */

const DESKTOP: EditionDef = {
  id: "desktop",
  name: "Desktop",
  desktop: "gnome",
  kind: "desktop",
  order: 0,
};
const SERVER: EditionDef = {
  id: "server",
  name: "Server",
  desktop: null,
  kind: "server",
  order: 1,
};
const SERVER_64K: EditionDef = {
  id: "server-64k-page-size",
  name: "Server (64k page size)",
  desktop: null,
  kind: "server",
  order: 2,
};
const PI_DESKTOP: EditionDef = {
  id: "desktop-for-raspberry-pi",
  name: "Desktop for Raspberry Pi",
  desktop: "gnome",
  kind: "desktop",
  order: 3,
};
const PI_SERVER: EditionDef = {
  id: "server-for-raspberry-pi",
  name: "Server for Raspberry Pi",
  desktop: null,
  kind: "server",
  order: 4,
};
const RISCV_PREINSTALLED: EditionDef = {
  id: "server-preinstalled-image",
  name: "Server preinstalled image",
  desktop: null,
  kind: "server",
  order: 5,
};
/** Board names as the RISC-V download page spells them; an unknown board keeps its file-name tag. */
const RISCV_BOARDS: Record<string, string> = {
  nezha: "AllWinner Nezha",
  jh7110: "StarFive JH7110 boards",
  unmatched: "SiFive Unmatched",
  licheerv: "Sipeed LicheeRV Dock",
  icicle: "Microchip Polarfire SoC FPGA Icicle Kit",
  pic64gx: "Microchip PIC64GX1000 Curiosity Kit",
  visionfive: "StarFive VisionFive",
};

/** The edition an Ubuntu image belongs to, or null for files that are not offered install media. */
function ubuntuEdition(image: UbuntuImage): EditionDef | null {
  const { kind, variant } = image;
  if (kind === "desktop") return variant === null ? DESKTOP : null;
  if (kind === "live-server") {
    if (variant === null) return SERVER;
    return variant === "largemem" ? SERVER_64K : null;
  }
  if (kind === "preinstalled-desktop") return variant === "raspi" ? PI_DESKTOP : null;
  if (kind === "preinstalled-server") {
    if (variant === "raspi") return PI_SERVER;
    if (image.arch !== "riscv64") return null; // plain amd64/arm64 preinstalled images are not offered
    if (variant === null) return RISCV_PREINSTALLED;
    return {
      id: `server-preinstalled-image-${variant}`,
      name: `Server preinstalled image (${RISCV_BOARDS[variant] ?? variant})`,
      desktop: null,
      kind: "server",
      order: 6,
    };
  }
  return null;
}

/** SHA-256 → exact size of the ISOs in Ubuntu's simplestreams catalog (amd64 desktop and server). */
async function releaseSizes(): Promise<Map<string, number>> {
  type Catalog = {
    products?: Record<
      string,
      {
        versions?: Record<
          string,
          { items?: Record<string, { ftype?: string; sha256?: string; size?: number }> }
        >;
      }
    >;
  };
  const sizes = new Map<string, number>();
  for (const name of ["ubuntu", "ubuntu-server"]) {
    const catalog = await getJson<Catalog>(
      `${RELEASES_HOST}streams/v1/com.ubuntu.releases:${name}.json`,
    );
    for (const product of Object.values(catalog.products ?? {}))
      for (const version of Object.values(product.versions ?? {}))
        for (const item of Object.values(version.items ?? {}))
          if (item.ftype === "iso" && item.sha256 && item.size && item.size > 0)
            sizes.set(item.sha256, item.size);
  }
  return sizes;
}

async function ubuntuRelease(row: UbuntuRelease, sizes: Map<string, number>): Promise<Release> {
  const trees: { dir: ImageDir; mirrorRoot: string | null }[] = [
    // releases.ubuntu.com is the tree the official CD-image mirrors carry.
    { dir: await imageDir(`${RELEASES_HOST}${row.line}/`), mirrorRoot: `${row.line}/` },
    {
      dir: await imageDir(`${CDIMAGE_HOST}ubuntu/releases/${row.version}/release/`),
      mirrorRoot: null,
    },
  ];
  const candidates: {
    image: UbuntuImage;
    edition: EditionDef;
    dir: ImageDir;
    mirrorPath: string | null;
  }[] = [];
  for (const { dir, mirrorRoot } of trees)
    for (const file of dir.sums.keys()) {
      const image = parseImageName(file, "ubuntu");
      const edition = image && image.line === row.line ? ubuntuEdition(image) : null;
      if (image && edition)
        candidates.push({
          image,
          edition,
          dir,
          mirrorPath: mirrorRoot === null ? null : `${mirrorRoot}${file}`,
        });
    }
  const groups = new Map<string, { def: EditionDef; artifacts: Artifact[] }>();
  for (const c of newestBy(candidates, (x) => `${x.edition.id}/${x.image.arch}`)) {
    const artifact = imageArtifact(c.dir, c.image, c.mirrorPath);
    artifact.size = (artifact.checksum && sizes.get(artifact.checksum.value)) || null;
    const group = groups.get(c.edition.id) ?? { def: c.edition, artifacts: [] };
    group.artifacts.push(artifact);
    groups.set(c.edition.id, group);
  }
  for (const id of ["desktop", "server"])
    if (!groups.get(id)?.artifacts.some((a) => a.arch === "x86_64"))
      throw new Error(`Ubuntu ${row.version}: no x86_64 ${id} image in the release directories`);
  return {
    version: row.version,
    channel: row.lts ? "lts" : "stable",
    codename: row.codename,
    releaseDate: row.date,
    eol: row.eol,
    notesUrl: row.notesUrl,
    editions: toEditions(groups),
  };
}

interface LaunchpadMirror {
  https_base_url: string | null;
  enabled: boolean;
  status: string;
  content: string;
  country_link: string;
  displayname: string | null;
}

/** Launchpad's official "CD Image" mirrors: each carries the releases.ubuntu.com tree. */
async function ubuntuMirrors(): Promise<MirrorsResult> {
  const first = "https://api.launchpad.net/devel/ubuntu/cdimage_mirrors";
  const mirrors = new Map<string, Mirror>();
  for (let next: string | null = first; next; ) {
    const page: { entries: LaunchpadMirror[]; next_collection_link?: string } = await getJson(next);
    for (const m of page.entries) {
      if (!m.enabled || m.status !== "Official" || m.content !== "CD Image" || !m.https_base_url)
        continue;
      const url = withSlash(m.https_base_url);
      mirrors.set(url, {
        url,
        country: countryCode(m.country_link.split("/").pop()),
        name: m.displayname ?? new URL(url).hostname,
        lat: null,
        lon: null,
        score: null,
      });
    }
    next = page.next_collection_link ?? null;
  }
  return { sources: [first], mirrors: [...mirrors.values()] };
}

const ubuntu = defineSource({
  slug: "ubuntu",
  hosts: HOSTS,
  async releases(ctx: SyncContext): Promise<ReleasesResult> {
    const lines = currentLines(await ubuntuReleaseList(), ctx.today);
    if (!lines.length) throw new Error("Ubuntu release list: no release is in standard support");
    const sizes = await releaseSizes();
    const releases: Release[] = [];
    for (const row of lines) releases.push(await ubuntuRelease(row, sizes));
    return {
      sources: [
        RELEASE_LIST_URL,
        RELEASES_HOST,
        `${CDIMAGE_HOST}ubuntu/releases/`,
        `${RELEASES_HOST}streams/v1/com.ubuntu.releases:ubuntu.json`,
        `${RELEASES_HOST}streams/v1/com.ubuntu.releases:ubuntu-server.json`,
      ],
      releases,
    };
  },
  mirrors: ubuntuMirrors,
});

/* ---------- flavors ---------- */

interface FlavorSpec {
  slug: string;
  /** Tree below cdimage.ubuntu.com, also the prefix of the image file names. */
  dir: string;
  /** The flavor's download page. */
  page: string;
  /** Editions by image kind in the file name (desktop, minimal). */
  editions: Partial<Record<string, EditionDef>>;
  /** One chunk of the page per offered release. */
  chunks(html: string): string[];
  /** End of support (ISO day) and release notes of the release a chunk describes. */
  support(chunk: string, line: string): Promise<{ eol: string | null; notes: string | null }>;
  mirrors(): Promise<MirrorsResult>;
}

const stripComments = (html: string) => html.replace(/<!--[\s\S]*?-->/g, "");
const MONTH_YEAR = "([A-Z][a-z]+\\s+\\d{4})";

async function flavorReleases(spec: FlavorSpec, ctx: SyncContext): Promise<ReleasesResult> {
  const rows = await ubuntuReleaseList();
  const page = stripComments(await getText(spec.page, { accept: "text/html" }));
  const releases: Release[] = [];
  for (const chunk of spec.chunks(page)) {
    const offered = imagesMentioned(chunk, spec.dir);
    if (!offered.length) continue;
    const version = offered.map((i) => i.version).sort((a, b) => compareVersions(b, a))[0] ?? "";
    const images = offered.filter((i) => i.version === version);
    const line = images[0]?.line ?? "";
    if (releases.some((r) => r.version === version || r.version.startsWith(`${line}.`)))
      throw new Error(`${spec.page}: two sections offer Ubuntu ${line}`);
    const row = rows.find((r) => r.line === line);
    if (!row) throw new Error(`${spec.page} offers ${line}, which Ubuntu's release list lacks`);
    const support = await spec.support(chunk, line);
    if (!support.eol) throw new Error(`${spec.page}: no end of support found for ${line}`);
    if (support.eol < ctx.today) continue;
    const root = `${spec.dir}/releases/${version}/release/`;
    const dir = await imageDir(`${CDIMAGE_HOST}${root}`);
    const groups = new Map<string, { def: EditionDef; artifacts: Artifact[] }>();
    for (const image of images) {
      const def = spec.editions[image.kind];
      if (!def) throw new Error(`${spec.page} offers an unknown image kind: ${image.file}`);
      const group = groups.get(def.id) ?? { def, artifacts: [] };
      group.artifacts.push(imageArtifact(dir, image, `${root}${image.file}`));
      groups.set(def.id, group);
    }
    releases.push({
      version,
      channel: row.lts ? "lts" : "stable",
      codename: row.codename,
      releaseDate: rows.find((r) => r.version === version)?.date ?? null,
      eol: support.eol,
      notesUrl: support.notes,
      editions: toEditions(groups),
    });
  }
  if (!releases.length) throw new Error(`${spec.page}: no supported release is offered`);
  releases.sort((a, b) => compareVersions(b.version, a.version));
  return {
    sources: [spec.page, RELEASE_LIST_URL, `${CDIMAGE_HOST}${spec.dir}/releases/`],
    releases,
  };
}

/** The mirror every flavor without a list of its own names: Canonical's cdimage server. */
const cdimageOrigin = () =>
  originAsMirror(CDIMAGE_HOST, "Ubuntu CD image server (Canonical)", "GB");

const flavorSource = (spec: FlavorSpec): DistroSource =>
  defineSource({
    slug: spec.slug,
    hosts: HOSTS,
    releases: (ctx) => flavorReleases(spec, ctx),
    mirrors: () => spec.mirrors(),
  });

/**
 * HTTPS entries of a project's mirror list whose layout is
 * `<root>/<dir>/releases/…`: root + `<dir>/releases/<point>/release/<file>`
 * is the file. Entries with another layout cannot be addressed that way and
 * are left out, as are plain-HTTP ones.
 */
function listedMirrors(
  entries: { href: string; name: string | null; country: string | null }[],
  dir: string,
): Mirror[] {
  const mirrors = new Map<string, Mirror>();
  for (const e of entries) {
    const at = e.href.indexOf(`/${dir}/releases/`);
    if (!e.href.startsWith("https://") || at < 0) continue;
    const url = withSlash(e.href.slice(0, at + 1));
    mirrors.set(url, {
      url,
      country: countryCode(e.country),
      name: e.name,
      lat: null,
      lon: null,
      score: null,
    });
  }
  return [...mirrors.values()];
}

const KUBUNTU_ALT = "https://kubuntu.org/alternative-downloads/";
const XUBUNTU_PAGE = "https://xubuntu.org/download/";

/** The link whose visible text matches, made absolute against the page it is on. */
function linkTo(html: string, base: string, text: RegExp): string | null {
  const found = anchors(html).find((a) => text.test(a.text));
  return found ? new URL(found.href, base).href : null;
}

const kubuntu = flavorSource({
  slug: "kubuntu",
  dir: "kubuntu",
  page: "https://kubuntu.org/download/",
  editions: {
    desktop: { id: "desktop", name: "Desktop", desktop: "kde", kind: "desktop", order: 0 },
  },
  chunks: (html) => html.split(/<h2\b/).slice(1),
  async support(chunk) {
    const until = chunk.match(
      new RegExp(`supported with security and maintenance updates,\\s+until\\s+${MONTH_YEAR}`),
    )?.[1];
    return {
      eol: until ? periodEnd(until) : null,
      notes: linkTo(chunk, "https://kubuntu.org/", /^Kubuntu [\d.]+ release notes$/),
    };
  },
  async mirrors() {
    const html = await getText(KUBUNTU_ALT, { accept: "text/html" });
    const list = html.split(/<h2 id="?mirrors"?>/)[1]?.split(/<h2\b/)[0];
    if (!list) throw new Error(`${KUBUNTU_ALT}: the mirror list is gone`);
    // "Main Download site (England)", "Turkey": the country is the parenthesis or the whole text.
    const entries = anchors(list).map((a) => ({
      href: a.href,
      name: a.text,
      country: a.text.match(/\(([^)]+)\)/)?.[1] ?? a.text,
    }));
    const mirrors = listedMirrors(entries, "kubuntu");
    if (!mirrors.length) throw new Error(`${KUBUNTU_ALT}: no HTTPS mirror listed`);
    return { sources: [KUBUNTU_ALT], mirrors };
  },
});

const xubuntu = flavorSource({
  slug: "xubuntu",
  dir: "xubuntu",
  page: XUBUNTU_PAGE,
  editions: {
    desktop: { id: "desktop", name: "Desktop", desktop: "xfce", kind: "desktop", order: 0 },
    minimal: { id: "minimal", name: "Minimal", desktop: "xfce", kind: "minimal", order: 1 },
  },
  chunks: (html) => html.split(/<section class="wide release">/).slice(1),
  async support(_chunk, line) {
    const url = `https://xubuntu.org/release/${line}/`;
    const page = await getText(url, { accept: "text/html" });
    const eol = page.match(/<dt>End of Life<\/dt>\s*<dd>([^<]+)<\/dd>/)?.[1];
    return {
      eol: eol ? parseDate(eol) : null,
      notes: linkTo(page, url, /^Xubuntu [\d.]+ Release Notes$/),
    };
  },
  async mirrors() {
    const html = stripComments(await getText(XUBUNTU_PAGE, { accept: "text/html" }));
    // The newest release's "Direct Downloads" list; older releases list the same mirrors.
    const list = html.match(/<ul class="?columned-list"?>([\s\S]*?)<\/ul>/)?.[1];
    if (!list) throw new Error(`${XUBUNTU_PAGE}: the mirror list is gone`);
    const entries = anchors(list).map((a) => ({ href: a.href, name: a.title, country: a.text }));
    const mirrors = listedMirrors(entries, "xubuntu");
    if (!mirrors.length) throw new Error(`${XUBUNTU_PAGE}: no HTTPS mirror listed`);
    return { sources: [XUBUNTU_PAGE], mirrors };
  },
});

/* ---------- Lubuntu ---------- */

const LUBUNTU_TREE = `${CDIMAGE_HOST}lubuntu/releases/`;
const LUBUNTU_EDITIONS: Partial<Record<string, EditionDef>> = {
  desktop: { id: "desktop", name: "Desktop", desktop: "lxqt", kind: "desktop", order: 0 },
};

/**
 * Lubuntu's release notes: the link Ubuntu's own release notes give for the
 * flavor (they list the official flavors' notes), else those release notes
 * themselves. Null when Ubuntu has no release-notes page for the line.
 */
async function lubuntuNotes(line: string): Promise<{ page: string; notes: string } | null> {
  const page = `https://documentation.ubuntu.com/release-notes/${line}/`;
  try {
    const html = await getText(page, { accept: "text/html" });
    return { page, notes: linkTo(html, page, /^Lubuntu Release Notes$/) ?? page };
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}

/**
 * The newest published release directory of `line` in Lubuntu's tree and the
 * install images it holds. A version directory without a `release/` yet (only
 * `beta/`) is skipped: that point release is not out.
 */
async function lubuntuImages(line: string, names: string[]) {
  for (const version of lineVersions(names, line)) {
    const root = `lubuntu/releases/${version}/release/`;
    let dir: ImageDir;
    try {
      dir = await imageDir(`${CDIMAGE_HOST}${root}`);
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) continue;
      throw error;
    }
    const images = [...dir.sums.keys()].flatMap((file) => {
      const image = parseImageName(file, "lubuntu");
      return image?.line === line ? [{ image }] : [];
    });
    if (!images.length) throw new Error(`${dir.url}SHA256SUMS has no Lubuntu ${line} image`);
    return {
      dir,
      root,
      images: newestBy(images, ({ image }) => `${image.kind}/${image.arch}/${image.variant}`).map(
        (found) => found.image,
      ),
    };
  }
  return null;
}

async function lubuntuReleases(ctx: SyncContext): Promise<ReleasesResult> {
  const rows = await ubuntuReleaseList();
  const ltsYears = await flavorLtsYears();
  const names = await listDirectory(LUBUNTU_TREE);
  const sources = [LUBUNTU_TREE, RELEASE_LIST_URL, FLAVOR_POLICY_URL];
  const releases: Release[] = [];
  for (const row of currentLines(rows, ctx.today)) {
    const eol = flavorSupportEnd(row, ltsYears);
    if (!eol) throw new Error(`Lubuntu ${row.line}: cannot work out the end of support`);
    if (eol < ctx.today) continue;
    const found = await lubuntuImages(row.line, names);
    if (!found) continue; // Lubuntu has not published this Ubuntu release (yet)
    const groups = new Map<string, { def: EditionDef; artifacts: Artifact[] }>();
    for (const image of found.images) {
      const def = image.variant === null ? LUBUNTU_EDITIONS[image.kind] : undefined;
      if (!def)
        throw new Error(`${found.dir.url} holds an image without an edition here: ${image.file}`);
      const group = groups.get(def.id) ?? { def, artifacts: [] };
      group.artifacts.push(imageArtifact(found.dir, image, `${found.root}${image.file}`));
      groups.set(def.id, group);
    }
    if (!groups.get("desktop")?.artifacts.some((a) => a.arch === "x86_64"))
      throw new Error(`Lubuntu ${row.line}: no x86_64 desktop image in ${found.dir.url}`);
    const version =
      found.images.map((i) => i.version).sort((a, b) => compareVersions(b, a))[0] ?? row.line;
    const notes = await lubuntuNotes(row.line);
    if (notes) sources.push(notes.page);
    releases.push({
      version,
      channel: row.lts ? "lts" : "stable",
      codename: row.codename,
      releaseDate: rows.find((r) => r.version === version)?.date ?? null,
      eol,
      notesUrl: notes?.notes ?? null,
      editions: toEditions(groups),
    });
  }
  if (!releases.length) throw new Error(`${LUBUNTU_TREE}: no supported Lubuntu release found`);
  return { sources, releases };
}

const lubuntu = defineSource({
  slug: "lubuntu",
  hosts: HOSTS,
  releases: lubuntuReleases,
  // Lubuntu names no mirror list: Canonical's cdimage server is the single origin.
  mirrors: async () => ({ sources: [LUBUNTU_TREE], mirrors: [cdimageOrigin()] }),
});

const ubuntuMate = flavorSource({
  slug: "ubuntu-mate",
  dir: "ubuntu-mate",
  page: "https://ubuntu-mate.org/download/",
  editions: {
    desktop: { id: "desktop", name: "Desktop", desktop: "mate", kind: "desktop", order: 0 },
  },
  chunks: (html) => html.split(/<div class="row release-item/).slice(1),
  async support(chunk) {
    const until = chunk.match(/Supported until\s+([A-Z][a-z]+)\s+(\d{4})/);
    return {
      eol: until ? periodEnd(`${until[1]} ${until[2]}`) : null,
      notes: linkTo(chunk, "https://ubuntu-mate.org/", /Release Notes/i),
    };
  },
  async mirrors() {
    return { sources: ["https://ubuntu-mate.org/download/"], mirrors: [cdimageOrigin()] };
  },
});

export default [ubuntu, kubuntu, xubuntu, lubuntu, ubuntuMate];
