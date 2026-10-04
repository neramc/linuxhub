/**
 * KDE neon (User Edition): the official download page names the current
 * User Edition images on files.kde.org, KDE's Mirrorbits redirector, which
 * sends each visitor to a nearby mirror. The SHA-256 comes from the
 * redirector itself ("<file>?sha256" is answered by files.kde.org from the
 * origin copy, not by a mirror); the image directory listing tells which
 * .sha256sum, .sig and .torrent files exist. Images are rebuilt on top of the
 * Ubuntu LTS base as KDE ships new Plasma releases, so each build is tracked
 * as a dated snapshot. Testing/Unstable/Developer images are pre-release and
 * left out.
 */

import type { Artifact, Edition, Release } from "../../../src/lib/data-schemas";
import { getText, headSize } from "../http";
import { parseChecksums } from "../lib/checksums";
import { listDirectory } from "../lib/dirlist";
import { defineSource } from "../source";

const DOWNLOAD = "https://neon.kde.org/download";
const IMAGES = "https://files.kde.org/neon/images/";

const EDITIONS: { image: string; id: string; name: string; kind: Edition["kind"] }[] = [
  { image: "desktop", id: "desktop", name: "Desktop", kind: "desktop" },
  { image: "mobile", id: "mobile", name: "Plasma Mobile", kind: "other" },
  { image: "bigscreen", id: "bigscreen", name: "Plasma Bigscreen", kind: "other" },
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "20260903-0454" → "2026-09-03". */
const day = (stamp: string) => `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`;

export default defineSource({
  slug: "kde-neon",
  hosts: ["files.kde.org"],
  async releases() {
    const page = await getText(DOWNLOAD, { accept: "text/html" });
    const editions: Edition[] = [];
    let desktopStamp: string | null = null;
    for (const def of EDITIONS) {
      const re = new RegExp(
        `${escapeRe(IMAGES)}${def.image}/user/(\\d{8}-\\d{4})/neon-user-${def.image}-\\1\\.iso(?=")`,
      );
      const stamp = page.match(re)?.[1];
      if (!stamp) continue;
      const dir = `${IMAGES}${def.image}/user/${stamp}/`;
      const file = `neon-user-${def.image}-${stamp}.iso`;
      const listing = await listDirectory(dir);
      if (!listing.includes(file)) continue;
      const sha = parseChecksums(await getText(`${dir}${file}?sha256`, { noCache: true })).get(
        file,
      );
      if (!sha) continue;
      const sumFile = `neon-user-${def.image}-${stamp}.sha256sum`;
      const artifact: Artifact = {
        arch: "x86_64",
        format: "iso",
        file,
        path: null,
        url: `${dir}${file}`,
        size: await headSize(`${dir}${file}`),
        checksum: {
          type: "sha256",
          value: sha,
          url: listing.includes(sumFile) ? `${dir}${sumFile}` : null,
        },
        signatureUrl: listing.includes(`${file}.sig`) ? `${dir}${file}.sig` : null,
        torrentUrl: listing.includes(`${file}.torrent`) ? `${dir}${file}.torrent` : null,
      };
      if (def.image === "desktop") desktopStamp = stamp;
      editions.push({
        id: def.id,
        name: def.name,
        desktop: "kde",
        kind: def.kind,
        artifacts: [artifact],
      });
    }
    if (!desktopStamp)
      throw new Error("no Desktop User Edition image on the official download page");

    const date = day(desktopStamp);
    const releases: Release[] = [
      {
        version: date.replaceAll("-", "."),
        channel: "rolling",
        codename: null,
        releaseDate: date,
        eol: null,
        notesUrl: null,
        editions,
      },
    ];
    return { sources: [DOWNLOAD, `${IMAGES}desktop/user/`], releases };
  },
});
