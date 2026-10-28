/**
 * Zorin OS. Zorin publishes no machine-readable release data, so four of its
 * own pages are combined, each for what it officially states:
 *
 * - help.zorin.com "Check the integrity of your copy of Zorin OS": the
 *   official SHA-256 list ("Zorin OS 18.1 Core 64-bit: <hash>", respins as
 *   "(r2)"). It names the current point release of every supported line and
 *   is the only checksum publication on Zorin's own hosts (the tree's
 *   SHA256SUMS.txt lives on a mirror and is only used as a cross-check: a
 *   disagreement throws).
 * - zorin.com/os/download/: names the release the download page offers now;
 *   it must equal the newest version of the checksum list, so a release the
 *   help page has not caught up with yet fails instead of shipping old data.
 * - mirrors.edge.kernel.org/zorinos-isos/<major>/: the "World" entry of
 *   Zorin's official mirror list (GeoDNS) and the public file tree. An image
 *   is offered only when its file is in that tree: Pro, Pro Lite and Core PA
 *   are on the checksum list but not public (Pro is paid and is mailed after
 *   purchase), so they are excluded. The download page links Core and
 *   Education; Lite is linked from it and Zorin's Lite page states that Lite
 *   stays available in the 17 and 18 series. Older respins (-r1, unsuffixed)
 *   and the 18 Beta files are superseded or pre-release and are not listed.
 * - blog.zorin.com: the release post (the date and notes link come from the
 *   post's path in sitemap.xml) and its "until <Month Year>" support
 *   sentence. Zorin states month and year only, so EOL is the last day of
 *   that month (periodEnd). A line whose post says "Long-Term Support" is
 *   channel lts, else stable. endoflife.date has no Zorin OS product.
 *
 * Mirrors: the official list at zorin.com/os/mirrors/ (39 HTTPS entries with
 * "City, Country"; no coordinates or scores). Every root holds the same tree
 * as the World mirror, so root + "<major>/<file>" is the file. The list gives
 * no country for Kernel.org (World) and only "Taipei" for NCHC, which is
 * mapped to TW here.
 *
 * Not included, for every distro alike: betas that Zorin offers only through
 * a blog post (the 18 Beta was never on the download page), the unverifiable
 * zrn.co short links (no HEAD, and GET would stream the image), and lines
 * past EOL (16 ended April 2025). No arm64 or 32-bit images exist. Zorin
 * publishes no signatures and no torrents. Sizes are left to the runner (one
 * HEAD on kernel.org per file).
 */

import type { Artifact, Edition, Mirror, Release } from "../../../src/lib/data-schemas";
import type { Desktop } from "../../../src/lib/taxonomy";
import { getText } from "../http";
import { parseChecksums } from "../lib/checksums";
import { listDirectory } from "../lib/dirlist";
import { countryCode, withSlash } from "../lib/mirrors";
import { compareVersions, periodEnd } from "../lib/versions";
import { defineSource } from "../source";

const SUMS_PAGE =
  "https://help.zorin.com/docs/getting-started/check-the-integrity-of-your-copy-of-zorin-os/";
const SUMS_URL = `${SUMS_PAGE}#correct-sha256-checksums`;
const DOWNLOAD_PAGE = "https://zorin.com/os/download/";
const MIRRORS_PAGE = "https://zorin.com/os/mirrors/";
const TREE = "https://mirrors.edge.kernel.org/zorinos-isos/";
const BLOG = "https://blog.zorin.com";
const SITEMAP = `${BLOG}/sitemap.xml`;

/** Public editions: the name Zorin uses on the checksum page → edition. */
const EDITIONS: Record<string, { id: string; desktop: Desktop }> = {
  Core: { id: "core", desktop: "gnome" },
  Education: { id: "education", desktop: "gnome" },
  Lite: { id: "lite", desktop: "xfce" },
};

/** Locations the official list gives without a country. */
const CITY_COUNTRY: Record<string, string> = { Taipei: "TW" };

interface Listed {
  version: string;
  edition: string;
  respin: number;
  sha256: string;
}

const text = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .trim();

/** Every "Zorin OS <ver> <Edition> 64-bit[ (rN)]: <sha256>" row of the official checksum page. */
function parseSumsPage(html: string): Listed[] {
  const out: Listed[] = [];
  for (const m of html.matchAll(
    /<strong>Zorin OS (\d+(?:\.\d+)?) ([A-Za-z][A-Za-z ]*?) 64-bit(?: \(r(\d+)\))?:<\/strong>\s*<code>([0-9a-f]{64})<\/code>/g,
  )) {
    const [, version, edition, respin, sha256] = m;
    if (version && edition && sha256)
      out.push({ version, edition, respin: Number(respin ?? 0), sha256 });
  }
  return out;
}

const fileName = (l: Listed) =>
  `Zorin-OS-${l.version}-${l.edition.replace(/ /g, "-")}-64-bit${l.respin ? `-r${l.respin}` : ""}.iso`;

interface Post {
  url: string;
  date: string;
}

/** Release posts by version, from the blog sitemap ("…/2026/04/15/zorin-os-18.1-is-released/"); earliest wins. */
function releasePosts(sitemap: string): Map<string, Post> {
  const posts = new Map<string, Post>();
  for (const m of sitemap.matchAll(
    /<loc>(https:\/\/blog\.zorin\.com\/(\d{4})\/(\d{2})\/(\d{2})\/zorin-os-(\d+(?:\.\d+)?)-(?:is|has)-[a-z-]+\/)<\/loc>/g,
  )) {
    const [, url, y, mo, d, version] = m;
    if (!url || !version) continue;
    const date = `${y}-${mo}-${d}`;
    const known = posts.get(version);
    if (!known || date < known.date) posts.set(version, { url, date });
  }
  return posts;
}

/** The "until <Month Year>" support sentence of a release post, as the last day of that month. */
function supportEnd(post: string): string | null {
  const m = text(post).match(/\buntil (?:at least )?([A-Z][a-z]+) (\d{4})\b/);
  return m?.[1] && m[2] ? periodEnd(`${m[1]} ${m[2]}`) : null;
}

export default defineSource({
  slug: "zorin-os",
  hosts: ["mirrors.edge.kernel.org", "help.zorin.com"],
  async releases(ctx) {
    const listed = parseSumsPage(await getText(SUMS_PAGE, { accept: "text/html" }));
    if (!listed.length) throw new Error(`no checksums found on ${SUMS_PAGE}`);

    // The newest point release of every line the checksum page names.
    const newest = new Map<string, string>();
    for (const l of listed) {
      const major = l.version.split(".")[0] as string;
      const known = newest.get(major);
      if (!known || compareVersions(l.version, known) > 0) newest.set(major, l.version);
    }
    const top = [...newest.values()].sort((a, b) => compareVersions(b, a))[0] as string;

    // The download page must offer the same newest release.
    const offered = (await getText(DOWNLOAD_PAGE, { accept: "text/html" })).match(
      /Zorin OS (\d+(?:\.\d+)?)<\/span> Core/,
    )?.[1];
    if (!offered) throw new Error(`no Core edition found on ${DOWNLOAD_PAGE}`);
    if (offered !== top)
      throw new Error(`${DOWNLOAD_PAGE} offers Zorin OS ${offered}, the checksum list ${top}`);

    const posts = releasePosts(await getText(SITEMAP, { accept: "application/xml" }));
    const releases: Release[] = [];
    for (const [major, version] of [...newest].sort((a, b) => compareVersions(b[1], a[1]))) {
      const tree = `${TREE}${major}/`;
      const names = new Set(await listDirectory(tree));
      const treeSums = parseChecksums(await getText(`${tree}SHA256SUMS.txt`));

      // Newest respin of each edition at this version.
      const best = new Map<string, Listed>();
      for (const l of listed.filter((x) => x.version === version)) {
        const known = best.get(l.edition);
        if (!known || l.respin > known.respin) best.set(l.edition, l);
      }
      const editions: Edition[] = [];
      for (const l of [...best.values()].sort((a, b) => a.edition.localeCompare(b.edition))) {
        const file = fileName(l);
        const def = EDITIONS[l.edition];
        if (!names.has(file)) {
          // Not in the public tree: Pro, Pro Lite and Core PA (paid or not offered).
          ctx.log(`${file}: not public, skipped`);
          continue;
        }
        if (!def) throw new Error(`${file} is public but ${l.edition} is not a known edition`);
        const mirrorSum = treeSums.get(file);
        if (mirrorSum && mirrorSum !== l.sha256)
          throw new Error(
            `${file}: checksum differs between ${SUMS_PAGE} and ${tree}SHA256SUMS.txt`,
          );
        const artifact: Artifact = {
          arch: "x86_64",
          format: "iso",
          file,
          path: `${major}/${file}`,
          url: `${tree}${file}`,
          size: null,
          checksum: { type: "sha256", value: l.sha256, url: SUMS_URL },
          signatureUrl: null,
          torrentUrl: null,
        };
        editions.push({
          id: def.id,
          name: l.edition,
          desktop: def.desktop,
          kind: "desktop",
          artifacts: [artifact],
        });
      }
      if (!editions.some((e) => e.id === "core"))
        throw new Error(`Zorin OS ${version}: no public Core image in ${tree}`);

      const post = posts.get(version);
      if (!post) throw new Error(`no release post for Zorin OS ${version} in ${SITEMAP}`);
      const first = posts.get(major);
      const [postHtml, firstHtml] = await Promise.all([
        getText(post.url, { accept: "text/html" }),
        first && first.url !== post.url ? getText(first.url, { accept: "text/html" }) : "",
      ]);
      const eol = supportEnd(postHtml) ?? supportEnd(firstHtml);
      if (eol && eol < ctx.today) {
        ctx.log(`Zorin OS ${major} ended ${eol}, skipped`);
        continue;
      }
      releases.push({
        version,
        channel: /long-term support/i.test(text(`${postHtml} ${firstHtml}`)) ? "lts" : "stable",
        codename: null,
        releaseDate: post.date,
        eol,
        notesUrl: post.url,
        editions,
      });
    }
    if (!releases.length) throw new Error("no supported Zorin OS release found");
    return {
      sources: [
        SUMS_PAGE,
        DOWNLOAD_PAGE,
        TREE,
        SITEMAP,
        ...releases.map((r) => r.notesUrl ?? ""),
      ].filter(Boolean),
      releases,
    };
  },
  async mirrors() {
    const html = await getText(MIRRORS_PAGE, { accept: "text/html" });
    const section = html.slice(0, html.indexOf("Want to mirror Zorin OS"));
    const mirrors: Mirror[] = [];
    for (const m of section.matchAll(
      /<td class="font-700"><a href="(https:\/\/[^"]+)"[^>]*>([^<]+)<\/a><\/td>(?:\s*<td>([^<]*)<\/td>)?/g,
    )) {
      const [, url, name, location] = m;
      if (!url || !name) continue;
      const place = decode(location ?? "");
      const country = place ? (CITY_COUNTRY[place] ?? countryCode(place.split(",").pop())) : null;
      mirrors.push({
        url: withSlash(url),
        country,
        name: decode(name),
        lat: null,
        lon: null,
        score: null,
      });
    }
    if (!mirrors.some((m) => m.url === TREE))
      throw new Error(`the World mirror ${TREE} is missing from ${MIRRORS_PAGE}`);
    return { sources: [MIRRORS_PAGE], mirrors };
  },
});
