/**
 * Rocky Linux.
 *
 * Official sources, and what each one is used for:
 * - rockylinux.org/download (the download page): a Next.js page that embeds
 *   its download table as JSON in the page payload. For every architecture
 *   (x86_64, aarch64, ppc64le, s390x, riscv64) and supported major it gives
 *   the current point release, the planned end of life, the official URL of
 *   every installer ISO (DVD, Boot, Minimal), the Generic Cloud qcow2, the
 *   Live images (Workstation = GNOME, Workstation Lite, KDE, XFCE, MATE,
 *   Cinnamon), the Raspberry Pi and VisionFive 2 board images, and the link
 *   of the CHECKSUM file for each group. It decides which releases,
 *   architectures and images are listed.
 * - download.rockylinux.org / dl.rockylinux.org (the project's origin, behind
 *   its CDN): the CHECKSUM file the page links for each group (SHA-256), and
 *   the directory listing next to it, which gives the exact size of each file
 *   ("File Size"; the "# <file>: N bytes" comments in the CHECKSUM files are
 *   not used because the one for Rocky 9 `minimal` repeats the size of
 *   `boot`), the per-ISO torrents and the CHECKSUM signature (`.asc`, `.sig`
 *   in the old Rocky 8 live tree). The signature is that of the CHECKSUM
 *   file, so `signatureUrl` points at it.
 * - docs.rockylinux.org/releases/: codename and the release date of each
 *   point release, and the link of its release notes.
 * - mirrors.rockylinux.org/mirrormanager/mirrors: Rocky's own MirrorManager
 *   list (country, and the mirror's HTTPS root of its "Rocky Linux" tree, the
 *   one that holds 10/isos/, 10/images/, 10/live/). It is not Fedora's
 *   template, so lib/mirrormanager.ts cannot read it. endoflife.date is not
 *   needed.
 *
 * ISOs are the versioned files the page links. The cloud, Live and board
 * images are the moving `latest` aliases the page links (Rocky publishes
 * the dated builds next to them), so such a file's digest changes with each
 * build and a mirror that has not synced yet can serve the previous one; the
 * release version is the point release the page names. The Live tree of
 * Rocky 8 is `Live/` on the page and `live/` in the mirror path.
 *
 * Excluded: container images, WSL images (.wsl is no format of the catalog),
 * the Azure/EC2/OpenStack/Vagrant/OCP cloud variants that are in the
 * directories but not on the download page, and the dated duplicates of the
 * aliases. The VisionFive 2 image is the one the page links in the 10.0
 * vault tree (path null: it is not in the mirror tree).
 */

import type { Artifact, Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getText } from "../http";
import { parseChecksums } from "../lib/checksums";
import { parseEnglishDay } from "../lib/dates";
import { countryCode, withSlash } from "../lib/mirrors";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const PAGE = "https://rockylinux.org/download";
const DOCS = "https://docs.rockylinux.org/releases/";
const MIRROR_LIST = "https://mirrors.rockylinux.org/mirrormanager/mirrors";
const HOSTS = ["download.rockylinux.org", "dl.rockylinux.org"];
/** The mirror-relative part of an origin URL starts after this. */
const TREE = /^https:\/\/(?:download|dl)\.rockylinux\.org\/pub\/rocky\//;

const ARCHES = ["x86_64", "aarch64", "ppc64le", "s390x", "riscv64"] as const;
/** Image groups of the page: the ones read below plus the excluded container and WSL images. */
const GROUPS = new Set([
  "defaultImages",
  "cloudImages",
  "liveImages",
  "rpiImages",
  "visionFive2Images",
  "containerImages",
  "wslImages",
]);

interface EditionDef {
  id: string;
  name: string;
  desktop: Desktop | null;
  kind: Edition["kind"];
}

/** Download-page group → label → edition. Order here is the display order. */
const ISOS: Record<string, EditionDef> = {
  "DVD ISO": { id: "dvd", name: "DVD", desktop: null, kind: "server" },
  "Minimal ISO": { id: "minimal", name: "Minimal", desktop: null, kind: "minimal" },
  "Boot ISO": { id: "boot", name: "Boot", desktop: null, kind: "netinst" },
};
const LIVE: Record<string, EditionDef> = {
  GNOME: {
    id: "workstation",
    name: "Live Workstation (GNOME)",
    desktop: "gnome",
    kind: "live",
  },
  GNOMELITE: {
    id: "workstation-lite",
    name: "Live Workstation Lite (GNOME)",
    desktop: "gnome",
    kind: "live",
  },
  KDE: { id: "kde", name: "Live KDE", desktop: "kde", kind: "live" },
  XFCE: { id: "xfce", name: "Live XFCE", desktop: "xfce", kind: "live" },
  MATE: { id: "mate", name: "Live MATE", desktop: "mate", kind: "live" },
  CINNAMON: { id: "cinnamon", name: "Live Cinnamon", desktop: "cinnamon", kind: "live" },
};
const CLOUD: EditionDef = {
  id: "generic-cloud",
  name: "Generic Cloud",
  desktop: null,
  kind: "cloud",
};
const RPI: EditionDef = {
  id: "raspberry-pi",
  name: "Raspberry Pi",
  desktop: null,
  kind: "other",
};
const VISIONFIVE: EditionDef = {
  id: "visionfive-2",
  name: "VisionFive 2",
  desktop: null,
  kind: "other",
};

interface Group {
  downloadOptions?: { label: string; link: string }[];
  links?: { name: string; link: string }[];
}

interface PageVersion {
  versionName: string;
  versionId: string;
  currentVersion: string;
  plannedEol: string;
  defaultImages?: Group;
  cloudImages?: Group;
  liveImages?: Group;
  rpiImages?: Group;
  visionFive2Images?: Group;
}

type PageData = Record<string, { versions: PageVersion[] }>;

/** The download table embedded in the page payload (`self.__next_f.push` strings). */
function pageData(html: string): PageData {
  let flight = "";
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g))
    flight += JSON.parse(m[1] as string);
  const key = flight.indexOf('"architectures":{');
  if (key < 0) throw new Error(`${PAGE}: download table not found in the page payload`);
  const start = flight.indexOf("{", key);
  let depth = 0;
  let inString = false;
  for (let i = start; i < flight.length; i++) {
    const c = flight[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      const data = JSON.parse(flight.slice(start, i + 1)) as PageData;
      for (const [arch, { versions }] of Object.entries(data)) {
        if (!(ARCHES as readonly string[]).includes(arch))
          throw new Error(`${PAGE}: unknown architecture ${arch}`);
        if (!Array.isArray(versions)) throw new Error(`${PAGE}: no versions for ${arch}`);
        // A new kind of image must be added here on purpose, not skipped unseen.
        for (const v of versions)
          for (const key of Object.keys(v))
            if (/Images$/.test(key) && !GROUPS.has(key))
              throw new Error(`${PAGE}: unknown image group ${key} (${arch})`);
      }
      return data;
    }
  }
  throw new Error(`${PAGE}: download table is cut off`);
}

/** What the release-notes page says: codename per major, GA date per point release, notes links. */
function releaseDocs(html: string) {
  const codenames = new Map<string, string>();
  const dates = new Map<string, string>();
  const notes = new Set<string>();
  for (const row of html.split("<tr").slice(1)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) =>
      (c[1] ?? "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    );
    const major = cells[0]?.match(/^Rocky Linux (\d+)$/)?.[1];
    if (major && cells[1]) codenames.set(major, cells[1]);
    const point = cells[0]?.match(/^\d+\.\d+$/)?.[0];
    if (point && /^\d{4}-\d{2}-\d{2}$/.test(cells[1] ?? "")) dates.set(point, cells[1] as string);
  }
  for (const m of html.matchAll(/href="(release_notes\/\d+_\d+\/)"/g)) if (m[1]) notes.add(m[1]);
  return { codenames, dates, notes };
}

/**
 * The entries of an origin directory listing with their exact byte size
 * (the "File Size" column). The "# <file>: N bytes" comments in the CHECKSUM
 * files are not used: the one for Rocky 9 `minimal` repeats the size of `boot`.
 */
async function listing(dir: string): Promise<Map<string, number>> {
  const html = await getText(dir, { accept: "text/html" });
  const entries = new Map<string, number>();
  for (const m of html.matchAll(
    /<a href="([^"?#/][^"?#]*)" title="[^"]*">[^<]*<\/a><\/td><td class="size">\s*(\d+|-)\s*<\/td>/g,
  ))
    if (m[1] && m[2] !== "-") entries.set(decodeURIComponent(m[1]), Number(m[2]));
  if (!entries.has("CHECKSUM") && ![...entries.keys()].some((n) => n.endsWith(".CHECKSUM")))
    throw new Error(`${dir}: directory listing changed (no CHECKSUM file found)`);
  return entries;
}

/** The mirrors' "Rocky Linux" tree roots (HTTPS) from Rocky's MirrorManager list. */
function parseMirrorList(html: string): Mirror[] {
  const total = Number(html.match(/We have currently (\d+) active mirror/)?.[1]);
  const body = html.split("<tbody")[1] ?? "";
  const rows = body.split("<tr>").slice(1);
  if (!Number.isFinite(total) || rows.length !== total)
    throw new Error(
      `${MIRROR_LIST}: ${rows.length} rows for ${Number.isFinite(total) ? total : "?"} mirrors`,
    );
  const mirrors = new Map<string, Mirror>();
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1] ?? "");
    if (cells.length !== 7)
      throw new Error(`${MIRROR_LIST}: mirror row with ${cells.length} cells`);
    const text = (s: string | undefined) =>
      (s ?? "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    // "Rocky Linux SIGs:", "Rocky Linux Vault:" and "Rocky Linux:" are separate categories.
    const category = (cells[3] ?? "")
      .replace(/\s+/g, " ")
      .match(/(?:^|,)\s*Rocky Linux:([\s\S]*?)<br/);
    const https = category?.[1]?.match(/href="(https:\/\/[^"]+)"/)?.[1];
    if (!https) continue;
    const url = withSlash(https);
    mirrors.set(url, {
      url,
      country: countryCode(text(cells[0])),
      name: text(cells[2]) || new URL(url).hostname,
      lat: null,
      lon: null,
      score: null,
    });
  }
  return [...mirrors.values()];
}

function formatOf(url: string): Artifact["format"] {
  if (url.endsWith(".iso")) return "iso";
  if (url.endsWith(".qcow2")) return "qcow2";
  if (url.endsWith(".raw.xz")) return "raw.xz";
  if (url.endsWith(".tar.xz")) return "tar.xz";
  throw new Error(`${PAGE}: unexpected image format ${url}`);
}

const dirOf = (url: string) => url.slice(0, url.lastIndexOf("/") + 1);

export default defineSource({
  slug: "rocky-linux",
  hosts: HOSTS,
  async releases(ctx) {
    const [html, docsHtml] = await Promise.all([
      getText(PAGE, { accept: "text/html" }),
      getText(DOCS, { accept: "text/html" }),
    ]);
    const data = pageData(html);
    const docs = releaseDocs(docsHtml);

    const checksums = new Map<string, Promise<Map<string, string>>>();
    const sumsOf = (url: string) => {
      const known = checksums.get(url);
      if (known) return known;
      const pending = getText(url).then(parseChecksums);
      checksums.set(url, pending);
      return pending;
    };
    const listings = new Map<string, Promise<Map<string, number>>>();
    const entriesOf = (dir: string) => {
      const known = listings.get(dir);
      if (known) return known;
      const pending = listing(dir);
      listings.set(dir, pending);
      return pending;
    };

    /** One page link as an artifact: digest, size, signature and torrent from the origin. */
    async function artifact(
      arch: Artifact["arch"],
      url: string,
      sumUrl: string,
      where: string,
    ): Promise<Artifact> {
      const file = url.split("/").pop() as string;
      const sha256 = (await sumsOf(sumUrl)).get(file);
      if (!sha256 || !/^[0-9a-f]{64}$/.test(sha256))
        throw new Error(`${sumUrl}: no SHA-256 for ${file} (${where})`);
      const entries = await entriesOf(dirOf(url));
      if (!entries.has(file))
        throw new Error(`${dirOf(url)}: ${file} is not in the directory (${where})`);
      const sumName = sumUrl.split("/").pop() as string;
      const signature = [`${sumName}.asc`, `${sumName}.sig`].find((n) => entries.has(n));
      const torrent = file.replace(/\.iso$/, ".torrent");
      const path = TREE.test(url)
        ? url.replace(TREE, "").replace(/^(\d+)\/Live\//, "$1/live/")
        : null;
      return {
        arch,
        format: formatOf(url),
        file,
        path,
        url,
        size: entries.get(file) ?? null,
        checksum: { type: "sha256", value: sha256, url: sumUrl },
        signatureUrl: signature ? `${dirOf(sumUrl)}${signature}` : null,
        torrentUrl:
          file.endsWith(".iso") && entries.has(torrent) ? `${dirOf(url)}${torrent}` : null,
      };
    }

    // versionId ("rocky-10") → arch → that architecture's entry on the page
    const lines = new Map<string, Map<string, PageVersion>>();
    for (const [arch, { versions }] of Object.entries(data))
      for (const v of versions) {
        const perArch = lines.get(v.versionId) ?? new Map<string, PageVersion>();
        perArch.set(arch, v);
        lines.set(v.versionId, perArch);
      }
    if (!lines.size) throw new Error(`no Rocky Linux release on ${PAGE}`);

    const releases: Release[] = [];
    for (const [versionId, perArch] of [...lines].sort((a, b) => compareVersions(b[0], a[0]))) {
      const major = versionId.match(/^rocky-(\d+)$/)?.[1];
      const entries = [...perArch.entries()];
      const first = entries[0]?.[1];
      if (!major || !first) throw new Error(`${PAGE}: unexpected release id ${versionId}`);
      const version = first.currentVersion.replace(/^v/, "");
      const eol = parseEnglishDay(first.plannedEol);
      if (!/^\d+\.\d+$/.test(version) || version.split(".")[0] !== major || !eol)
        throw new Error(`${PAGE}: unexpected version/end of life for ${versionId}`);
      for (const [arch, v] of entries)
        if (v.currentVersion !== first.currentVersion || v.plannedEol !== first.plannedEol)
          throw new Error(`${PAGE}: ${arch} disagrees on ${versionId}`);
      if (eol < ctx.today) continue;

      const byEdition = new Map<string, { def: EditionDef; artifacts: Artifact[] }>();
      const add = (def: EditionDef, a: Artifact) => {
        const entry = byEdition.get(def.id) ?? { def, artifacts: [] };
        entry.artifacts.push(a);
        byEdition.set(def.id, entry);
      };
      /** The group's CHECKSUM link (a directory link means the CHECKSUM file inside it). */
      const sumLink = (group: Group, where: string) => {
        const link = group.links?.find((l) => /^CHECKSUMS?$/.test(l.name))?.link;
        if (!link) throw new Error(`${PAGE}: no CHECKSUM link for ${where}`);
        return link.endsWith("/") ? `${link}CHECKSUM` : link;
      };

      for (const [archName, v] of entries) {
        const arch = archName as Artifact["arch"];
        const where = `Rocky Linux ${version} ${archName}`;
        const groups: [Group | undefined, (label: string) => EditionDef | undefined, boolean][] = [
          [v.defaultImages, (l) => ISOS[l], true],
          [v.cloudImages, (l) => (l === "QCOW2 Image" ? CLOUD : undefined), false],
          [
            v.liveImages,
            (l) => {
              const token = l.match(/^Live Image \(([A-Z0-9]+)\)$/)?.[1];
              return token
                ? (LIVE[token] ?? {
                    id: token.toLowerCase(),
                    name: `Live ${token}`,
                    desktop: null,
                    kind: "live",
                  })
                : undefined;
            },
            false,
          ],
          [v.rpiImages, (l) => (l === "Download" ? RPI : undefined), false],
          [v.visionFive2Images, (l) => (l === "Download" ? VISIONFIVE : undefined), false],
        ];
        for (const [group, edition, versioned] of groups) {
          if (!group?.downloadOptions?.length) continue;
          const sumUrl = sumLink(group, where);
          for (const option of group.downloadOptions) {
            const def = edition(option.label);
            if (!def) throw new Error(`${PAGE}: unexpected image "${option.label}" (${where})`);
            if (!new URL(option.link).hostname.endsWith(".rockylinux.org"))
              throw new Error(`${PAGE}: image link off the project's hosts: ${option.link}`);
            // The installer ISOs carry the point release in their name; the aliases do not.
            if (versioned && !option.link.includes(`/Rocky-${version}-${archName}-`))
              throw new Error(`${PAGE}: ${option.link} is not ${version} (${where})`);
            add(def, await artifact(arch, option.link, sumUrl, where));
          }
        }
      }
      const order = [...Object.values(ISOS), ...Object.values(LIVE), CLOUD, RPI, VISIONFIVE].map(
        (d) => d.id,
      );
      const editions: Edition[] = [...byEdition.values()]
        .sort((a, b) => {
          const i = order.indexOf(a.def.id);
          const j = order.indexOf(b.def.id);
          return (i < 0 ? order.length : i) - (j < 0 ? order.length : j);
        })
        .map(({ def, artifacts }) => ({
          id: def.id,
          name: def.name,
          desktop: def.desktop,
          kind: def.kind,
          artifacts,
        }));
      for (const known of ["dvd", "boot"])
        if (!editions.some((e) => e.id === known))
          throw new Error(`${PAGE}: Rocky Linux ${version} has no ${known} image`);

      const notes = `release_notes/${version.replace(".", "_")}/`;
      releases.push({
        version,
        channel: "stable",
        codename: docs.codenames.get(major) ?? null,
        releaseDate: docs.dates.get(version) ?? null,
        eol,
        notesUrl: docs.notes.has(notes) ? `${DOCS}${notes}` : null,
        editions,
      });
    }
    if (!releases.length) throw new Error("no supported Rocky Linux release on the download page");
    return { sources: [PAGE, DOCS], releases };
  },

  async mirrors() {
    const mirrors = parseMirrorList(await getText(MIRROR_LIST, { accept: "text/html" }));
    if (!mirrors.length) throw new Error(`no HTTPS "Rocky Linux" mirror in ${MIRROR_LIST}`);
    return { sources: [MIRROR_LIST], mirrors };
  },
});
