/**
 * Linux Mint: maintained versions from endoflife.date, images + SHA-256 from
 * the official ISO origin (pub.linuxmint.io, sha256sum.txt signed by the Mint
 * team). The official mirror list (linuxmint.com/mirrors.php) sits behind a
 * bot challenge, so downloads use the official origin; ranking mirrors for
 * Mint would need a scriptable official list.
 */

import type { Artifact, Edition, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getText } from "../http";
import { parseChecksums } from "../lib/checksums";
import { endOfLife } from "../lib/endoflife";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const ORIGIN = "https://pub.linuxmint.io/";
const EDITIONS: { id: string; name: string; desktop: Desktop }[] = [
  { id: "cinnamon", name: "Cinnamon Edition", desktop: "cinnamon" },
  { id: "xfce", name: "Xfce Edition", desktop: "xfce" },
  { id: "mate", name: "MATE Edition", desktop: "mate" },
];

export default defineSource({
  slug: "linux-mint",
  hosts: ["pub.linuxmint.io"],
  async releases(ctx) {
    const eol = await endOfLife("linuxmint");
    const numeric = eol.cycles
      .filter(
        (c) => c.isMaintained && (!c.eol || c.eol >= ctx.today) && /^\d+(\.\d+)?$/.test(c.name),
      )
      .sort((a, b) => compareVersions(b.name, a.name));
    // Latest release, plus the newest point release of the previous series.
    const latest = numeric[0];
    const previous = numeric.find(
      (c) => latest && c.name.split(".")[0] !== latest.name.split(".")[0],
    );
    const releases: Release[] = [];
    for (const cycle of [latest, previous].filter((c): c is NonNullable<typeof c> => Boolean(c))) {
      const dir = `${ORIGIN}stable/${cycle.name}/`;
      const sums = parseChecksums(await getText(`${dir}sha256sum.txt`));
      const editions: Edition[] = [];
      for (const def of EDITIONS) {
        const file = `linuxmint-${cycle.name}-${def.id}-64bit.iso`;
        const sha = sums.get(file);
        if (!sha) continue;
        const artifact: Artifact = {
          arch: "x86_64",
          format: "iso",
          file,
          path: `stable/${cycle.name}/${file}`,
          url: `${dir}${file}`,
          size: null,
          checksum: { type: "sha256", value: sha, url: `${dir}sha256sum.txt` },
          signatureUrl: `${dir}sha256sum.txt.gpg`,
          torrentUrl: null,
        };
        editions.push({
          id: def.id,
          name: def.name,
          desktop: def.desktop,
          kind: "desktop",
          artifacts: [artifact],
        });
      }
      if (editions.length) {
        releases.push({
          version: cycle.name,
          channel: "lts",
          codename: cycle.codename,
          releaseDate: cycle.releaseDate,
          eol: cycle.eol,
          notesUrl: `https://linuxmint.com/rel_${(cycle.codename ?? "").toLowerCase()}.php`,
          editions,
        });
      }
    }
    return { sources: [eol.url, `${ORIGIN}stable/`], releases };
  },
});
