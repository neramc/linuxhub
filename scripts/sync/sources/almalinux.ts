/**
 * AlmaLinux OS.
 *
 * Official sources, and what each one is used for:
 * - almalinux.org/get-almalinux/ (the download page): one tab per supported
 *   major and architecture (x86_64, x86_64 v2, aarch64, s390x, ppc64le) with
 *   the installer ISOs (DVD, Boot, Minimal), the Generic Cloud and OpenNebula
 *   qcow2 images and the Live media (GNOME, KDE, and for 8/9 also GNOME Mini,
 *   XFCE, MATE), their official URLs on repo.almalinux.org (the project's
 *   origin, fronted by Fastly), the SHA-256 the page prints next to each ISO
 *   and cloud image, and the per-architecture torrent. It decides which
 *   releases, architectures and images are listed.
 * - wiki.almalinux.org/release-notes/: codename, release date and, per major,
 *   the end of security support ("security support until 31 May 2035"), the
 *   date this module uses as the end of life. endoflife.date is not needed.
 * - mirrors.almalinux.org: the official mirror table (country, status, HTTP /
 *   HTTPS / rsync root) the download page's "Download ISO from mirrors" links
 *   to. The per-ISO pages of the same host list the nearest mirrors for the
 *   requester's IP, so they are not used.
 *
 * Checksums (deviation from "file on the origin host"): repo.almalinux.org,
 * vault.almalinux.org and dl.almalinux.org disallow every bot in robots.txt, so
 * the CHECKSUM files next to the images are never fetched. The only
 * compliant official publication is the download page itself, which prints
 * the SHA-256 of every ISO and cloud image; `checksum.url` is that page. The
 * Live media have no digest on the page (only a link to the disallowed
 * CHECKSUM file), so their `checksum` is null. The CHECKSUM files are
 * clearsigned and no detached signature exists, so `signatureUrl` is null.
 * Sizes are not published anywhere readable; run.ts takes them from a HEAD on
 * a listed mirror (the official host may not be asked).
 *
 * The x86_64 v2 build (AlmaLinux 10, "older CPUs") is a variant of x86_64 that
 * the data model has no architecture for; its images are separate editions
 * named "... (x86_64 v2)" so that a visitor choosing x86_64 sees both.
 * Cloud images are the moving `-latest` aliases the page links; the version
 * of a release is the point release of its ISOs.
 *
 * Excluded: AlmaLinux OS Kitten (continuous development builds of the next
 * point release: moving `latest` files, no version or end of life; the project
 * says it is "not a product at all"); the 9.9 and 10.3 betas (the page only
 * links the announcements, the images are on vault.almalinux.org); the
 * Raspberry Pi images (the page links just a directory on the disallowed
 * host); container images, Vagrant boxes, Incus/LXC, WSL and the cloud
 * marketplace listings (AWS, Azure, OCI), none of which is an image format of
 * the catalog.
 */

import type { Artifact, Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getText } from "../http";
import { parseEnglishDay } from "../lib/dates";
import { countryCode, withSlash } from "../lib/mirrors";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const PAGE = "https://almalinux.org/get-almalinux/";
const NOTES = "https://wiki.almalinux.org/release-notes/";
const MIRRORS = "https://mirrors.almalinux.org/";
const ORIGIN = "https://repo.almalinux.org/almalinux/";

/** Sections of an architecture tab: the three read below plus the excluded ones (see the header). */
const SECTIONS = new Set([
  "ISO_Images",
  "Cloud_Images",
  "Live_Media",
  "Container_Images",
  "Raspberry_Pi",
  "Vagrant_Boxes",
  "Incus-LXC",
  "WSL",
]);

const ARCHES: Record<string, Artifact["arch"]> = {
  x86_64: "x86_64",
  x86_64_v2: "x86_64",
  aarch64: "aarch64",
  s390x: "s390x",
  ppc64le: "ppc64le",
};

interface EditionDef {
  id: string;
  name: string;
  desktop: Desktop | null;
  kind: Edition["kind"];
}

/** Installer ISOs, keyed by the type in the file name. Display order of all three tables: as listed. */
const ISOS: Record<string, EditionDef> = {
  dvd: { id: "dvd", name: "DVD", desktop: null, kind: "server" },
  minimal: { id: "minimal", name: "Minimal", desktop: null, kind: "minimal" },
  boot: { id: "boot", name: "Boot", desktop: null, kind: "netinst" },
};
const LIVE: Record<string, EditionDef> = {
  GNOME: { id: "live-gnome", name: "Live GNOME", desktop: "gnome", kind: "live" },
  "GNOME-Mini": { id: "live-gnome-mini", name: "Live GNOME Mini", desktop: "gnome", kind: "live" },
  KDE: { id: "live-kde", name: "Live KDE", desktop: "kde", kind: "live" },
  XFCE: { id: "live-xfce", name: "Live XFCE", desktop: "xfce", kind: "live" },
  MATE: { id: "live-mate", name: "Live MATE", desktop: "mate", kind: "live" },
};
const CLOUD: Record<string, EditionDef> = {
  GenericCloud: { id: "generic-cloud", name: "Generic Cloud", desktop: null, kind: "cloud" },
  OpenNebula: { id: "opennebula", name: "OpenNebula", desktop: null, kind: "cloud" },
};
const ORDER = [...Object.values(ISOS), ...Object.values(LIVE), ...Object.values(CLOUD)].map(
  (d) => d.id,
);

interface Image {
  /** Architecture as the page spells it ("x86_64_v2" is its own tab). */
  arch: string;
  def: EditionDef;
  /** Point release in the file name; null for the cloud aliases. */
  version: string | null;
  file: string;
  url: string;
  sha256: string | null;
  torrent: string | null;
}

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** A new Live flavour is still listed: its id and name follow the file name. */
function liveDef(token: string): EditionDef {
  return (
    LIVE[token] ?? {
      id: `live-${token.toLowerCase()}`,
      name: `Live ${token.replace(/-/g, " ")}`,
      desktop: null,
      kind: "live",
    }
  );
}

/** Images of one architecture tab: the ISO, Live media and cloud sections. */
function tabImages(major: string, arch: string, tab: string): Image[] {
  const images: Image[] = [];
  const e = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const section of tab.split('class="p-4 container-').slice(1)) {
    const name = section.slice(0, section.indexOf('"'));
    if (!SECTIONS.has(name)) throw new Error(`${PAGE}: unknown download section ${name}`);
    if (name !== "ISO_Images" && name !== "Live_Media" && name !== "Cloud_Images") continue;
    const links = [
      ...section.matchAll(
        /href=(https:\/\/repo\.almalinux\.org\/almalinux\/[^\s">]+\.(?:iso|qcow2))/g,
      ),
    ];
    const torrent = section.match(
      new RegExp(
        `href=(https://repo\\.almalinux\\.org/almalinux/[\\d.]+/isos/${e(arch)}/AlmaLinux-[\\d.]+-${e(arch)}\\.torrent)`,
      ),
    )?.[1];
    links.forEach((m, i) => {
      const url = m[1] as string;
      const file = url.split("/").pop() as string;
      const next = links[i + 1]?.index ?? section.length;
      const sha256 =
        text(section.slice((m.index ?? 0) + m[0].length, next)).match(
          /SHA-256:\s*([0-9a-f]{64})\b/i,
        )?.[1] ?? null;
      let def: EditionDef | undefined;
      let version: string | null = null;
      if (name === "ISO_Images") {
        const iso = url.match(
          new RegExp(
            `/almalinux/${major}/isos/${e(arch)}/AlmaLinux-(\\d+\\.\\d+)-${e(arch)}-([a-z]+)\\.iso$`,
          ),
        );
        def = ISOS[iso?.[2] ?? ""];
        version = iso?.[1] ?? null;
      } else if (name === "Live_Media") {
        const live = url.match(
          new RegExp(
            `/almalinux/${major}/live/${e(arch)}/AlmaLinux-(\\d+\\.\\d+)-${e(arch)}-Live-([A-Za-z-]+)\\.iso$`,
          ),
        );
        if (live?.[2]) def = liveDef(live[2]);
        version = live?.[1] ?? null;
      } else {
        const cloud = url.match(
          new RegExp(
            `/almalinux/${major}/cloud/${e(arch)}/images/AlmaLinux-${major}-([A-Za-z]+)-latest\\.${e(arch)}\\.qcow2$`,
          ),
        );
        def = CLOUD[cloud?.[1] ?? ""];
      }
      if (!def)
        throw new Error(`${PAGE}: unexpected image link ${url} (AlmaLinux ${major} ${arch})`);
      if (name !== "Live_Media" && !sha256)
        throw new Error(`${PAGE}: no SHA-256 printed for ${file} (AlmaLinux ${major} ${arch})`);
      images.push({
        arch,
        def,
        version,
        file,
        url,
        sha256,
        torrent: name === "ISO_Images" ? (torrent ?? null) : null,
      });
    });
  }
  return images;
}

/** The images of every non-Kitten tab, per major. */
function pageImages(html: string): Map<string, Image[]> {
  const byMajor = new Map<string, Image[]>();
  for (const tab of html.split('<div class="tab-pane').slice(1)) {
    const id = tab.match(/^[^>]*\bid=([a-z0-9_-]+)/)?.[1];
    const m = id?.match(/^([a-z0-9_]+)-(\d+)(-[a-z]+)?$/);
    if (!m?.[1] || !m[2]) continue;
    if (m[3]) continue; // "-kitten": continuous development builds
    if (!ARCHES[m[1]]) throw new Error(`${PAGE}: unknown architecture tab ${id}`);
    const list = byMajor.get(m[2]) ?? [];
    list.push(...tabImages(m[2], m[1], tab));
    byMajor.set(m[2], list);
  }
  return byMajor;
}

interface Note {
  codename: string | null;
  releaseDate: string | null;
}

/** Per major from the wiki's release notes: end of security support and the release table. */
function releaseNotes(html: string) {
  const out = new Map<string, { eol: string | null; releases: Map<string, Note> }>();
  for (const part of html.split('<h3 id="almalinux-os-').slice(1)) {
    const major = part.match(/^(\d+)"/)?.[1];
    if (!major) continue; // "kitten-10"
    const eolText = part.match(/security support until ([^.<]+)/)?.[1];
    const releases = new Map<string, Note>();
    for (const row of part.split("<tr>").slice(1)) {
      const cells = [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((c) => text(c[1] ?? ""));
      const version = cells[0]?.match(/^\d+\.\d+$/)?.[0];
      if (version)
        releases.set(version, {
          codename: cells[1] || null,
          releaseDate: parseEnglishDay(cells[3] ?? ""),
        });
    }
    out.set(major, { eol: eolText ? parseEnglishDay(eolText) : null, releases });
  }
  return out;
}

/** The official mirrors with an HTTPS root whose status is ok. */
function parseMirrorTable(html: string): Mirror[] {
  const head = [
    ...(html.match(/<thead>[\s\S]*?<\/thead>/)?.[0] ?? "").matchAll(/<th[^>]*>([^<]*)<\/th>/g),
  ]
    .map((m) => (m[1] ?? "").trim())
    .join(",");
  if (head !== "Name,Sponsor,Status,Continent,Region,HTTP,HTTPS,RSYNC,IPv6")
    throw new Error(`${MIRRORS}: mirror table columns changed (${head || "no table"})`);
  const mirrors = new Map<string, Mirror>();
  const body = html.split("<tbody>")[1] ?? "";
  for (const row of body.split("<tr>").slice(1)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1] ?? "");
    if (cells.length !== 9) throw new Error(`${MIRRORS}: mirror row with ${cells.length} cells`);
    if (text(cells[2] ?? "") !== "ok") continue;
    const https = (cells[6] ?? "").match(/href="(https:\/\/[^"]+)"/)?.[1];
    if (!https) continue;
    const url = withSlash(https);
    mirrors.set(url, {
      url,
      country: countryCode(text(cells[4] ?? "")),
      name: text(cells[0] ?? "") || new URL(url).hostname,
      lat: null,
      lon: null,
      score: null,
    });
  }
  return [...mirrors.values()];
}

export default defineSource({
  slug: "almalinux",
  hosts: ["almalinux.org", "repo.almalinux.org"],
  async releases(ctx) {
    const [html, wiki] = await Promise.all([
      getText(PAGE, { accept: "text/html" }),
      getText(NOTES, { accept: "text/html" }),
    ]);
    const majors = pageImages(html);
    if (!majors.size) throw new Error(`no AlmaLinux release tabs on ${PAGE}`);
    const notes = releaseNotes(wiki);

    const releases: Release[] = [];
    for (const major of [...majors.keys()].sort((a, b) => compareVersions(b, a))) {
      const images = majors.get(major) ?? [];
      const versions = new Set(images.flatMap((i) => i.version ?? []));
      const version = [...versions][0];
      if (versions.size !== 1 || !version)
        throw new Error(
          `${PAGE}: AlmaLinux ${major} images of ${versions.size} point releases (${[...versions].join(", ")})`,
        );
      const line = notes.get(major);
      if (!line?.eol)
        throw new Error(`${NOTES}: no end of security support for AlmaLinux ${major}`);
      if (line.eol < ctx.today) continue;
      const note = line.releases.get(version);
      if (!note) ctx.log(`AlmaLinux ${version} is not in the release-notes table yet`);

      const editions: Edition[] = [];
      for (const variant of ["x86_64", "x86_64_v2"]) {
        // Known editions in display order, then any new Live flavour the page adds.
        const ids = [...new Set(images.map((i) => i.def.id))].sort(
          (a, b) =>
            (ORDER.indexOf(a) < 0 ? ORDER.length : ORDER.indexOf(a)) -
              (ORDER.indexOf(b) < 0 ? ORDER.length : ORDER.indexOf(b)) || a.localeCompare(b),
        );
        for (const id of ids) {
          const own = images.filter(
            (i) => i.def.id === id && (variant === "x86_64_v2") === (i.arch === "x86_64_v2"),
          );
          const def = own[0]?.def;
          if (!def) continue;
          // The v2 build is an x86_64 variant: its own editions (see the header).
          const isV2 = variant === "x86_64_v2";
          editions.push({
            id: isV2 ? `${def.id}-x86-64-v2` : def.id,
            name: isV2 ? `${def.name} (x86_64 v2)` : def.name,
            desktop: def.desktop,
            kind: def.kind,
            artifacts: own.map((i): Artifact => {
              if (!i.url.startsWith(ORIGIN)) throw new Error(`unexpected image URL ${i.url}`);
              return {
                arch: ARCHES[i.arch] as Artifact["arch"],
                format: i.url.endsWith(".qcow2") ? "qcow2" : "iso",
                file: i.file,
                path: i.url.slice(ORIGIN.length),
                url: i.url,
                size: null,
                checksum: i.sha256 ? { type: "sha256", value: i.sha256, url: PAGE } : null,
                signatureUrl: null,
                torrentUrl: i.torrent,
              };
            }),
          });
        }
      }
      for (const known of ["dvd", "minimal", "boot", "generic-cloud"])
        if (!editions.some((e) => e.id === known))
          throw new Error(`${PAGE}: AlmaLinux ${major} has no ${known} image`);

      releases.push({
        version,
        channel: "stable",
        codename: note?.codename ?? null,
        releaseDate: note?.releaseDate ?? null,
        eol: line.eol,
        notesUrl: note ? `${NOTES}${version}.html` : null,
        editions,
      });
    }
    if (!releases.length) throw new Error("no supported AlmaLinux release on the download page");
    return { sources: [PAGE, NOTES], releases };
  },

  async mirrors() {
    const mirrors = parseMirrorTable(await getText(MIRRORS, { accept: "text/html" }));
    if (!mirrors.length) throw new Error(`no HTTPS mirror with status ok on ${MIRRORS}`);
    return { sources: [MIRRORS], mirrors };
  },
});
