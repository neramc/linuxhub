/**
 * ParrotOS. Every Parrot download host (deb.parrot.sh, the director that sends
 * each visitor to a nearby official mirror, and download.parrot.sh) closes
 * itself to bots in robots.txt, so nothing is fetched from them: no checksum
 * file, no torrent, no HEAD. The official site parrotsec.org allows crawling
 * and supplies everything else:
 *   - /download/ and its page script (download-<hash>.js) hold the data of
 *     every edition card (Security, Home, Hack The Box, IoT, Special, Community
 *     Spins) with the direct and torrent link of each image; the server-side
 *     HTML carries only the Security card, so a missing script throws;
 *   - the release date and notes link come from the "parrot-<version>-release-notes"
 *     post in /sitemap.xml;
 *   - the mirror list is the table on /docs/mirrors/mirrors-list/ (below).
 *
 * Listed: every ISO (amd64 and arm64, plus the amd64 "tuned" builds for newer
 * instruction sets), the Raspberry Pi and Orange Pi 5 Ultra images (the page
 * tags the IoT images ARM64) and the RISC-V tarball. The version is the one in
 * the image links; the page offers a single release (Parrot is semi-rolling
 * and keeps one current release; Parrot 6 images are no longer offered), and
 * mixed versions among the listed images throw instead of guessing.
 *
 * Excluded for every distro alike: containers (parrot.run), the Debian
 * conversion script (not an image), WSL, Vagrant boxes, and VM images in
 * formats the data schema does not hold (OVA, UTM .tar.gz, VMDK .xz, QCOW2 .xz).
 *
 * Checksums. The only publication of the per-image hashes is signed-hashes.txt
 * next to the images on deb.parrot.sh, which robots.txt closes to bots, and the
 * page, the docs and the sitemap carry none. Mirror copies are not the origin
 * host, so they are not used either: artifacts have `checksum: null` and
 * `signatureUrl` links the signed hash list (a link only, never fetched), which
 * is what a visitor verifies the download with (docs: "Hash and key
 * verification"). Sizes are null: the page shows only rounded GB figures, so
 * run.ts fills them from a listed mirror.
 *
 * Mirrors. The official list gives each mirror's APT archive root, and the
 * image tree sits below it (<root>iso/<version>/<file>, the same layout as the
 * director's https://deb.parrot.sh/parrot/iso/...), hence `path` is
 * iso/<version>/<file>. Only the HTTPS root of the "APT config string" column
 * is used (HTTP-only entries are dropped); the country is the table's
 * "Location" column (the worldwide CDN rows have none); the list publishes no
 * coordinates or scores. run.ts then checks each root for the newest image.
 */

import type { Artifact, Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import { DESKTOPS, type Desktop } from "../../../src/lib/taxonomy";
import { getText } from "../http";
import { countryCode, withSlash } from "../lib/mirrors";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const SITE = "https://parrotsec.org";
const DOWNLOAD = `${SITE}/download/`;
const SITEMAP = `${SITE}/sitemap.xml`;
const MIRRORS_DOC = `${SITE}/docs/mirrors/mirrors-list/`;
const DIRECTOR = "https://deb.parrot.sh/parrot/";
const ISO_DIR = `${DIRECTOR}iso/`;

type Arch = Artifact["arch"];
type Format = Artifact["format"];

interface ImageSpec {
  /** Edition id of the ISO; board and tarball editions append the target. */
  id: string;
  name: string;
  desktop: Desktop | null;
  kind: Edition["kind"];
}

/** Image name in "Parrot-<image>-<version>_<target>" → edition. Display order. */
const IMAGES: Record<string, ImageSpec> = {
  security: { id: "security", name: "Security", desktop: "kde", kind: "desktop" },
  home: { id: "home", name: "Home", desktop: "kde", kind: "desktop" },
  "spin-htb": { id: "htb", name: "Hack The Box", desktop: "kde", kind: "desktop" },
  "security-tuned": {
    id: "security-tuned",
    name: "Security (tuned)",
    desktop: "kde",
    kind: "desktop",
  },
  "home-tuned": { id: "home-tuned", name: "Home (tuned)", desktop: "kde", kind: "desktop" },
  "spin-mate": { id: "mate", name: "MATE spin", desktop: "mate", kind: "desktop" },
  "spin-lxqt": { id: "lxqt", name: "LXQt spin", desktop: "lxqt", kind: "desktop" },
  "spin-enlightenment": {
    id: "enlightenment",
    name: "Enlightenment spin",
    desktop: null,
    kind: "desktop",
  },
  core: { id: "core", name: "Core", desktop: "none", kind: "minimal" },
};
const IMAGE_ORDER = Object.keys(IMAGES);

/** Boards named in the IoT section ("<image>_<board>.img.xz"). All of them are ARM64. */
const BOARDS: Record<string, string> = {
  rpi: "Raspberry Pi",
  "orangepi5-ultra": "Orange Pi 5 Ultra",
};

/** A direct link of the page: Parrot-<image>-<version>_<target> (the torrent is its ".torrent"). */
const LINK =
  /^https:\/\/deb\.parrot\.sh\/parrot\/iso\/(?<dir>[\d.]+)\/(?<file>Parrot-(?<image>[a-z0-9-]+?)-(?<version>\d+(?:\.\d+)*)_(?<target>[a-z0-9-]+)(?<ext>\.iso|\.img\.xz|\.tar\.xz|\.[a-z0-9.]+))$/;

/** US states in the mirror table's location column (the table gives no country for them). */
const US_STATES = new Set(
  (
    "Alabama,Alaska,Arizona,Arkansas,California,Colorado,Connecticut,Delaware,Florida,Georgia," +
    "Hawaii,Idaho,Illinois,Indiana,Iowa,Kansas,Kentucky,Louisiana,Maine,Maryland,Massachusetts," +
    "Michigan,Minnesota,Mississippi,Missouri,Montana,Nebraska,Nevada,New Hampshire,New Jersey," +
    "New Mexico,New York,North Carolina,North Dakota,Ohio,Oklahoma,Oregon,Pennsylvania," +
    "Rhode Island,South Carolina,South Dakota,Tennessee,Texas,Utah,Vermont,Virginia,Washington," +
    "West Virginia,Wisconsin,Wyoming"
  ).split(","),
);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'");

/** Every image link of the page, including the torrents: server-rendered HTML plus the page script. */
async function downloadLinks(): Promise<Set<string>> {
  const html = await getText(DOWNLOAD, { accept: "text/html" });
  const chunk = html.match(/\/_next\/static\/chunks\/pages\/download-[\w-]+\.js/)?.[0];
  if (!chunk) throw new Error("the Parrot download page no longer loads its download-*.js script");
  const js = await getText(`${SITE}${chunk}`, { accept: "application/javascript" });
  const links = new Set<string>();
  for (const text of [html, js])
    for (const url of text.match(/https:\/\/deb\.parrot\.sh\/parrot\/iso\/[^"`'\\\s<>]+/g) ?? [])
      links.add(url);
  return links;
}

interface Image {
  version: string;
  file: string;
  url: string;
  image: string;
  arch: Arch;
  format: Format;
  /** "amd64", "arm64", "rpi", "riscv64", "orangepi5-ultra" */
  target: string;
}

/** The links this source lists (see the header for the rest), classified. */
function classify(links: Set<string>): Image[] {
  const out: Image[] = [];
  for (const url of [...links].sort()) {
    const m = url.match(LINK)?.groups;
    if (!m?.file || !m.image || !m.version || !m.target || !m.ext) continue;
    if (m.dir !== m.version) throw new Error(`${url} is not in the directory of its own version`);
    let arch: Arch;
    let format: Format;
    if (m.ext === ".iso" && (m.target === "amd64" || m.target === "arm64")) {
      arch = m.target === "amd64" ? "x86_64" : "aarch64";
      format = "iso";
    } else if (m.ext === ".img.xz") {
      arch = "aarch64";
      format = "img.xz";
    } else if (m.ext === ".tar.xz" && m.target === "riscv64") {
      arch = "riscv64";
      format = "tar.xz";
    } else continue; // OVA, UTM, VMDK, QCOW2, WSL, Vagrant: excluded formats
    out.push({
      version: m.version,
      file: m.file,
      url,
      image: m.image,
      arch,
      format,
      target: m.target,
    });
  }
  return out;
}

/** Edition of an image: the ISOs are the edition itself, boards and the tarball are device editions. */
function editionOf(img: Image): Omit<Edition, "artifacts"> {
  const known = IMAGES[img.image];
  const spin = img.image.replace(/^spin-/, "");
  const spec: ImageSpec = known ?? {
    id: spin,
    name: img.image.startsWith("spin-") ? `${spin} spin` : img.image,
    desktop: spin in DESKTOPS ? (spin as Desktop) : null,
    kind: "desktop",
  };
  if (img.format === "iso")
    return { id: spec.id, name: spec.name, desktop: spec.desktop, kind: spec.kind };
  const device = img.target === "riscv64" ? "RISC-V" : (BOARDS[img.target] ?? img.target);
  return {
    id: `${spec.id}-${img.target}`,
    name: `${spec.name} (${device})`,
    desktop: spec.desktop,
    kind: spec.kind,
  };
}

/** Release date and notes from the "parrot-<version>-release-notes" post slug in the sitemap. */
async function releaseNotes(version: string): Promise<{ date: string | null; url: string | null }> {
  try {
    const xml = await getText(SITEMAP, { accept: "application/xml" });
    const re = new RegExp(
      `<loc>(https://parrotsec\\.org/blog/(\\d{4}-\\d{2}-\\d{2})-parrot-${escapeRe(version)}-release-notes/?)</loc>`,
    );
    const m = xml.match(re);
    if (m?.[1] && m[2]) return { date: m[2], url: m[1] };
  } catch {
    /* the date is optional */
  }
  return { date: null, url: null };
}

/** Order: ISOs in the page's order, then boards, then the tarball; ties by id. */
const rank = (img: Image) =>
  (img.format === "iso" ? 0 : img.arch === "riscv64" ? 2 : 1) * 100 +
  (IMAGE_ORDER.includes(img.image) ? IMAGE_ORDER.indexOf(img.image) : IMAGE_ORDER.length);

/** "Massachusetts" / "Sweden, Lund" / "Vietnam, Ha Noi (APAC region)" → ISO country code. */
function locationCountry(location: string): string | null {
  const place =
    location
      .replace(/\(.*?\)/g, "")
      .split(",")[0]
      ?.trim() ?? "";
  return US_STATES.has(place) ? "US" : countryCode(place);
}

interface ListedMirror {
  root: string;
  country: string | null;
}

/**
 * The tables of the mirror doc: Worldwide (CDN) has no location column, the regional
 * tables start with "Location / Mirror ID / bandwidth". The root is the HTTPS archive
 * URL of the APT config string.
 */
function parseMirrorTables(html: string): ListedMirror[] {
  const out = new Map<string, ListedMirror>();
  for (const table of html.split(/<table\b/i).slice(1)) {
    const body = table.split(/<\/table>/i)[0] ?? "";
    const rows = body.split(/<tr\b/i).slice(1);
    const header = rows[0] ?? "";
    const hasLocation = /<th[^>]*>\s*Location\b/i.test(header);
    for (const row of rows.slice(1)) {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1] ?? "");
      const apt = cells.at(-1)?.match(/deb\s+<a href="(https:\/\/[^"]+)"/i)?.[1];
      if (!apt) continue;
      const first = (cells[0] ?? "").split(/<br\s*\/?>/i)[0] ?? "";
      const location = decode(first.replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim();
      const root = withSlash(decode(apt));
      out.set(root, { root, country: hasLocation ? locationCountry(location) : null });
    }
  }
  return [...out.values()];
}

export default defineSource({
  slug: "parrot-os",
  hosts: ["deb.parrot.sh"],
  async releases(ctx) {
    const links = await downloadLinks();
    const images = classify(links);
    const versions = [...new Set(images.map((i) => i.version))];
    const version = versions.sort(compareVersions).at(-1);
    if (!version) throw new Error("no Parrot image links on the official download page");
    if (versions.length > 1)
      throw new Error(`the Parrot download page offers mixed releases (${versions.join(", ")})`);
    for (const need of ["security", "home"])
      if (!images.some((i) => i.image === need && i.arch === "x86_64" && i.format === "iso"))
        throw new Error(`Parrot ${version} ${need} (amd64 ISO) is no longer on the download page`);
    if (!images.some((i) => i.format === "img.xz"))
      throw new Error(`Parrot ${version} lists no board images on the download page`);

    const dir = `${ISO_DIR}${version}/`;
    const hashes = `${dir}signed-hashes.txt`;
    const editions = new Map<string, { edition: Edition; rank: number }>();
    for (const img of images) {
      const spec = editionOf(img);
      const entry = editions.get(spec.id) ?? {
        edition: { ...spec, artifacts: [] },
        rank: rank(img),
      };
      entry.edition.artifacts.push({
        arch: img.arch,
        format: img.format,
        file: img.file,
        path: `iso/${version}/${img.file}`,
        url: img.url,
        size: null,
        checksum: null,
        signatureUrl: links.has(hashes) ? hashes : null,
        torrentUrl: links.has(`${img.url}.torrent`) ? `${img.url}.torrent` : null,
      });
      editions.set(spec.id, entry);
    }
    const ordered = [...editions.values()].sort(
      (a, b) => a.rank - b.rank || a.edition.id.localeCompare(b.edition.id),
    );
    ctx.log(`${version}: ${ordered.length} editions, ${images.length} files`);

    const notes = await releaseNotes(version);
    const releases: Release[] = [
      {
        version,
        channel: "stable",
        codename: null,
        releaseDate: notes.date,
        eol: null,
        notesUrl: notes.url,
        editions: ordered.map((e) => e.edition),
      },
    ];
    return { sources: [DOWNLOAD, SITEMAP], releases };
  },

  async mirrors(ctx) {
    const listed = parseMirrorTables(await getText(MIRRORS_DOC, { accept: "text/html" }));
    if (!listed.some((m) => m.root === DIRECTOR))
      throw new Error("the Parrot mirror list no longer names the deb.parrot.sh director");
    const mirrors: Mirror[] = listed
      .sort((a, b) => a.root.localeCompare(b.root))
      .map((m) => ({
        url: m.root,
        country: m.country,
        name: new URL(m.root).hostname,
        lat: null,
        lon: null,
        score: null,
      }));
    ctx.log(
      `${mirrors.length} HTTPS mirrors, ${mirrors.filter((m) => !m.country).length} without country`,
    );
    return { sources: [MIRRORS_DOC], mirrors };
  },
});
