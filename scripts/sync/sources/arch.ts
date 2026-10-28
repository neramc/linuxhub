/**
 * Arch Linux.
 *
 * Official sources, and what each one is used for:
 * - archlinux.org/releng/releases/json/ (release engineering): the monthly ISO
 *   snapshots with release date, size (the torrent's file length, exact),
 *   SHA-256, torrent and the ISO path. The newest available snapshot is the
 *   one archlinux.org/download/ calls "Current Release". That page offers no
 *   older snapshot (its download links and mirror list all name the current
 *   one), so only the current snapshot is listed (conventions: a previous
 *   rolling snapshot only while the download page still offers it).
 * - archlinux.org/iso/<version>/sha256sums.txt: the checksum file on the
 *   origin host. It is what `checksum.url` points to and the digest is read
 *   from it; if the releng JSON disagrees, the sync throws. The page also
 *   publishes BLAKE2b (b2sums.txt), but SHA-256 is used for every distro
 *   (the policy ranks sha512/sha256 first, and the site only shows commands
 *   for those). The .sig next to the ISO is the PGP signature.
 * - geo.mirror.pkgbuild.com/images/: the official virtual machine images
 *   ("VM images" section of the download page, which points to the
 *   arch-boxes package registry; the same builds are on Arch's own CDN, the
 *   robots-allowed place the sync can read): `basic` and `cloudimg`, both
 *   qcow2 for x86_64, built every two weeks. The dated build directory
 *   (v<date>.<build>/) is used for the URL, the file name, the checksum
 *   (<file>.SHA256) and the signature (<file>.sig), so a link stays valid
 *   after latest/ moves on. Sizes stay null here (run.ts HEADs the file).
 *   Mirrors are not known to carry images/ (their list only flags iso/), so
 *   these have `path: null` and are downloaded from the official CDN.
 * - archlinux.org/mirrors/status/json/: the official mirror list the download
 *   page is generated from (country, ISO availability, last sync, score).
 *
 * Exclusions, for the same reasons as everywhere: the Docker image
 * (container image); the WSL image (.wsl is no format of the data model);
 * the netboot loader (no image file); the bootstrap tarball (tar.zst is no
 * format of the data model; the page links only its signature). Arch Linux
 * ARM and Arch Linux 32 are separate projects that the page does not offer.
 *
 * Mirrors: every active HTTPS entry that the list flags as carrying ISOs and
 * that has synced at least once (the download page shows them all; an entry
 * with no sync at all carries nothing). run.ts then checks each one for the
 * newest ISO. Country comes from the list (empty for the geo/CDN hosts →
 * null); the list has no coordinates. Deviation: the list's score moves with
 * every check (every 15 minutes), so it is stored as a coarse tier
 * (ceil, at least 1) and the committed data only changes when a mirror's
 * quality changes meaningfully.
 */
import type { Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import { getJson, getText } from "../http";
import { checksumType, parseChecksums } from "../lib/checksums";
import { listDirectory } from "../lib/dirlist";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const ORIGIN = "https://archlinux.org/";
const RELENG = `${ORIGIN}releng/releases/json/`;
const MIRROR_STATUS = `${ORIGIN}mirrors/status/json/`;
/** Arch's official GeoDNS mirror: picks a nearby server automatically. */
const GEO = "https://geo.mirror.pkgbuild.com/";
const IMAGES = `${GEO}images/`;

interface RelengRelease {
  version: string;
  release_date: string;
  available: boolean;
  sha256_sum: string | null;
  iso_url: string;
  torrent_url: string | null;
  torrent?: { file_length?: number } | null;
}

interface MirrorStatus {
  urls: {
    url: string;
    protocol: string;
    active: boolean;
    isos: boolean;
    last_sync: string | null;
    score: number | null;
    country_code: string;
  }[];
}

/** The official VM images (arch-boxes), in display order. */
const VM_IMAGES: { key: string; id: string; name: string; kind: Edition["kind"] }[] = [
  { key: "basic", id: "vm-basic", name: "VM image (basic)", kind: "other" },
  { key: "cloudimg", id: "vm-cloudimg", name: "VM image (cloud-init)", kind: "cloud" },
];

/** The newest dated build of each VM image, from the CDN's latest/ directory. */
async function vmEditions(): Promise<Edition[]> {
  const names = await listDirectory(`${IMAGES}latest/`);
  const editions: Edition[] = [];
  for (const vm of VM_IMAGES) {
    const pattern = new RegExp(`^Arch-Linux-x86_64-${vm.key}-(\\d{8}\\.\\d+)\\.qcow2$`);
    const builds = names.flatMap((n) => pattern.exec(n)?.[1] ?? []);
    const build = builds.sort(compareVersions).at(-1);
    if (!build) throw new Error(`no ${vm.key} VM image in ${IMAGES}latest/`);
    const file = `Arch-Linux-x86_64-${vm.key}-${build}.qcow2`;
    const dir = `${IMAGES}v${build}/`;
    const sumUrl = `${dir}${file}.SHA256`;
    const hash = parseChecksums(await getText(sumUrl)).get(file);
    if (!hash) throw new Error(`${sumUrl} does not list ${file}`);
    editions.push({
      id: vm.id,
      name: vm.name,
      desktop: "none",
      kind: vm.kind,
      artifacts: [
        {
          arch: "x86_64",
          format: "qcow2",
          file,
          path: null,
          url: `${dir}${file}`,
          size: null,
          checksum: { type: checksumType(hash), value: hash, url: sumUrl },
          signatureUrl: names.includes(`${file}.sig`) ? `${dir}${file}.sig` : null,
          torrentUrl: null,
        },
      ],
    });
  }
  return editions;
}

export default defineSource({
  slug: "arch",
  hosts: ["archlinux.org", "geo.mirror.pkgbuild.com"],
  async releases() {
    const data = await getJson<{ releases: RelengRelease[] }>(RELENG);
    const current = data.releases
      .filter((r) => r.available && r.sha256_sum)
      .sort((a, b) => compareVersions(b.version, a.version))[0];
    if (!current) throw new Error(`no available Arch release in ${RELENG}`);

    const { version } = current;
    const file = `archlinux-${version}-x86_64.iso`;
    const path = `iso/${version}/${file}`;
    if (current.iso_url !== `/${path}`)
      throw new Error(`unexpected ISO path ${current.iso_url} for Arch ${version}`);

    const sumUrl = `${ORIGIN}iso/${version}/sha256sums.txt`;
    const hash = parseChecksums(await getText(sumUrl)).get(file);
    if (!hash) throw new Error(`${sumUrl} does not list ${file}`);
    if (hash !== (current.sha256_sum ?? "").toLowerCase())
      throw new Error(`SHA-256 of ${file} differs between ${sumUrl} and ${RELENG}`);

    const release: Release = {
      version,
      channel: "rolling",
      codename: null,
      releaseDate: current.release_date,
      eol: null,
      notesUrl: `${ORIGIN}releng/releases/${version}/`,
      editions: [
        {
          id: "live",
          name: "Live ISO",
          desktop: "none",
          kind: "live",
          artifacts: [
            {
              arch: "x86_64",
              format: "iso",
              file,
              path,
              url: `${GEO}${path}`,
              size: current.torrent?.file_length ?? null,
              checksum: { type: checksumType(hash), value: hash, url: sumUrl },
              signatureUrl: `${ORIGIN}${path}.sig`,
              torrentUrl: current.torrent_url
                ? `https://archlinux.org${current.torrent_url}`
                : null,
            },
          ],
        },
        ...(await vmEditions()),
      ],
    };
    return { sources: [RELENG, `${IMAGES}latest/`], releases: [release] };
  },
  async mirrors() {
    const data = await getJson<MirrorStatus>(MIRROR_STATUS);
    const mirrors: Mirror[] = data.urls
      .filter((m) => m.protocol === "https" && m.active && m.isos && m.last_sync)
      .map((m) => ({
        url: m.url.endsWith("/") ? m.url : `${m.url}/`,
        country: /^[A-Z]{2}$/.test(m.country_code) ? m.country_code : null,
        name: new URL(m.url).hostname,
        lat: null,
        lon: null,
        score: m.score === null ? null : Math.max(1, Math.ceil(m.score)),
      }));
    if (!mirrors.length) throw new Error(`no HTTPS ISO mirrors in ${MIRROR_STATUS}`);
    return { sources: [MIRROR_STATUS], mirrors };
  },
});
