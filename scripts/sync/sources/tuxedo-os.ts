/**
 * TUXEDO OS: TUXEDO Computers serves the ISO from one first-party server,
 * os.tuxedocomputers.com (its product page links only that server). There is
 * no mirror network and no redirector, so the mirrors file holds that single
 * origin, without a country because no official page says where it runs.
 *
 * The server's index lists the current build as TUXEDO-OS-<YYYYMMDDhhmm>.iso
 * with a .torrent next to it; checksums/ holds <iso>.sha256 (SHA-256, the only
 * algorithm published) and <iso>.sha256.asc, a detached OpenPGP signature of
 * the .sha256 file (not of the ISO), made with TUXEDO's ISO signing key
 * 0x4E6C9F510268444C. Verify with `gpg --verify <iso>.sha256.asc <iso>.sha256`,
 * then `sha256sum -c <iso>.sha256`; signatureUrl points at that .asc.
 *
 * The ISO is rebuilt in place and the old build disappears, so each build is a
 * dated rolling snapshot; the index offers one build, and up to two are kept
 * if it ever lists more (one per day: a same-day rebuild replaces the older
 * one). TUXEDO publishes no version number on its download infrastructure, so
 * the build date is the version. The ISO is x86_64 only. The size is left to
 * the runner (the index only shows a rounded "4.7 GiB"; one HEAD on this
 * origin, which does not redirect).
 *
 * Excluded: TUXEDO-OS_current.* (an alias of the dated build, with its own
 * checksum file naming the alias), .manifest (a package list, not an image),
 * and mirrors.tuxedocomputers.com (package mirror: no ISO tree).
 */

import type { Release } from "../../../src/lib/data-schemas";
import { getText } from "../http";
import { parseChecksums } from "../lib/checksums";
import { listDirectory } from "../lib/dirlist";
import { originAsMirror } from "../lib/mirrors";
import { defineSource } from "../source";

const ORIGIN = "https://os.tuxedocomputers.com/";
const CHECKSUMS = `${ORIGIN}checksums/`;
/** Builds kept at once: the newest, plus the previous one while the server still offers it. */
const MAX_BUILDS = 2;

export default defineSource({
  slug: "tuxedo-os",
  hosts: ["os.tuxedocomputers.com"],
  async releases() {
    const names = await listDirectory(ORIGIN);
    const builds = names
      .map((n) => n.match(/^TUXEDO-OS-(\d{4})(\d{2})(\d{2})(\d{4})\.iso$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .sort((a, b) => (b[0] ?? "").localeCompare(a[0] ?? ""));
    const newest = builds[0]?.[0];
    if (!newest) throw new Error("no TUXEDO-OS-<build>.iso on the official ISO server");

    const sums = await listDirectory(CHECKSUMS);
    if (!sums.includes(`${newest}.sha256`)) throw new Error(`no checksum published for ${newest}`);

    const releases: Release[] = [];
    const days = new Set<string>();
    for (const build of builds) {
      const [file, year, month, day] = build;
      if (!file || releases.length >= MAX_BUILDS) break;
      const date = `${year}-${month}-${day}`;
      if (days.has(date) || !sums.includes(`${file}.sha256`)) continue;
      days.add(date);
      const sha = parseChecksums(await getText(`${CHECKSUMS}${file}.sha256`)).get(file);
      if (!sha || !/^[0-9a-f]{64}$/.test(sha))
        throw new Error(`${file}.sha256 does not list a SHA-256 for ${file}`);
      releases.push({
        version: `${year}.${month}.${day}`,
        channel: "rolling",
        codename: null,
        releaseDate: date,
        eol: null,
        notesUrl: null,
        editions: [
          {
            id: "desktop",
            name: "TUXEDO OS",
            desktop: "kde",
            kind: "desktop",
            artifacts: [
              {
                arch: "x86_64",
                format: "iso",
                file,
                path: file,
                url: `${ORIGIN}${file}`,
                size: null,
                checksum: { type: "sha256", value: sha, url: `${CHECKSUMS}${file}.sha256` },
                signatureUrl: sums.includes(`${file}.sha256.asc`)
                  ? `${CHECKSUMS}${file}.sha256.asc`
                  : null,
                torrentUrl: names.includes(`${file}.torrent`) ? `${ORIGIN}${file}.torrent` : null,
              },
            ],
          },
        ],
      });
    }
    return { sources: [ORIGIN, CHECKSUMS], releases };
  },
  async mirrors() {
    return { sources: [ORIGIN], mirrors: [originAsMirror(ORIGIN, "TUXEDO Computers")] };
  },
});
