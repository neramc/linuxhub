/**
 * TUXEDO OS: the official ISO server os.tuxedocomputers.com lists the current
 * build as TUXEDO-OS-<YYYYMMDDhhmm>.iso (plus a torrent), with its SHA-256 and
 * the GPG signature of that checksum (TUXEDO's ISO signing key) under
 * checksums/. The ISO is refreshed in place (semi-rolling), so each build is
 * tracked as a dated snapshot.
 */

import type { Release } from "../../../src/lib/data-schemas";
import { getText, headSize } from "../http";
import { parseChecksums } from "../lib/checksums";
import { listDirectory } from "../lib/dirlist";
import { defineSource } from "../source";

const ORIGIN = "https://os.tuxedocomputers.com/";
const CHECKSUMS = `${ORIGIN}checksums/`;

export default defineSource({
  slug: "tuxedo-os",
  hosts: ["os.tuxedocomputers.com"],
  async releases() {
    const names = await listDirectory(ORIGIN);
    const builds = names
      .map((n) => n.match(/^TUXEDO-OS-(\d{4})(\d{2})(\d{2})(\d{4})\.iso$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .sort((a, b) => (b[0] ?? "").localeCompare(a[0] ?? ""));
    const build = builds[0];
    if (!build) throw new Error("no TUXEDO-OS-<build>.iso on the official ISO server");
    const file = build[0];
    const [year, month, day] = [build[1], build[2], build[3]];

    const sums = await listDirectory(CHECKSUMS);
    if (!sums.includes(`${file}.sha256`)) throw new Error(`no checksum published for ${file}`);
    const sha = parseChecksums(await getText(`${CHECKSUMS}${file}.sha256`)).get(file);
    if (!sha) throw new Error(`${file}.sha256 does not list ${file}`);

    const releases: Release[] = [
      {
        version: `${year}.${month}.${day}`,
        channel: "rolling",
        codename: null,
        releaseDate: `${year}-${month}-${day}`,
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
                path: null,
                url: `${ORIGIN}${file}`,
                size: await headSize(`${ORIGIN}${file}`),
                checksum: { type: "sha256", value: sha, url: `${CHECKSUMS}${file}.sha256` },
                signatureUrl: sums.includes(`${file}.sha256.asc`)
                  ? `${CHECKSUMS}${file}.sha256.asc`
                  : null,
                torrentUrl: names.includes(`${file}.torrent`) ? `${ORIGIN}${file}.torrent` : null,
              },
            ],
          },
        ],
      },
    ];
    return { sources: [ORIGIN, CHECKSUMS], releases };
  },
});
