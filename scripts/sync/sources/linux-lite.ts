/**
 * Linux Lite: every supported series (8.x, 7.x, 6.x) with its newest release,
 * one edition (Xfce) as a 64-bit ISO, checksums and torrent from the project's
 * own release server, mirrors from the project's official mirror list.
 *
 * Official sources, and what each one is used for:
 * - www.linuxliteos.com/download.php (the download page): the release it offers
 *   now (card: version, release date, SHA-256) and the "Roadmap" list, which
 *   gives each series' releases with their dates and the "End of Support"
 *   month of the series' last release. A series is supported until the end of
 *   that month (periodEnd); a series whose roadmap names no end yet is kept
 *   with eol null. The newest release of a series that the page no longer
 *   offers is its newest roadmap release dated on or before today ("No
 *   release required" rows are skipped).
 * - repo.linuxliteos.com/linuxlite/isos/<version>/ (the project's release
 *   server, also the "Default Repository" entry of its mirror list): the image
 *   `linux-lite-<version>-64bit.iso`, its `.sha256` (the official checksum, GNU
 *   format; for the offered release it is cross-checked with the SHA-256 printed
 *   on the page, a mismatch throws) and `.torrent`. `path` is
 *   `<version>/<file>` below every mirror root.
 * - www.linuxliteos.com/forums/forumdisplay.php?fid=11 (Release Announcements):
 *   the "Linux Lite X.Y Final Released" thread of each release, as `notesUrl`.
 *   The offered release takes the announcement link of its card on the page.
 * - mirrors.linuxliteos.com (the mirror page the download button links to; an
 *   Uptime Kuma status page), read through its JSON API
 *   /api/status-page/mirrors: one entry per mirror with a country name and the
 *   URL of its `isos/` directory. Listed: the entries published over https
 *   (8 of 18 today) and the default repository (see Deviations). The mirror's
 *   isos/ directory is the mirror root.
 *
 * No endoflife.date entry exists for Linux Lite, so release dates and the end
 * of support come from the page and its roadmap only. Sizes are not published
 * exactly (the page rounds to 0.01 GB, the server index to whole GB): left null
 * for run.ts. The project publishes no signature files and, for the supported
 * series, no other editions or architectures.
 *
 * Excluded: release candidates (the 8.2 rc1 on the server is not linked from
 * the download page), MD5 files (SHA-256 is published for every image),
 * unreleased roadmap rows, series past their end of support.
 *
 * Deviations: the default repository, repo.linuxliteos.com, is published in
 * the mirror list as an http URL. It is the host every artifact URL of this
 * module already uses over https, so it is listed with https like the other
 * https entries; all other http-only entries are not listed. The older
 * supported series (7.x, 6.x) are not shown as cards on the download page any
 * more; they come from the roadmap and the same release server.
 */

import type { Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import { getJson, getText } from "../http";
import { parseChecksums } from "../lib/checksums";
import { parseEnglishDay } from "../lib/dates";
import { listDirectory } from "../lib/dirlist";
import { countryCode, withSlash } from "../lib/mirrors";
import { compareVersions, periodEnd } from "../lib/versions";
import { defineSource } from "../source";

const SITE = "https://www.linuxliteos.com/";
const PAGE = `${SITE}download.php`;
const FORUM = `${SITE}forums/forumdisplay.php?fid=11`;
const ORIGIN_HOST = "repo.linuxliteos.com";
const ORIGIN = `https://${ORIGIN_HOST}/linuxlite/isos/`;
const MIRRORS_API = "https://mirrors.linuxliteos.com/api/status-page/mirrors";

interface Card {
  version: string;
  releaseDate: string | null;
  announcement: string | null;
  sha256: string;
}

/** The release cards of the download page (it offers one at a time, the newest). */
function parseCards(html: string): Card[] {
  const cards: Card[] = [];
  for (const part of html.split(/<article class="download-card">/).slice(1)) {
    const card = part.split("</article>")[0] ?? "";
    const version = card.match(/<h2><span>Linux Lite (\d+(?:\.\d+)+)<\/span><\/h2>/)?.[1];
    const sha256 = card.match(
      /<strong>SHA256:<\/strong>\s*<code class="hash">([0-9a-fA-F]{64})<\/code>/,
    )?.[1];
    if (!version || !sha256)
      throw new Error("the Linux Lite download page changed (release card without version/SHA256)");
    cards.push({
      version,
      releaseDate: parseEnglishDay(card.match(/Released:\s*([^<]+)</)?.[1] ?? ""),
      announcement: card.match(/<a href="([^"]+)"[^>]*>\s*Release Announcement<\/a>/)?.[1] ?? null,
      sha256: sha256.toLowerCase(),
    });
  }
  if (!cards.length) throw new Error("the Linux Lite download page lists no release");
  return cards;
}

interface RoadmapRow {
  version: string;
  /** Release date, null for "No release required" and other free text. */
  date: string | null;
  /** Last day of the "End of Support" month named on the row. */
  eol: string | null;
}

/** `<b>Linux Lite 7.8 Release</b> - <em>1st February 2026 (End of Support June 2029)</em>` rows. */
function parseRoadmap(html: string): RoadmapRow[] {
  const rows: RoadmapRow[] = [];
  for (const m of html.matchAll(
    /<b>Linux Lite (\d+\.\d+)(?:\s+'[^']*')?\s+Release<\/b>\s*-\s*<em>([^<]*)<\/em>/g,
  )) {
    const text = m[2] ?? "";
    const support = text.match(/End of Support\s+([A-Za-z]+\s+\d{4})/)?.[1];
    rows.push({
      version: m[1] as string,
      date: parseEnglishDay(text),
      eol: support ? periodEnd(support) : null,
    });
  }
  if (!rows.length) throw new Error("the Linux Lite download page lists no roadmap");
  return rows;
}

/** Version → announcement thread of the Release Announcements forum. */
function parseAnnouncements(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of html.matchAll(
    /href="(showthread\.php\?tid=\d+)">Linux Lite (\d+(?:\.\d+)+) Final Released</g,
  ))
    out.set(m[2] as string, `${SITE}forums/${m[1]}`);
  return out;
}

const major = (version: string) => version.split(".")[0] as string;

interface Plan {
  version: string;
  releaseDate: string | null;
  eol: string | null;
  notesUrl: string | null;
}

/** One release per supported series: the offered one, else the newest dated on or before today. */
function plan(
  cards: Card[],
  roadmap: RoadmapRow[],
  announcements: Map<string, string>,
  today: string,
): Plan[] {
  const offered = new Map<string, Card>();
  for (const c of cards) {
    const best = offered.get(major(c.version));
    if (!best || compareVersions(c.version, best.version) > 0) offered.set(major(c.version), c);
  }
  const newestCard = [...offered.values()].sort((a, b) => compareVersions(b.version, a.version))[0];
  const majors = new Set([...offered.keys(), ...roadmap.map((r) => major(r.version))]);
  const plans: Plan[] = [];
  for (const line of majors) {
    const rows = roadmap.filter((r) => major(r.version) === line);
    const eol = rows.map((r) => r.eol).find((e) => e) ?? null;
    if (eol && eol < today) continue;
    const card = offered.get(line);
    if (card) {
      const row = rows.find((r) => r.version === card.version);
      plans.push({
        version: card.version,
        releaseDate: card.releaseDate ?? row?.date ?? null,
        eol,
        notesUrl: card.announcement ?? announcements.get(card.version) ?? null,
      });
      continue;
    }
    // Older series than the offered release only: unreleased series are not in scope.
    if (newestCard && compareVersions(line, major(newestCard.version)) > 0) continue;
    const due = rows
      .filter((r) => r.date && r.date <= today)
      .sort((a, b) => compareVersions(b.version, a.version))[0];
    if (!due) continue;
    plans.push({
      version: due.version,
      releaseDate: due.date,
      eol,
      notesUrl: announcements.get(due.version) ?? null,
    });
  }
  return plans.sort((a, b) => compareVersions(b.version, a.version));
}

/** The image of one release on the release server, with its checksum and torrent. */
async function edition(p: Plan, card: Card | undefined): Promise<Edition> {
  const dir = `${ORIGIN}${p.version}/`;
  const file = `linux-lite-${p.version}-64bit.iso`;
  const names = new Set(await listDirectory(dir));
  if (!names.has(file) || !names.has(`${file}.sha256`))
    throw new Error(`${dir} has no ${file} with its .sha256`);
  const sums = parseChecksums(await getText(`${dir}${file}.sha256`));
  const sha256 = sums.get(file);
  if (!sha256 || !/^[0-9a-f]{64}$/.test(sha256))
    throw new Error(`${dir}${file}.sha256 is not a SHA-256 of ${file}`);
  if (card && card.sha256 !== sha256)
    throw new Error(`the download page and ${dir}${file}.sha256 disagree on ${file}`);
  return {
    id: "xfce",
    name: "Xfce",
    desktop: "xfce",
    kind: "desktop",
    artifacts: [
      {
        arch: "x86_64",
        format: "iso",
        file,
        path: `${p.version}/${file}`,
        url: `${dir}${file}`,
        size: null,
        checksum: { type: "sha256", value: sha256, url: `${dir}${file}.sha256` },
        signatureUrl: null,
        torrentUrl: names.has(`${file}.torrent`) ? `${dir}${file}.torrent` : null,
      },
    ],
  };
}

interface KumaStatusPage {
  publicGroupList?: { monitorList?: { name?: string; url?: string }[] }[];
}

/** The https entries of the official mirror list (an Uptime Kuma status page). */
function parseMirrors(page: KumaStatusPage): Mirror[] {
  const entries = (page.publicGroupList ?? []).flatMap((g) => g.monitorList ?? []);
  if (!entries.length) throw new Error("the Linux Lite mirror list is empty or changed");
  const mirrors = new Map<string, Mirror>();
  for (const e of entries) {
    if (!e.name || !e.url || !/^https?:\/\/[^/]+\/.*\/isos\/?$/.test(e.url))
      throw new Error(
        `the Linux Lite mirror list changed (entry ${e.name ?? "?"}: ${e.url ?? ""})`,
      );
    const url = new URL(e.url);
    // The default repository is the one http entry that is also this module's https origin.
    if (url.protocol !== "https:" && url.hostname !== ORIGIN_HOST) continue;
    url.protocol = "https:";
    const root = withSlash(url.href);
    mirrors.set(root, {
      url: root,
      country: countryCode(e.name.replace(/\s*\([^)]*\)/g, "")),
      name: url.hostname,
      lat: null,
      lon: null,
      score: null,
    });
  }
  if (!mirrors.size) throw new Error("the Linux Lite mirror list has no https mirror");
  return [...mirrors.values()];
}

export default defineSource({
  slug: "linux-lite",
  hosts: [ORIGIN_HOST],
  async releases(ctx) {
    const html = await getText(PAGE, { accept: "text/html" });
    const cards = parseCards(html);
    const plans = plan(
      cards,
      parseRoadmap(html),
      parseAnnouncements(await getText(FORUM, { accept: "text/html" })),
      ctx.today,
    );
    if (!plans.length) throw new Error("no supported Linux Lite series");
    const releases: Release[] = [];
    for (const p of plans)
      releases.push({
        version: p.version,
        channel: "lts",
        codename: null,
        releaseDate: p.releaseDate,
        eol: p.eol,
        notesUrl: p.notesUrl,
        editions: [
          await edition(
            p,
            cards.find((c) => c.version === p.version),
          ),
        ],
      });
    return { sources: [PAGE, ORIGIN, FORUM], releases };
  },
  async mirrors() {
    return {
      sources: [MIRRORS_API],
      mirrors: parseMirrors(await getJson<KumaStatusPage>(MIRRORS_API)),
    };
  },
});
