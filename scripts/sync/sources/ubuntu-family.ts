/**
 * Ubuntu and its official flavors. Releases and EOL dates come from
 * endoflife.date (sourced from Canonical's release cycle); files and SHA-256
 * from the official SHA256SUMS next to the images:
 *   Ubuntu desktop/server amd64 → releases.ubuntu.com/<cycle>/ (mirrored by
 *   Ubuntu's official CD-image mirrors listed in Launchpad)
 *   arm64 and flavors → cdimage.ubuntu.com
 */

import type { Artifact, Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getJson, getText, HttpError } from "../http";
import { parseChecksums } from "../lib/checksums";
import { listDirectory } from "../lib/dirlist";
import { endOfLife } from "../lib/endoflife";
import { countryCode, withSlash } from "../lib/mirrors";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

interface EditionDef {
  id: string;
  name: string;
  desktop: Desktop | null;
  kind: Edition["kind"];
  /** Matches the ISO file name for an arch label (amd64/arm64). */
  pattern: (arch: string) => RegExp;
}

const ARCH_MAP: Record<string, Artifact["arch"]> = { amd64: "x86_64", arm64: "aarch64" };

async function sums(dir: string): Promise<Map<string, string> | null> {
  try {
    return parseChecksums(await getText(`${dir}SHA256SUMS`));
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}

/** Keeps only the newest point release per architecture (checksum files can list older ones). */
function newestPerArch(artifacts: Artifact[]): Artifact[] {
  const best = new Map<string, Artifact>();
  const ver = (a: Artifact) => a.file.match(/-(\d+\.\d+(?:\.\d+)?)-/)?.[1] ?? "0";
  for (const a of artifacts) {
    const cur = best.get(a.arch);
    if (!cur || compareVersions(ver(a), ver(cur)) > 0) best.set(a.arch, a);
  }
  return [...best.values()].sort((a, b) => a.arch.localeCompare(b.arch));
}

async function artifactsFrom(
  dir: string,
  mirrorPrefix: string | null,
  def: EditionDef,
  arch: string,
): Promise<Artifact[]> {
  const checksums = await sums(dir);
  if (!checksums) return [];
  let listing: string[] = [];
  try {
    listing = await listDirectory(dir);
  } catch {
    /* listing is optional (torrent detection only) */
  }
  return [...checksums]
    .filter(([file]) => def.pattern(arch).test(file))
    .map(([file, sha256]) => ({
      arch: ARCH_MAP[arch] as Artifact["arch"],
      format: "iso" as const,
      file,
      path: mirrorPrefix ? `${mirrorPrefix}${file}` : null,
      url: `${dir}${file}`,
      size: null,
      checksum: { type: "sha256" as const, value: sha256, url: `${dir}SHA256SUMS` },
      signatureUrl: `${dir}SHA256SUMS.gpg`,
      torrentUrl: listing.includes(`${file}.torrent`) ? `${dir}${file}.torrent` : null,
    }));
}

export function ubuntuFamily(options: {
  slug: string;
  /** cdimage.ubuntu.com sub-tree for flavors (e.g. "kubuntu"); undefined for Ubuntu itself. */
  flavor?: string;
  editions: EditionDef[];
  withMirrors?: boolean;
}) {
  const { slug, flavor, editions } = options;
  return defineSource({
    slug,
    hosts: ["releases.ubuntu.com", "cdimage.ubuntu.com"],
    async releases(ctx) {
      const eol = await endOfLife("ubuntu");
      // Standard support only (ESM/Pro-only releases are not offered for new installs).
      const cycles = eol.cycles
        .filter((c) => c.isMaintained && (!c.eol || c.eol >= ctx.today))
        .slice(0, 3);
      const releases: Release[] = [];
      for (const cycle of cycles) {
        const out: Edition[] = [];
        for (const def of editions) {
          const artifacts: Artifact[] = [];
          for (const arch of ["amd64", "arm64"]) {
            if (!flavor && arch === "amd64") {
              artifacts.push(
                ...(await artifactsFrom(
                  `https://releases.ubuntu.com/${cycle.name}/`,
                  `${cycle.name}/`,
                  def,
                  arch,
                )),
              );
            } else {
              const base = flavor
                ? `https://cdimage.ubuntu.com/${flavor}/releases/${cycle.name}/release/`
                : `https://cdimage.ubuntu.com/releases/${cycle.name}/release/`;
              if (flavor && arch === "arm64") continue; // flavors publish amd64 images
              artifacts.push(...(await artifactsFrom(base, null, def, arch)));
            }
          }
          const newest = newestPerArch(artifacts);
          if (newest.length)
            out.push({
              id: def.id,
              name: def.name,
              desktop: def.desktop,
              kind: def.kind,
              artifacts: newest,
            });
        }
        if (!out.length) continue; // the flavor dropped this cycle
        const first = out[0]?.artifacts.find((a) => a.arch === "x86_64") ?? out[0]?.artifacts[0];
        const point =
          first?.file.match(/-(\d+\.\d+(?:\.\d+)?)-/)?.[1] ?? cycle.latest ?? cycle.name;
        releases.push({
          version: point,
          channel: cycle.lts ? "lts" : "stable",
          codename: cycle.codename,
          releaseDate: cycle.releaseDate,
          eol: cycle.eol,
          notesUrl: null,
          editions: out,
        });
      }
      return {
        sources: [
          eol.url,
          flavor
            ? `https://cdimage.ubuntu.com/${flavor}/releases/`
            : "https://releases.ubuntu.com/",
        ],
        releases,
      };
    },
    ...(options.withMirrors
      ? {
          async mirrors() {
            const sources = ["https://api.launchpad.net/devel/ubuntu/cdimage_mirrors"];
            const mirrors: Mirror[] = [];
            let next: string | null = sources[0] ?? null;
            while (next) {
              const page: {
                entries: {
                  https_base_url: string | null;
                  enabled: boolean;
                  status: string;
                  country_link: string;
                  displayname: string | null;
                }[];
                next_collection_link?: string;
              } = await getJson(next);
              for (const m of page.entries) {
                if (!m.enabled || m.status !== "Official" || !m.https_base_url) continue;
                mirrors.push({
                  url: withSlash(m.https_base_url),
                  country: countryCode(m.country_link.split("/").pop()),
                  name: m.displayname ?? new URL(m.https_base_url).hostname,
                  lat: null,
                  lon: null,
                  score: null,
                });
              }
              next = page.next_collection_link ?? null;
            }
            return { sources, mirrors };
          },
        }
      : {}),
  });
}

const iso = (kind: string) => (arch: string) => new RegExp(`-${kind}-${arch}\\.iso$`);

export const ubuntu = ubuntuFamily({
  slug: "ubuntu",
  withMirrors: true,
  editions: [
    { id: "desktop", name: "Desktop", desktop: "gnome", kind: "desktop", pattern: iso("desktop") },
    { id: "server", name: "Server", desktop: null, kind: "server", pattern: iso("live-server") },
  ],
});

const desktopOnly = (desktop: Desktop) => [
  { id: "desktop", name: "Desktop", desktop, kind: "desktop" as const, pattern: iso("desktop") },
];

export const kubuntu = ubuntuFamily({
  slug: "kubuntu",
  flavor: "kubuntu",
  editions: desktopOnly("kde"),
});
export const xubuntu = ubuntuFamily({
  slug: "xubuntu",
  flavor: "xubuntu",
  editions: [
    ...desktopOnly("xfce"),
    { id: "minimal", name: "Minimal", desktop: "xfce", kind: "minimal", pattern: iso("minimal") },
  ],
});
export const lubuntu = ubuntuFamily({
  slug: "lubuntu",
  flavor: "lubuntu",
  editions: desktopOnly("lxqt"),
});
export const ubuntuMate = ubuntuFamily({
  slug: "ubuntu-mate",
  flavor: "ubuntu-mate",
  editions: desktopOnly("mate"),
});

export default [ubuntu, kubuntu, xubuntu, lubuntu, ubuntuMate];
