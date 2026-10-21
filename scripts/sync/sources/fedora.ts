/**
 * Fedora Linux.
 *
 * Official sources and what they are used for:
 * - fedoraproject.org/releases.json: the feed the download pages (and Fedora
 *   Media Writer) are built from: every image's link, variant, architecture,
 *   SHA-256 and exact size. Fedora's download pages were compared against it
 *   on 2026-10-20 (Workstation, KDE, Server, Atomic Desktops, every Spin and
 *   Lab, IoT, Cloud, Miscellaneous, and the Beta pages): they offer exactly
 *   what this module keeps, apart from the exclusions below.
 * - bodhi.fedoraproject.org/releases/: Fedora's updates system, the official
 *   `released_on` and `eol` of each release. endoflife.date only fills a date
 *   Bodhi leaves empty (Fedora 43 has no `released_on` there).
 * - mirrormanager.fedoraproject.org/mirrors/Fedora/<N>/x86_64: Fedora's
 *   public MirrorManager list (country, host, the mirror's HTTPS root for
 *   "Fedora Linux", i.e. its copy of pub/fedora/linux). admin.fedoraproject.org
 *   /mirrormanager is robots-disallowed and redirects here.
 * - torrent.fedoraproject.org/torrents.json: Fedora's BitTorrent tracker index
 *   (the pages under fedoraproject.org/torrents/ are built from it, and the
 *   download pages link to them): one group per release (43, 44, 45_Beta)
 *   with its .torrent files and the day the release was published. It supplies
 *   torrentUrl, and the release date when Bodhi has none (Fedora 43, 45 Beta).
 *
 * Downloads use download.fedoraproject.org, Fedora's MirrorManager redirector
 * (the links on the download pages). Mirror paths are set only for images
 * under pub/fedora/linux/releases/<N>/: secondary architectures
 * (fedora-secondary), pub/alt (Labs for x86_64, IoT) and pre-releases
 * (releases/test, which not every mirror carries) go through the redirector
 * only (path null), so mirror root + path is always a real file.
 *
 * Checksums: the digest comes from releases.json. The OpenPGP-signed CHECKSUM
 * file linked from each download page lives on dl.fedoraproject.org, whose
 * robots.txt disallows all bots, so it is not fetched; checksum.url is its
 * address, built from the file-name pattern the pages use (verified against
 * the pages for 44 and 45 Beta). CHECKSUM files are clear-signed, so there is
 * no separate signature (signatureUrl is null). A torrent is linked for every
 * image the tracker index lists (ISOs of the desktop editions, spins and the
 * Server DVD; the tracker has none for netinstall, raw.xz or qcow2 images):
 * its name ("Fedora-Workstation-Live-x86_64-44.torrent") is matched to the
 * image by the file name without architecture and compose number. Torrents
 * are an optional extra: a name that cannot be read or is ambiguous, and a
 * torrent without a listed image, are logged and left out; the tracker being
 * unreachable or no longer a list of releases fails the sync like any other
 * source.
 *
 * Releases: every supported stable line (Bodhi/endoflife EOL not past), plus
 * the numbered Beta while the download pages offer it (release 45 Beta;
 * Rawhide and "Testing Images" are development builds and left out). Release
 * dates: Bodhi's `released_on`, else the day the tracker published the
 * release (equal to Bodhi's for 44 and to endoflife.date's for 43), else
 * endoflife.date; the Beta has no other official date.
 *
 * Kept: ISO, raw.xz and qcow2 images of Workstation, KDE Plasma Desktop,
 * Server, Everything, the Atomic Desktops, all Spins, Labs, IoT and Cloud Base.
 * Excluded: container images (Container, WSL, oci.tar.xz), the bootc/ostree
 * `.ociarchive` update images, Vagrant boxes (.box), Azure (.vhdfixed.xz) and
 * GCE (.tar.gz) images (not image formats the catalog schema knows), the
 * Workstation ppc64le and Labs Robotics images (on the server and in
 * releases.json but not offered on the download pages), and Fedora CoreOS (a
 * separate project and stream, not in releases.json). The IoT Beta page
 * links six images (alt/iot/test/45: ostree and provisioner ISOs and the
 * raw.xz for x86_64 and aarch64) that releases.json does not list, and their
 * digests exist only in the disallowed CHECKSUM files, so IoT is listed for
 * stable releases only until releases.json carries them.
 */

import type { Artifact, Edition, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getJson } from "../http";
import { endOfLife } from "../lib/endoflife";
import { mirrorManagerMirrors } from "../lib/mirrormanager";
import { compareVersions, isoDay } from "../lib/versions";
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

interface BodhiRelease {
  name: string;
  id_prefix: string;
  released_on: string | null;
  eol: string | null;
}

/** One release in the tracker index: its .torrent files and the day it was published (epoch seconds). */
interface TorrentGroup {
  name: string;
  releasedate: number;
  torrents: { torrent: string }[];
}

const RELEASES_JSON = "https://fedoraproject.org/releases.json";
const BODHI = "https://bodhi.fedoraproject.org/releases/?exclude_archived=true&rows_per_page=100";
const MIRROR_LIST = "https://mirrormanager.fedoraproject.org/mirrors/Fedora";
const PUB = "https://download.fedoraproject.org/pub/";
const CHECKSUMS = "https://dl.fedoraproject.org/pub/";
const TRACKER = "https://torrent.fedoraproject.org/torrents.json";
const TORRENTS = "https://torrent.fedoraproject.org/torrents/";

const ARCHES: Record<string, Artifact["arch"]> = {
  x86_64: "x86_64",
  aarch64: "aarch64",
  ppc64le: "ppc64le",
  s390x: "s390x",
};

const FORMATS: { suffix: string; format: Artifact["format"] }[] = [
  { suffix: ".iso", format: "iso" },
  { suffix: ".raw.xz", format: "raw.xz" },
  { suffix: ".qcow2", format: "qcow2" },
];

interface EditionDef {
  id: string;
  name: string;
  desktop: Desktop | null;
  kind: Edition["kind"];
  match: (e: Entry) => boolean;
  /** Core editions every release must have; a release without one is a format change. */
  required?: boolean;
}

const is = (variant: string, subvariant?: string) => (e: Entry) =>
  e.variant === variant && (subvariant === undefined || e.subvariant === subvariant);

const spin = (
  id: string,
  name: string,
  subvariant: string,
  desktop: Desktop | null,
): EditionDef => ({ id, name, desktop, kind: "desktop", match: is("Spins", subvariant) });

const lab = (
  id: string,
  name: string,
  subvariant: string,
  desktop: Desktop | null,
): EditionDef => ({ id, name, desktop, kind: "desktop", match: is("Labs", subvariant) });

/** Download-page order. */
const EDITIONS: EditionDef[] = [
  {
    id: "workstation",
    name: "Workstation",
    desktop: "gnome",
    kind: "desktop",
    // The Workstation page offers x86_64 and aarch64 only (a ppc64le ISO is in releases.json).
    match: (e) => e.variant === "Workstation" && e.arch !== "ppc64le",
    required: true,
  },
  {
    id: "kde",
    name: "KDE Plasma Desktop",
    desktop: "kde",
    kind: "desktop",
    match: is("KDE"),
    required: true,
  },
  {
    id: "server",
    name: "Server",
    desktop: null,
    kind: "server",
    match: (e) => e.variant === "Server" && e.subvariant === "Server" && !/-netinst-/.test(e.link),
    required: true,
  },
  {
    id: "server-netinst",
    name: "Server (netinstall)",
    desktop: null,
    kind: "netinst",
    match: (e) => e.variant === "Server" && e.subvariant === "Server" && /-netinst-/.test(e.link),
    required: true,
  },
  {
    id: "server-guest",
    name: "Server Guest (QEMU)",
    desktop: null,
    kind: "other",
    match: is("Server", "Server_KVM"),
  },
  {
    id: "everything",
    name: "Everything (netinstall)",
    desktop: null,
    kind: "netinst",
    match: is("Everything"),
    required: true,
  },
  {
    id: "silverblue",
    name: "Silverblue",
    desktop: "gnome",
    kind: "desktop",
    match: is("Silverblue"),
  },
  { id: "kinoite", name: "Kinoite", desktop: "kde", kind: "desktop", match: is("Kinoite") },
  {
    id: "sway-atomic",
    name: "Sway Atomic",
    desktop: "sway",
    kind: "desktop",
    match: is("Sericea"),
  },
  {
    id: "budgie-atomic",
    name: "Budgie Atomic",
    desktop: "budgie",
    kind: "desktop",
    match: is("Onyx"),
  },
  {
    id: "cosmic-atomic",
    name: "COSMIC Atomic",
    desktop: "cosmic",
    kind: "desktop",
    match: is("COSMIC-Atomic"),
  },
  spin("xfce", "Xfce", "Xfce", "xfce"),
  spin("cinnamon", "Cinnamon", "Cinnamon", "cinnamon"),
  spin("mate", "MATE-Compiz", "Mate", "mate"),
  spin("lxqt", "LXQt", "LXQt", "lxqt"),
  spin("lxde", "LXDE", "LXDE", "lxde"),
  spin("budgie", "Budgie", "Budgie", "budgie"),
  spin("cosmic", "COSMIC", "COSMIC", "cosmic"),
  spin("sway", "Sway", "Sway", "sway"),
  spin("i3", "i3", "i3", "i3"),
  spin("kde-mobile", "KDE Mobile", "KDE_Mobile", "kde"),
  spin("miraclewm", "MiracleWM", "MiracleWM", null),
  spin("soas", "Sugar on a Stick", "SoaS", null),
  { id: "minimal", name: "Minimal", desktop: null, kind: "minimal", match: is("Spins", "Minimal") },
  lab("astronomy", "Astronomy", "Astronomy_KDE", "kde"),
  lab("design-suite", "Design Suite", "Design_suite", null),
  lab("games", "Games", "Games", null),
  lab("jam", "Jam", "Jam_KDE", "kde"),
  lab("python-classroom", "Python Classroom", "Python_Classroom", null),
  lab("scientific", "Scientific", "Scientific_KDE", "kde"),
  lab("security", "Security Lab", "Security", null),
  { id: "iot", name: "IoT", desktop: null, kind: "other", match: is("IoT", "IoT") },
  {
    id: "iot-provisioner",
    name: "IoT Simplified Provisioner",
    desktop: null,
    kind: "other",
    match: is("IoT", "IoT_Simplified_Provisioner"),
  },
  {
    id: "cloud-base",
    name: "Cloud Base",
    desktop: null,
    kind: "cloud",
    match: (e) => is("Cloud", "Cloud_Base")(e) && e.link.includes("-Generic-"),
  },
  {
    id: "cloud-base-ec2",
    name: "Cloud Base (Amazon EC2)",
    desktop: null,
    kind: "cloud",
    match: (e) => is("Cloud", "Cloud_Base")(e) && e.link.includes("-AmazonEC2-"),
  },
  {
    id: "cloud-base-uki",
    name: "Cloud Base UKI",
    desktop: null,
    kind: "cloud",
    match: is("Cloud", "Cloud_Base_UKI"),
  },
];

/** Offered by releases.json but deliberately not kept (see the header). */
const EXCLUDED = (e: Entry) =>
  e.variant === "Container" ||
  (e.variant === "IoT" && e.subvariant === "base") ||
  (e.variant === "Labs" && (e.subvariant === "Robotics" || e.subvariant === "Scientific"));

const formatOf = (link: string) => FORMATS.find((f) => link.endsWith(f.suffix))?.format ?? null;

/**
 * The CHECKSUM file the download pages link for an image (clear-signed, on
 * dl.fedoraproject.org). Stable: Fedora-<Group>-<N>-<compose>-<arch>-CHECKSUM
 * in the image's directory; Beta: Fedora-<Group>-<iso|images>-<N>_Beta-...;
 * IoT stable: Fedora-IoT-<N>-<arch>-<compose>-CHECKSUM. Null when the pattern
 * cannot be read.
 */
function checksumFile(e: Entry, dir: string): string | null {
  const beta = e.version.endsWith(" Beta");
  const version = beta ? `${e.version.replace(" Beta", "")}_Beta` : e.version;
  const compose = e.link.match(new RegExp(`-${version}-(\\d+\\.\\d+)(?=[.-])`))?.[1];
  if (!compose) return null;
  const kind = dir.split("/").filter(Boolean).pop();
  if (e.variant === "IoT" && !beta) return `Fedora-IoT-${version}-${e.arch}-${compose}-CHECKSUM`;
  return `Fedora-${e.variant}-${beta ? `${kind}-` : ""}${version}-${compose}-${e.arch}-CHECKSUM`;
}

function artifact(e: Entry, format: Artifact["format"]): Artifact {
  if (!e.link.startsWith(PUB)) throw new Error(`unexpected Fedora download link: ${e.link}`);
  if (!e.sha256 || !/^[0-9a-f]{64}$/i.test(e.sha256) || !e.size)
    throw new Error(`releases.json has no SHA-256 or size for ${e.link}`);
  const rel = e.link.slice(PUB.length);
  const file = rel.split("/").pop() ?? rel;
  const dir = rel.slice(0, rel.length - file.length);
  const checksum = checksumFile(e, dir);
  return {
    arch: ARCHES[e.arch] as Artifact["arch"],
    format,
    file,
    path: rel.match(/^fedora\/linux\/(releases\/\d+\/.+)$/)?.[1] ?? null,
    url: e.link,
    size: Number(e.size),
    checksum: {
      type: "sha256",
      value: e.sha256.toLowerCase(),
      url: checksum ? `${CHECKSUMS}${dir}${checksum}` : null,
    },
    signatureUrl: null,
    torrentUrl: null,
  };
}

const bodhiName = (version: string) => `F${version}`;

const ARCH_TOKEN = /(?:^|[._-])(x86_64|aarch64|ppc64le|s390x)(?=$|[._-])/;

/**
 * Key shared by an image and its torrent: the file name without extension,
 * architecture and compose number, lower-cased and stripped of separators,
 * plus the architecture. "Fedora-Workstation-Live-44-1.7.x86_64.iso" and
 * "Fedora-Workstation-Live-x86_64-44.torrent" both give
 * "fedoraworkstationlive44/x86_64". Null when the name has no architecture.
 */
function imageKey(name: string): string | null {
  const base = name.replace(/\.(?:iso|raw\.xz|qcow2|torrent)$/, "");
  const arch = base.match(ARCH_TOKEN)?.[1];
  if (!arch) return null;
  const rest = base.replace(ARCH_TOKEN, "").replace(/-\d+\.\d+$/, "");
  return `${rest.toLowerCase().replace(/[^a-z0-9]+/g, "")}/${arch}`;
}

/**
 * Torrent file name per image key for one tracker group. Torrents are an
 * optional extra, so a name that cannot be read, or that shares its key with
 * another torrent (which image would it be?), is left out and reported in
 * `skipped` instead of failing the sync; a wrong torrent is never linked.
 */
function torrentNames(group: TorrentGroup | undefined, skipped: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const repeated = new Set<string>();
  for (const { torrent } of group?.torrents ?? []) {
    const key = /^[\w.-]+\.torrent$/.test(torrent) ? imageKey(torrent) : null;
    if (!key) skipped.push(torrent);
    else if (out.has(key)) repeated.add(key);
    else out.set(key, torrent);
  }
  for (const key of repeated) {
    skipped.push(out.get(key) as string);
    out.delete(key);
  }
  return out;
}

export default defineSource({
  slug: "fedora",
  hosts: ["download.fedoraproject.org", "dl.fedoraproject.org", "torrent.fedoraproject.org"],
  async releases(ctx) {
    const [entries, bodhi, eol, tracker] = await Promise.all([
      getJson<Entry[]>(RELEASES_JSON),
      getJson<{ releases: BodhiRelease[] }>(BODHI),
      endOfLife("fedora"),
      getJson<TorrentGroup[]>(TRACKER),
    ]);
    if (!Array.isArray(entries) || !entries.length) throw new Error("releases.json is empty");
    if (
      !Array.isArray(tracker) ||
      !tracker.length ||
      !tracker.every((g) => typeof g.name === "string" && Array.isArray(g.torrents))
    )
      throw new Error(`${TRACKER} no longer lists releases with their torrents`);
    const official = new Map(
      bodhi.releases.filter((r) => r.id_prefix === "FEDORA").map((r) => [r.name, r]),
    );
    const cycles = new Map(eol.cycles.map((c) => [c.name, c]));
    const published = (group: string) => {
      const seconds = tracker.find((g) => g.name === group)?.releasedate;
      return typeof seconds === "number" ? isoDay(new Date(seconds * 1000)) : null;
    };
    const dates = (version: string) => {
      const b = official.get(bodhiName(version));
      const c = cycles.get(version);
      return {
        releaseDate: b?.released_on ?? published(version) ?? c?.releaseDate ?? null,
        eol: b?.eol ?? c?.eol ?? null,
      };
    };

    const stable = [...new Set(entries.map((e) => e.version).filter((v) => /^\d+$/.test(v)))]
      .filter((v) => {
        const end = dates(v).eol;
        return !end || end >= ctx.today;
      })
      .sort((a, b) => compareVersions(b, a));
    if (!stable.length) throw new Error("no supported Fedora release in releases.json");
    const beta = [...new Set(entries.map((e) => e.version).filter((v) => /^\d+ Beta$/.test(v)))]
      .sort((a, b) => compareVersions(b, a))
      .find((v) => compareVersions(v.replace(" Beta", ""), stable[0] ?? "0") > 0);
    const versions = beta ? [beta, ...stable] : stable;

    const releases: Release[] = versions.map((version) => {
      const isBeta = version.endsWith(" Beta");
      const number = version.replace(" Beta", "");
      const mine = entries.filter((e) => e.version === version);
      const editions: Edition[] = [];
      const claimed = new Set<Entry>();
      for (const def of EDITIONS) {
        const artifacts: Artifact[] = [];
        for (const e of mine) {
          const format = formatOf(e.link);
          if (!format || !ARCHES[e.arch] || !def.match(e)) continue;
          claimed.add(e);
          artifacts.push(artifact(e, format));
        }
        if (!artifacts.length) {
          if (def.required)
            throw new Error(`Fedora ${version}: no ${def.name} images in releases.json`);
          continue;
        }
        const seen = new Set<string>();
        for (const a of artifacts) {
          const key = `${a.arch}/${a.format}`;
          if (seen.has(key))
            throw new Error(
              `Fedora ${version}: ${def.id} has two ${a.format} images for ${a.arch}`,
            );
          seen.add(key);
        }
        artifacts.sort((a, b) => a.arch.localeCompare(b.arch) || a.file.localeCompare(b.file));
        editions.push({
          id: def.id,
          name: def.name,
          desktop: def.desktop,
          kind: def.kind,
          artifacts,
        });
      }
      const unmapped = [
        ...new Set(
          mine
            .filter((e) => formatOf(e.link) && ARCHES[e.arch] && !claimed.has(e) && !EXCLUDED(e))
            .filter((e) => !(e.variant === "Workstation" && e.arch === "ppc64le"))
            .map((e) => `${e.variant}/${e.subvariant}`),
        ),
      ];
      if (unmapped.length)
        ctx.log(`Fedora ${version}: editions not mapped yet: ${unmapped.join(", ")}`);

      // The tracker names its groups "44" and "45_Beta".
      const group = isBeta ? `${number}_Beta` : number;
      const skipped: string[] = [];
      const listed = torrentNames(
        tracker.find((g) => g.name === group),
        skipped,
      );
      if (!listed.size) ctx.log(`Fedora ${version}: the tracker lists no usable torrents`);
      if (skipped.length)
        ctx.log(
          `Fedora ${version}: torrents left out (unreadable or ambiguous): ${skipped.join(", ")}`,
        );
      const linked = new Set<string>();
      for (const edition of editions)
        for (const a of edition.artifacts) {
          const key = imageKey(a.file);
          const torrent = key ? listed.get(key) : undefined;
          if (!key || !torrent) continue;
          if (linked.has(key)) throw new Error(`Fedora ${version}: two images match ${torrent}`);
          linked.add(key);
          a.torrentUrl = `${TORRENTS}${torrent}`;
        }
      const orphans = [...listed].filter(([key]) => !linked.has(key)).map(([, name]) => name);
      if (orphans.length)
        ctx.log(`Fedora ${version}: torrents without a listed image: ${orphans.join(", ")}`);

      const { releaseDate, eol: end } = dates(number);
      return {
        version: isBeta ? `${number}-beta` : number,
        channel: isBeta ? ("beta" as const) : ("stable" as const),
        codename: null,
        releaseDate: isBeta ? published(group) : releaseDate,
        eol: isBeta ? null : end,
        notesUrl: isBeta
          ? null
          : `https://docs.fedoraproject.org/en-US/fedora/f${number}/release-notes/`,
        editions,
      };
    });
    return { sources: [RELEASES_JSON, BODHI, TRACKER, eol.url], releases };
  },

  async mirrors() {
    const entries = await getJson<Entry[]>(RELEASES_JSON);
    const newest = entries
      .map((e) => e.version)
      .filter((v) => /^\d+$/.test(v))
      .sort((a, b) => compareVersions(b, a))[0];
    if (!newest) throw new Error("no stable Fedora release in releases.json");
    const { source, mirrors } = await mirrorManagerMirrors(
      `${MIRROR_LIST}/${newest}/x86_64`,
      "Fedora Linux",
    );
    return { sources: [source], mirrors };
  },
});
