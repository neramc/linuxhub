/**
 * Debian stable: version/codename from the archive's Release file, images and
 * SHA-256 from cdimage.debian.org (netinst + live images per desktop), EOL
 * dates from endoflife.date. Mirrors: the official Mirrors.masterlist entries
 * that carry the CD image tree, kept only when they answer over HTTPS.
 */

import type { Artifact, Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getText } from "../http";
import { parseChecksums } from "../lib/checksums";
import { endOfLife } from "../lib/endoflife";
import { countryCode, httpsReachable, mapLimit } from "../lib/mirrors";
import { defineSource } from "../source";

const CD = "https://cdimage.debian.org/debian-cd/";
const RELEASE = "https://deb.debian.org/debian/dists/stable/Release";
const MASTERLIST = "https://mirror-master.debian.org/status/Mirrors.masterlist";

const LIVE: { id: string; name: string; desktop: Desktop }[] = [
  { id: "gnome", name: "Live GNOME", desktop: "gnome" },
  { id: "kde", name: "Live KDE Plasma", desktop: "kde" },
  { id: "xfce", name: "Live Xfce", desktop: "xfce" },
  { id: "cinnamon", name: "Live Cinnamon", desktop: "cinnamon" },
  { id: "mate", name: "Live MATE", desktop: "mate" },
  { id: "lxqt", name: "Live LXQt", desktop: "lxqt" },
  { id: "lxde", name: "Live LXDE", desktop: "lxde" },
];

function artifact(
  dir: string,
  mirrorDir: string,
  file: string,
  sha: string,
  arch: Artifact["arch"],
): Artifact {
  return {
    arch,
    format: "iso",
    file,
    path: `${mirrorDir}${file}`,
    url: `${dir}${file}`,
    size: null,
    checksum: { type: "sha256", value: sha, url: `${dir}SHA256SUMS` },
    signatureUrl: `${dir}SHA256SUMS.sign`,
    torrentUrl: null,
  };
}

export default defineSource({
  slug: "debian",
  hosts: ["cdimage.debian.org"],
  async releases() {
    const release = await getText(RELEASE);
    const version = release.match(/^Version:\s*(\S+)/m)?.[1];
    const codename = release.match(/^Codename:\s*(\S+)/m)?.[1] ?? null;
    if (!version) throw new Error("no Version in stable Release file");
    const eol = await endOfLife("debian");
    const cycle = eol.cycles.find((c) => c.name === version.split(".")[0]);

    const editions: Edition[] = [];
    // Network installer (amd64 + arm64).
    const netinst: Artifact[] = [];
    for (const [debArch, arch] of [
      ["amd64", "x86_64"],
      ["arm64", "aarch64"],
    ] as const) {
      const dir = `${CD}current/${debArch}/iso-cd/`;
      const files = parseChecksums(await getText(`${dir}SHA256SUMS`));
      for (const [file, sha] of files) {
        const m = file.match(new RegExp(`^debian-(\\d+\\.\\d+\\.\\d+)-${debArch}-netinst\\.iso$`));
        if (m) netinst.push(artifact(dir, `${m[1]}/${debArch}/iso-cd/`, file, sha, arch));
      }
    }
    // Live images (amd64), one edition per desktop.
    const liveDir = `${CD}current-live/amd64/iso-hybrid/`;
    const live = parseChecksums(await getText(`${liveDir}SHA256SUMS`));
    for (const def of LIVE) {
      const hit = [...live].find(([file]) =>
        new RegExp(`^debian-live-[\\d.]+-amd64-${def.id}\\.iso$`).test(file),
      );
      if (!hit) continue;
      const [file, sha] = hit;
      const ver = file.match(/^debian-live-([\d.]+)-/)?.[1] ?? "";
      editions.push({
        id: `live-${def.id}`,
        name: def.name,
        desktop: def.desktop,
        kind: "live",
        artifacts: [artifact(liveDir, `${ver}-live/amd64/iso-hybrid/`, file, sha, "x86_64")],
      });
    }
    if (netinst.length) {
      editions.unshift({
        id: "netinst",
        name: "netinst",
        desktop: null,
        kind: "netinst",
        artifacts: netinst,
      });
    }

    const releases: Release[] = [
      {
        version,
        channel: "stable",
        codename: codename ? codename[0]?.toUpperCase() + codename.slice(1) : null,
        releaseDate: cycle?.releaseDate ?? null,
        eol: cycle?.eol ?? null,
        notesUrl: `https://www.debian.org/releases/${codename ?? "stable"}/releasenotes`,
        editions,
      },
    ];
    return { sources: [RELEASE, `${CD}current/`, `${CD}current-live/`, eol.url], releases };
  },
  async mirrors() {
    const text = await getText(MASTERLIST);
    const candidates: { site: string; path: string; country: string | null }[] = [];
    for (const block of text.split(/\n\s*\n/)) {
      const site = block.match(/^Site:\s*(\S+)/m)?.[1];
      const path = block.match(/^CDImage-http:\s*(\S+)/m)?.[1];
      const type = block.match(/^Type:\s*(\S+)/m)?.[1];
      if (!site || !path || type === "Origin") continue;
      candidates.push({
        site,
        path,
        country: countryCode(block.match(/^Country:\s*([A-Z]{2})/m)?.[1]),
      });
    }
    const checked = await mapLimit(candidates, 8, async (c) => {
      const url = `https://${c.site}${c.path.endsWith("/") ? c.path : `${c.path}/`}`;
      return (await httpsReachable(url)) ? c : null;
    });
    const mirrors: Mirror[] = checked
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .map((c) => ({
        url: `https://${c.site}${c.path.endsWith("/") ? c.path : `${c.path}/`}`,
        country: c.country,
        name: c.site,
        lat: null,
        lon: null,
        score: null,
      }));
    return { sources: [MASTERLIST], mirrors };
  },
});
