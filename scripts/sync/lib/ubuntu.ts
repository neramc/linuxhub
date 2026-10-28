/**
 * Shared by the Ubuntu family sources (sources/ubuntu-family.ts):
 * - the official release table of the Ubuntu project documentation (version,
 *   code name, release date, end of standard support, release notes),
 * - image file names (`<prefix>-<version>-<kind>-<arch>[+variant].<ext>`),
 * - one image directory of releases.ubuntu.com / cdimage.ubuntu.com
 *   (its SHA256SUMS and its autoindex).
 *
 * Dates are parsed by hand (Date.UTC), never with `new Date(text)`, so the
 * results do not depend on the machine's time zone.
 */
import type { Artifact } from "../../../src/lib/data-schemas";
import { getText } from "../http";
import { parseChecksums } from "./checksums";
import { listDirectory } from "./dirlist";
import { compareVersions, periodEnd } from "./versions";

export const RELEASE_LIST_URL = "https://ubuntu.com/project/docs/release-team/list-of-releases/";
export const RELEASES_HOST = "https://releases.ubuntu.com/";
export const CDIMAGE_HOST = "https://cdimage.ubuntu.com/";

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** "Oct 15, 2026" | "April 26, 2029" | "15 October 2026" → "2026-10-15"; anything else → null. */
export function parseDate(text: string): string | null {
  const t = text.trim().replace(/\s+/g, " ");
  const mdy = t.match(/^([A-Za-z]+)\.? (\d{1,2}),? (\d{4})$/);
  const dmy = t.match(/^(\d{1,2}) ([A-Za-z]+)\.? (\d{4})$/);
  const [monthName, day, year] = mdy
    ? [mdy[1], mdy[2], mdy[3]]
    : dmy
      ? [dmy[2], dmy[1], dmy[3]]
      : [];
  if (!monthName || !day || !year) return null;
  const month = MONTHS.findIndex((m) => m.startsWith(monthName.toLowerCase().slice(0, 3)));
  if (month < 0) return null;
  const date = new Date(Date.UTC(Number(year), month, Number(day)));
  return date.getUTCMonth() === month ? date.toISOString().slice(0, 10) : null;
}

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');

const textOf = (html: string) =>
  decode(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

export interface Anchor {
  href: string;
  title: string | null;
  /** Visible text, tags removed. */
  text: string;
}

/**
 * Every link of an HTML fragment. Attribute values may be quoted or not
 * (minified pages drop the quotes when a value has no spaces).
 */
export function anchors(html: string): Anchor[] {
  const out: Anchor[] = [];
  for (const m of html.matchAll(/<a\s+([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attr = (name: string) => {
      const found = (m[1] ?? "").match(
        new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i"),
      );
      const value = found?.[1] ?? found?.[2] ?? found?.[3];
      return value === undefined ? null : decode(value);
    };
    const href = attr("href");
    if (href) out.push({ href, title: attr("title"), text: textOf(m[2] ?? "") });
  }
  return out;
}

export interface UbuntuRelease {
  /** Point release as the project names it, e.g. "26.04.1" or "26.10". */
  version: string;
  /** "26.04". */
  line: string;
  lts: boolean;
  codename: string;
  /** Release date of this version. */
  date: string | null;
  /** Last day of the month in which standard support ends. */
  eol: string | null;
  notesUrl: string | null;
}

/**
 * Reads the "List of current releases" table. Throws when the page no longer
 * has that table with these columns (the sync then keeps its last good data).
 */
export function parseReleaseList(html: string): UbuntuRelease[] {
  const heading = html.indexOf("List of current releases");
  const start = heading < 0 ? -1 : html.indexOf("<table", heading);
  const end = start < 0 ? -1 : html.indexOf("</table>", start);
  if (end < 0) throw new Error("Ubuntu release list: the 'List of current releases' table is gone");
  const rows = html.slice(start, end).split(/<tr\b/i).slice(1);
  const cellsOf = (row: string, tag: "td" | "th") =>
    [...row.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi"))].map(
      (m) => m[1] ?? "",
    );
  const head = rows.map((r) => cellsOf(r, "th").map(textOf)).find((c) => c.length > 0) ?? [];
  const expected = [
    "Version",
    "Code name",
    "Docs",
    "Release",
    "End of Standard Support",
    "End of Life",
  ];
  if (head.join("|") !== expected.join("|"))
    throw new Error(`Ubuntu release list: unexpected columns (${head.join(", ")})`);
  const out: UbuntuRelease[] = [];
  for (const row of rows) {
    const cells = cellsOf(row, "td");
    if (cells.length !== expected.length) continue;
    const match = textOf(cells[0] ?? "").match(/^Ubuntu (\d+\.\d+(?:\.\d+)*)( LTS)?$/);
    if (!match?.[1]) continue;
    const eos = textOf(cells[4] ?? "");
    const notes = (cells[2] ?? "").match(/href\s*=\s*"(https:\/\/[^"]+)"/i)?.[1];
    out.push({
      version: match[1],
      line: match[1].split(".").slice(0, 2).join("."),
      lts: Boolean(match[2]),
      codename: textOf(cells[1] ?? ""),
      date: parseDate(textOf(cells[3] ?? "")),
      eol: periodEnd(eos) ?? parseDate(eos),
      notesUrl: notes ? decode(notes) : null,
    });
  }
  if (!out.length) throw new Error("Ubuntu release list: no release rows found");
  return out;
}

export async function ubuntuReleaseList(): Promise<UbuntuRelease[]> {
  return parseReleaseList(await getText(RELEASE_LIST_URL, { accept: "text/html" }));
}

/**
 * The newest point release of every release line whose standard support has
 * not ended on `today`, newest line first. A line released within the last six
 * years (longer than any standard support) without an end of support date is an
 * error: the table changed.
 */
export function currentLines(rows: UbuntuRelease[], today: string): UbuntuRelease[] {
  const cutoff = `${Number(today.slice(0, 4)) - 6}${today.slice(4)}`;
  const newest = new Map<string, UbuntuRelease>();
  for (const row of rows) {
    const known = newest.get(row.line);
    if (!known || compareVersions(row.version, known.version) > 0) newest.set(row.line, row);
  }
  const lines = [...newest.values()].filter((r) => r.date === null || r.date >= cutoff);
  const undated = lines.find((r) => !r.eol);
  if (undated) throw new Error(`Ubuntu release list: no end of support for ${undated.version}`);
  return lines
    .filter((r) => (r.eol ?? "") >= today)
    .sort((a, b) => compareVersions(b.line, a.line));
}

/* ---------- flavor support ---------- */

/** Ubuntu project documentation: the official statement on how long flavors support a release. */
export const FLAVOR_POLICY_URL = "https://ubuntu.com/project/docs/release-team/ubuntu-releases/";

/**
 * The number of years flavors support an LTS release, from the sentence
 * "Flavors generally support their releases for 3 years in LTS versions
 * (although there can be exceptions)" of the Ubuntu project documentation.
 * Throws when the sentence is gone or reworded: the rule is then no longer
 * the project's statement, and the sync keeps its last good data.
 */
export function parseFlavorLtsYears(html: string): number {
  const years = textOf(html).match(
    /Flavors generally support their releases for (\d+) years in LTS versions/,
  )?.[1];
  if (!years || Number(years) < 1)
    throw new Error(`${FLAVOR_POLICY_URL}: the flavor support statement is gone`);
  return Number(years);
}

export async function flavorLtsYears(): Promise<number> {
  return parseFlavorLtsYears(await getText(FLAVOR_POLICY_URL, { accept: "text/html" }));
}

/**
 * Last day of support of a flavor's release, for a flavor that publishes no
 * date machine-readably: an LTS release is supported `ltsYears` years from the
 * month it came out (the version number "YY.MM" names that month), anything
 * else for as long as Ubuntu supports the interim release (nine months, the
 * flavors being built from and updated through the Ubuntu archive).
 */
export function flavorSupportEnd(row: UbuntuRelease, ltsYears: number): string | null {
  if (!row.lts) return row.eol;
  const [year, month] = row.line.split(".").map(Number);
  return year && month ? periodEnd(`${2000 + year + ltsYears}-${month}`) : null;
}

/**
 * The version directories of a flavor's `releases/` listing that belong to
 * `line`, newest first: "26.04.1/" and "26.04/" for "26.04". Code-name links
 * ("resolute/") and other lines are not versions of it.
 */
export function lineVersions(names: string[], line: string): string[] {
  return names
    .flatMap((name) => name.match(/^(\d+\.\d+(?:\.\d+)*)\/$/)?.[1] ?? [])
    .filter((version) => version.split(".").slice(0, 2).join(".") === line)
    .sort((a, b) => compareVersions(b, a));
}

/* ---------- image names and directories ---------- */

const ARCHES: Record<string, Artifact["arch"]> = {
  amd64: "x86_64",
  arm64: "aarch64",
  armhf: "armhf",
  riscv64: "riscv64",
  ppc64el: "ppc64le",
  s390x: "s390x",
};

export interface UbuntuImage {
  file: string;
  /** "26.04.1", "24.04.5.1". */
  version: string;
  /** "26.04". */
  line: string;
  /** desktop, minimal, live-server, preinstalled-desktop or preinstalled-server. */
  kind: string;
  arch: Artifact["arch"];
  /** The part after "+" in the file name: largemem, raspi, a RISC-V board. */
  variant: string | null;
  format: Artifact["format"];
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * `<prefix>-<version>-<kind>-<arch>[+variant].<iso|img.xz|img.gz>`. Anything
 * else (betas, `amd64v3`, WSL and netboot archives, manifests) is not an
 * install image and returns null.
 */
export function parseImageName(file: string, prefix: string): UbuntuImage | null {
  const m = file.match(
    new RegExp(
      `^${escapeRegExp(prefix)}-(\\d+\\.\\d+(?:\\.\\d+)*)-(desktop|minimal|live-server|preinstalled-desktop|preinstalled-server)-([a-z0-9]+)(?:\\+([a-z0-9]+))?\\.(iso|img\\.xz|img\\.gz)$`,
    ),
  );
  const [, version, kind, archLabel, variant, format] = m ?? [];
  const arch = archLabel ? ARCHES[archLabel] : undefined;
  if (!version || !kind || !arch || !format) return null;
  return {
    file,
    version,
    line: version.split(".").slice(0, 2).join("."),
    kind,
    arch,
    variant: variant ?? null,
    format: format as Artifact["format"],
  };
}

/**
 * Install images (desktop and minimal ISOs) of `prefix` that a page names
 * anywhere in `text`, by file name, however the page links them (ISO,
 * torrent or magnet link). Sorted by file name.
 */
export function imagesMentioned(text: string, prefix: string): UbuntuImage[] {
  const names = new Set(
    text.match(
      new RegExp(
        `${escapeRegExp(prefix)}-\\d+\\.\\d+(?:\\.\\d+)*-(?:desktop|minimal)-[a-z0-9]+\\.iso`,
        "g",
      ),
    ) ?? [],
  );
  return [...names].sort().flatMap((file) => {
    const image = parseImageName(file, prefix);
    return image ? [image] : [];
  });
}

export interface ImageDir {
  /** Directory URL, ending with "/". */
  url: string;
  /** File name → SHA-256 from the directory's SHA256SUMS. */
  sums: Map<string, string>;
  /** Names in the directory's autoindex. */
  names: Set<string>;
}

export async function imageDir(url: string): Promise<ImageDir> {
  const sums = parseChecksums(await getText(`${url}SHA256SUMS`));
  const names = new Set(await listDirectory(url));
  if (!sums.size) throw new Error(`${url}SHA256SUMS is empty`);
  if (!names.size) throw new Error(`${url} lists nothing`);
  return { url, sums, names };
}

/**
 * The artifact for one image of a directory. Throws when the directory has no
 * checksum for it or no longer lists the file (the page and the files must
 * agree, otherwise the data would silently get thinner).
 */
export function imageArtifact(
  dir: ImageDir,
  image: UbuntuImage,
  mirrorPath: string | null,
): Artifact {
  const sha = dir.sums.get(image.file);
  if (!sha || !/^[0-9a-f]{64}$/.test(sha))
    throw new Error(`${dir.url}SHA256SUMS has no SHA-256 for ${image.file}`);
  if (!dir.names.has(image.file)) throw new Error(`${dir.url} does not list ${image.file}`);
  return {
    arch: image.arch,
    format: image.format,
    file: image.file,
    path: mirrorPath,
    url: `${dir.url}${image.file}`,
    size: null,
    checksum: { type: "sha256", value: sha, url: `${dir.url}SHA256SUMS` },
    signatureUrl: dir.names.has("SHA256SUMS.gpg") ? `${dir.url}SHA256SUMS.gpg` : null,
    torrentUrl: dir.names.has(`${image.file}.torrent`) ? `${dir.url}${image.file}.torrent` : null,
  };
}

/** Keeps the newest image of every key (compared by version), in first-seen key order. */
export function newestBy<T extends { image: UbuntuImage }>(
  items: T[],
  key: (item: T) => string,
): T[] {
  const best = new Map<string, T>();
  for (const item of items) {
    const known = best.get(key(item));
    if (!known || compareVersions(item.image.version, known.image.version) > 0)
      best.set(key(item), item);
  }
  return [...best.values()];
}
