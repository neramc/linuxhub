/**
 * Raspberry Pi OS (download strategy "official-page"): the newest published
 * image build of the current line (its image date and Debian codename), no
 * files.
 *
 * Why no files, checksums, sizes or mirror list: every place where Raspberry
 * Pi publishes them is closed to bots. downloads.raspberrypi.com and
 * downloads.raspberrypi.org (image folders, .sha256/.sig/.torrent, the
 * Imager's os_list JSON) answer "User-agent: * / Disallow: /" in robots.txt,
 * and www.raspberrypi.com (the download page, documentation, news pages,
 * forums) answers every non-browser request with HTTP 403 (bot challenge).
 * Sync is bound by robots.txt (CLAUDE.md rule 6) and never impersonates a
 * browser, so nothing under those hosts is requested and no file name, URL,
 * size or checksum is guessed. The download panel therefore points visitors
 * to the official download page (strategy "official-page"); this release
 * entry carries only what the project publishes in a place bots may read.
 * The same rule applies to the sizes run.ts would fill: there is no file to
 * ask about.
 *
 * Official sources used:
 * - github.com/RPi-Distro/pi-gen (the project's image build repository; its
 *   tags are the build record). Every published image build is tagged
 *   "<YYYY-MM-DD>-raspios-<debian codename>-<arm64|armhf>", the date being
 *   the image date the download page shows as the release date. The tag
 *   list is read from the repository's git ref advertisement
 *   (info/refs?service=git-upload-pack, one small request that needs no API
 *   token and has no rate limit), the same data `git ls-remote --tags` prints.
 * - deb.debian.org/debian/dists/stable/Release: the Debian codename that is
 *   stable today. Raspberry Pi OS follows Debian stable with a delay and
 *   also tags builds for the next Debian while it is still in testing, so the
 *   current line is the newest codename that is not newer than Debian stable.
 *
 * Deviations from the shared policy (nothing else could be read):
 * - editions is empty: the editions, architectures, formats, files and
 *   checksums of the download page cannot be read (see above). Nothing the
 *   page offers is claimed.
 * - Older Debian bases that Raspberry Pi keeps building as "Legacy" images
 *   are not listed: which of them the download page still offers cannot be
 *   read, and a second line would share the image date as its version.
 * - No end-of-support date: Raspberry Pi publishes none and endoflife.date
 *   has no Raspberry Pi OS product, so eol is null.
 * - The one mirror is the official image host (originAsMirror, country
 *   unknown); the host can neither be probed (robots.txt) nor lists mirrors.
 *   The release notes URL is the project's own release_notes.txt next to the
 *   images (not requested, for the same reason).
 *
 * Fails closed: a tag list without the expected tags, a Debian stable
 * codename this module does not know, or no tag for the current line throws.
 */

import type { Release } from "../../../src/lib/data-schemas";
import { getText } from "../http";
import { originAsMirror } from "../lib/mirrors";
import { defineSource } from "../source";

const REFS = "https://github.com/RPi-Distro/pi-gen/info/refs?service=git-upload-pack";
const TAGS_PAGE = "https://github.com/RPi-Distro/pi-gen/tags";
const DEBIAN_STABLE = "https://deb.debian.org/debian/dists/stable/Release";
const IMAGES = "https://downloads.raspberrypi.com/";
const RELEASE_NOTES = `${IMAGES}raspios_arm64/release_notes.txt`;

/** Debian codenames in release order. A new Debian stable must be added here (the sync fails until then). */
const DEBIAN = ["buster", "bullseye", "bookworm", "trixie", "forky", "duke"];

export default defineSource({
  slug: "raspberry-pi-os",
  hosts: ["downloads.raspberrypi.com"],

  async releases() {
    const stable = (await getText(DEBIAN_STABLE)).match(/^Codename:\s*([a-z]+)\s*$/m)?.[1];
    const stableRank = stable ? DEBIAN.indexOf(stable) : -1;
    if (!stable || stableRank < 0)
      throw new Error(`Debian stable codename "${stable}" is not in this module's list`);

    // codename → newest image date tagged for it
    const newest = new Map<string, string>();
    const refs = await getText(REFS);
    for (const m of refs.matchAll(
      / refs\/tags\/(\d{4}-\d{2}-\d{2})-raspios-([a-z]+)(?:-(?:arm64|armhf))?(?=\s|$)/gm,
    )) {
      const [, date, codename] = m;
      if (!date || !codename || (newest.get(codename) ?? "") >= date) continue;
      newest.set(codename, date);
    }
    if (newest.size === 0)
      throw new Error("no <date>-raspios-<codename> tags in RPi-Distro/pi-gen");

    // The current line: the newest Debian base that is not newer than Debian stable.
    const codename = [...newest.keys()]
      .filter((c) => DEBIAN.indexOf(c) >= 0 && DEBIAN.indexOf(c) <= stableRank)
      .sort((a, b) => DEBIAN.indexOf(b) - DEBIAN.indexOf(a))[0];
    const date = codename ? newest.get(codename) : undefined;
    if (!codename || !date)
      throw new Error(`no Raspberry Pi OS image tag for Debian ${stable} or older`);

    const releases: Release[] = [
      {
        version: date,
        channel: "stable",
        codename: codename.charAt(0).toUpperCase() + codename.slice(1),
        releaseDate: date,
        eol: null,
        notesUrl: RELEASE_NOTES,
        editions: [],
      },
    ];
    return { sources: [TAGS_PAGE, DEBIAN_STABLE], releases };
  },

  async mirrors() {
    return {
      sources: [IMAGES],
      mirrors: [originAsMirror(IMAGES, "downloads.raspberrypi.com")],
    };
  },
});
