/**
 * Qubes OS.
 *
 * Official sources, and what each one is used for:
 * - doc.qubes-os.org "Supported releases" (the project's support policy): the
 *   table of lines with start date, end date ("TBD" while supported) and
 *   status. A line is listed while its end date has not passed; a line with
 *   no end date yet has eol null. Today that is Release 4.3 only (4.2 ended
 *   2026-06-21).
 * - www.qubes-os.org/downloads/: the page that offers the ISO. For each
 *   release it shows (an h3 "Qubes OS 4.3.2"), the ISO link carries the exact
 *   size in its title ("8,459,569,152 bytes"), next to a torrent, a detached
 *   signature and the release signing key; below is the project's mirror
 *   table. The release it shows is the one used for its line, and its size
 *   must equal the directory's. A pre-release appears only if this page shows
 *   it (channel beta); none is shown today (4.3.2-rc1 is older than 4.3.2).
 * - ftp.qubes-os.org/iso/ (the project's own server, listed on the page as
 *   "The Qubes OS Project"): the ISO directory. Per ISO it gives the exact
 *   size and day (the release day), the `.asc` signature, the `.torrent` and
 *   the `.DIGESTS` file, whose hashes are the checksum (SHA-512, the
 *   strongest of the SHA-256 and SHA-512 lines it carries; the file has a
 *   detached signature, .DIGESTS.asc). A line the page does not show uses its
 *   newest final ISO in the directory. The page's own ISO button points at the
 *   kernel.org mirror of the same file; the origin address is used for the
 *   file, signature, torrent and checksum so every URL is on the project's host.
 * - The mirror table of the downloads page: organization, location and URLs
 *   of each mirror; see Mirrors.
 *
 * Qubes has one image: the installation ISO for x86_64 (the installer offers
 * Xfce by default, KDE and i3 as options: desktop xfce). Exclusions: other
 * architectures (none exist), templates (not downloaded from this page),
 * and every ISO of an unsupported line.
 *
 * Mirrors: the HTTPS URLs of the table (not the .onion, .i2p, rsync, ftp and
 * plain http addresses). A listed address may be the mirror's root ("…/qubes/")
 * or its iso/ folder ("…/qubes/iso/", kernel.org, the project's server): the
 * root is the address without a trailing iso/, so root + "iso/<file>" is
 * the file everywhere. An address with several hosts for one organization
 * becomes one entry per host. Country comes from the location text; a
 * location that names several countries ("Portugal, South Africa") or none
 * ("(Distributed)") gives null. The table has no coordinates or score.
 */
import type { Artifact, Mirror, Release } from "../../../src/lib/data-schemas";
import { getText } from "../http";
import { checksumType } from "../lib/checksums";
import { countryCode, withSlash } from "../lib/mirrors";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const DOWNLOADS = "https://www.qubes-os.org/downloads/";
const SUPPORTED =
  "https://doc.qubes-os.org/en/latest/user/downloading-installing-upgrading/supported-releases.html";
const ISO_DIR = "https://ftp.qubes-os.org/iso/";
const MIRROR_ROOT = "https://ftp.qubes-os.org/";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;| /g, " ")
    .replace(/\s+/g, " ")
    .trim();

const seriesOf = (version: string) => version.split(".").slice(0, 2).join(".");

interface Line {
  series: string;
  /** End of support; null while the page says TBD. */
  end: string | null;
}

/** The "Qubes OS" table of the support policy: Release | Start Date | End Date | Status. */
function parseSupported(html: string, today: string): Line[] {
  const lines: Line[] = [];
  let rows = 0;
  for (const m of html.matchAll(
    /<td><p>Release (\d+(?:\.\d+)?)<\/p><\/td>\s*<td><p>(\d{4}-\d{2}-\d{2})<\/p><\/td>\s*<td><p>([^<]+)<\/p><\/td>\s*<td><p>([^<]+)<\/p><\/td>/g,
  )) {
    rows++;
    const [, series, , endText, status] = m;
    if (!series) continue;
    const end = /^\d{4}-\d{2}-\d{2}$/.test((endText ?? "").trim()) ? (endText ?? "").trim() : null;
    if (end && end < today) continue;
    if (!end && (endText ?? "").trim() !== "TBD")
      throw new Error(`unreadable end date "${endText}" of Release ${series} on ${SUPPORTED}`);
    if ((status ?? "").trim() !== "Supported")
      throw new Error(
        `Release ${series} has no end date passed but status "${status}" on ${SUPPORTED}`,
      );
    lines.push({ series, end });
  }
  if (!rows) throw new Error(`support table not found on ${SUPPORTED}`);
  if (!lines.length) throw new Error(`no supported Qubes OS release on ${SUPPORTED}`);
  return lines;
}

interface Iso {
  file: string;
  version: string;
  /** "rc1" for pre-releases, "" for final releases. */
  pre: string;
  day: string;
  size: number;
}

interface Dir {
  isos: Iso[];
  names: Set<string>;
}

/** "02-Oct-2026" → "2026-10-02". */
function listingDay(value: string): string | null {
  const m = value.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  const month = m ? MONTHS.indexOf(m[2] ?? "") : -1;
  return m && month >= 0 ? `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1]}` : null;
}

function parseDir(html: string): Dir {
  const names = new Set<string>();
  const isos: Iso[] = [];
  for (const m of html.matchAll(
    /<a href="([^"?/]+)">[^<]*<\/a>\s+(\d{2}-[A-Za-z]{3}-\d{4})\s+\d{2}:\d{2}\s+(\d+)/g,
  )) {
    const [, file, date, size] = m;
    if (!file) continue;
    names.add(file);
    const iso = file.match(/^Qubes-R(\d+\.\d+(?:\.\d+)?)(?:-((?:rc|beta|alpha)\d*))?-x86_64\.iso$/);
    const day = listingDay(date ?? "");
    if (iso?.[1] && day && Number(size) > 0)
      isos.push({ file, version: iso[1], pre: iso[2] ?? "", day, size: Number(size) });
  }
  if (!isos.length) throw new Error(`no ISO listed in ${ISO_DIR}`);
  return { isos, names };
}

interface Offered {
  /** "4.3.2" or "4.4.0-rc1" */
  version: string;
  pre: boolean;
  size: number;
}

/** The releases the downloads page shows, with the ISO size its button states. */
function parseOffered(html: string): Offered[] {
  const out: Offered[] = [];
  for (const m of html.matchAll(
    /<h3 id="qubes-os-[^"]*">\s*Qubes(?:\s|&nbsp;| )+OS\s+([^<\s]+)\s*<\/h3>/g,
  )) {
    const version = m[1] ?? "";
    const iso = html.match(
      new RegExp(
        `href="https://[^"]+/Qubes-R${version.replace(/[.]/g, "\\.")}-x86_64\\.iso" title="[^"]*\\(([\\d,]+) bytes\\)"`,
      ),
    );
    if (!iso) throw new Error(`${DOWNLOADS} shows Qubes OS ${version} without its ISO link`);
    out.push({
      version,
      pre: /-(rc|beta|alpha)/.test(version),
      size: Number((iso[1] ?? "").replace(/,/g, "")),
    });
  }
  if (!out.length) throw new Error(`no release on ${DOWNLOADS}`);
  return out;
}

/** The hashes of a .DIGESTS file for one file, longest (strongest) first. */
function digestsOf(textFile: string, file: string): string[] {
  const out: string[] = [];
  for (const line of textFile.split(/\r?\n/)) {
    const m = line.trim().match(/^([0-9a-fA-F]{32,128}) \*?(\S+)$/);
    if (m?.[1] && m[2] === file) out.push(m[1].toLowerCase());
  }
  return out.sort((a, b) => b.length - a.length);
}

/** "Portugal, South Africa" → null (two countries); "Germany" → DE. */
function locationCountry(location: string): string | null {
  const found = new Set(
    location
      .split(",")
      .map((p) => countryCode(p.trim()))
      .filter((c): c is string => c !== null),
  );
  return found.size === 1 ? ([...found][0] as string) : null;
}

export default defineSource({
  slug: "qubes-os",
  hosts: ["ftp.qubes-os.org"],
  async releases(ctx) {
    const [doc, page, dirHtml] = await Promise.all([
      getText(SUPPORTED, { accept: "text/html" }),
      getText(DOWNLOADS, { accept: "text/html" }),
      getText(ISO_DIR, { accept: "text/html" }),
    ]);
    const lines = parseSupported(doc, ctx.today);
    const dir = parseDir(dirHtml);
    const offered = parseOffered(page);

    // The final release of every supported line (the page's, else the newest in the directory),
    // then the upcoming pre-releases the page shows.
    const nameOf = (i: Iso) => (i.pre ? `${i.version}-${i.pre}` : i.version);
    const find = (version: string) => {
      const iso = dir.isos.find((i) => nameOf(i) === version);
      if (!iso)
        throw new Error(`${DOWNLOADS} shows Qubes OS ${version}, which ${ISO_DIR} does not list`);
      return iso;
    };
    const chosen: { iso: Iso; line?: Line }[] = [];
    for (const line of lines) {
      const shown = offered.find((o) => !o.pre && seriesOf(o.version) === line.series);
      const newest = dir.isos
        .filter((i) => !i.pre && seriesOf(i.version) === line.series)
        .sort((a, b) => compareVersions(b.version, a.version))[0];
      const iso = shown ? find(shown.version) : newest;
      if (!iso) throw new Error(`no final ISO of Qubes OS ${line.series} in ${ISO_DIR}`);
      if (shown && shown.size !== iso.size)
        throw new Error(
          `${iso.file} is ${shown.size} bytes on ${DOWNLOADS} but ${iso.size} in ${ISO_DIR}`,
        );
      chosen.push({ iso, line });
    }
    const newestFinal =
      chosen.map((c) => c.iso.version).sort((a, b) => compareVersions(b, a))[0] ?? "0";
    for (const o of offered.filter((x) => x.pre)) {
      const iso = find(o.version);
      if (compareVersions(iso.version, newestFinal) > 0) chosen.push({ iso });
    }
    chosen.sort(
      (a, b) =>
        compareVersions(b.iso.version, a.iso.version) ||
        Number(Boolean(a.iso.pre)) - Number(Boolean(b.iso.pre)),
    );

    const releases: Release[] = [];
    for (const { iso, line } of chosen) {
      const version = nameOf(iso);
      const sumUrl = `${ISO_DIR}${iso.file}.DIGESTS`;
      if (!dir.names.has(`${iso.file}.DIGESTS`))
        throw new Error(`${ISO_DIR} lists no ${iso.file}.DIGESTS`);
      const hash = digestsOf(await getText(sumUrl), iso.file)[0];
      if (!hash) throw new Error(`${sumUrl} does not list ${iso.file}`);
      const torrent = iso.file.replace(/\.iso$/, ".torrent");
      const artifact: Artifact = {
        arch: "x86_64",
        format: "iso",
        file: iso.file,
        path: `iso/${iso.file}`,
        url: `${ISO_DIR}${iso.file}`,
        size: iso.size,
        checksum: { type: checksumType(hash), value: hash, url: sumUrl },
        signatureUrl: dir.names.has(`${iso.file}.asc`) ? `${ISO_DIR}${iso.file}.asc` : null,
        torrentUrl: dir.names.has(torrent) ? `${ISO_DIR}${torrent}` : null,
      };
      if (!artifact.signatureUrl) throw new Error(`${ISO_DIR} lists no ${iso.file}.asc`);
      releases.push({
        version,
        channel: iso.pre ? "beta" : "stable",
        codename: null,
        releaseDate: iso.day,
        eol: line?.end ?? null,
        notesUrl: `https://doc.qubes-os.org/en/latest/developer/releases/${seriesOf(iso.version).replace(".", "_")}/release-notes.html`,
        editions: [
          {
            id: "installer",
            name: "Installation ISO",
            desktop: "xfce",
            kind: "desktop",
            artifacts: [artifact],
          },
        ],
      });
    }
    return { sources: [SUPPORTED, DOWNLOADS, ISO_DIR], releases };
  },
  async mirrors() {
    const page = await getText(DOWNLOADS, { accept: "text/html" });
    const at = page.indexOf('id="mirrors"');
    if (at < 0) throw new Error(`no mirror table on ${DOWNLOADS}`);
    const mirrors: Mirror[] = [];
    const seen = new Set<string>();
    let rows = 0;
    for (const row of page.slice(at).matchAll(/<tr id="[^"]+">([\s\S]*?)<\/tr>/g)) {
      const cells = [...(row[1] ?? "").matchAll(/<td>([\s\S]*?)<\/td>/g)].map((c) => c[1] ?? "");
      if (cells.length < 3) throw new Error(`unreadable mirror row on ${DOWNLOADS}`);
      rows++;
      const org = text(cells[0] ?? "");
      const country = locationCountry(text(cells[1] ?? ""));
      const urls = [...(cells[2] ?? "").matchAll(/<a href="(https:\/\/[^"]+)"/g)].map(
        (u) => u[1] as string,
      );
      let first = true;
      for (const raw of urls) {
        const root = withSlash(raw).replace(/iso\/$/, "");
        if (seen.has(root)) continue;
        seen.add(root);
        mirrors.push({
          url: root,
          country,
          name: first ? org : `${org} (${new URL(root).host})`,
          lat: null,
          lon: null,
          score: null,
        });
        first = false;
      }
    }
    if (!rows) throw new Error(`no mirror rows on ${DOWNLOADS}`);
    if (!seen.has(MIRROR_ROOT))
      throw new Error(`the project's own server is not in the mirror table on ${DOWNLOADS}`);
    return { sources: [DOWNLOADS], mirrors };
  },
});
