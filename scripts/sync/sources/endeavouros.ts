/**
 * EndeavourOS.
 *
 * Official sources, and what each one is used for:
 * - endeavouros.com/download/: the one ISO the project offers (name, "image
 *   dated" day, SHA-512 in the "Verify your download" section, the torrent
 *   link) and the official mirror table (26 rows by continent, each with the
 *   country code and a link to <root>iso/<file>). The project has no download
 *   host of its own: every download is a mirror, so the page is the origin of
 *   the checksum (checksum.url = the page). The same digest sits in the
 *   <file>.sha512sum next to the ISO on every mirror; the one on the canonical
 *   mirror is read and must agree with the page (the sync throws otherwise),
 *   which also proves that the canonical URL answers before it is published.
 * - endeavouros.com/endeavouros-arm/ ("EndeavourOS ARM" in the main menu, same
 *   site): the project's aarch64 images, six .img.xz files on the project's
 *   GitHub releases (github.com/endeavouros-arm/images), each with a
 *   .sha512sum release asset. github.com's robots.txt disallows release
 *   downloads for every bot ("/*\/download"), so those checksum files are not
 *   read and the ARM images have no checksum (the images stay linked; the same
 *   treatment as every checksum robots.txt closes). They are listed as editions of the newest ISO
 *   release: they are rebuilt in place under "-latest" names and have no
 *   version of their own. The page does not print the architecture; all the
 *   listed devices (Raspberry Pi 4b/5b, Odroid N2, PineBook Pro) are 64-bit
 *   ARM, which is what the image names (enosLinuxARM) and the catalog say.
 * - endeavouros.com/news/feed.xml: the release announcement. The ISO name
 *   carries only the codename ("Titan-Nova") and the build day, the
 *   announcement (a few days to weeks later) is the release date, so the
 *   earliest item that names the codename within 90 days after the build is
 *   used for releaseDate and notesUrl; without a match the build day and the
 *   news index are used.
 *
 * Canonical URL: mirror.alpix.eu, a listed mirror that robots.txt lets the
 * sync size and check (the page's own torrent host, mirror.rznet.fr, refuses
 * bots). Fails closed when it is no longer listed. Every listed mirror stays on
 * the list; run.ts checks each one over HTTPS and keeps those that robots.txt
 * keeps it from checking.
 *
 * Deviations / exclusions: the ISO has no stated desktop in any official page
 * (the installer offers several), so desktop is null; the ISO size is on the
 * page only as "3.63 GiB", so sizes stay null and run.ts HEADs them; ARM
 * images are not on the mirrors (path null) and have no signature or torrent.
 */

import type { Artifact, Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import { getText } from "../http";
import { checksumType, parseChecksums, readChecksum } from "../lib/checksums";
import { countryCode } from "../lib/mirrors";
import { isoDay } from "../lib/versions";
import type { SyncContext } from "../source";
import { defineSource } from "../source";

const SITE = "https://endeavouros.com/";
const PAGE = `${SITE}download/`;
const ARM_PAGE = `${SITE}endeavouros-arm/`;
const NEWS = `${SITE}news/`;
const FEED = `${NEWS}feed.xml`;
const CANONICAL = "mirror.alpix.eu";
/** A release announcement counts for an ISO when it follows the build within this many days. */
const ANNOUNCE_WINDOW_DAYS = 90;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .trim();

interface Listed {
  /** Mirror root: root + "iso/<file>" is the ISO. */
  root: string;
  host: string;
  name: string | null;
  country: string | null;
}

interface PageInfo {
  file: string;
  /** "2026.08.15" */
  version: string;
  /** "Titan Nova" */
  codename: string;
  built: string | null;
  sha512: string;
  torrent: string | null;
  mirrors: Listed[];
}

interface ArmImage {
  label: string;
  server: boolean;
  file: string;
  url: string;
  sumUrl: string;
}

/** releases() and mirrors() read the same pages; fetch them once per run. */
const pages = new WeakMap<SyncContext, Promise<PageInfo>>();
const page = (ctx: SyncContext) => {
  let pending = pages.get(ctx);
  if (!pending) {
    pending = readPage();
    pages.set(ctx, pending);
  }
  return pending;
};

async function readPage(): Promise<PageInfo> {
  const html = await getText(PAGE, { accept: "text/html" });
  const file = html.match(/<code>(EndeavourOS_[A-Za-z0-9_.-]+\.iso)<\/code>/)?.[1];
  if (!file) throw new Error(`no ISO name on ${PAGE}`);
  // "EndeavourOS_Titan-Nova-2026.08.15.iso" -> codename "Titan Nova", version "2026.08.15".
  const m = file.match(/^EndeavourOS_(.+?)-(\d{4}\.\d{2}\.\d{2})\.iso$/);
  if (!m?.[1] || !m[2]) throw new Error(`unexpected ISO name ${file} on ${PAGE}`);
  const sha512 = html.match(/id="sha512-value">\s*([0-9a-fA-F]{128})\s*</)?.[1]?.toLowerCase();
  if (!sha512) throw new Error(`no SHA-512 on ${PAGE}`);

  const mirrors: Listed[] = [];
  for (const row of html.split(/<tr\b/).slice(1)) {
    const link = row.match(
      new RegExp(`class="c-name"><a href="(https://[^"]+/)iso/${esc(file)}"[^>]*>([^<]*)<`),
    );
    if (!link?.[1]) continue;
    const cc = row.match(/<span class="cc"[^>]*>([A-Z]{2})<\/span>/)?.[1];
    const country = row.match(/<span class="country">([^<]+)<\/span>/)?.[1];
    mirrors.push({
      root: decode(link[1]),
      host: new URL(decode(link[1])).hostname,
      name: decode(link[2] ?? "") || null,
      country: countryCode(cc) ?? countryCode(country ? decode(country) : null),
    });
  }
  const stated = Number(html.match(/(\d+) mirrors worldwide/)?.[1]);
  if (!mirrors.length || mirrors.length !== stated)
    throw new Error(`${PAGE} lists ${mirrors.length} mirror rows but says ${stated}`);

  const torrent = html.match(new RegExp(`href="(https://[^"]+/${esc(file)}\\.torrent)"`))?.[1];
  return {
    file,
    version: m[2],
    codename: m[1].replace(/[-_]+/g, " "),
    built: html.match(/image dated (\d{4}-\d{2}-\d{2})/)?.[1] ?? null,
    sha512,
    torrent: torrent ? decode(torrent) : null,
    mirrors,
  };
}

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** The announcement for this ISO: earliest feed item naming the codename within the window after the build. */
async function announcement(info: PageInfo): Promise<{ date: string; url: string } | null> {
  if (!info.built) return null;
  const feed = await getText(FEED, { accept: "application/rss+xml" });
  const name = new RegExp(`\\b${esc(info.codename)}\\b`, "i");
  const found: { date: string; url: string }[] = [];
  for (const item of feed.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = item[1] ?? "";
    const tag = (t: string) =>
      decode(
        body
          .match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`))?.[1]
          ?.replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, "") ?? "",
      );
    const date = isoDay(tag("pubDate"));
    const url = tag("link");
    if (!date || !url.startsWith("https://") || !name.test(tag("title"))) continue;
    const late = (day(date) - day(info.built)) / 86_400_000;
    if (late >= 0 && late <= ANNOUNCE_WINDOW_DAYS) found.push({ date, url });
  }
  return found.sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

const ARM_ROW =
  /class="c-loc">([^<]+)<\/th>\s*<td class="c-name"><a href="(https:\/\/github\.com\/endeavouros-arm\/images\/releases\/download\/[^"/]+\/([^"/]+\.img\.xz))"[\s\S]*?<a href="(https:\/\/github\.com\/endeavouros-arm\/images\/releases\/download\/[^"]+\.sha512sum)"/;

function armRows(html: string, server: boolean): ArmImage[] {
  const images: ArmImage[] = [];
  for (const row of html.split(/<tr\b/).slice(1)) {
    const m = row.match(ARM_ROW);
    if (!m?.[1] || !m[2] || !m[3] || !m[4]) continue;
    images.push({
      label: decode(m[1]),
      server,
      file: m[3],
      url: decode(m[2]),
      sumUrl: decode(m[4]),
    });
  }
  const stated = (html.match(/class="c-loc">/g) ?? []).length;
  if (stated !== images.length)
    throw new Error(`${ARM_PAGE} has ${stated} image rows but ${images.length} were understood`);
  return images;
}

/** The ARM images and their checksum files, as the ARM page lists them (desktop table, then headless server table). */
async function readArm(): Promise<ArmImage[]> {
  const html = await getText(ARM_PAGE, { accept: "text/html" });
  const serverAt = html.indexOf('id="server-images"');
  if (serverAt < 0) throw new Error(`no headless server section on ${ARM_PAGE}`);
  const images = [
    ...armRows(html.slice(0, serverAt), false),
    ...armRows(html.slice(serverAt), true),
  ];
  if (!images.some((i) => !i.server) || !images.some((i) => i.server))
    throw new Error(`${ARM_PAGE} no longer lists both desktop and server images`);
  return images;
}

const slug = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

async function armEditions(): Promise<Edition[]> {
  const editions: Edition[] = [];
  for (const image of await readArm()) {
    // On GitHub release assets, which robots.txt closes: null (see the header).
    const hash = await readChecksum(image.sumUrl, image.file);
    editions.push({
      id: slug(image.label),
      name: image.label,
      desktop: image.server ? "none" : null,
      kind: image.server ? "server" : "desktop",
      artifacts: [
        {
          arch: "aarch64",
          format: "img.xz",
          file: image.file,
          path: null,
          url: image.url,
          size: null,
          checksum: hash ? { type: checksumType(hash), value: hash, url: image.sumUrl } : null,
          signatureUrl: null,
          torrentUrl: null,
        },
      ],
    });
  }
  return editions;
}

export default defineSource({
  slug: "endeavouros",
  hosts: ["endeavouros.com", CANONICAL, "mirror.rznet.fr", "github.com"],
  async releases(ctx) {
    const info = await page(ctx);
    const canonical = info.mirrors.find((m) => m.host === CANONICAL);
    if (!canonical) throw new Error(`${CANONICAL} is no longer listed on ${PAGE}`);
    const path = `iso/${info.file}`;
    const url = `${canonical.root}${path}`;

    // The mirror's own checksum file must exist and agree with the page.
    const sumUrl = `${url}.sha512sum`;
    const onMirror = parseChecksums(await getText(sumUrl)).get(info.file);
    if (!onMirror) throw new Error(`${sumUrl} does not list ${info.file}`);
    if (onMirror !== info.sha512)
      throw new Error(`SHA-512 of ${info.file} differs between ${PAGE} and ${sumUrl}`);

    const news = await announcement(info);
    const iso: Artifact = {
      arch: "x86_64",
      format: "iso",
      file: info.file,
      path,
      url,
      size: null,
      checksum: { type: "sha512", value: info.sha512, url: PAGE },
      signatureUrl: `${url}.sig`,
      torrentUrl: info.torrent,
    };
    const arm = await armEditions();
    const release: Release = {
      version: info.version,
      channel: "rolling",
      codename: info.codename,
      releaseDate: news?.date ?? info.built ?? info.version.replace(/\./g, "-"),
      eol: null,
      notesUrl: news?.url ?? NEWS,
      editions: [
        { id: "live", name: "Live ISO", desktop: null, kind: "live", artifacts: [iso] },
        ...arm,
      ],
    };
    return { sources: [PAGE, ARM_PAGE, FEED, sumUrl], releases: [release] };
  },
  async mirrors(ctx) {
    const info = await page(ctx);
    const seen = new Set<string>();
    const mirrors: Mirror[] = [];
    for (const m of info.mirrors) {
      if (seen.has(m.root)) continue;
      seen.add(m.root);
      mirrors.push({
        url: m.root,
        country: m.country,
        name: m.name,
        lat: null,
        lon: null,
        score: null,
      });
    }
    return { sources: [PAGE], mirrors };
  },
});
