/**
 * Bodhi Linux: every supported release the download page offers (today 7.0.0,
 * 64-bit: Standard, HWE, s76 and App Pack), ISOs from the project's SourceForge,
 * mirrors = SourceForge's redirector.
 *
 * Official sources, and what each one is used for:
 * - bodhilinux.com/download/ (the download page): the source of truth for what
 *   is offered. Each list item names an edition and links its ISO, torrent and
 *   `.md5` / `.sha256` files on the project's SourceForge. Editions are read
 *   from the file names (`bodhi-<version>-<64|legacy>[-<flavour>].iso`); an
 *   unknown flavour or a name that does not parse throws.
 * - bodhilinux.com/w/release-cycle/ (the wiki's release-cycle page): which
 *   major lines are still supported ("security updates until 2023", "dropped
 *   2021"). A year becomes the last day of that year (`periodEnd`). A major the
 *   page does not list (7.y.z, written after the page) has no end date: eol null.
 *   The page must still list release lines, otherwise the sync throws.
 * - sourceforge.net/projects/bodhilinux/files/ (robots.txt allows the files
 *   pages): every linked file must exist there. The page shows the upload day
 *   of each file (the release date is the earliest ISO upload of the release,
 *   2023-08-21, the day of the project's announcement) and the SHA-256 / SHA-1 /
 *   MD5 that SourceForge computed.
 * - bodhilinux.com/release/<version>/: the project's release notes
 *   (`notesUrl`) when that page exists, else null.
 *
 * Checksums: the project publishes a `.sha256` and a `.md5` file next to each
 * ISO (the page links them), but they can only be read through SourceForge's
 * /download link, which redirects to a *.dl.sourceforge.net host whose
 * robots.txt disallows all bots. Following it would break the rule that every
 * request is robots-allowed, so the value is the strongest hash SourceForge
 * shows for the ISO (SHA-256 today). `checksum.url` is the project's own file of
 * that type, so the visitor can compare against the project's publication. A
 * file with no hash at all on SourceForge throws. No detached signatures are
 * published (signatureUrl null). Sizes are only given rounded ("1.3 GB"): left
 * null for run.ts.
 *
 * Excluded: the 32-bit "Legacy" 5.1.0 image, which the page still offers: its
 * line (5.y.z) is past its end of support ("security updates until 2023"), and
 * lines past EOL are dropped for every distro; SourceForge's 7.0.0-beta /
 * 7.0.0-rc folders (pre-releases of the release that is already out and not
 * linked), 6.0.0 and older folders, the Debian-based Bodhi 7 beta (described on
 * the wiki only) and the ARMHF folder.
 */

import type { Artifact, Checksum, Edition, Release } from "../../../src/lib/data-schemas";
import { getText, request } from "../http";
import { originAsMirror } from "../lib/mirrors";
import { sourceforgeDownloadUrl } from "../lib/mxiso";
import { type SourceforgeTree, sourceforgeLinkPath, sourceforgeTree } from "../lib/sfproject";
import { type SfEntry, sourceforgeFolderUrl, sourceforgeRoot } from "../lib/sourceforge";
import { compareVersions, periodEnd } from "../lib/versions";
import { defineSource } from "../source";

const PAGE = "https://www.bodhilinux.com/download/";
const CYCLE = "https://www.bodhilinux.com/w/release-cycle/";
const PROJECT = "bodhilinux";

/** Flavours the project names in its file names; an unknown one is a format change. */
const FLAVOURS: Record<
  string,
  { id: string; name: string; kind: Edition["kind"]; arch: Artifact["arch"] }
> = {
  standard: { id: "standard", name: "Standard", kind: "minimal", arch: "x86_64" },
  hwe: { id: "hwe", name: "HWE", kind: "minimal", arch: "x86_64" },
  s76: { id: "s76", name: "s76", kind: "minimal", arch: "x86_64" },
  apppack: { id: "app-pack", name: "App Pack", kind: "desktop", arch: "x86_64" },
  legacy: { id: "legacy", name: "Legacy", kind: "minimal", arch: "i686" },
};

/** bodhi-7.0.0-64.iso, bodhi-7.0.0-64-hwe.iso, bodhi-5.1.0-legacy.iso */
const ISO = /^bodhi-(\d+(?:\.\d+)+)-(?:64(?:-([a-z0-9]+))?|(legacy))\.iso$/;

interface Offer {
  version: string;
  flavour: keyof typeof FLAVOURS;
  /** Paths below the SourceForge files root of what the page links for this image. */
  iso: string;
  torrent: string | null;
  sha256: string | null;
  md5: string | null;
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&#8211;|&ndash;/g, "-")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Every image the download page offers, from the list items that link a SourceForge ISO. */
function parseOffers(html: string): Offer[] {
  const offers: Offer[] = [];
  for (const item of html.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
    const paths = [...(item[1] ?? "").matchAll(/href="([^"]+)"/g)].flatMap((m) => {
      const path = sourceforgeLinkPath(PROJECT, m[1] ?? "");
      return path ? [path] : [];
    });
    const isos = paths.filter((p) => p.endsWith(".iso"));
    if (isos.length === 0) continue;
    if (isos.length > 1)
      throw new Error(`the Bodhi download page links ${isos.length} ISOs in one item`);
    const iso = isos[0] as string;
    const m = ISO.exec(iso.split("/").pop() ?? "");
    const flavour = m?.[3] ?? m?.[2] ?? "standard";
    if (!m?.[1] || !FLAVOURS[flavour])
      throw new Error(`the Bodhi download page offers an unknown image ${iso}`);
    const linked = (suffix: string) =>
      paths.includes(`${iso}${suffix}`) ? `${iso}${suffix}` : null;
    offers.push({
      version: m[1],
      flavour,
      iso,
      torrent: linked(".torrent"),
      sha256: linked(".sha256"),
      md5: linked(".md5"),
    });
  }
  if (offers.length === 0) throw new Error("the Bodhi download page offers no SourceForge ISO");
  return offers;
}

/** Major line → end of support (null when the page gives no year): "5.y.z -> … (supported - security updates until 2023)". */
function parseCycle(html: string): Map<string, string | null> {
  const lines = new Map<string, string | null>();
  for (const m of html.matchAll(/<li><strong>(\d+)\.y\.z<\/strong>\s*(?:->|-&gt;)([^<]*)<\/li>/g)) {
    const text = decode(m[2] ?? "");
    const year =
      text.match(/security updates until (\d{4})/i)?.[1] ??
      text.match(/no longer supported\D*(\d{4})/i)?.[1];
    lines.set(m[1] as string, year ? periodEnd(year) : null);
  }
  if (lines.size === 0) throw new Error("the Bodhi release-cycle page lists no release lines");
  return lines;
}

/** The strongest hash SourceForge shows, with the project's own checksum file of that type when it has one. */
function checksumOf(entry: SfEntry, offer: Offer, folderPage: string): Checksum {
  const file = (path: string | null) => (path ? sourceforgeDownloadUrl(PROJECT, path) : null);
  if (entry.sha256)
    return { type: "sha256", value: entry.sha256, url: file(offer.sha256) ?? folderPage };
  if (entry.sha1) return { type: "sha1", value: entry.sha1, url: folderPage };
  if (entry.md5) return { type: "md5", value: entry.md5, url: file(offer.md5) ?? folderPage };
  throw new Error(`SourceForge shows no hash for ${offer.iso}`);
}

async function artifactOf(offer: Offer, tree: SourceforgeTree, entry: SfEntry): Promise<Artifact> {
  const folder = offer.iso.split("/").slice(0, -1).join("/");
  for (const linked of [offer.sha256, offer.md5])
    if (linked && !(await tree.entry(linked)))
      throw new Error(`${linked} is linked by ${PAGE} but not on the SourceForge files page`);
  let torrentUrl: string | null = null;
  if (offer.torrent) {
    if (!(await tree.entry(offer.torrent)))
      throw new Error(
        `${offer.torrent} is linked by ${PAGE} but not on the SourceForge files page`,
      );
    torrentUrl = sourceforgeDownloadUrl(PROJECT, offer.torrent);
  }
  return {
    arch: (FLAVOURS[offer.flavour] as (typeof FLAVOURS)[string]).arch,
    format: "iso",
    file: entry.name,
    path: entry.path,
    url: sourceforgeDownloadUrl(PROJECT, entry.path),
    size: null,
    checksum: checksumOf(entry, offer, sourceforgeFolderUrl(PROJECT, folder)),
    signatureUrl: null,
    torrentUrl,
  };
}

/** The project's release notes page for a version, when it exists. */
async function notesPage(version: string): Promise<string | null> {
  const url = `https://www.bodhilinux.com/release/${version.replace(/\./g, "-")}/`;
  try {
    return (await request(url, { method: "HEAD", noCache: true })).status < 400 ? url : null;
  } catch {
    return null;
  }
}

export default defineSource({
  slug: "bodhi-linux",
  hosts: ["sourceforge.net"],
  async releases(ctx) {
    const offers = parseOffers(await getText(PAGE, { accept: "text/html" }));
    const cycle = parseCycle(await getText(CYCLE, { accept: "text/html" }));
    const tree = sourceforgeTree(PROJECT);

    const versions = [...new Set(offers.map((o) => o.version))].sort((a, b) =>
      compareVersions(b, a),
    );
    const releases: Release[] = [];
    for (const version of versions) {
      const eol = cycle.get(version.split(".")[0] as string) ?? null;
      if (eol && eol < ctx.today) {
        ctx.log(`${version} dropped: its release line ended ${eol}`);
        continue;
      }
      const editions: Edition[] = [];
      const days: string[] = [];
      for (const offer of offers.filter((o) => o.version === version)) {
        const entry = await tree.entry(offer.iso);
        if (!entry) throw new Error(`${offer.iso} is linked by ${PAGE} but not on SourceForge`);
        if (entry.date) days.push(entry.date);
        const def = FLAVOURS[offer.flavour] as (typeof FLAVOURS)[string];
        editions.push({
          id: def.id,
          name: def.name,
          desktop: "moksha",
          kind: def.kind,
          artifacts: [await artifactOf(offer, tree, entry)],
        });
      }
      releases.push({
        version,
        channel: "stable",
        codename: null,
        releaseDate: days.sort()[0] ?? null,
        eol,
        notesUrl: await notesPage(version),
        editions,
      });
    }
    if (releases.length === 0)
      throw new Error("every release the Bodhi download page offers is past EOL");
    return { sources: [PAGE, CYCLE, sourceforgeFolderUrl(PROJECT)], releases };
  },
  async mirrors() {
    return {
      sources: [sourceforgeFolderUrl(PROJECT)],
      mirrors: [originAsMirror(sourceforgeRoot(PROJECT), "SourceForge", null)],
    };
  },
});
