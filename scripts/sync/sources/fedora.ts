/**
 * Fedora: official release metadata JSON (version, variant, arch, link,
 * sha256, size) + endoflife.date for release/EOL dates. Downloads go through
 * download.fedoraproject.org, Fedora's MirrorManager redirector, which sends
 * each visitor to a nearby mirror.
 */

import type { Artifact, Edition, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getJson } from "../http";
import { endOfLife } from "../lib/endoflife";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

interface Entry {
  version: string;
  arch: string;
  link: string;
  variant: string;
  subvariant: string;
  sha256?: string;
  size?: string;
}

const RELEASES_JSON = "https://fedoraproject.org/releases.json";

/** variant/subvariant → edition. Order here is the display order. */
const EDITIONS: {
  match: (e: Entry) => boolean;
  id: string;
  name: string;
  desktop: Desktop | null;
  kind: Edition["kind"];
}[] = [
  {
    match: (e) => e.variant === "Workstation",
    id: "workstation",
    name: "Workstation",
    desktop: "gnome",
    kind: "desktop",
  },
  {
    match: (e) => e.variant === "KDE",
    id: "kde",
    name: "KDE Plasma Desktop",
    desktop: "kde",
    kind: "desktop",
  },
  {
    match: (e) => e.variant === "Server" && /-dvd-/.test(e.link),
    id: "server",
    name: "Server",
    desktop: null,
    kind: "server",
  },
  {
    match: (e) => e.variant === "Server" && /-netinst-/.test(e.link),
    id: "server-netinst",
    name: "Server (netinstall)",
    desktop: null,
    kind: "netinst",
  },
  {
    match: (e) => e.variant === "Everything",
    id: "everything",
    name: "Everything (netinstall)",
    desktop: null,
    kind: "netinst",
  },
  {
    match: (e) => e.variant === "Silverblue",
    id: "silverblue",
    name: "Silverblue",
    desktop: "gnome",
    kind: "desktop",
  },
  {
    match: (e) => e.variant === "Kinoite",
    id: "kinoite",
    name: "Kinoite",
    desktop: "kde",
    kind: "desktop",
  },
  {
    match: (e) => e.subvariant === "Xfce",
    id: "xfce",
    name: "Xfce",
    desktop: "xfce",
    kind: "desktop",
  },
  {
    match: (e) => e.subvariant === "Cinnamon",
    id: "cinnamon",
    name: "Cinnamon",
    desktop: "cinnamon",
    kind: "desktop",
  },
  {
    match: (e) => e.subvariant === "MATE_Compiz",
    id: "mate",
    name: "MATE-Compiz",
    desktop: "mate",
    kind: "desktop",
  },
  {
    match: (e) => e.subvariant === "LXQt",
    id: "lxqt",
    name: "LXQt",
    desktop: "lxqt",
    kind: "desktop",
  },
  {
    match: (e) => e.subvariant === "Budgie",
    id: "budgie",
    name: "Budgie",
    desktop: "budgie",
    kind: "desktop",
  },
  {
    match: (e) => e.subvariant === "COSMIC" && e.variant === "Spins",
    id: "cosmic",
    name: "COSMIC",
    desktop: "cosmic",
    kind: "desktop",
  },
  {
    match: (e) => e.subvariant === "Sway",
    id: "sway",
    name: "Sway",
    desktop: "sway",
    kind: "desktop",
  },
  { match: (e) => e.subvariant === "i3", id: "i3", name: "i3", desktop: "i3", kind: "desktop" },
];

const ARCHES: Record<string, Artifact["arch"]> = {
  x86_64: "x86_64",
  aarch64: "aarch64",
  ppc64le: "ppc64le",
  s390x: "s390x",
};

export default defineSource({
  slug: "fedora",
  hosts: ["download.fedoraproject.org", "fedoraproject.org"],
  async releases() {
    const [entries, eol] = await Promise.all([
      getJson<Entry[]>(RELEASES_JSON),
      endOfLife("fedora"),
    ]);
    const stable = [...new Set(entries.map((e) => e.version).filter((v) => /^\d+$/.test(v)))].sort(
      (a, b) => compareVersions(b, a),
    );
    const beta = [
      ...new Set(entries.map((e) => e.version).filter((v) => /^\d+ Beta$/.test(v))),
    ].sort((a, b) => compareVersions(b, a))[0];
    const cycles = new Map(eol.cycles.map((c) => [c.name, c]));
    // Supported releases (Fedora supports the two newest stable releases).
    const versions = stable.filter((v) => cycles.get(v)?.isMaintained !== false).slice(0, 2);
    if (beta && compareVersions(beta.replace(" Beta", ""), versions[0] ?? "0") > 0)
      versions.unshift(beta);

    const releases: Release[] = versions.map((version) => {
      const isBeta = version.endsWith(" Beta");
      const cycle = cycles.get(version.replace(" Beta", ""));
      const editions: Edition[] = [];
      for (const def of EDITIONS) {
        const artifacts: Artifact[] = entries
          .filter(
            (e) =>
              e.version === version && e.link.endsWith(".iso") && ARCHES[e.arch] && def.match(e),
          )
          .map((e) => ({
            arch: ARCHES[e.arch] as Artifact["arch"],
            format: "iso" as const,
            file: e.link.split("/").pop() ?? e.link,
            path: e.link.replace("https://download.fedoraproject.org/pub/", ""),
            url: e.link,
            size: e.size ? Number(e.size) : null,
            checksum: e.sha256
              ? { type: "sha256" as const, value: e.sha256.toLowerCase(), url: null }
              : null,
            signatureUrl: null,
            torrentUrl: null,
          }))
          .sort((a, b) => a.arch.localeCompare(b.arch) || a.file.localeCompare(b.file));
        if (artifacts.length)
          editions.push({
            id: def.id,
            name: def.name,
            desktop: def.desktop,
            kind: def.kind,
            artifacts,
          });
      }
      return {
        version: isBeta ? version.replace(" Beta", "-beta") : version,
        channel: isBeta ? ("beta" as const) : ("stable" as const),
        codename: null,
        releaseDate: isBeta ? null : (cycle?.releaseDate ?? null),
        eol: isBeta ? null : (cycle?.eol ?? null),
        notesUrl: isBeta
          ? null
          : `https://docs.fedoraproject.org/en-US/fedora/f${version}/release-notes/`,
        editions,
      };
    });
    return { sources: [RELEASES_JSON, eol.url], releases };
  },
});
