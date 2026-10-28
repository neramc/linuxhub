/**
 * PCLinuxOS: the monthly 64-bit live ISOs.
 *
 * State of the official sources on 2026-10-28: www.pclinuxos.com (home,
 * download page, forum, robots.txt) answers every request from LinuxhubBot
 * with a Cloudflare challenge (HTTP 403), which this sync does not work
 * around. The project's other web host, the PCLinuxOS Magazine, has no
 * download information. The download page therefore cannot be read.
 *
 * What is read instead is the ISO tree of ftp.nluug.nl/os/Linux/distr/
 * pclinuxos/iso/, the mirror that the project's own getpclinuxos tool uses as
 * its default (the project's guide, dnf-pkg-mgr-multilingual.pdf, lives in
 * the same directory). It holds exactly one monthly set:
 * pclinuxos64-<flavor>-<YYYY.MM>.iso with a <name>.md5sum beside it.
 * - Editions: the flavors present (KDE, KDE Darkstar, MATE, Xfce today, all
 *   four required: a set that lacks one throws), all 64-bit; the version is the
 *   YYYY.MM of the file names. PCLinuxOS is a rolling distribution that
 *   republishes its installation media monthly, so the release is channel
 *   "rolling" and only the newest set exists (an older set is not offered once
 *   a new one is up).
 * - Checksum: the .md5sum file in the same directory, the only checksum the
 *   project publishes (no SHA-2, no signature, no torrent), hence md5 with
 *   that file as checksum.url. A listed ISO without its .md5sum throws.
 * - Release date: the upload day shown in the directory listing for the ISOs
 *   (the newest of the set); the project publishes no date of its own.
 * - Sizes: the listing rounds them ("4.0 GiB"), so they stay null and run.ts
 *   HEADs the file.
 *
 * Mirrors: the project's mirror list is not published as a page or file that
 * can be read. It ships inside the dnf-package-manager RPM
 * (/usr/share/dnf-package-manager/repos/*.repo, 13 entries in 1.18-1pclos2026
 * of 2026-08-06), and the project's own getpclinuxos tool turns each baseurl
 * into that mirror's ISO directory (<root>/apt/... -> <root>/iso). An RPM is a
 * binary xz archive, which neither the text-only HTTP client nor Node can
 * read, so the 8 entries that are HTTPS (the other 5 are plain http and the
 * data model takes HTTPS only) are transcribed in MIRRORS below, with their
 * country only where the host name states it (country-code domain, .edu).
 * The tree has no list file, distro.ibiblio.org (another mirror the project
 * names) disallows bots, and nothing else readable exists. On 2026-10-28 every
 * one of them that robots.txt lets a HEAD through (all but Princeton) served
 * the current ISO with the size of the NLUUG copy; run.ts checks each again on
 * every run and drops one that stops answering. A mirror the project adds
 * later is not picked up until the list is transcribed again. Every artifact
 * has path = iso/<file> below each root; `url` is the NLUUG copy.
 *
 * Not included: anything the download page offers that is not in the
 * directory above (the page cannot be read, so such editions are unknown;
 * community editions are separate projects hosted elsewhere).
 */

import type { Edition, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getText } from "../http";
import { parseChecksums } from "../lib/checksums";
import { originAsMirror } from "../lib/mirrors";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const ROOT = "https://ftp.nluug.nl/os/Linux/distr/pclinuxos/";
const ISO = `${ROOT}iso/`;

/** Flavors in display order, keyed by the lowercase name in the file name. */
const FLAVORS: Record<string, { name: string; desktop: Desktop | null }> = {
  kde: { name: "KDE", desktop: "kde" },
  "kde-darkstar": { name: "KDE Darkstar", desktop: "kde" },
  mate: { name: "MATE", desktop: "mate" },
  xfce: { name: "Xfce", desktop: "xfce" },
};

/**
 * The HTTPS entries of the project's own mirror list (see the header), by the
 * root that holds iso/. Country only where the host name states it.
 */
const MIRRORS: { root: string; country: string | null }[] = [
  { root: "https://mirror.aarnet.edu.au/pclinuxos/", country: "AU" },
  { root: "https://mirrors.cicku.me/pclinuxos/", country: null },
  { root: "https://distrib-coffee.ipsl.jussieu.fr/pub/linux/pclinuxos/", country: "FR" },
  { root: "https://ftp.fau.de/pclinuxos/", country: "DE" },
  { root: "https://mirror.freedif.org/PCLinuxOS/", country: null },
  { root: ROOT, country: "NL" },
  { root: "https://mirror.math.princeton.edu/pub/pclinuxos/", country: "US" },
  { root: "https://ftp.cc.uoc.gr/mirrors/linux/pclinuxos/", country: "GR" },
];

const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");

/** "2026-Oct-06 20:05" → "2026-10-06"; anything else → null. */
function listingDay(value: string): string | null {
  const m = value.match(/^(\d{4})-([A-Za-z]{3})-(\d{2})\b/);
  const month = MONTHS.indexOf((m?.[2] ?? "").toLowerCase());
  return m && month >= 0 ? `${m[1]}-${String(month + 1).padStart(2, "0")}-${m[3]}` : null;
}

export default defineSource({
  slug: "pclinuxos",
  hosts: ["ftp.nluug.nl"],
  async releases() {
    const html = await getText(ISO, { accept: "text/html" });
    // One row per entry: name, rounded size, date.
    const entries = new Map<string, string | null>();
    for (const m of html.matchAll(
      /<td class="link"><a href="([^"]+)"[^>]*>[^<]*<\/a><\/td><td class="size">[^<]*<\/td><td class="date">([^<]*)<\/td>/g,
    ))
      entries.set(decodeURIComponent(m[1] ?? ""), listingDay(m[2] ?? ""));
    if (!entries.size) throw new Error(`${ISO} no longer looks like a directory listing`);

    const isos = [...entries.keys()].flatMap((name) => {
      const m = name.match(/^pclinuxos64-([A-Za-z0-9-]+)-(\d{4}\.\d{2})\.iso$/);
      return m?.[1] && m[2]
        ? [{ name, flavor: m[1].toLowerCase(), spelled: m[1], version: m[2] }]
        : [];
    });
    const version = isos
      .map((i) => i.version)
      .sort(compareVersions)
      .at(-1);
    if (!version) throw new Error(`no pclinuxos64-<flavor>-<YYYY.MM>.iso in ${ISO}`);
    const set = isos.filter((i) => i.version === version);

    const order = Object.keys(FLAVORS);
    const flavors = [...set].sort(
      (a, b) =>
        (order.indexOf(a.flavor) + 1 || order.length + 1) -
          (order.indexOf(b.flavor) + 1 || order.length + 1) || a.flavor.localeCompare(b.flavor),
    );
    const editions: Edition[] = [];
    const days: string[] = [];
    for (const iso of flavors) {
      const sumName = iso.name.replace(/\.iso$/, ".md5sum");
      if (!entries.has(sumName)) throw new Error(`${ISO} has ${iso.name} but no ${sumName}`);
      const hash = parseChecksums(await getText(`${ISO}${sumName}`)).get(iso.name);
      if (hash?.length !== 32) throw new Error(`${ISO}${sumName} does not list ${iso.name}`);
      const known = FLAVORS[iso.flavor];
      const day = entries.get(iso.name);
      if (day) days.push(day);
      editions.push({
        id: iso.flavor,
        name: known?.name ?? iso.spelled,
        desktop: known?.desktop ?? null,
        kind: "live",
        artifacts: [
          {
            arch: "x86_64",
            format: "iso",
            file: iso.name,
            path: `iso/${iso.name}`,
            url: `${ISO}${iso.name}`,
            size: null,
            checksum: { type: "md5", value: hash, url: `${ISO}${sumName}` },
            signatureUrl: null,
            torrentUrl: null,
          },
        ],
      });
    }
    // Fail closed: a set that lacks an ISO the directory held before is a partial upload or a
    // dropped edition; either way the data must not get thinner silently.
    for (const id of Object.keys(FLAVORS))
      if (!editions.some((e) => e.id === id))
        throw new Error(`no ${FLAVORS[id]?.name} ISO for ${version} in ${ISO}`);

    const release: Release = {
      version,
      channel: "rolling",
      codename: null,
      releaseDate: days.sort().at(-1) ?? null,
      eol: null,
      notesUrl: null,
      editions,
    };
    return { sources: [ISO], releases: [release] };
  },
  async mirrors() {
    return {
      sources: [ISO],
      mirrors: MIRRORS.map((m) => originAsMirror(m.root, new URL(m.root).hostname, m.country)),
    };
  },
});
