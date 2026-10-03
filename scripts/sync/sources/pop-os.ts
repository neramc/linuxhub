/**
 * Pop!_OS: System76's build API returns the current ISO (URL, size, SHA-256)
 * per version and channel (generic / NVIDIA). Served from iso.pop-os.org (CDN).
 */
import type { Artifact, Edition, Release } from "../../../src/lib/data-schemas";
import { getJson, HttpError } from "../http";
import { endOfLife } from "../lib/endoflife";
import { defineSource } from "../source";

interface Build {
  version: string;
  url: string;
  size: number;
  sha_sum: string;
  channel: string;
  build: string;
}

const API = "https://api.pop-os.org/builds";
const CHANNELS: { id: string; name: string }[] = [
  { id: "generic", name: "Intel/AMD" },
  { id: "nvidia", name: "NVIDIA" },
];

async function build(version: string, channel: string, arch: string): Promise<Build | null> {
  try {
    return await getJson<Build>(`${API}/${version}/${channel}?arch=${arch}`);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}

export default defineSource({
  slug: "pop-os",
  hosts: ["iso.pop-os.org"],
  async releases(ctx) {
    const eol = await endOfLife("pop-os");
    const versions = eol.cycles
      .filter((c) => c.isMaintained && (!c.eol || c.eol >= ctx.today))
      .map((c) => c.name)
      .slice(0, 2);
    const releases: Release[] = [];
    for (const version of versions) {
      const editions: Edition[] = [];
      for (const ch of CHANNELS) {
        const artifacts: Artifact[] = [];
        for (const [apiArch, arch] of [
          ["amd64", "x86_64"],
          ["arm64", "aarch64"],
        ] as const) {
          const b =
            (await build(version, ch.id, apiArch)) ??
            (ch.id === "generic" ? await build(version, "intel", apiArch) : null);
          if (!b?.url.startsWith("https://")) continue;
          artifacts.push({
            arch,
            format: "iso",
            file: b.url.split("/").pop() ?? b.url,
            path: null,
            url: b.url,
            size: b.size || null,
            checksum: { type: "sha256", value: b.sha_sum.toLowerCase(), url: null },
            signatureUrl: null,
            torrentUrl: null,
          });
        }
        if (artifacts.length)
          editions.push({
            id: ch.id,
            name: ch.name,
            desktop: "cosmic",
            kind: "desktop",
            artifacts,
          });
      }
      const cycle = eol.cycles.find((c) => c.name === version);
      if (editions.length) {
        releases.push({
          version,
          channel: cycle?.lts ? "lts" : "stable",
          codename: null,
          releaseDate: cycle?.releaseDate ?? null,
          eol: cycle?.eol ?? null,
          notesUrl: null,
          editions: version.startsWith("22.")
            ? editions.map((e) => ({ ...e, desktop: "gnome" as const }))
            : editions,
        });
      }
    }
    return { sources: [`${API}/`, eol.url], releases };
  },
});
