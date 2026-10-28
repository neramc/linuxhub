/**
 * Nobara.
 *
 * Official sources and what they are used for:
 * - nobaraproject.org/download.html: the official download page. One section
 *   per offered version ("Nobara 44 downloads") with a row per edition: its
 *   name, the image file name and URL on nobara-images.nobaraproject.org (the
 *   project's CDN) and the link to the `<file>.sha256sum` next to it. This
 *   page alone decides which versions and editions are listed. Every row is a
 *   unified image for AMD/Intel and NVIDIA systems, x86_64 only.
 * - nobara-images.nobaraproject.org (the project's origin): the
 *   `<file>.sha256sum` of each image (SHA-256). A listed image without one is
 *   a format change and throws.
 *
 * Dates: Nobara has been a semi-rolling release since version 41 (the wiki's
 * "Upgrading Nobara" page) and publishes no end-of-life dates, no release
 * announcements (the changelog link on its home page is dead) and is not on
 * endoflife.date. The date in an image's file name is the day it was respun,
 * not the day the version came out, so `releaseDate` and `eol` stay null.
 *
 * Mirrors: the project serves the ISOs from its CDN only (mirrors.nobaraproject
 * .org lists RPM repositories, not images), so the mirror list is that one
 * root (originAsMirror); mirror root + artifact.path is the image.
 *
 * Excluded: nothing the page offers. Nobara publishes no signature and no
 * torrent for its images (signatureUrl and torrentUrl are null). Sizes are
 * left to run.ts (one HEAD per image).
 */

import type { Artifact, Edition, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getText } from "../http";
import { parseChecksums } from "../lib/checksums";
import { originAsMirror } from "../lib/mirrors";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const PAGE = "https://nobaraproject.org/download.html";
const CDN = "https://nobara-images.nobaraproject.org/";

/** Editions the current download page is known to offer (a missing one is a format change). */
const KNOWN: Record<string, Desktop> = {
  official: "kde",
  gnome: "gnome",
  kde: "kde",
  "steam-htpc": "kde",
  "steam-handheld": "kde",
};

interface Row {
  id: string;
  name: string;
  version: string;
  file: string;
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** The download rows of the page: edition name, image file and the links beside it. */
function rows(html: string): Row[] {
  const out: Row[] = [];
  for (const body of html.split('<article class="card download-row"').slice(1)) {
    const name = body.match(/<h3>\s*([^<]+?)\s*<\/h3>/)?.[1];
    const iso = body.match(/data-iso="([^"]+)"/)?.[1];
    const url = body.match(/data-url="([^"]+)"/)?.[1];
    const sum = body.match(/href="([^"]+\.sha256sum)"/)?.[1];
    if (!name || !iso || !url || !sum) throw new Error(`unreadable download row on ${PAGE}`);
    const m = iso.match(/^Nobara-(\d+)-(.+)-\d{4}-\d{2}-\d{2}\.iso$/);
    if (!m?.[1] || !m[2] || url !== `${CDN}${iso}` || sum !== `${url}.sha256sum`)
      throw new Error(`unexpected Nobara download links for ${iso} on ${PAGE}`);
    if (slug(name) !== slug(m[2]))
      throw new Error(`Nobara row "${name}" does not match its file ${iso}`);
    out.push({ id: slug(name), name, version: m[1], file: iso });
  }
  return out;
}

export default defineSource({
  slug: "nobara",
  hosts: ["nobara-images.nobaraproject.org"],
  async releases() {
    const html = await getText(PAGE, { accept: "text/html" });
    const found = rows(html);
    if (!found.length) throw new Error(`no download rows on ${PAGE}`);
    const versions = [...new Set(found.map((r) => r.version))].sort((a, b) =>
      compareVersions(b, a),
    );
    for (const version of versions)
      if (!new RegExp(`<h2>\\s*Nobara ${version} downloads\\s*</h2>`).test(html))
        throw new Error(
          `${PAGE} has Nobara ${version} images but no "Nobara ${version} downloads"`,
        );

    const releases: Release[] = [];
    for (const version of versions) {
      const mine = found.filter((r) => r.version === version);
      const ids = mine.map((r) => r.id);
      if (new Set(ids).size !== ids.length)
        throw new Error(`Nobara ${version}: an edition is listed twice on ${PAGE}`);
      if (version === versions[0]) {
        const missing = Object.keys(KNOWN).filter((id) => !ids.includes(id));
        if (missing.length)
          throw new Error(`Nobara ${version}: ${missing.join(", ")} missing from ${PAGE}`);
      }
      const editions: Edition[] = [];
      for (const row of mine) {
        const sumUrl = `${CDN}${row.file}.sha256sum`;
        const sha256 = parseChecksums(await getText(sumUrl)).get(row.file);
        if (!sha256 || !/^[0-9a-f]{64}$/.test(sha256))
          throw new Error(`${sumUrl}: no SHA-256 for ${row.file}`);
        const artifact: Artifact = {
          arch: "x86_64",
          format: "iso",
          file: row.file,
          path: row.file,
          url: `${CDN}${row.file}`,
          size: null,
          checksum: { type: "sha256", value: sha256, url: sumUrl },
          signatureUrl: null,
          torrentUrl: null,
        };
        editions.push({
          id: row.id,
          name: row.name,
          desktop: KNOWN[row.id] ?? null,
          kind: "desktop",
          artifacts: [artifact],
        });
      }
      releases.push({
        version,
        channel: "stable",
        codename: null,
        releaseDate: null,
        eol: null,
        notesUrl: null,
        editions,
      });
    }
    return { sources: [PAGE], releases };
  },

  async mirrors() {
    // One official CDN root; every image is served from it under its own file name.
    return {
      sources: [PAGE],
      mirrors: [originAsMirror(CDN, "nobara-images.nobaraproject.org")],
    };
  },
});
