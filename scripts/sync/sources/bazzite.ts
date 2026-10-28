/**
 * Bazzite.
 *
 * Official sources and what they are used for:
 * - bazzite.gg: the official download page is the image picker on the home
 *   page (device, GPU, Nvidia generation, desktop). Its script turns the
 *   choices into ten image names (`bazzite`, `bazzite-gnome`,
 *   `bazzite-nvidia-open`, `bazzite-gnome-nvidia-open`, `bazzite-nvidia`,
 *   `bazzite-gnome-nvidia`, `bazzite-deck`, `bazzite-deck-gnome`,
 *   `bazzite-deck-nvidia`, `bazzite-deck-nvidia-gnome`) and links, for each,
 *   the Live ISO (`<image>-stable-live-amd64.iso`, with its `-CHECKSUM` and
 *   `.sig`) and the "Legacy installer" ISO (`<image>-stable-amd64.iso` with
 *   its `-CHECKSUM`; the page says it will be phased out). The ten names are
 *   encoded here. The module reads the picker's option lists and the URL
 *   templates in its script on every run and throws when either changed, so a
 *   new device, desktop or file naming is never silently left out.
 * - download.bazzite.gg (Bazzite's download CDN): the ISOs and their
 *   `-CHECKSUM` files (SHA-256) and `.sig` signatures. A Live ISO without a
 *   checksum is a format change and throws. A legacy installer is skipped
 *   (and logged) when the CDN does not serve it: the page links
 *   `bazzite-gnome-nvidia-open-stable-amd64.iso`, which answers 404 today.
 * - ghcr.io/ublue-os/bazzite:stable (the OS image registry the picker links
 *   to; anonymous pull token, manifest annotations only): the version
 *   (`org.opencontainers.image.version`, e.g. 44.20261012.1) and build time
 *   of the current stable image. Bazzite has one stable branch that every
 *   install keeps following, so the single release listed is the newest
 *   stable build, dated by that image's build day. GitHub's release list is
 *   not used: bazzite.gg keeps only the newest 30 releases, nearly all
 *   testing and unstable builds, so the newest stable one drops out within
 *   days.
 *
 * The Live ISOs are rebuilt under fixed names with each stable build; the
 * legacy installers are frozen builds from October 2025 (their Last-Modified)
 * that update themselves after installing. They are listed as separate
 * editions because the page offers both for every image.
 *
 * Excluded: testing and unstable builds, the FOSS Torrents link (a
 * third-party site, no torrent from the project: torrentUrl is null), and the
 * "existing user" rebase commands (not downloads). Every image is x86_64; the
 * picker offers no other architecture. There is no end-of-life date for a
 * rolling stable branch. Sizes come from run.ts (one HEAD per file).
 */

import type { Artifact, Edition, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getJson, getText, HttpError, request } from "../http";
import { parseChecksums } from "../lib/checksums";
import { originAsMirror } from "../lib/mirrors";
import { isoDay } from "../lib/versions";
import { defineSource } from "../source";

const HOME = "https://bazzite.gg/";
const CDN = "https://download.bazzite.gg/";
const REGISTRY = "https://ghcr.io/v2/ublue-os/bazzite/manifests/stable";
const TOKEN = "https://ghcr.io/token?service=ghcr.io&scope=repository:ublue-os/bazzite:pull";

/** The picker's ten outcomes, in its order (desktop/laptop, then handheld and HTPC). */
const IMAGES: { image: string; name: string; desktop: Desktop }[] = [
  { image: "bazzite", name: "Desktop/Laptop, AMD/Intel GPU, KDE Plasma", desktop: "kde" },
  { image: "bazzite-gnome", name: "Desktop/Laptop, AMD/Intel GPU, GNOME", desktop: "gnome" },
  { image: "bazzite-nvidia-open", name: "Desktop/Laptop, Nvidia RTX, KDE Plasma", desktop: "kde" },
  {
    image: "bazzite-gnome-nvidia-open",
    name: "Desktop/Laptop, Nvidia RTX, GNOME",
    desktop: "gnome",
  },
  { image: "bazzite-nvidia", name: "Desktop/Laptop, Nvidia GTX, KDE Plasma", desktop: "kde" },
  { image: "bazzite-gnome-nvidia", name: "Desktop/Laptop, Nvidia GTX, GNOME", desktop: "gnome" },
  { image: "bazzite-deck", name: "Handheld or HTPC, AMD/Intel GPU, KDE Plasma", desktop: "kde" },
  {
    image: "bazzite-deck-gnome",
    name: "Handheld or HTPC, AMD/Intel GPU, GNOME",
    desktop: "gnome",
  },
  { image: "bazzite-deck-nvidia", name: "HTPC, Nvidia, KDE Plasma", desktop: "kde" },
  { image: "bazzite-deck-nvidia-gnome", name: "HTPC, Nvidia, GNOME", desktop: "gnome" },
];

/** What the picker offers; anything else means the images below are not the whole set. */
const PICKER_OPTIONS: Record<string, string[]> = {
  "data-device": ["desktop", "handheld", "htpc"],
  "data-gpu": ["amd-intel", "nvidia"],
  "data-nvidia-driver": ["open", "proprietary"],
  "data-desktop-environment": ["gnome", "kde"],
};

/** Pieces of the picker script that build the file names and links used below. */
const SCRIPT_MARKERS = [
  "https://download.bazzite.gg/",
  "-stable-live-amd64.iso",
  "-stable-amd64.iso",
  "-CHECKSUM",
  ".iso.sig",
  "'bazzite-deck'",
  "'-gnome'",
  "'-nvidia-open'",
  "'-nvidia'",
];

/** Throws unless the picker on the home page still offers exactly the choices this module knows. */
async function checkPicker(): Promise<void> {
  const html = await getText(HOME, { accept: "text/html" });
  for (const [attribute, expected] of Object.entries(PICKER_OPTIONS)) {
    const found = [
      ...new Set([...html.matchAll(new RegExp(`${attribute}="([^"]+)"`, "g"))].map((m) => m[1])),
    ].sort();
    if (found.join() !== expected.join())
      throw new Error(
        `Bazzite's image picker changed: ${attribute} offers ${found.join(", ") || "nothing"} (expected ${expected.join(", ")})`,
      );
  }
  const src = html.match(/<script[^>]+src="([^"]*betheme-child\/script\d*\.js)"/)?.[1];
  if (!src) throw new Error(`no picker script on ${HOME}`);
  const script = await getText(new URL(src, HOME).href);
  const missing = SCRIPT_MARKERS.filter((marker) => !script.includes(marker));
  if (missing.length)
    throw new Error(`Bazzite's image picker script changed: no ${missing.join(", ")}`);
}

/** SHA-256 from `<file>-CHECKSUM`, or null when the CDN has no such file (404). */
async function sha256Of(file: string): Promise<{ sha256: string | null; url: string }> {
  const url = `${CDN}${file}-CHECKSUM`;
  try {
    const sha256 = parseChecksums(await getText(url)).get(file) ?? null;
    return { sha256: sha256 && /^[0-9a-f]{64}$/.test(sha256) ? sha256 : null, url };
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return { sha256: null, url };
    throw error;
  }
}

/** True unless the CDN answers 404/410 for the URL. */
async function served(url: string): Promise<boolean> {
  try {
    await request(url, { method: "HEAD", noCache: true });
    return true;
  } catch (error) {
    if (error instanceof HttpError && (error.status === 404 || error.status === 410)) return false;
    throw error;
  }
}

function artifact(file: string, sha256: string, checksumUrl: string, signatureUrl: string | null) {
  return {
    arch: "x86_64",
    format: "iso",
    file,
    path: file,
    url: `${CDN}${file}`,
    size: null,
    checksum: { type: "sha256", value: sha256, url: checksumUrl },
    signatureUrl,
    torrentUrl: null,
  } satisfies Artifact;
}

export default defineSource({
  slug: "bazzite",
  hosts: ["download.bazzite.gg"],
  async releases(ctx) {
    await checkPicker();

    const token = (await getJson<{ token?: string }>(TOKEN)).token;
    if (!token) throw new Error("ghcr.io gave no pull token");
    const manifest = await getJson<{ annotations?: Record<string, string> }>(REGISTRY, {
      accept: [
        "application/vnd.oci.image.manifest.v1+json",
        "application/vnd.oci.image.index.v1+json",
      ].join(", "),
      headers: { authorization: `Bearer ${token}` },
      noCache: true,
    });
    const version = manifest.annotations?.["org.opencontainers.image.version"];
    if (!version || !/^\d+\.\d{8}(?:\.\d+)?$/.test(version))
      throw new Error(`no stable version in the ${REGISTRY} manifest`);
    const built = isoDay(manifest.annotations?.["org.opencontainers.image.created"]);

    const live: Edition[] = [];
    const legacy: Edition[] = [];
    for (const def of IMAGES) {
      const liveFile = `${def.image}-stable-live-amd64.iso`;
      const liveSum = await sha256Of(liveFile);
      // The Live ISO is the picker's main download: a missing one is a format change.
      if (!liveSum.sha256) throw new Error(`no checksum for ${liveFile} on ${CDN}`);
      const signatureUrl = `${CDN}${liveFile}.sig`;
      live.push({
        id: def.image,
        name: def.name,
        desktop: def.desktop,
        kind: "desktop",
        artifacts: [
          artifact(
            liveFile,
            liveSum.sha256,
            liveSum.url,
            (await served(signatureUrl)) ? signatureUrl : null,
          ),
        ],
      });

      const legacyFile = `${def.image}-stable-amd64.iso`;
      const old = await sha256Of(legacyFile);
      if (!old.sha256 || !(await served(`${CDN}${legacyFile}`))) {
        ctx.log(`legacy installer ${legacyFile} is not served by the CDN, left out`);
        continue;
      }
      legacy.push({
        id: `${def.image}-legacy`,
        name: `${def.name} (legacy installer)`,
        desktop: def.desktop,
        kind: "desktop",
        artifacts: [artifact(legacyFile, old.sha256, old.url, null)],
      });
    }

    const releases: Release[] = [
      {
        version,
        channel: "stable",
        codename: null,
        releaseDate: built,
        eol: null,
        notesUrl: `https://github.com/ublue-os/bazzite/releases/tag/${version}`,
        editions: [...live, ...legacy],
      },
    ];
    return { sources: [HOME, REGISTRY], releases };
  },

  async mirrors() {
    // One official CDN root: every ISO is served from it under its own file name.
    return {
      sources: [HOME],
      mirrors: [originAsMirror(CDN, "download.bazzite.gg")],
    };
  },
});
