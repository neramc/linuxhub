/**
 * Vanilla OS: the official download page (vanillaos.org/download, then
 * /download/reunion/stable) is a client-rendered app that loads exactly one
 * file, https://info.vanillaos.org/downloads.json, and offers every entry as
 * an architecture choice: ISO URL, SHA-256 file URL and build date, served
 * from download.vanillaos.org. That JSON is the source of the files; the
 * SHA-256 file next to each ISO (GNU "hash  file") is the checksum, and a
 * listed file without a matching checksum line throws. The major version
 * comes from the image name (Vanilla-OS-3-stable-amd64.20260828.iso). Its
 * codename, release date and announcement come from the "Vanilla OS <major>
 * <Codename> - Stable Release" post in the official blog feed
 * (vanillaos.org/feed.xml, Atom; the feed only carries the day), which must
 * exist for the major or the sync throws.
 *
 * The ISOs are rebuilt in place under the same name for the same major, so a
 * checksum can change without a new version. Vanilla OS has one image per
 * architecture (amd64 and, since Vanilla OS 3, arm64), both with GNOME, and
 * publishes no signature, no torrent and no sizes (the runner does one HEAD
 * per file). download.vanillaos.org is the only host: no mirror network, no
 * redirector, so the mirrors file holds that origin, without a country
 * because no official page says where it runs.
 *
 * Excluded: the Vanilla OS 2 Orchid Alpha/Beta pages (/download/orchid/*) are
 * routes of the site's app that the download page does not link and that load
 * development builds, and Orchid and Vanilla OS 22.10 Kinetic are no longer
 * offered. No EOL date is published for Vanilla OS 3, so eol is null.
 */

import type { Artifact, Release } from "../../../src/lib/data-schemas";
import { getJson, getText } from "../http";
import { parseChecksums } from "../lib/checksums";
import { originAsMirror } from "../lib/mirrors";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const DOWNLOADS = "https://info.vanillaos.org/downloads.json";
const FEED = "https://vanillaos.org/feed.xml";
const ORIGIN = "https://download.vanillaos.org/";

interface Download {
  Arch?: string;
  Date?: string;
  Iso?: string;
  Sha256?: string;
}

const ARCHES: Record<string, Artifact["arch"]> = { amd64: "x86_64", arm64: "aarch64" };

/** Codename, day and link of the "Vanilla OS <major> <Codename> - Stable Release" post. */
async function announcement(
  major: string,
): Promise<{ codename: string; date: string; url: string }> {
  const xml = await getText(FEED, { accept: "application/atom+xml" });
  for (const entry of xml.split("<entry>").slice(1)) {
    const title = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? "";
    const m = title.match(new RegExp(`^Vanilla OS ${major} ([A-Za-z]+) - Stable Release$`));
    const date = entry.match(/<(?:published|updated)>(\d{4}-\d{2}-\d{2})/)?.[1];
    const url = entry.match(/<link[^>]*href="(https:\/\/[^"]+)"/)?.[1];
    if (m?.[1] && date && url) return { codename: m[1], date, url };
  }
  throw new Error(`no "Vanilla OS ${major} <Codename> - Stable Release" post in ${FEED}`);
}

export default defineSource({
  slug: "vanilla-os",
  hosts: ["download.vanillaos.org"],
  async releases() {
    const downloads = await getJson<Download[]>(DOWNLOADS);
    if (!Array.isArray(downloads) || !downloads.length)
      throw new Error(`${DOWNLOADS} lists no images`);

    const byMajor = new Map<string, Artifact[]>();
    for (const d of downloads) {
      const arch = ARCHES[d.Arch ?? ""];
      const file = d.Iso?.split("/").pop() ?? "";
      const major = file.match(/^Vanilla-OS-(\d+)-stable-[a-z0-9]+\.\d{8}\.iso$/)?.[1];
      if (!arch || !major || !d.Iso?.startsWith(ORIGIN) || !d.Sha256?.startsWith(ORIGIN))
        throw new Error(`unexpected entry in ${DOWNLOADS}: ${JSON.stringify(d)}`);
      const sha = parseChecksums(await getText(d.Sha256)).get(file);
      if (!sha || !/^[0-9a-f]{64}$/.test(sha))
        throw new Error(`${d.Sha256} has no SHA-256 for ${file}`);
      const artifacts = byMajor.get(major) ?? [];
      artifacts.push({
        arch,
        format: "iso",
        file,
        path: file,
        url: d.Iso,
        size: null,
        checksum: { type: "sha256", value: sha, url: d.Sha256 },
        signatureUrl: null,
        torrentUrl: null,
      });
      byMajor.set(major, artifacts);
    }

    const releases: Release[] = [];
    for (const major of [...byMajor.keys()].sort((a, b) => compareVersions(b, a))) {
      const artifacts = byMajor.get(major) ?? [];
      if (!artifacts.some((a) => a.arch === "x86_64"))
        throw new Error(`Vanilla OS ${major}: no amd64 image in ${DOWNLOADS}`);
      const post = await announcement(major);
      releases.push({
        version: major,
        channel: "stable",
        codename: post.codename,
        releaseDate: post.date,
        eol: null,
        notesUrl: post.url,
        editions: [
          { id: "desktop", name: "Vanilla OS", desktop: "gnome", kind: "desktop", artifacts },
        ],
      });
    }
    return { sources: [DOWNLOADS, FEED], releases };
  },
  async mirrors() {
    return { sources: [DOWNLOADS], mirrors: [originAsMirror(ORIGIN, "download.vanillaos.org")] };
  },
});
