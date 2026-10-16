/**
 * ParrotOS: every Parrot download host (deb.parrot.sh, the director that hands
 * each visitor to a nearby official mirror, and download.parrot.sh) closes
 * itself to bots in robots.txt, so nothing is fetched from them. The official
 * download page on parrotsec.org (robots allows it) carries the current image
 * links, torrents and the signed hash list in its page script; the release
 * date and notes link come from the "parrot-<version>-release-notes" post in
 * the official sitemap. The per-image SHA-256 values live only in
 * signed-hashes.txt on the bot-closed host, so artifacts carry no checksum and
 * the signed hash list is linked as the signature instead.
 */

import type { Artifact, Edition, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getText } from "../http";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const SITE = "https://parrotsec.org";
const DOWNLOAD = `${SITE}/download/`;
const SITEMAP = `${SITE}/sitemap.xml`;
const ISO_DIR = "https://deb.parrot.sh/parrot/iso/";

/** Image name (without "Parrot-" and "-<version>_<suffix>") → edition. Display order. */
const EDITIONS: {
  image: string;
  /** File suffix after the version: "amd64.iso", "rpi.img.xz", "riscv64.tar.xz". */
  suffix: string;
  id: string;
  name: string;
  desktop: Desktop | null;
  kind: Edition["kind"];
}[] = [
  {
    image: "security",
    suffix: "amd64.iso",
    id: "security",
    name: "Security",
    desktop: "kde",
    kind: "desktop",
  },
  { image: "home", suffix: "amd64.iso", id: "home", name: "Home", desktop: "kde", kind: "desktop" },
  {
    image: "spin-htb",
    suffix: "amd64.iso",
    id: "htb",
    name: "Hack The Box",
    desktop: "kde",
    kind: "desktop",
  },
  {
    image: "security-tuned",
    suffix: "amd64.iso",
    id: "security-tuned",
    name: "Security (tuned)",
    desktop: "kde",
    kind: "desktop",
  },
  {
    image: "home-tuned",
    suffix: "amd64.iso",
    id: "home-tuned",
    name: "Home (tuned)",
    desktop: "kde",
    kind: "desktop",
  },
  {
    image: "spin-mate",
    suffix: "amd64.iso",
    id: "mate",
    name: "MATE spin",
    desktop: "mate",
    kind: "desktop",
  },
  {
    image: "spin-lxqt",
    suffix: "amd64.iso",
    id: "lxqt",
    name: "LXQt spin",
    desktop: "lxqt",
    kind: "desktop",
  },
  {
    image: "spin-enlightenment",
    suffix: "amd64.iso",
    id: "enlightenment",
    name: "Enlightenment spin",
    desktop: null,
    kind: "desktop",
  },
  {
    image: "security",
    suffix: "rpi.img.xz",
    id: "security-rpi",
    name: "Security (Raspberry Pi)",
    desktop: "kde",
    kind: "desktop",
  },
  {
    image: "home",
    suffix: "rpi.img.xz",
    id: "home-rpi",
    name: "Home (Raspberry Pi)",
    desktop: "kde",
    kind: "desktop",
  },
  {
    image: "core",
    suffix: "rpi.img.xz",
    id: "core-rpi",
    name: "Core (Raspberry Pi)",
    desktop: "none",
    kind: "minimal",
  },
  {
    image: "core",
    suffix: "riscv64.tar.xz",
    id: "core",
    name: "Core (RISC-V tarball)",
    desktop: "none",
    kind: "minimal",
  },
];

const SUFFIX: Record<string, { arch: Artifact["arch"]; format: Artifact["format"] }> = {
  "amd64.iso": { arch: "x86_64", format: "iso" },
  "rpi.img.xz": { arch: "aarch64", format: "img.xz" },
  "riscv64.tar.xz": { arch: "riscv64", format: "tar.xz" },
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The download page's own script chunk, which lists every image link. */
async function downloadLinks(): Promise<Set<string>> {
  const html = await getText(DOWNLOAD, { accept: "text/html" });
  const links = new Set<string>(html.match(/https:\/\/deb\.parrot\.sh\/parrot\/iso\/[^"\\\s<>]+/g));
  const chunk = html.match(/\/_next\/static\/chunks\/pages\/download-[\w-]+\.js/)?.[0];
  if (chunk) {
    const js = await getText(`${SITE}${chunk}`, { accept: "application/javascript" });
    for (const url of js.match(/https:\/\/deb\.parrot\.sh\/parrot\/iso\/[^"`'\\\s]+/g) ?? [])
      links.add(url);
  }
  return links;
}

/** Release date and notes from the "parrot-<version>-release-notes" post slug in the sitemap. */
async function releaseNotes(version: string): Promise<{ date: string | null; url: string | null }> {
  try {
    const xml = await getText(SITEMAP, { accept: "application/xml" });
    const re = new RegExp(
      `<loc>(https://parrotsec\\.org/blog/(\\d{4}-\\d{2}-\\d{2})-parrot-${escapeRe(version)}-release-notes/?)</loc>`,
    );
    const m = xml.match(re);
    if (m?.[1] && m[2]) return { date: m[2], url: m[1] };
  } catch {
    /* the date is optional */
  }
  return { date: null, url: null };
}

export default defineSource({
  slug: "parrot-os",
  hosts: ["deb.parrot.sh"],
  async releases() {
    const links = await downloadLinks();
    const version = [...links]
      .map((u) => u.match(/\/Parrot-security-(\d+(?:\.\d+)*)_amd64\.iso$/)?.[1])
      .filter((v): v is string => Boolean(v))
      .sort((a, b) => compareVersions(b, a))[0];
    if (!version) throw new Error("no Security ISO link on the official download page");
    const dir = `${ISO_DIR}${version}/`;
    const hashes = `${dir}signed-hashes.txt`;

    const editions: Edition[] = [];
    for (const def of EDITIONS) {
      const file = `Parrot-${def.image}-${version}_${def.suffix}`;
      const url = `${dir}${file}`;
      const target = SUFFIX[def.suffix];
      if (!target || !links.has(url)) continue;
      editions.push({
        id: def.id,
        name: def.name,
        desktop: def.desktop,
        kind: def.kind,
        artifacts: [
          {
            arch: target.arch,
            format: target.format,
            file,
            path: null,
            url,
            size: null,
            checksum: null,
            signatureUrl: links.has(hashes) ? hashes : null,
            torrentUrl: links.has(`${url}.torrent`) ? `${url}.torrent` : null,
          },
        ],
      });
    }
    if (!editions.length) throw new Error(`no images for Parrot ${version} on the download page`);

    const notes = await releaseNotes(version);
    const releases: Release[] = [
      {
        version,
        channel: "stable",
        codename: null,
        releaseDate: notes.date,
        eol: null,
        notesUrl: notes.url,
        editions,
      },
    ];
    return { sources: [DOWNLOAD, SITEMAP], releases };
  },
});
