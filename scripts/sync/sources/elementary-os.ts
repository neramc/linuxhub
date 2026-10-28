/**
 * elementary OS (download strategy "official-page"): the release that
 * elementary.io offers now, as two installer images (Intel/AMD and ARM, one
 * Pantheon edition each) with exact sizes and SHA-256 sums.
 *
 * Why the files carry no direct link: the page's download buttons point to
 * https://dl.elementaryos.org/<token>/<file>, where the token is the time the
 * page was rendered (base64 of the Unix time); an old token answers HTTP 400.
 * Such a URL would change on every run, so each artifact's `url` is the
 * official download page itself (https://elementary.io/) and `path` is null.
 * The same host serves no mirror tree, so the mirrors file holds that origin
 * only (originAsMirror, like every project with a single origin; no country
 * is published), and the download panel sends visitors to the official page.
 *
 * Official sources, and what each one is used for:
 * - elementary.io (home page): the release the download button offers ("elementary
 *   OS 8.1.1 Circe (3.3 GB)": version, code name) and the two "Choose a
 *   Download" links (Intel or AMD 64-bit, ARM 64-bit) whose file names
 *   (elementaryos-8.1-stable-amd64.20260219.iso) name the image build. The
 *   image's version prefix must match the release version, or the sync throws.
 * - The same links, read with a HEAD request (never the image): the
 *   Content-Length is the exact size, since the page rounds it. run.ts cannot
 *   do this itself (it would ask the page URL, not the expiring link), so the
 *   size is read here from the official download link.
 * - elementary.io/docs/installation ("Verify Your Download"): the SHA-256 of
 *   each image, printed for Windows, macOS and Linux. All three must agree and
 *   every image must have one, or the sync throws. It is the checksum URL, as
 *   the stable page that publishes the sums. The project also keeps
 *   <image>.sha256.txt next to each image (only reachable through the
 *   expiring link, never linked on a page); it is read as well and must
 *   agree with the page when it exists.
 * - blog.elementary.io/os-<version>-available-now/: the release announcement
 *   (release notes link). Its publication date is the release date; the post's
 *   title must be "elementary OS <version> Available Now". When no such post
 *   exists, date and notes link are null.
 *
 * No endoflife.date product exists for elementary OS and the project publishes
 * no end-of-support date, so eol is null.
 *
 * Deviations from the shared policy (nothing else can be read or linked):
 * - Only the current release: the download page offers no other line, and no
 *   page links older images, so no second line is listed.
 * - torrentUrl is null: only magnet links (not https) and an expiring
 *   <image>.torrent URL are published. No signature is published either.
 */

import type { Artifact, Release } from "../../../src/lib/data-schemas";
import { getText, HttpError, request } from "../http";
import { parseChecksums } from "../lib/checksums";
import { originAsMirror } from "../lib/mirrors";
import { isoDay } from "../lib/versions";
import { defineSource } from "../source";

const HOME = "https://elementary.io/";
const DOCS = "https://elementary.io/docs/installation";
const BLOG = "https://blog.elementary.io/";
const DOWNLOAD_HOST = "https://dl.elementaryos.org/";

const ARCHES: Record<string, Artifact["arch"]> = { x86: "x86_64", arm: "aarch64" };

interface Offer {
  arch: Artifact["arch"];
  /** The expiring download link as the page renders it now (never stored). */
  link: string;
  file: string;
}

function parseOffers(html: string, isoVersion: string): Offer[] {
  const offers: Offer[] = [];
  for (const m of html.matchAll(
    /<a\b[^>]*class="[^"]*\bdownload-link\b[^"]*\bhttp\b[^"]*\b(x86|arm)\b[^"]*"[^>]*href="([^"]+)"/g,
  )) {
    const link = m[2] ?? "";
    const file = link.match(
      /^https:\/\/dl\.elementaryos\.org\/[^/]+\/(elementaryos-(\d+(?:\.\d+)*)-stable-(?:amd64|arm64)\.\d{8}\.iso)$/,
    );
    if (!file?.[1] || file[2] !== isoVersion)
      throw new Error(`unexpected elementary OS download link ${link}`);
    const arch = ARCHES[m[1] ?? ""];
    if (!arch) throw new Error(`unexpected elementary OS download link ${link}`);
    offers.push({ arch, link, file: file[1] });
  }
  if (!offers.some((o) => o.arch === "x86_64"))
    throw new Error("the elementary OS download dialog offers no Intel or AMD image");
  return offers;
}

/** SHA-256 per image from the installation docs: every mention must agree. */
function docsChecksums(html: string): Map<string, string> {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&");
  const found = new Map<string, Set<string>>();
  let file: string | null = null;
  for (const m of text.matchAll(/elementaryos-[A-Za-z0-9._-]+?\.iso|\b[0-9a-f]{64}\b/g)) {
    const token = m[0];
    if (token.endsWith(".iso")) file = token;
    else if (file) found.set(file, (found.get(file) ?? new Set()).add(token));
  }
  const out = new Map<string, string>();
  for (const [name, sums] of found) {
    if (sums.size !== 1)
      throw new Error(`the elementary OS installation page gives different checksums for ${name}`);
    out.set(name, [...sums][0] as string);
  }
  return out;
}

/** The exact size from the official download link (HEAD only); a missing length throws. */
async function officialSize(link: string): Promise<number> {
  const length = Number(
    (await request(link, { method: "HEAD", noCache: true })).headers.get("content-length"),
  );
  if (!Number.isInteger(length) || length <= 0)
    throw new Error(`the elementary OS download link reports no size: ${link.split("/").pop()}`);
  return length;
}

export default defineSource({
  slug: "elementary-os",
  hosts: ["elementary.io"],
  async releases() {
    const home = await getText(HOME);
    const label = home.match(/elementary OS (\d+(?:\.\d+)+) ([A-Za-z]+) \(([\d.]+) GB\)/);
    const version = label?.[1];
    const codename = label?.[2];
    if (!version || !codename)
      throw new Error("the elementary OS home page no longer names the release it offers");
    const isoVersion = version.split(".").slice(0, 2).join(".");
    if (!home.includes('id="download-modal"'))
      throw new Error("the elementary OS home page has no download dialog");
    const offers = parseOffers(home, isoVersion);

    const docs = docsChecksums(await getText(DOCS));
    const artifacts: Artifact[] = [];
    for (const offer of offers) {
      const sha = docs.get(offer.file);
      if (!sha)
        throw new Error(`the elementary OS installation page lists no SHA-256 for ${offer.file}`);
      try {
        const file = parseChecksums(await getText(`${offer.link}.sha256.txt`)).get(offer.file);
        if (file && file !== sha)
          throw new Error(
            `the elementary OS checksum file and installation page disagree for ${offer.file}`,
          );
      } catch (error) {
        if (!(error instanceof HttpError && error.status === 404)) throw error;
      }
      artifacts.push({
        arch: offer.arch,
        format: "iso",
        file: offer.file,
        path: null,
        url: HOME,
        size: await officialSize(offer.link),
        checksum: { type: "sha256", value: sha, url: DOCS },
        signatureUrl: null,
        torrentUrl: null,
      });
    }

    const post = `${BLOG}os-${version.replaceAll(".", "-")}-available-now/`;
    let releaseDate: string | null = null;
    let notesUrl: string | null = null;
    try {
      const html = await getText(post);
      const title = html
        .match(/<meta property="og:title" content="([^"]*)"/)?.[1]
        ?.replace(/&nbsp;/g, " ");
      if (title !== `elementary OS ${version} Available Now`)
        throw new Error(`unexpected title "${title}" on the release announcement ${post}`);
      releaseDate = isoDay(html.match(/<time class="post-date" datetime="([^"]+)"/)?.[1]);
      if (!releaseDate) throw new Error(`no publication date on the release announcement ${post}`);
      notesUrl = post;
    } catch (error) {
      if (!(error instanceof HttpError && error.status === 404)) throw error;
    }

    const release: Release = {
      version,
      channel: "stable",
      codename,
      releaseDate,
      eol: null,
      notesUrl,
      editions: [
        {
          id: "elementary-os",
          name: "elementary OS",
          desktop: "pantheon",
          kind: "desktop",
          artifacts,
        },
      ],
    };
    return { sources: [HOME, DOCS, ...(notesUrl ? [notesUrl] : [])], releases: [release] };
  },
  async mirrors() {
    return {
      sources: [HOME],
      mirrors: [originAsMirror(DOWNLOAD_HOST, "elementary OS download server")],
    };
  },
});
