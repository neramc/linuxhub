/**
 * NixOS.
 *
 * Official sources, and what each one is used for:
 * - nixos.org/download/: the page that offers the installation images: for
 *   the current stable release, the Graphical ISO and the Minimal ISO, each
 *   for 64-bit Intel/AMD and 64-bit ARM, with a SHA-256 link. Every image it
 *   links must be in the result, otherwise the sync throws (nothing offered
 *   may be missing); the release it links is a release line even when
 *   endoflife.date does not list it yet.
 * - nixos.org/manual/nixos/stable/release-notes: the manual's release list,
 *   whose headings carry the codename and release date
 *   ("Release 26.05 (“Yarara”, 2026.05/30)"). Both are read from there.
 * - channels.nixos.org/nixos-<release>/latest-nixos-<image>-<arch>-linux.iso.sha256:
 *   the channel's stable names for the newest build. They redirect to the
 *   immutable build directory on releases.nixos.org (NixOS's own CDN, an S3
 *   bucket behind Fastly), whose name carries the build
 *   (nixos-26.05.12707.718f670e8453); the artifact URL and its .sha256 are
 *   those immutable ones, so the link keeps matching the checksum after the
 *   channel moves on. The .sha256 file ("<hash>  <file>") is the checksum.
 *   NixOS publishes no SHA-512, signature or torrent for the ISOs, and no
 *   sizes (run.ts reads them with one HEAD each).
 * - endoflife.date: the end of support (the NixOS project states it only in
 *   release announcements; stable releases get about seven months) and which
 *   lines are still supported. Today that is one line; two overlap for about
 *   a month around each release.
 *
 * Exclusions, for the same reasons as everywhere: the AMIs (AWS-specific
 * images, the download page's third section); `unstable` and every other
 * development build (nixos-unstable, "-small" channels). NixOS has no numbered
 * pre-releases: the next release has no channel before it ships.
 *
 * The version is the release ("26.05"); NixOS has no point releases, the
 * build number in the file name is what changes. Graphical ISO: the live
 * system lets you pick the desktop in the boot menu, so its desktop is not
 * one fixed environment (null).
 *
 * Mirrors: NixOS publishes no mirror list, only its CDN, so the list is that
 * one root (releases.nixos.org).
 */
import type { Artifact, Edition, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getText, HttpError, request } from "../http";
import { parseChecksums } from "../lib/checksums";
import { endOfLife } from "../lib/endoflife";
import { originAsMirror } from "../lib/mirrors";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const DOWNLOAD_PAGE = "https://nixos.org/download/";
const RELEASE_NOTES = "https://nixos.org/manual/nixos/stable/release-notes";
const CHANNELS = "https://channels.nixos.org/";
const RELEASES = "https://releases.nixos.org/";

const ARCHES: [string, Artifact["arch"]][] = [
  ["x86_64", "x86_64"],
  ["aarch64", "aarch64"],
];

const IMAGES: {
  image: string;
  id: string;
  name: string;
  desktop: Desktop | null;
  kind: Edition["kind"];
}[] = [
  { image: "graphical", id: "graphical", name: "Graphical ISO", desktop: null, kind: "live" },
  { image: "minimal", id: "minimal", name: "Minimal ISO", desktop: "none", kind: "minimal" },
];

interface Line {
  version: string;
  eol: string | null;
  releaseDate: string | null;
  codename: string | null;
}

/** "Release 26.05 (“Yarara”, 2026.05/30)" headings of the manual's release notes. */
function releaseNotes(html: string): Map<string, { codename: string; date: string | null }> {
  const out = new Map<string, { codename: string; date: string | null }>();
  for (const m of html.matchAll(
    /Release (\d+\.\d+) \(“([^”]+)”, (\d{4})[./](\d{2})[./](\d{2}|\?\?)\)/g,
  )) {
    const [, version, codename, y, mo, d] = m;
    if (!version || !codename || out.has(version)) continue;
    out.set(version, { codename, date: d === "??" ? null : `${y}-${mo}-${d}` });
  }
  return out;
}

/** The images the download page links: "<release> <image> <arch>". */
function offered(html: string): Set<string> {
  const out = new Set<string>();
  for (const m of html.matchAll(
    /href="https:\/\/channels\.nixos\.org\/nixos-(\d+\.\d+)\/latest-nixos-([a-z0-9]+)-([a-z0-9_]+)-linux\.iso"/g,
  ))
    out.add(`${m[1]} ${m[2]} ${m[3]}`);
  return out;
}

/** The newest build of one image: its immutable URL and SHA-256, or null when the channel has none. */
async function newestBuild(
  version: string,
  image: string,
  arch: string,
): Promise<{ file: string; dir: string; sha256: string } | null> {
  const sumUrl = `${CHANNELS}nixos-${version}/latest-nixos-${image}-${arch}-linux.iso.sha256`;
  let res: Awaited<ReturnType<typeof request>>;
  try {
    res = await request(sumUrl, { accept: "text/plain" });
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
  const m = res.finalUrl.match(
    new RegExp(
      `^(${RELEASES.replaceAll(".", "\\.")}nixos/${version.replace(".", "\\.")}/nixos-(${version.replace(".", "\\.")}\\.\\d+\\.[0-9a-f]+)/)(nixos-${image}-\\2-${arch}-linux\\.iso)\\.sha256$`,
    ),
  );
  if (!m?.[1] || !m[3])
    throw new Error(`${sumUrl} redirects to an unexpected place: ${res.finalUrl}`);
  const sha256 = parseChecksums(res.body).get(m[3]);
  if (sha256?.length !== 64) throw new Error(`${res.finalUrl} does not list ${m[3]}`);
  return { file: m[3], dir: m[1], sha256 };
}

export default defineSource({
  slug: "nixos",
  hosts: ["releases.nixos.org"],
  async releases(ctx) {
    const [page, notesHtml, eol] = await Promise.all([
      getText(DOWNLOAD_PAGE, { accept: "text/html" }),
      getText(RELEASE_NOTES, { accept: "text/html" }),
      endOfLife("nixos"),
    ]);
    const notes = releaseNotes(notesHtml);
    if (!notes.size) throw new Error(`no release headings on ${RELEASE_NOTES}`);
    const links = offered(page);
    if (!links.size) throw new Error(`no ISO links on ${DOWNLOAD_PAGE}`);

    // Supported lines: endoflife.date, plus any release the download page links.
    const lines = new Map<string, Line>();
    for (const c of eol.cycles) {
      if (!/^\d+\.\d+$/.test(c.name) || !c.releaseDate || c.releaseDate > ctx.today) continue;
      if (c.eol && c.eol < ctx.today) continue;
      lines.set(c.name, {
        version: c.name,
        eol: c.eol,
        releaseDate: c.releaseDate,
        codename: c.codename,
      });
    }
    for (const key of links) {
      const version = key.split(" ")[0] as string;
      if (!lines.has(version))
        lines.set(version, { version, eol: null, releaseDate: null, codename: null });
    }

    const releases: Release[] = [];
    for (const line of [...lines.values()].sort((a, b) => compareVersions(b.version, a.version))) {
      const editions: Edition[] = [];
      for (const def of IMAGES) {
        const artifacts: Artifact[] = [];
        for (const [nixArch, arch] of ARCHES) {
          const build = await newestBuild(line.version, def.image, nixArch);
          if (!build) {
            if (links.has(`${line.version} ${def.image} ${nixArch}`))
              throw new Error(
                `${DOWNLOAD_PAGE} offers nixos-${line.version} ${def.image} ${nixArch} but the channel has no such image`,
              );
            ctx.log(`${line.version}: no ${def.image} ${nixArch} image in the channel`);
            continue;
          }
          const url = `${build.dir}${build.file}`;
          artifacts.push({
            arch,
            format: "iso",
            file: build.file,
            path: url.slice(RELEASES.length),
            url,
            size: null,
            checksum: { type: "sha256", value: build.sha256, url: `${url}.sha256` },
            signatureUrl: null,
            torrentUrl: null,
          });
        }
        if (artifacts.length)
          editions.push({
            id: def.id,
            name: def.name,
            desktop: def.desktop,
            kind: def.kind,
            artifacts,
          });
      }
      if (!editions.length) throw new Error(`no images found in the nixos-${line.version} channel`);
      const official = notes.get(line.version);
      releases.push({
        version: line.version,
        channel: "stable",
        codename: official?.codename ?? line.codename,
        releaseDate: official?.date ?? line.releaseDate,
        eol: line.eol,
        notesUrl: `${RELEASE_NOTES}#sec-release-${line.version}`,
        editions,
      });
    }
    if (!releases.length) throw new Error("no supported NixOS release");
    return { sources: [DOWNLOAD_PAGE, RELEASE_NOTES, CHANNELS, eol.url], releases };
  },
  async mirrors() {
    return {
      sources: [DOWNLOAD_PAGE],
      mirrors: [originAsMirror(RELEASES, "releases.nixos.org")],
    };
  },
});
