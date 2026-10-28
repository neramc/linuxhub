/**
 * Garuda Linux.
 *
 * Official sources, and what each one is used for:
 * - garudalinux.org/editions: the download page is an Angular app with no
 *   data in its HTML. The editions it offers (name, code name and which
 *   downloads each has: direct, SourceForge, SHA-256, torrent) and the
 *   template of its download links (".../iso/latest/garuda/#edition#/latest.iso")
 *   are plain object literals in the app's configuration chunk, found through
 *   the page's main script. Everything the page lists with a direct download
 *   is listed here; "Nix Subsystem" has none (the page says it is not an ISO
 *   you can boot) and is left out.
 * - iso.builds.garudalinux.org (the project's ISO server, robots.txt allows
 *   it): for the editions with a SHA-256 on the page, <template>.sha256
 *   redirects to the checksum file of the tested release build
 *   (iso/garuda/<edition>/<YYMMDD>/<file>.sha256, which names the ISO). The
 *   dated directories also hold untested daily builds, so only that alias is
 *   followed. COSMIC is the page's community edition: the page links the
 *   directory iso/community/cosmic/ (no alias), so the newest dated build not
 *   newer than the release snapshot is used, with its .sha256 next to the ISO.
 *   The server publishes no PGP signature; the .torrent is used where the
 *   page offers one.
 * - forum.garudalinux.org (announcements category, Discourse JSON): the
 *   release topic 'Garuda Linux "<Codename>" (<YYMMDD>)' gives the codename
 *   and notesUrl of the snapshot; without one the codename is null.
 *
 * Releases: editions are grouped by snapshot date (the YYMMDD directory), the
 * newest first. All editions share a snapshot today, so there is one release.
 *
 * Download links: the page's Direct button is <alias>?r2=1, which the server
 * answers with a redirect to the project's Cloudflare R2 CDN (r2.garudalinux.org,
 * which refuses requests without the redirect's marker). The artifact URL is
 * the dated file with the same ?r2=1, so the button is the project's own CDN
 * route and still names the exact file the checksum belongs to; COSMIC (whose
 * page link is a plain directory) has the plain dated URL. The CDN cannot be a
 * mirror root, so the mirror entry is the ISO server's root (one origin:
 * originAsMirror), and root + path is the file.
 *
 * Sizes are not published (run.ts HEADs them). Desktop of each edition comes
 * from its name on the page (Mokka, Dr460nized, Dr460nized Gaming and KDE Lite
 * are KDE Plasma); a new edition the table does not know gets desktop null.
 */

import type { Edition, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getJson, getText, request } from "../http";
import { checksumType, parseChecksums } from "../lib/checksums";
import { listDirectory } from "../lib/dirlist";
import { originAsMirror } from "../lib/mirrors";
import { defineSource } from "../source";

const PAGE = "https://garudalinux.org/editions";
const ISO = "https://iso.builds.garudalinux.org/iso/";
const FORUM = "https://forum.garudalinux.org/";
const ANNOUNCEMENTS = `${FORUM}c/announcements/16`;

const DESKTOP_OF: Record<string, Desktop> = {
  dr460nized: "kde",
  "dr460nized-gaming": "kde",
  mokka: "kde",
  "kde-lite": "kde",
  gnome: "gnome",
  xfce: "xfce",
  cinnamon: "cinnamon",
  hyprland: "hyprland",
  sway: "sway",
  i3: "i3",
  cosmic: "cosmic",
};

interface Offered {
  name: string;
  code: string;
  /** The page links a SHA-256 and the release alias (otherwise the community directory). */
  alias: boolean;
  torrent: boolean;
}

interface Build {
  offered: Offered;
  date: string;
  file: string;
  hash: string;
  /** Under iso/: "garuda/<code>/<date>/<file>" or "community/<code>/<date>/<file>". */
  path: string;
}

/** The app's configuration: the download-link template and the editions with their downloads. */
async function configuration(): Promise<{ template: string; offered: Offered[] }> {
  const html = await getText(PAGE, { accept: "text/html" });
  const main = html.match(/<script[^>]*\ssrc="([^"]*main-[A-Za-z0-9]+\.js)"/)?.[1];
  if (!main) throw new Error(`no main script on ${PAGE}`);
  const mainUrl = new URL(main, PAGE).href;
  const mainJs = await getText(mainUrl, { accept: "text/javascript" });
  // The configuration sits in one of the chunks that the main script imports.
  const chunkUrls = [
    ...new Set(
      [...mainJs.matchAll(/\bimport\{[^}]*\}from"\.\/(chunk-[A-Za-z0-9]+\.js)"/g)].map(
        (m) => new URL(m[1] ?? "", mainUrl).href,
      ),
    ),
  ];
  for (const url of [mainUrl, ...chunkUrls]) {
    const js = url === mainUrl ? mainJs : await getText(url, { accept: "text/javascript" });
    const template = js.match(/downloadUrl:"([^"]*#edition#[^"]*)"/)?.[1];
    if (template) return { template, offered: parseEditions(js) };
  }
  throw new Error(`no download configuration in the scripts of ${PAGE}`);
}

/** Editions are object literals: {name:"X", ... codeName:"x", ... downloads:{direct:!0,sourceforge:!0,sha256:!0,torrent:!0}, ...}. */
function parseEditions(js: string): Offered[] {
  const out: Offered[] = [];
  for (const part of js.split('{name:"').slice(1)) {
    const head = part.slice(0, 3000);
    const name = head.match(/^([^"]+)"/)?.[1];
    const code = head.match(/codeName:"([a-z0-9-]+)"/)?.[1];
    const downloads = head.match(/downloads:\{([^}]*)\}/)?.[1];
    if (!name || !code || downloads === undefined) continue;
    const flag = (k: string) => new RegExp(`\\b${k}:!0`).test(downloads);
    if (!flag("direct")) continue;
    out.push({ name, code, alias: flag("sha256"), torrent: flag("torrent") });
  }
  if (!out.length) throw new Error("no editions with a direct download in the page configuration");
  const codes = out.map((o) => o.code);
  if (new Set(codes).size !== codes.length)
    throw new Error("duplicate editions in the page configuration");
  return out;
}

const SUM_URL =
  /^https:\/\/iso\.builds\.garudalinux\.org\/iso\/garuda\/([a-z0-9-]+)\/(\d{6})\/([^/]+\.iso)\.sha256$/;

/** The tested release build behind <template>.sha256 (it redirects to the build's checksum file). */
async function aliasBuild(offered: Offered, template: string): Promise<Build> {
  // A redirect to a tiny file: always read it fresh, an old copy could name the previous build.
  const res = await request(`${template.replace("#edition#", offered.code)}.sha256`, {
    noCache: true,
  });
  const m = res.finalUrl.match(SUM_URL);
  const [, code, date, file] = m ?? [];
  if (!m || code !== offered.code || !date || !file)
    throw new Error(`unexpected checksum location ${res.finalUrl} for ${offered.code}`);
  const hash = parseChecksums(res.body).get(file);
  if (!hash) throw new Error(`${res.finalUrl} does not list ${file}`);
  return { offered, date, file, hash, path: `garuda/${code}/${date}/${file}` };
}

/** A community edition has no alias: the newest dated build that is not newer than the release snapshot. */
async function communityBuild(offered: Offered, snapshot: string): Promise<Build> {
  const root = `${ISO}community/${offered.code}/`;
  const dates = (await listDirectory(root))
    .flatMap((n) => n.match(/^(\d{6})\/$/)?.[1] ?? [])
    .filter((d) => d <= snapshot)
    .sort()
    .reverse();
  for (const date of dates) {
    const sum = (await listDirectory(`${root}${date}/`)).find((n) => n.endsWith(".iso.sha256"));
    if (!sum) continue;
    const file = sum.slice(0, -".sha256".length);
    const hash = parseChecksums(await getText(`${root}${date}/${sum}`)).get(file);
    if (hash)
      return { offered, date, file, hash, path: `community/${offered.code}/${date}/${file}` };
  }
  throw new Error(`no build of ${offered.code} up to ${snapshot} under ${root}`);
}

/** "260819" -> "2026-08-19". */
const dateOf = (yymmdd: string) =>
  `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;

/** Release topics are titled 'Garuda Linux "Temeraire" (260819)'. */
async function announcements(): Promise<Map<string, { codename: string; url: string }>> {
  const data = await getJson<{
    topic_list?: { topics?: { id: number; slug: string; title: string }[] };
  }>(`${ANNOUNCEMENTS}.json`);
  const topics = data.topic_list?.topics;
  if (!Array.isArray(topics))
    throw new Error(`unexpected announcements JSON from ${ANNOUNCEMENTS}.json`);
  const found = new Map<string, { codename: string; url: string }>();
  for (const t of topics) {
    const m = String(t.title ?? "").match(/^Garuda Linux\s+["“]([^"”]+)["”]\s*\((\d{6})\)/);
    if (m?.[1] && m[2] && !found.has(m[2]))
      found.set(m[2], { codename: m[1], url: `${FORUM}t/${t.slug}/${t.id}` });
  }
  return found;
}

export default defineSource({
  slug: "garuda-linux",
  hosts: ["iso.builds.garudalinux.org"],
  async releases(ctx) {
    const { template, offered } = await configuration();
    const aliased = offered.filter((o) => o.alias);
    const builds: Build[] = [];
    for (const o of aliased) builds.push(await aliasBuild(o, template));
    const snapshot = builds
      .map((b) => b.date)
      .sort()
      .at(-1);
    if (!snapshot) throw new Error(`${PAGE} offers no release builds`);
    for (const o of offered.filter((x) => !x.alias)) {
      ctx.log(`${o.code}: community edition (no release alias), newest build up to ${snapshot}`);
      builds.push(await communityBuild(o, snapshot));
    }

    const bySnapshot = new Map<string, Edition[]>();
    // The page's order (regular editions, then the advanced ones).
    for (const o of offered) {
      const b = builds.find((x) => x.offered === o) as Build;
      const url = `${ISO}${b.path}`;
      const edition: Edition = {
        id: o.code,
        name: o.name,
        desktop: DESKTOP_OF[o.code] ?? null,
        kind: "desktop",
        artifacts: [
          {
            arch: "x86_64",
            format: "iso",
            file: b.file,
            path: b.path,
            url: o.alias ? `${url}?r2=1` : url,
            size: null,
            checksum: { type: checksumType(b.hash), value: b.hash, url: `${url}.sha256` },
            signatureUrl: null,
            torrentUrl: o.torrent ? `${url}.torrent` : null,
          },
        ],
      };
      bySnapshot.set(b.date, [...(bySnapshot.get(b.date) ?? []), edition]);
    }

    const topics = await announcements();
    const releases: Release[] = [...bySnapshot.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, editions]) => ({
        version: date,
        channel: "rolling",
        codename: topics.get(date)?.codename ?? null,
        releaseDate: dateOf(date),
        eol: null,
        notesUrl: topics.get(date)?.url ?? ANNOUNCEMENTS,
        editions,
      }));
    return { sources: [PAGE, `${ISO}latest/garuda/`, `${ANNOUNCEMENTS}.json`], releases };
  },
  async mirrors() {
    // One official origin (the CDN behind it is reached only through its redirect).
    return {
      sources: [PAGE],
      mirrors: [originAsMirror(ISO, "iso.builds.garudalinux.org")],
    };
  },
});
