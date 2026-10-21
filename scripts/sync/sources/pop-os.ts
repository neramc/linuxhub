/**
 * Pop!_OS: every image that System76's download page offers (24.04 LTS and
 * the previous 22.04 LTS; Intel/AMD graphics and NVIDIA; x86_64 and, for
 * 24.04, ARM), served from iso.pop-os.org, System76's one ISO origin.
 *
 * Official sources, and what each one is used for:
 * - system76.com/download-pop/ (the download page) decides what is offered.
 *   The current release's cards are filled by the page's script from the build
 *   API, one call per image (fetchRelease('24.04', 'nvidia', 'arm64')); the
 *   previous releases are listed in plain HTML, with the image link and its
 *   "SHA256 Sum". Both are read: every call and every listed image becomes an
 *   artifact, and the page's headings tell the "LTS" channel.
 * - api.pop-os.org/builds/<version>/<channel>?arch=<amd64|arm64> (the build
 *   API the page's script uses): the current build of an image, with its URL,
 *   exact size and SHA-256. For an image the page lists in HTML, the API must
 *   return that same URL and SHA-256, or the sync throws.
 * - iso.pop-os.org/<version>/<arch>/<channel>/<build>/SHA256SUMS (next to each
 *   image, on the origin host): the official checksum file (checksum.url). It
 *   must agree with the API, or the sync throws.
 * - endoflife.date (release date, end of support): System76 announces neither
 *   in a place a sync can read. Its blog feed keeps only the ten newest posts,
 *   so the release announcements are not machine-readable. System76 supports
 *   only the newest LTS itself; endoflife.date follows Ubuntu's schedule for
 *   the older one, which the download page still lists as a previous release.
 *   A release past its end of support is not listed.
 *
 * Mirrors: iso.pop-os.org is the only host: a CDN (BunnyCDN) in front of
 * System76's storage, with no mirror network (its directory listings answer
 * 403). The mirrors file therefore holds that one root (originAsMirror; no
 * country is published), and root + path is the file.
 *
 * Editions are the API channels: "generic" (called "intel" for 22.04) and
 * "nvidia", each with an image per architecture the page offers. The desktop
 * is COSMIC from 24.04 on and GNOME (with System76's extensions) before.
 *
 * Excluded for every distro alike: images that the API has but the page does
 * not offer (older builds and the Raspberry Pi images of 22.04). The project
 * publishes no signature or torrent files.
 */

import type { Artifact, Edition, Release } from "../../../src/lib/data-schemas";
import { getJson, getText } from "../http";
import { parseChecksums } from "../lib/checksums";
import { endOfLife } from "../lib/endoflife";
import { originAsMirror } from "../lib/mirrors";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const PAGE = "https://system76.com/download-pop/";
const API = "https://api.pop-os.org/builds/";
const ISO = "https://iso.pop-os.org/";

interface Build {
  version: string;
  url: string;
  size: number;
  sha_sum: string;
  channel: string;
  build: string;
}

type ApiArch = "amd64" | "arm64";
const ARCH: Record<ApiArch, Artifact["arch"]> = { amd64: "x86_64", arm64: "aarch64" };

interface Offer {
  version: string;
  channel: string;
  arch: ApiArch;
  /** Image URL and SHA-256 when the page lists the image in plain HTML. */
  listed: { url: string; sha: string } | null;
}

const EDITIONS: Record<string, { id: string; name: string }> = {
  generic: { id: "generic", name: "Intel/AMD" },
  intel: { id: "generic", name: "Intel/AMD" },
  nvidia: { id: "nvidia", name: "NVIDIA" },
};

function parseOffers(html: string): Offer[] {
  const offers: Offer[] = [];
  for (const m of html.matchAll(
    /fetchRelease\(\s*'(\d+\.\d+)',\s*'([a-z]+)',\s*'(amd64|arm64)'\s*\)/g,
  ))
    offers.push({
      version: m[1] as string,
      channel: m[2] as string,
      arch: m[3] as ApiArch,
      listed: null,
    });
  for (const m of html.matchAll(
    /SHA256 Sum:\s*([0-9a-f]{64})[\s\S]{0,800}?location\.href='(https:\/\/iso\.pop-os\.org\/(\d+\.\d+)\/(amd64|arm64)\/([a-z]+)\/\d+\/[^']+\.iso)'/g,
  ))
    offers.push({
      version: m[3] as string,
      channel: m[5] as string,
      arch: m[4] as ApiArch,
      listed: { url: m[2] as string, sha: m[1] as string },
    });
  if (!offers.length) throw new Error("the Pop!_OS download page offers no image");
  return offers;
}

export default defineSource({
  slug: "pop-os",
  hosts: ["iso.pop-os.org"],
  async releases(ctx) {
    const html = await getText(PAGE);
    const offers = parseOffers(html);
    const eol = await endOfLife("pop-os");

    const versions = [...new Set(offers.map((o) => o.version))].sort((a, b) =>
      compareVersions(b, a),
    );
    const releases: Release[] = [];
    for (const version of versions) {
      const cycle = eol.cycles.find((c) => c.name === version);
      if (cycle?.eol && cycle.eol < ctx.today) continue;
      const editions = new Map<string, Edition>();
      for (const offer of offers.filter((o) => o.version === version)) {
        const def = EDITIONS[offer.channel];
        if (!def) throw new Error(`unknown Pop!_OS channel "${offer.channel}" (${version})`);
        const build = await getJson<Build>(`${API}${version}/${offer.channel}?arch=${offer.arch}`);
        const m = build.url.match(
          /^https:\/\/iso\.pop-os\.org\/(\d+\.\d+)\/(amd64|arm64)\/([a-z]+)\/\d+\/([^/]+\.iso)$/,
        );
        if (
          !m ||
          m[1] !== version ||
          m[2] !== offer.arch ||
          m[3] !== offer.channel ||
          !/^[0-9a-f]{64}$/.test(build.sha_sum) ||
          !(build.size > 0)
        )
          throw new Error(
            `unexpected build answer for Pop!_OS ${version} ${offer.channel} ${offer.arch}`,
          );
        const file = m[4] as string;
        if (offer.listed && (offer.listed.url !== build.url || offer.listed.sha !== build.sha_sum))
          throw new Error(`the Pop!_OS download page and API disagree for ${file}`);
        const dir = build.url.slice(0, build.url.length - file.length);
        const sha = parseChecksums(await getText(`${dir}SHA256SUMS`)).get(file);
        if (sha !== build.sha_sum)
          throw new Error(`${dir}SHA256SUMS and the Pop!_OS API disagree for ${file}`);
        const edition = editions.get(def.id) ?? {
          id: def.id,
          name: def.name,
          desktop: compareVersions(version, "24.04") >= 0 ? "cosmic" : "gnome",
          kind: "desktop",
          artifacts: [],
        };
        edition.artifacts.push({
          arch: ARCH[offer.arch],
          format: "iso",
          file,
          path: build.url.slice(ISO.length),
          url: build.url,
          size: build.size,
          checksum: { type: "sha256", value: sha, url: `${dir}SHA256SUMS` },
          signatureUrl: null,
          torrentUrl: null,
        });
        editions.set(def.id, edition);
      }
      releases.push({
        version,
        channel: html.includes(`Pop!_OS ${version} LTS`) || cycle?.lts ? "lts" : "stable",
        codename: null,
        releaseDate: cycle?.releaseDate ?? null,
        eol: cycle?.eol ?? null,
        notesUrl: null,
        editions: [...editions.values()].sort((a, b) => a.id.localeCompare(b.id)),
      });
    }
    if (!releases.length) throw new Error("no supported Pop!_OS release on the download page");
    return { sources: [PAGE, API, eol.url], releases };
  },
  async mirrors() {
    return { sources: [PAGE], mirrors: [originAsMirror(ISO, "Pop!_OS ISO CDN")] };
  },
});
