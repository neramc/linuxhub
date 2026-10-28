/**
 * Oracle Linux.
 *
 * Official sources, and what each one is used for:
 * - yum.oracle.com/oracle-linux-isos.html (the ISO download page): the Full
 *   ISO, Boot ISO (Red Hat compatible kernel) and UEK Boot ISO of the three
 *   most recent updates of every release, for x86_64 and aarch64, with their
 *   official URLs on yum.oracle.com. The newest update of each supported
 *   release is listed; the Source ISOs are not.
 * - linux.oracle.com/security/gpg/: the "Oracle Linux Releases and Checksum
 *   Files" list. For the current update of each release and architecture it
 *   links the checksum file (SHA-256 of the Full, Boot and UEK Boot ISO),
 *   which is PGP-clearsigned by Oracle; `checksum.url` is that file, and
 *   `signatureUrl` is null because the signature is inside it (there is no
 *   detached signature file). If the ISO page offers an update whose
 *   checksum file is not linked yet, the sync throws.
 * - endoflife.date: end of Premier Support (the "end of life" used here;
 *   Oracle states only "ten years after the release date" on
 *   oracle.com/linux and keeps the exact dates in a PDF the sync cannot
 *   read) and the release date of an update when it is the one endoflife.date
 *   has as latest (otherwise null: it lags behind Oracle's own releases).
 *   Oracle Linux 7 (Premier Support ended 2024-12-31) is therefore dropped.
 *
 * Mirrors: Oracle publishes no mirror list (its ISO page calls third-party
 * mirror sites "unofficial ... not endorsed by Oracle"), so the mirror list
 * is the one official root, yum.oracle.com/ISOS/OracleLinux/ (served by
 * Akamai NetStorage), and root + artifact.path is the ISO. No country: Oracle
 * does not state one.
 *
 * Known upstream quirk: the checksum file of Oracle Linux 8.10 aarch64 names
 * the UEK Boot ISO `OracleLinux-R8-U10-boot-uek.iso` (no architecture), a
 * file that does not exist, while the page links
 * `OracleLinux-R8-U10-aarch64-boot-uek.iso`. Such a file is kept with
 * `checksum: null` (logged) instead of guessing that the entry is meant for
 * it; any other file the checksum file does not list makes the sync throw.
 * Torrents are not published (torrentUrl null); sizes are left to run.ts
 * (one HEAD per ISO).
 */

import type { Artifact, Edition, Release } from "../../../src/lib/data-schemas";
import { getText } from "../http";
import { parseChecksums } from "../lib/checksums";
import { endOfLife } from "../lib/endoflife";
import { originAsMirror } from "../lib/mirrors";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const PAGE = "https://yum.oracle.com/oracle-linux-isos.html";
const GPG = "https://linux.oracle.com/security/gpg/";
const ROOT = "https://yum.oracle.com/ISOS/OracleLinux/";

const ARCHES: Record<string, Artifact["arch"]> = { x86_64: "x86_64", aarch64: "aarch64" };

/** Image type in the file name → edition, in display order (names as the ISO page spells them). */
const EDITIONS: Record<string, { id: string; name: string; kind: Edition["kind"] }> = {
  dvd: { id: "full-iso", name: "Full ISO", kind: "server" },
  boot: { id: "boot-iso", name: "Boot ISO", kind: "netinst" },
  "boot-uek": { id: "uek-boot-iso", name: "UEK Boot ISO", kind: "netinst" },
};

interface Iso {
  major: string;
  update: number;
  arch: string;
  type: string;
  file: string;
  /** Path below ROOT. */
  path: string;
}

/** Every ISO the page links (Source ISOs excepted); a link of an unknown shape throws. */
function isoLinks(html: string): Iso[] {
  const out = new Map<string, Iso>();
  for (const m of html.matchAll(
    /href="(https:\/\/yum\.oracle\.com\/ISOS\/OracleLinux\/[^"]+\.iso)"/g,
  )) {
    const url = m[1] as string;
    if (url.includes("/source/")) continue;
    const path = url.slice(ROOT.length);
    const p = path.match(
      /^OL(\d+)\/u(\d+)\/(x86_64|aarch64)\/(OracleLinux-R\1-U\2-(?:Server-)?\3-(dvd|boot|boot-uek)\.iso)$/,
    );
    if (!p?.[1] || !p[2] || !p[3] || !p[4] || !p[5])
      throw new Error(`${PAGE}: unexpected ISO link ${url}`);
    out.set(path, {
      major: p[1],
      update: Number(p[2]),
      arch: p[3],
      type: p[5],
      file: p[4],
      path,
    });
  }
  return [...out.values()];
}

/** The checksum files the verification page links: release → update → arch → URL. */
function checksumLinks(html: string) {
  const out = new Map<string, Map<number, Map<string, string>>>();
  for (const m of html.matchAll(
    /href="(checksum\/OracleLinux-R(\d+)-U(\d+)-Server-([a-z0-9_]+)\.checksum)"/g,
  )) {
    const [, href, major, update, arch] = m;
    if (!href || !major || !update || !arch) continue;
    const updates = out.get(major) ?? new Map<number, Map<string, string>>();
    const arches = updates.get(Number(update)) ?? new Map<string, string>();
    arches.set(arch, `${GPG}${href}`);
    updates.set(Number(update), arches);
    out.set(major, updates);
  }
  return out;
}

export default defineSource({
  slug: "oracle-linux",
  hosts: ["yum.oracle.com", "linux.oracle.com"],
  async releases(ctx) {
    const [page, gpg, eol] = await Promise.all([
      getText(PAGE, { accept: "text/html" }),
      getText(GPG, { accept: "text/html" }),
      endOfLife("oracle-linux"),
    ]);
    const isos = isoLinks(page);
    if (!isos.length) throw new Error(`no ISO links on ${PAGE}`);
    const checksumFiles = checksumLinks(gpg);
    if (!checksumFiles.size) throw new Error(`no checksum files linked on ${GPG}`);

    const cycles = eol.cycles
      .filter((c) => /^\d+$/.test(c.name) && c.eol !== null && c.eol >= ctx.today)
      .sort((a, b) => compareVersions(b.name, a.name));
    if (!cycles.length) throw new Error(`no supported Oracle Linux release on ${eol.url}`);

    const releases: Release[] = [];
    for (const cycle of cycles) {
      const ofMajor = isos.filter((i) => i.major === cycle.name);
      const update = Math.max(...ofMajor.map((i) => i.update));
      if (!ofMajor.length)
        throw new Error(
          `${PAGE}: no ISO for Oracle Linux ${cycle.name}, supported until ${cycle.eol}`,
        );
      const version = `${cycle.name}.${update}`;
      const files = checksumFiles.get(cycle.name)?.get(update);
      if (!files) throw new Error(`${GPG}: no checksum file for Oracle Linux ${version}`);

      const sums = new Map<string, Map<string, string>>();
      for (const arch of new Set(ofMajor.filter((i) => i.update === update).map((i) => i.arch))) {
        const url = files.get(arch);
        if (!url) throw new Error(`${GPG}: no checksum file for Oracle Linux ${version} ${arch}`);
        sums.set(arch, parseChecksums(await getText(url)));
      }

      const editions: Edition[] = [];
      for (const [type, def] of Object.entries(EDITIONS)) {
        const artifacts: Artifact[] = ofMajor
          .filter((i) => i.update === update && i.type === type)
          .map((i) => {
            const arch = ARCHES[i.arch] as Artifact["arch"];
            const url = `${ROOT}${i.path}`;
            const sumUrl = files.get(i.arch) as string;
            const all = sums.get(i.arch) as Map<string, string>;
            const sha256 = all.get(i.file) ?? null;
            if (sha256 !== null && !/^[0-9a-f]{64}$/.test(sha256))
              throw new Error(`${sumUrl}: bad SHA-256 for ${i.file}`);
            // The 8.10 aarch64 file lists its UEK boot ISO without the architecture.
            if (sha256 === null) {
              if (!all.has(i.file.replace(`-${i.arch}-`, "-")))
                throw new Error(`${sumUrl}: no SHA-256 for ${i.file}`);
              ctx.log(
                `${i.file}: its checksum file lists it under a name without the architecture`,
              );
            }
            return {
              arch,
              format: "iso",
              file: i.file,
              path: i.path,
              url,
              size: null,
              checksum: sha256 ? { type: "sha256", value: sha256, url: sumUrl } : null,
              signatureUrl: null,
              torrentUrl: null,
            };
          });
        if (artifacts.length)
          editions.push({ id: def.id, name: def.name, desktop: null, kind: def.kind, artifacts });
      }
      if (!editions.some((e) => e.id === "full-iso"))
        throw new Error(`${PAGE}: no Full ISO for Oracle Linux ${version}`);

      releases.push({
        version,
        channel: "stable",
        codename: null,
        releaseDate: cycle.latest === version ? cycle.latestDate : null,
        eol: cycle.eol,
        notesUrl: `https://docs.oracle.com/en/operating-systems/oracle-linux/${cycle.name}/relnotes${version}/`,
        editions,
      });
    }
    return { sources: [PAGE, GPG, eol.url], releases };
  },

  async mirrors() {
    // One official root: every ISO is served from it under its own path.
    return { sources: [PAGE], mirrors: [originAsMirror(ROOT, "yum.oracle.com")] };
  },
});
