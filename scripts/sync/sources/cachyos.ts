/**
 * CachyOS.
 *
 * Official sources, and what each one is used for:
 * - cachyos.org/download/: what the project offers, one <astro-island> per
 *   edition (Desktop Edition, Handheld Edition) whose props carry the direct
 *   URL, the torrent, and the magnet link whose web seeds (ws=) are the hosts
 *   that carry that very file (the project's CDN, its own regional servers and
 *   third-party mirrors). The file URL on the project's CDN
 *   (cdn77.cachyos.org/ISO/<dir>/<YYMMDD>/<file>) is one of those web seeds and
 *   is the canonical `url`. Only what the page offers is listed: the ISO
 *   origin also keeps cli/, kde/ and testing/ trees that the page does not
 *   offer (excluded for every distro alike).
 * - mirror.cachyos.org/ISO/<dir>/<YYMMDD>/: the origin of the checksum
 *   (<file>.sha256, SHA-256; the wiki's download page quotes the same value)
 *   and of the PGP signature (<file>.sig, documented on the wiki's download
 *   page for every ISO). The CDN serves the ISO, the origin the proofs.
 * - cachyos.org/blog/: release posts are named /blog/<YYMM>-<month>-release;
 *   the post for the image's year-month is notesUrl (the GUI installer
 *   changelog on the wiki when there is none).
 * - raw.githubusercontent.com/CachyOS/CachyOS-PKGBUILDS (cachyos-mirrorlist):
 *   the project's package mirror list marks each server with "code=XX"; it is
 *   the only official place that states mirror countries, so a web seed whose
 *   host is on it gets that country (GLOBAL and unlisted hosts: null).
 *
 * Releases: the images are dated snapshots (YYMMDD in the file name) and the
 * two editions are built on their own schedules (Handheld is older than
 * Desktop today). Editions are grouped by snapshot, newest first: the newest
 * snapshot plus the previous one while the download page still offers it
 * (conventions, rolling). No snapshot has an EOL.
 *
 * Mirrors: the web seeds that carry every offered edition (a seed that lists
 * only one edition cannot serve the other one's file, and the wizard builds
 * mirror root + artifact path). run.ts then checks each one for the newest
 * file; hosts robots.txt keeps it from checking stay on the official list.
 * The mirrorlist's tier marks repository mirrors, not ISO ones, so score is
 * null. The SourceForge copy that the page also links is not listed: its
 * redirector is closed to bots and CachyOS has its own mirror network.
 *
 * Direct link (changed October 2026). The page's direct link used to be the CDN
 * file; since the page of 2026-10-23 it is https://mirror.zyner.org/cachyos/ISO/…
 * (both editions). That host is an official mirror, not the project's CDN: the
 * project's own mirror list (cachyos-mirrorlist above) names it "Sweden Mirror much
 * thanks to Zyner!", tier 1, code SE, root https://mirror.zyner.org/cachyos/, and the
 * page lists it among the web seeds of both ISOs. So it is listed as a mirror (the
 * root is the direct link's, which is also the mirror list's; the web seed entry
 * writes it with another prefix, /mirror/cachyos/) but not made the canonical URL:
 * `url` stays on the CDN, which the same page lists as a web seed, the wiki's
 * download page uses for the signature, and which answers HEAD with the file (same
 * length as the origin). `hosts` is unchanged because no artifact, checksum,
 * signature or torrent URL points at a mirror, and the strategy stays `redirector`
 * (the CDN picks the server; one third-party mirror would not be a CDN). The source
 * fails when the page's layout changes or no longer lists the CDN as a web seed. A
 * direct-link host that is not a listed web seed is not trusted: it changes nothing.
 * mirror.zyner.org's robots.txt closes it to LinuxhubBot (or it does not answer), so
 * run.ts cannot check its root and keeps it on the project's word.
 *
 * Deviations: desktop is null for the Desktop Edition because no official page
 * says which desktop its live session runs (the installer offers 17+); the
 * Handheld Edition is KDE Plasma ("only KDE Plasma is supported", download
 * page). Sizes are not published, run.ts HEADs them.
 */

import type { Artifact, Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getText } from "../http";
import { checksumType, parseChecksums } from "../lib/checksums";
import { countryCode } from "../lib/mirrors";
import type { SyncContext } from "../source";
import { defineSource } from "../source";

const SITE = "https://cachyos.org/";
const PAGE = `${SITE}download/`;
const BLOG = `${SITE}blog/`;
const ORIGIN = "https://mirror.cachyos.org/ISO/";
/** The project's CDN (CDN77), the canonical host of the ISOs. */
const CDN_HOST = "cdn77.cachyos.org";
const CHANGELOG = "https://wiki.cachyos.org/cachyos_basic/changelogs/gui_installer/";
const MIRRORLIST =
  "https://raw.githubusercontent.com/CachyOS/CachyOS-PKGBUILDS/master/cachyos-mirrorlist/cachyos-mirrorlist";

/** Desktop of an edition's live session, where the download page states it (by ISO directory). */
const DESKTOP_OF: Record<string, Desktop> = { handheld: "kde" };

interface Offered {
  title: string;
  /** ISO directory: "desktop", "handheld". */
  dir: string;
  /** Snapshot, "260809". */
  date: string;
  file: string;
  url: string;
  torrent: string | null;
  /** Mirror roots (ending with "/") from the magnet link's web seeds. */
  seeds: string[];
}

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** Astro serializes island props as [0, value] pairs. */
function plain(v: unknown): unknown {
  return Array.isArray(v) && v.length === 2 && v[0] === 0 ? v[1] : v;
}

/** releases() and mirrors() read the same page; fetch it once per run. */
const pages = new WeakMap<SyncContext, Promise<Offered[]>>();
const page = (ctx: SyncContext) => {
  let pending = pages.get(ctx);
  if (!pending) {
    pending = readPage();
    pages.set(ctx, pending);
  }
  return pending;
};

async function readPage(): Promise<Offered[]> {
  const html = await getText(PAGE, { accept: "text/html" });
  const offered: Offered[] = [];
  for (const island of html.matchAll(/<astro-island\b[^>]*?\sprops="([^"]*)"/g)) {
    let props: Record<string, unknown>;
    try {
      const parsed = JSON.parse(decode(island[1] ?? "")) as { data?: unknown };
      const data = plain(parsed.data);
      if (!data || typeof data !== "object") continue;
      props = data as Record<string, unknown>;
    } catch {
      continue;
    }
    const str = (k: string) => {
      const v = plain(props[k]);
      return typeof v === "string" ? v : null;
    };
    const direct = str("direct_url");
    const title = str("title");
    if (!direct || !title) continue;
    // The direct link may sit on the CDN, the origin or a mirror (mirror.zyner.org
    // since October 2026), so only its layout is fixed: <root>/ISO/<dir>/<date>/<file>.
    const m = direct.match(
      /^(https:\/\/[^/]+\/(?:[a-z0-9._-]+\/)*?)ISO\/([a-z0-9-]+)\/(\d{6})\/(cachyos-\2-linux-\3\.iso)$/,
    );
    if (!m?.[1] || !m[2] || !m[3] || !m[4])
      throw new Error(`unexpected direct URL ${direct} on ${PAGE}`);
    const [, directRoot, dir, date, file] = m;
    const tail = `ISO/${dir}/${date}/${file}`;
    const seeds = [...(str("magnet_url") ?? "").matchAll(/[?&]ws=([^&]+)/g)].flatMap((w) => {
      const seed = decodeURIComponent(w[1] ?? "");
      return seed.startsWith("https://") && seed.endsWith(`/${tail}`)
        ? [seed.slice(0, -tail.length)]
        : [];
    });
    if (!seeds.length) throw new Error(`no web seeds for ${title} on ${PAGE}`);
    // The file's canonical URL is on the project's own CDN, which the page lists as a web seed.
    const cdn = seeds.find((root) => new URL(root).hostname === CDN_HOST);
    if (!cdn) throw new Error(`${title} on ${PAGE} no longer lists ${CDN_HOST} as a web seed`);
    // The direct link is used only for the layout of a mirror the page also lists as a web seed
    // (its direct link is on mirror.zyner.org, whose seed entry has another prefix); a host the
    // page does not list as carrying the file is not trusted and changes nothing.
    const directHost = new URL(directRoot).hostname;
    const roots = seeds.map((root) => (new URL(root).hostname === directHost ? directRoot : root));
    offered.push({
      title,
      dir,
      date,
      file,
      url: `${cdn}${tail}`,
      torrent: str("torrent_url"),
      seeds: [...new Set(roots)],
    });
  }
  if (!offered.length) throw new Error(`no editions on ${PAGE}`);
  return offered;
}

/** "260809" -> "2026-08-09". */
const dateOf = (yymmdd: string) =>
  `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export default defineSource({
  slug: "cachyos",
  hosts: [CDN_HOST, "mirror.cachyos.org", "torrents.soulharsh007-codewerkstatt.de"],
  async releases(ctx) {
    const offered = await page(ctx);

    const posts = new Map<string, string>();
    for (const post of (await getText(BLOG, { accept: "text/html" })).matchAll(
      /href="(\/blog\/(\d{4})-[a-z]+-release)"/g,
    ))
      if (post[1] && post[2]) posts.set(post[2], new URL(post[1], SITE).href);

    const bySnapshot = new Map<string, Edition[]>();
    const sources = [PAGE, BLOG];
    for (const o of offered) {
      const base = `${ORIGIN}${o.dir}/${o.date}/${o.file}`;
      const sumUrl = `${base}.sha256`;
      const hash = parseChecksums(await getText(sumUrl)).get(o.file);
      if (!hash) throw new Error(`${sumUrl} does not list ${o.file}`);
      sources.push(sumUrl);
      const artifact: Artifact = {
        arch: "x86_64",
        format: "iso",
        file: o.file,
        path: `ISO/${o.dir}/${o.date}/${o.file}`,
        url: o.url,
        size: null,
        checksum: { type: checksumType(hash), value: hash, url: sumUrl },
        signatureUrl: `${base}.sig`,
        torrentUrl: o.torrent,
      };
      const edition: Edition = {
        id: slug(o.title),
        name: o.title,
        desktop: DESKTOP_OF[o.dir] ?? null,
        kind: "desktop",
        artifacts: [artifact],
      };
      bySnapshot.set(o.date, [...(bySnapshot.get(o.date) ?? []), edition]);
    }

    const releases: Release[] = [...bySnapshot.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, editions]) => ({
        version: date,
        channel: "rolling",
        codename: null,
        releaseDate: dateOf(date),
        eol: null,
        notesUrl: posts.get(date.slice(0, 4)) ?? CHANGELOG,
        editions,
      }));
    return { sources, releases };
  },
  async mirrors(ctx) {
    const offered = await page(ctx);
    // Roots that every offered edition lists as a web seed, in the page's order.
    const common = (offered[0]?.seeds ?? []).filter((root) =>
      offered.every((o) => o.seeds.includes(root)),
    );
    if (!common.length) throw new Error(`no mirror carries every edition listed on ${PAGE}`);

    // Countries from the project's own mirror list: "## tier=1 code=FR" above "Server = https://host/...".
    const countries = new Map<string, string | null>();
    let code: string | null = null;
    for (const line of (await getText(MIRRORLIST, { accept: "text/plain" })).split(/\r?\n/)) {
      const marked = line.match(/\bcode=([A-Z]+)\b/)?.[1];
      if (marked) code = marked;
      const host = line.match(/^#*\s*Server\s*=\s*https:\/\/([^/\s]+)\//)?.[1];
      if (host && !countries.has(host)) countries.set(host, code ? countryCode(code) : null);
    }

    const mirrors: Mirror[] = common.map((root) => {
      const host = new URL(root).hostname;
      return {
        url: root,
        country: countries.get(host) ?? null,
        name: host,
        lat: null,
        lon: null,
        score: null,
      };
    });
    return { sources: [PAGE, MIRRORLIST], mirrors };
  },
});
