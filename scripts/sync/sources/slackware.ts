/**
 * Slackware Linux (stable releases; the 64-bit and the 32-bit install DVD).
 *
 * Why not the download page: slackware.com and www.slackware.com (the download
 * page /getslack/, the release announcements, the torrent page) have no usable
 * HTTPS side: on 2026-10-28 https://slackware.com did not answer and
 * https://www.slackware.com answered HTTP 405 to every request, because the
 * site is served over plain HTTP, which the sync never fetches. What the page
 * offers is read from the project's own ISO tree instead, on the project's
 * HTTPS site mirrors.slackware.com (its ISO source and mirror redirector). Its
 * robots.txt asks for a 5 s crawl delay, which the HTTP client keeps, so this
 * source makes few requests.
 *
 * Official sources, and what each one is used for:
 * - endoflife.date/slackware (community-maintained, sourced from the
 *   announcements): which release lines are still supported. Slackware
 *   publishes no end-of-support dates, so eol stays null for a supported line;
 *   a line whose date is in the past is dropped (today only 15.0 remains). A
 *   release whose ISO directories exist but that endoflife.date does not list
 *   yet (newer than every line it knows) is treated as supported, so a new
 *   release is not missed while the community list catches up.
 * - mirrors.slackware.com/slackware/slackware64-<N>/ANNOUNCE.<N>: the release
 *   announcement. Its dateline ("… 2022-02-02:") is the release date; only
 *   when an announcement has no date (or does not exist) does endoflife.date's
 *   date stand in. (For 15.0 endoflife.date says 2022-02-03, the day the ISO
 *   files were published; the project announced 2022-02-02.) Like every
 *   non-ISO file there, the announcement is redirected by the mirror
 *   redirector to one of the project's mirrors, which serves the project's
 *   copy (a date only, the same whichever mirror answers).
 * - mirrors.slackware.com/slackware/slackware-iso/slackware64-<N>-iso/ and
 *   slackware-<N>-iso/: the ISO directories (64-bit x86_64 and 32-bit x86). The
 *   install DVD (slackware[64]-<N>-install-dvd.iso) is the image; the
 *   directory also holds its .asc (PGP signature, linked as the signature), a
 *   .md5 and the .txt file list.
 * - mirrors.slackware.com/…/<iso>.mirrorlist (the link the directory listing
 *   itself carries): the project's MirrorBrain redirector's page for the
 *   file: its exact size, the hashes computed from
 *   the master copy, and every mirror that carries it, with country codes.
 *   The SHA-256 is read from the project's <iso>.sha256 (the checksum file;
 *   the strongest published type, the project's own .md5 is the only static
 *   checksum next to the ISO) and has to equal the page's value; the page's MD5
 *   has to equal the project's .md5. If either disagrees the sync throws.
 *
 * Exclusions, for the same reasons as everywhere: -current (the development
 * tree), source DVDs, ISOs of lines past their end of support. Slackware ARM
 * is a separate port (arm.slackware.com answers over HTTPS and lists 15.0 as
 * its only stable release: 32-bit ARMv7, with the AArch64 port still in
 * -current), but everything it offers for download is on
 * ftp.arm.slackware.com, which has no HTTPS side (its documentation links
 * http:// only), and only https URLs are allowed in the data, so it is left
 * out. The same holds for the torrents, which are published only on the
 * HTTP-only download page: torrentUrl is null. The only image is the install
 * DVD; there are no editions, desktop images or live images.
 *
 * Mirrors: the redirector lists every mirror that currently carries the file
 * (the requester's country first, then the rest of the world; the metalink of
 * the same file lists the same number), the official list as published. Only
 * HTTPS entries are kept (the redirector itself warns it may send visitors to
 * plain-HTTP mirrors); a mirror must carry every listed ISO (64-bit and
 * 32-bit), because a mirror root plus an artifact path must be the file for
 * every architecture. The list has no coordinates, and its "prio" is a traffic
 * weight, not a quality score, so score is null. Deviations: the order and the
 * country split depend on the requester's IP address (irrelevant here, the set
 * is what is kept), and the set follows MirrorBrain's live health checks, so a
 * mirror that fails them drops out until it passes again. The project's static
 * list (mirrors.slackware.com/mirrorlist/) is not used: it has no flag for
 * which mirrors carry the ISO tree, and run.ts cannot check the ones whose
 * robots.txt forbids it. run.ts checks each kept mirror for the current ISO.
 *
 * Fails closed: no supported line with ISOs, an ISO directory without its
 * install DVD, a page that no longer shows a size, hash or mirrors, and any
 * disagreement between the project's checksum files and the redirector throw.
 */

import type { Artifact, Mirror, Release } from "../../../src/lib/data-schemas";
import { getText, HttpError } from "../http";
import { parseChecksums } from "../lib/checksums";
import { listDirectory } from "../lib/dirlist";
import { type Cycle, endOfLife } from "../lib/endoflife";
import { countryCode, withSlash } from "../lib/mirrors";
import { compareVersions, isoDay } from "../lib/versions";
import { defineSource, type SyncContext } from "../source";

const ROOT = "https://mirrors.slackware.com/slackware/";
const ISO_ROOT = `${ROOT}slackware-iso/`;

/** The two ISO trees of a release: 64-bit "slackware64-N-iso", 32-bit "slackware-N-iso". */
const TREES: { prefix: string; arch: Artifact["arch"] }[] = [
  { prefix: "slackware64", arch: "x86_64" },
  { prefix: "slackware", arch: "i686" },
];

interface Iso {
  cycle: Cycle;
  arch: Artifact["arch"];
  dir: string;
  file: string;
  /** Names in the ISO directory. */
  names: string[];
}

/** The release lines whose ISO directories exist, from the official ISO tree ("slackware64-15.0-iso/" → "15.0"). */
async function treeVersions(): Promise<string[]> {
  const names = await listDirectory(ISO_ROOT);
  return names.flatMap((n) => /^slackware64-(\d+\.\d+)-iso\/$/.exec(n)?.[1] ?? []);
}

/** The install DVDs of every supported line, from the official ISO tree. */
async function discover(ctx: SyncContext): Promise<Iso[]> {
  const { cycles: known } = await endOfLife("slackware");
  const newest =
    known
      .map((c) => c.name)
      .sort(compareVersions)
      .at(-1) ?? "0";
  // A release newer than every line endoflife.date knows has no dates there yet.
  const unlisted: Cycle[] = (await treeVersions())
    .filter((v) => compareVersions(v, newest) > 0)
    .map((name) => ({
      name,
      codename: null,
      label: name,
      releaseDate: null,
      eol: null,
      lts: false,
      latest: null,
      latestDate: null,
      isMaintained: true,
      link: null,
    }));
  const supported = [...known, ...unlisted]
    .filter((c) => /^\d+\.\d+$/.test(c.name) && (c.eol === null || c.eol >= ctx.today))
    .sort((a, b) => compareVersions(b.name, a.name));
  const isos: Iso[] = [];
  for (const cycle of supported) {
    const found: Iso[] = [];
    for (const tree of TREES) {
      const dir = `${ISO_ROOT}${tree.prefix}-${cycle.name}-iso/`;
      let names: string[];
      try {
        names = await listDirectory(dir);
      } catch (error) {
        if (error instanceof HttpError && error.status === 404) continue;
        throw error;
      }
      const file = `${tree.prefix}-${cycle.name}-install-dvd.iso`;
      if (!names.includes(file)) throw new Error(`${dir} has no ${file}`);
      found.push({ cycle, arch: tree.arch, dir, file, names });
    }
    if (found.some((i) => i.arch === "x86_64")) isos.push(...found);
    else ctx.log(`Slackware ${cycle.name}: no ISO directory on ${ISO_ROOT}, left out`);
  }
  if (!isos.length) throw new Error(`no supported Slackware release has ISOs on ${ISO_ROOT}`);
  return isos;
}

interface MirrorbrainPage {
  size: number;
  sha256: string;
  md5: string;
  /** Mirror root → country code (HTTPS entries whose URL ends with the ISO path). */
  roots: Map<string, string | null>;
}

/** Reads the MirrorBrain `?mirrorlist` page of an ISO: size, hashes and the mirrors that carry it. */
async function mirrorlist(iso: Iso): Promise<MirrorbrainPage> {
  const url = `${iso.dir}${iso.file}.mirrorlist`;
  const html = await getText(url, { accept: "text/html" });
  const size = html.match(/\((\d+) bytes\)/)?.[1];
  const hash = (label: string, length: number) =>
    html
      .match(new RegExp(`${label} Hash</a>:</span>\\s*<tt>([0-9a-f]{${length}})</tt>`, "i"))?.[1]
      ?.toLowerCase();
  const sha256 = hash("SHA-256", 64);
  const md5 = hash("MD5", 32);
  const path = html.match(/Path:<\/span>\s*(\/slackware\/[^<\s]+)/)?.[1];
  if (!size || !sha256 || !md5 || !path)
    throw new Error(`${url} no longer shows the file's size, hashes and path`);
  // Mirror roots hold the tree below /slackware/: root + "slackware-iso/…" is the file.
  const relative = path.replace(/^\/slackware\//, "");
  const roots = new Map<string, string | null>();
  for (const m of html.matchAll(
    /<li>\s*<a href="(https:\/\/[^"]+)">[^<]*<\/a>\s*\(([a-z]{2}),\s*prio\s*\d+\)/g,
  )) {
    const href = m[1] as string;
    if (!href.endsWith(`/${relative}`)) continue;
    roots.set(href.slice(0, -relative.length), countryCode((m[2] as string).toUpperCase()));
  }
  if (!roots.size) throw new Error(`${url} lists no HTTPS mirrors`);
  return { size: Number(size), sha256, md5, roots };
}

const announcement = (version: string) => `${ROOT}slackware64-${version}/ANNOUNCE.${version}`;

/** The release date from the announcement's dateline ("… 2022-02-02:"); null without an announcement or date. */
async function announced(version: string, today: string): Promise<string | null> {
  try {
    const text = await getText(announcement(version));
    const day = text.slice(0, 300).match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1] ?? null;
    return day && isoDay(day) === day && day <= today ? day : null;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}

export default defineSource({
  slug: "slackware",
  hosts: ["mirrors.slackware.com"],
  async releases(ctx) {
    const isos = await discover(ctx);
    const byCycle = new Map<string, Iso[]>();
    for (const iso of isos)
      byCycle.set(iso.cycle.name, [...(byCycle.get(iso.cycle.name) ?? []), iso]);

    const releases: Release[] = [];
    const sources = ["https://endoflife.date/slackware", ISO_ROOT];
    for (const [version, list] of byCycle) {
      const artifacts: Artifact[] = [];
      for (const iso of list) {
        const url = `${iso.dir}${iso.file}`;
        const page = await mirrorlist(iso);
        const sumUrl = `${url}.sha256`;
        const sha256 = parseChecksums(await getText(sumUrl)).get(iso.file);
        if (!sha256) throw new Error(`${sumUrl} does not list ${iso.file}`);
        if (sha256 !== page.sha256)
          throw new Error(`SHA-256 of ${iso.file} differs between ${sumUrl} and its mirror list`);
        const md5 = parseChecksums(await getText(`${url}.md5`)).get(iso.file);
        if (md5 !== page.md5)
          throw new Error(`MD5 of ${iso.file} differs between ${url}.md5 and its mirror list`);
        sources.push(iso.dir);
        artifacts.push({
          arch: iso.arch,
          format: "iso",
          file: iso.file,
          path: `${url.slice(ROOT.length)}`,
          url,
          size: page.size,
          checksum: { type: "sha256", value: sha256, url: sumUrl },
          signatureUrl: iso.names.includes(`${iso.file}.asc`) ? `${url}.asc` : null,
          torrentUrl: null,
        });
      }
      const cycle = (list[0] as Iso).cycle;
      const official = await announced(version, ctx.today);
      if (official) sources.push(announcement(version));
      releases.push({
        version,
        channel: "stable",
        codename: null,
        releaseDate: official ?? cycle.releaseDate,
        eol: cycle.eol,
        notesUrl: `${ROOT}slackware64-${version}/RELEASE_NOTES`,
        editions: [
          { id: "install-dvd", name: "Install DVD", desktop: null, kind: "other", artifacts },
        ],
      });
    }
    return { sources: [...new Set(sources)], releases };
  },
  async mirrors(ctx) {
    const isos = await discover(ctx);
    const lists: Map<string, string | null>[] = [];
    for (const iso of isos) lists.push((await mirrorlist(iso)).roots);
    const [first, ...rest] = lists;
    const common = [...(first ?? [])].filter(([root]) => rest.every((roots) => roots.has(root)));
    if (!common.length) throw new Error("no HTTPS mirror carries every Slackware ISO");
    const mirrors: Mirror[] = common.map(([root, country]) => ({
      url: withSlash(root),
      country,
      name: new URL(root).hostname,
      lat: null,
      lon: null,
      score: null,
    }));
    return {
      sources: [...new Set(isos.map((i) => `${i.dir}${i.file}.mirrorlist`))],
      mirrors,
    };
  },
});
