/**
 * Q4OS: every supported series (6.x "Andromeda", 5.x "Aquarius") with its
 * newest release and every image the official download pages offer for it
 * (Plasma live, Trinity live, Trinity install-cd, the 32-bit install-cd, the
 * Windows installer), from the project's SourceForge; mirrors = SourceForge's
 * redirector plus the project's own fast mirror in Switzerland.
 *
 * Official sources, and what each one is used for:
 * - q4os.org/downloads1.html (current series, the 32-bit install-cd and the
 *   Windows installer) and the "Legacy releases page" it links (the remaining
 *   Aquarius media): the list of offered images, their codename, the "supported
 *   until <month year>" of each series, the "Files details" md5 sums, and the
 *   mirror link. Each image link goes through dnt_download.html?target=N (a
 *   donation page; its script maps N to redirectNN.html) and redirectNN.html,
 *   which names the file's SourceForge URL; both are followed, so the files come
 *   from the same place a visitor's browser ends up.
 * - sourceforge.net/projects/q4os/files/{stable,oldstable}/ (robots.txt allows
 *   the files pages): SourceForge's SHA-256, SHA-1 and MD5 of every ISO and its
 *   upload day. The page's md5 sum of a file must equal SourceForge's MD5 (a
 *   mismatch throws), then the strongest SourceForge hash is the checksum, with
 *   `checksum.url` = the files page that shows it. The Windows installer is not
 *   on SourceForge's file listing (q4os.sourceforge.io, the project's static
 *   site): its checksum is the md5 sum the download page publishes, and
 *   `checksum.url` is that page.
 * - q4os.org/blog.html: "Q4OS <version> <Codename>, stable" posts give the
 *   release date and `notesUrl` (the post's anchor). Aquarius 5.9 and 5.10 have
 *   no post: their date is the SourceForge upload day of the Plasma live image
 *   (the same fallback as MX Linux).
 *
 * Both series are LTS (the blog calls Andromeda and Aquarius "LTS"). The end of
 * support is the last day of the month the download page names ("supported until
 * August 2030 at least"); a series past it is dropped. Images are rebuilt with a
 * revision suffix (r1, r2) and replaced in place, so files are read from the
 * page, not guessed. Sizes: the pages round to a MByte: left null for run.ts.
 * No signatures or torrents are published.
 *
 * Mirrors: the SourceForge redirector root, and "Fast mirror in Switzerland"
 * (mirror.velden.media/isos/q4os/, linked by the download page and announced on
 * the blog), which keeps the same stable/ and oldstable/ tree, so mirror root +
 * path is the file. The page's Patreon "mirror" is a post, not a file tree.
 *
 * Excluded: the testing page (Q4OS 7 "Perseus" on Debian testing: a development
 * build, like every distro's testing images), the unofficial Raspberry Pi spin,
 * `q4os on ARM` (a setup script for another OS, no image), depreciated/ and
 * loopimage/ folders, and md5sum.txt (the page's own md5 list is used).
 *
 * Deviations: the Windows installer (a zip with the setup program, not a disc
 * image) is offered on the download page like the images, so it is an edition
 * of kind "other" with `path: null`; its URL answers 403 to non-browser clients,
 * so its size stays null. The two ISO series are 64-bit only except Aquarius'
 * 32-bit install-cd; the catalog's aarch64 entry has no official image.
 */

import type { Artifact, Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getText } from "../http";
import { parseEnglishDay } from "../lib/dates";
import { countryCode, originAsMirror, withSlash } from "../lib/mirrors";
import { sourceforgeChecksum, sourceforgeDownloadUrl } from "../lib/mxiso";
import {
  type SfEntry,
  sourceforgeFolder,
  sourceforgeFolderUrl,
  sourceforgeRoot,
} from "../lib/sourceforge";
import { compareVersions, periodEnd } from "../lib/versions";
import { defineSource } from "../source";

const SITE = "https://www.q4os.org/";
const DOWNLOADS = `${SITE}downloads1.html`;
const BLOG = `${SITE}blog.html`;
const PROJECT = "q4os";

/** The editions in display order: the page's wording → id, name, desktop, kind. */
const EDITIONS: Record<string, { name: string; desktop: Desktop | null; kind: Edition["kind"] }> = {
  "plasma-live": { name: "Plasma live", desktop: "kde", kind: "live" },
  "trinity-live": { name: "Trinity live", desktop: "trinity", kind: "live" },
  "trinity-install-cd": { name: "Trinity install-cd", desktop: "trinity", kind: "other" },
  winsetup: { name: "WinSetup (Windows installer)", desktop: null, kind: "other" },
};

/** q4os-6.10-x64.r2.iso, q4os-6.10-x64-tde.r2.iso, q4os-6.10-x64-instcd.r1.iso, q4os-5.10-i386-instcd.r1.iso */
const ISO = /^q4os-(\d+\.\d+)-(x64|i386)(-tde|-instcd)?\.r\d+\.iso$/;
/** q4os-winsetup-6.10-r1.zip */
const WINSETUP = /^q4os-winsetup-(\d+\.\d+)-r\d+\.zip$/;
const SF_FILE = new RegExp(
  `^https://sourceforge\\.net/projects/${PROJECT}/files/((?:stable|oldstable)/[^/]+)/download$`,
);
const STATIC_FILE = /^https:\/\/q4os\.sourceforge\.io\/download\/([^/]+)$/;

interface Link {
  /** Absolute URL of the donation page, e.g. .../dnt_download.html?target=8 */
  href: string;
  target: string;
  codename: string;
  edition: string;
  arch: Artifact["arch"];
  /** The download page (for its md5 list). */
  page: string;
}

interface Image extends Link {
  file: string;
  /** Version in the file name. */
  version: string;
  format: Artifact["format"];
  /** SourceForge path (stable/<file>), null for the Windows installer. */
  path: string | null;
  url: string;
}

/** The image links of one download page: "Q4OS Andromeda, Plasma, live - 64bit / x64". */
function parseLinks(html: string, page: string): Link[] {
  const links: Link[] = [];
  const all = [...html.matchAll(/<a href="([^"]*dnt_download\.html\?target=\d+)">(.*?)<\/a>/g)];
  for (const m of all) {
    const text = (m[2] as string).replace(/<[^>]+>/g, "").trim();
    const label = text.match(/^Q4OS ([A-Za-z]+), (.+)$/);
    const kind = label?.[2]?.match(
      /^(?:(Plasma|Trinity), (live|install-cd)|WinSetup\.exe) - (?:32|64)bit \/ (x64|i386)$/,
    );
    if (!label || !kind) throw new Error(`the Q4OS download page changed (link '${text}')`);
    const edition = kind[1] ? `${kind[1].toLowerCase()}-${kind[2]}` : "winsetup";
    links.push({
      href: new URL(m[1] as string, page).href,
      target: (m[1] as string).match(/target=(\d+)/)?.[1] as string,
      codename: label[1] as string,
      edition,
      arch: kind[3] === "i386" ? "i686" : "x86_64",
      page,
    });
  }
  if (!links.length) throw new Error(`the Q4OS download page ${page} offers no image`);
  return links;
}

/** `md5sum ; file:` list of a download page → file → md5. */
function parseMd5(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of html.matchAll(/\b([0-9a-f]{32})\s+(q4os-[^\s<]+)/g))
    out.set(m[2] as string, m[1] as string);
  return out;
}

/** dnt_download.html's script: target → redirect page. */
function parseTargets(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of html.matchAll(/^\s*"(\d+)":\s*\{\s*redirect:\s*"([^"]+)"\s*\}/gm))
    out.set(m[1] as string, m[2] as string);
  if (!out.size) throw new Error("the Q4OS download redirect page changed (no targets)");
  return out;
}

/** "Q4OS 6.10 Andromeda, stable" posts: version → date and anchor. */
function parseBlog(html: string): Map<string, { date: string; anchor: string }> {
  const out = new Map<string, { date: string; anchor: string }>();
  for (const m of html.matchAll(
    /<a name="(news\d{6})"[^>]*><\/a>\s*<h4>Q4OS (\d+\.\d+) [A-Za-z]+, stable<\/h4>\s*([^<]*)/g,
  )) {
    const date = parseEnglishDay(m[3] as string);
    if (date) out.set(m[2] as string, { date, anchor: m[1] as string });
  }
  if (!out.size) throw new Error("the Q4OS blog changed (no stable release post)");
  return out;
}

/** End of support per codename: "release codenamed 'Andromeda' ... supported until August 2030 at least". */
function parseSupport(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of html.matchAll(
    /codenamed '([A-Za-z]+)'[^.<]*?supported until ([A-Za-z]+ \d{4})/g,
  )) {
    const eol = periodEnd(m[2] as string);
    if (eol) out.set(m[1] as string, eol);
  }
  return out;
}

export default defineSource({
  slug: "q4os",
  hosts: ["sourceforge.net", "q4os.sourceforge.io", "q4os.org"],
  async releases(ctx) {
    const main = await getText(DOWNLOADS, { accept: "text/html" });
    const legacyHref = main.match(/<a href="([^"]+)">Legacy releases page<\/a>/)?.[1];
    if (!legacyHref) throw new Error("the Q4OS download page has no link to the legacy releases");
    const legacyPage = new URL(legacyHref, DOWNLOADS).href;
    const legacy = await getText(legacyPage, { accept: "text/html" });

    const links = [...parseLinks(main, DOWNLOADS), ...parseLinks(legacy, legacyPage)];
    const md5s = new Map([...parseMd5(legacy), ...parseMd5(main)]);
    const targets = parseTargets(await getText(links[0]?.href as string, { accept: "text/html" }));

    const sf = new Map<string, SfEntry>();
    for (const folder of ["stable", "oldstable"])
      for (const e of await sourceforgeFolder(PROJECT, folder)) sf.set(e.path, e);

    const images: Image[] = [];
    const seen = new Set<string>();
    for (const l of links) {
      if (seen.has(l.target)) continue;
      seen.add(l.target);
      const redirect = targets.get(l.target);
      if (!redirect) throw new Error(`Q4OS download target ${l.target} has no redirect page`);
      const body = await getText(new URL(redirect, SITE).href, { accept: "text/html" });
      const url = body.match(/window\.location\.href\s*=\s*"([^"]+)"/)?.[1];
      if (!url) throw new Error(`${redirect} names no download URL`);
      const sfPath = SF_FILE.exec(url)?.[1] ?? null;
      const file = (sfPath ?? STATIC_FILE.exec(url)?.[1])?.split("/").pop();
      const iso = file ? ISO.exec(file) : null;
      const win = file ? WINSETUP.exec(file) : null;
      if (!file || (!iso && !win)) throw new Error(`unexpected Q4OS download ${url}`);
      const expected = iso
        ? `${iso[3] === "-tde" ? "trinity-live" : iso[3] === "-instcd" ? "trinity-install-cd" : "plasma-live"}`
        : "winsetup";
      if (
        expected !== l.edition ||
        (iso && (iso[2] === "i386" ? "i686" : "x86_64") !== l.arch) ||
        (win ? sfPath !== null : sfPath === null)
      )
        throw new Error(`the Q4OS page describes ${l.edition} but links ${url}`);
      images.push({
        ...l,
        file,
        version: (iso?.[1] ?? win?.[1]) as string,
        format: iso ? "iso" : "zip",
        path: sfPath,
        url: sfPath ? sourceforgeDownloadUrl(PROJECT, sfPath) : url,
      });
    }

    const blog = parseBlog(await getText(BLOG, { accept: "text/html" }));
    const support = new Map([...parseSupport(legacy), ...parseSupport(main)]);

    const lines = [...new Set(images.map((i) => i.codename))];
    const releases: Release[] = [];
    for (const codename of lines) {
      const own = images.filter((i) => i.codename === codename);
      const eol = support.get(codename) ?? null;
      if (eol && eol < ctx.today) continue;
      const versions = new Set(own.filter((i) => i.format === "iso").map((i) => i.version));
      if (versions.size !== 1)
        throw new Error(
          `Q4OS ${codename} images belong to ${[...versions].join(", ") || "no"} version`,
        );
      const version = [...versions][0] as string;

      const editions: Edition[] = [];
      for (const [id, def] of Object.entries(EDITIONS)) {
        const artifacts: Artifact[] = own
          .filter((i) => i.edition === id)
          .map((i) => {
            const entry = i.path ? sf.get(i.path) : undefined;
            const md5 = md5s.get(i.file);
            if (!md5) throw new Error(`the Q4OS download page publishes no md5 for ${i.file}`);
            if (i.path && !entry) throw new Error(`${i.path} is not on the SourceForge files page`);
            if (entry && entry.md5 !== md5)
              throw new Error(`SourceForge and ${i.page} disagree on the md5 of ${i.file}`);
            const folder = i.path?.split("/")[0] as string;
            return {
              arch: i.arch,
              format: i.format,
              file: i.file,
              path: i.path,
              url: i.url,
              size: null,
              checksum: entry
                ? sourceforgeChecksum(entry, sourceforgeFolderUrl(PROJECT, folder))
                : { type: "md5" as const, value: md5, url: i.page },
              signatureUrl: null,
              torrentUrl: null,
            };
          })
          .sort(
            (a, b) =>
              Number(a.arch !== "x86_64") - Number(b.arch !== "x86_64") ||
              a.file.localeCompare(b.file),
          );
        if (artifacts.length)
          editions.push({ id, name: def.name, desktop: def.desktop, kind: def.kind, artifacts });
      }

      const post = blog.get(version);
      const flagship = own.find((i) => i.edition === "plasma-live" && i.arch === "x86_64");
      releases.push({
        version,
        channel: "lts",
        codename,
        releaseDate: post?.date ?? (flagship?.path ? (sf.get(flagship.path)?.date ?? null) : null),
        eol,
        notesUrl: post ? `${BLOG}#${post.anchor}` : null,
        editions,
      });
    }
    if (!releases.length) throw new Error("no supported Q4OS series on the download pages");
    releases.sort((a, b) => compareVersions(b.version, a.version));
    return {
      sources: [DOWNLOADS, legacyPage, BLOG, sourceforgeFolderUrl(PROJECT, "stable")],
      releases,
    };
  },
  async mirrors() {
    const main = await getText(DOWNLOADS, { accept: "text/html" });
    const mirrors: Mirror[] = [originAsMirror(sourceforgeRoot(PROJECT), "SourceForge", null)];
    for (const m of main.matchAll(
      /<a href="(https:\/\/[^"]+)">Fast mirror in ([A-Za-z ]+)<\/a>/g,
    )) {
      const url = new URL(m[1] as string);
      mirrors.push({
        url: withSlash(url.href),
        country: countryCode(m[2]),
        name: url.hostname,
        lat: null,
        lon: null,
        score: null,
      });
    }
    return { sources: [DOWNLOADS], mirrors };
  },
});
