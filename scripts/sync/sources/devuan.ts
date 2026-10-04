/**
 * Devuan: the release archive files.devuan.org marks the current stable
 * release with a LATEST_STABLE_IS_<CODENAME> file; its installer-iso,
 * desktop-live and minimal-live directories carry the images with SHA-256
 * lists (SHA256SUMS.txt or per-image .sha256) signed by the release
 * developer. Release/EOL dates come from endoflife.date; an older release is
 * listed only while it is still in regular (non-LTS) support.
 *
 * No mirrors(): the only bot-readable official ISO mirror list
 * (devuan.org/get-devuan) names no countries, and the machine-readable lists
 * on pkgmaster.devuan.org / git.devuan.org are closed to bots by robots.txt.
 */

import type { Artifact, Edition, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getText, HttpError, headSize } from "../http";
import { parseChecksums } from "../lib/checksums";
import { listDirectory } from "../lib/dirlist";
import { endOfLife } from "../lib/endoflife";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const ROOT = "https://files.devuan.org/";

/** Image type in "devuan_<codename>_<version>_<arch>_<type>.iso" → edition. Display order. */
const EDITIONS: {
  type: string;
  dir: string;
  id: string;
  name: string;
  desktop: Desktop | null;
  kind: Edition["kind"];
}[] = [
  {
    type: "desktop-live",
    dir: "desktop-live",
    id: "desktop-live",
    name: "Desktop Live",
    desktop: "xfce",
    kind: "live",
  },
  {
    type: "netinstall",
    dir: "installer-iso",
    id: "netinstall",
    name: "Netinstall",
    desktop: null,
    kind: "netinst",
  },
  {
    type: "server",
    dir: "installer-iso",
    id: "server",
    name: "Server (CD1)",
    desktop: null,
    kind: "server",
  },
  {
    type: "desktop",
    dir: "installer-iso",
    id: "desktop",
    name: "Desktop DVD",
    desktop: "xfce",
    kind: "desktop",
  },
  {
    type: "minimal-live",
    dir: "minimal-live",
    id: "minimal-live",
    name: "Minimal Live",
    desktop: "none",
    kind: "live",
  },
];

const ARCHES: Record<string, Artifact["arch"]> = { amd64: "x86_64", i386: "i686" };

interface Image {
  file: string;
  version: string;
  arch: Artifact["arch"];
  type: string;
  sha256: string;
  checksumUrl: string;
  signatureUrl: string | null;
  dir: string;
}

const capitalize = (s: string) => (s[0]?.toUpperCase() ?? "") + s.slice(1);

async function listing(url: string): Promise<string[]> {
  try {
    return await listDirectory(url);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return [];
    throw error;
  }
}

/** Images (with SHA-256) in one image directory of a release. */
async function imagesIn(codename: string, dir: string): Promise<Image[]> {
  const url = `${ROOT}devuan_${codename}/${dir}/`;
  const names = await listing(url);
  const pattern = new RegExp(`^devuan_${codename}_(\\d+(?:\\.\\d+)*)_([a-z0-9]+)_([a-z-]+)\\.iso$`);
  const out: Image[] = [];
  if (names.includes("SHA256SUMS.txt")) {
    const sums = parseChecksums(await getText(`${url}SHA256SUMS.txt`));
    for (const [file, sha256] of sums) {
      const m = file.match(pattern);
      const arch = m?.[2] ? ARCHES[m[2]] : undefined;
      if (!m?.[1] || !m[3] || !arch || !names.includes(file)) continue;
      out.push({
        file,
        version: m[1],
        arch,
        type: m[3],
        sha256,
        checksumUrl: `${url}SHA256SUMS.txt`,
        signatureUrl: names.includes("SHA256SUMS.txt.asc") ? `${url}SHA256SUMS.txt.asc` : null,
        dir: url,
      });
    }
    return out;
  }
  // Per-image checksum files ("<image>.sha256" + ".sha256.asc").
  for (const file of names) {
    const m = file.match(pattern);
    const arch = m?.[2] ? ARCHES[m[2]] : undefined;
    if (!m?.[1] || !m[3] || !arch || !names.includes(`${file}.sha256`)) continue;
    const sha256 = parseChecksums(await getText(`${url}${file}.sha256`)).get(file);
    if (!sha256) continue;
    out.push({
      file,
      version: m[1],
      arch,
      type: m[3],
      sha256,
      checksumUrl: `${url}${file}.sha256`,
      signatureUrl: names.includes(`${file}.sha256.asc`) ? `${url}${file}.sha256.asc` : null,
      dir: url,
    });
  }
  return out;
}

async function release(
  codename: string,
  cycle: Awaited<ReturnType<typeof endOfLife>>["cycles"][number] | undefined,
): Promise<Release | null> {
  const base = `${ROOT}devuan_${codename}/`;
  const subdirs = await listing(base);
  const images: Image[] = [];
  for (const dir of [...new Set(EDITIONS.map((e) => e.dir))]) {
    if (subdirs.includes(`${dir}/`)) images.push(...(await imagesIn(codename, dir)));
  }
  const version = images.map((i) => i.version).sort((a, b) => compareVersions(b, a))[0];
  if (!version) return null;

  const editions: Edition[] = [];
  for (const def of EDITIONS) {
    const artifacts: Artifact[] = [];
    for (const arch of Object.values(ARCHES)) {
      // Newest image of this type and arch (checksum lists can carry older point releases).
      const image = images
        .filter((i) => i.type === def.type && i.arch === arch && i.dir.endsWith(`/${def.dir}/`))
        .sort((a, b) => compareVersions(b.version, a.version))[0];
      if (!image) continue;
      artifacts.push({
        arch,
        format: "iso",
        file: image.file,
        path: null,
        url: `${image.dir}${image.file}`,
        size: await headSize(`${image.dir}${image.file}`),
        checksum: { type: "sha256", value: image.sha256, url: image.checksumUrl },
        signatureUrl: image.signatureUrl,
        torrentUrl: null,
      });
    }
    if (artifacts.length)
      editions.push({
        id: def.id,
        name: def.name,
        desktop: def.desktop,
        kind: def.kind,
        artifacts,
      });
  }
  if (!editions.length) return null;

  return {
    version,
    channel: "stable",
    codename: cycle?.codename ?? capitalize(codename),
    releaseDate:
      cycle?.latest === version
        ? (cycle.latestDate ?? cycle.releaseDate)
        : (cycle?.releaseDate ?? null),
    eol: cycle?.eol ?? null,
    notesUrl: subdirs.includes("Release_notes.txt") ? `${base}Release_notes.txt` : null,
    editions,
  };
}

export default defineSource({
  slug: "devuan",
  hosts: ["files.devuan.org"],
  async releases(ctx) {
    const root = await listDirectory(ROOT);
    const stable = root
      .map((name) => name.match(/^LATEST_STABLE_IS_([A-Z]+)$/)?.[1]?.toLowerCase())
      .find((c): c is string => Boolean(c));
    if (!stable) throw new Error("no LATEST_STABLE_IS_<CODENAME> marker in the release archive");
    const eol = await endOfLife("devuan");
    const byCodename = new Map(eol.cycles.map((c) => [(c.codename ?? "").toLowerCase(), c]));

    // Current stable, plus any other release still in regular (non-LTS) support.
    const codenames = [
      stable,
      ...eol.cycles
        .filter(
          (c) =>
            c.isMaintained &&
            !c.lts &&
            (!c.eol || c.eol >= ctx.today) &&
            c.codename &&
            c.codename.toLowerCase() !== stable &&
            root.includes(`devuan_${c.codename.toLowerCase()}/`),
        )
        .map((c) => (c.codename ?? "").toLowerCase()),
    ].slice(0, 3);

    const releases: Release[] = [];
    for (const codename of codenames) {
      const r = await release(codename, byCodename.get(codename));
      if (r) releases.push(r);
    }
    releases.sort((a, b) => compareVersions(b.version, a.version));
    return { sources: [ROOT, eol.url], releases };
  },
});
