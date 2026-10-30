/**
 * Finds a free-licensed desktop screenshot for catalog distros (ADR-0018): the
 * screenshot in the infobox of the distro's English Wikipedia article
 * (scripts/sync/wikipedia-articles.ts), used only when the file is hosted on
 * Wikimedia Commons, which accepts free licenses only. Writes
 * src/assets/screenshots/<slug>.webp (at most 1280px wide; resized and
 * re-encoded, never cropped or edited) and prints the credit for the distro's
 * YAML. The alt text and caption are written by hand after looking at it.
 *
 * Only robots-allowed URLs are read, politely (scripts/sync/http.ts): the
 * article and the Commons file page (/wiki/…, not the disallowed /w/api.php),
 * and the image itself on upload.wikimedia.org.
 *
 * Usage: bun scripts/assets/screenshot.ts [--write] [--json=<file>] [slug...]
 *          [--file=<slug>:File:<name>]...
 *   without --write it only reports what it would use; --file picks a Commons
 *   file by hand (when the infobox has none, or an outdated one).
 */
import { existsSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { getText, HttpError, isAllowed, RobotsDisallowed, USER_AGENT } from "../sync/http";
import { WIKIPEDIA_ARTICLES } from "../sync/wikipedia-articles";

const MAX_WIDTH = 1280;
const args = process.argv.slice(2);
const write = args.includes("--write");
const jsonOut = args.find((a) => a.startsWith("--json="))?.slice(7);
const picked = new Map(
  args
    .filter((a) => a.startsWith("--file="))
    .map((a) => {
      const [slug, ...file] = a.slice(7).split(":");
      return [slug ?? "", file.join(":")] as const;
    }),
);
const only = [...args.filter((a) => !a.startsWith("--")), ...picked.keys()];

export interface Found {
  slug: string;
  article: string | null;
  file: string;
  source: string;
  author: string;
  license: string;
  licenseUrl: string | null;
  description: string;
  wikipediaCaption: string;
  date: string;
  width: number;
  height: number;
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

/** The Commons "Information" table row with this id (Author, Description, Date). */
function infoRow(html: string, id: string): string {
  const m = html.match(new RegExp(`id="${id}"[^>]*>[\\s\\S]*?</td>\\s*<td[^>]*>([\\s\\S]*?)</td>`));
  return m?.[1] ? decode(m[1]) : "";
}

/** The infobox images, in order: file page, kind (bitmap/drawing) and the caption under each. */
function infoboxImages(html: string): { file: string; bitmap: boolean; caption: string }[] {
  const box = html.match(/<table class="infobox[\s\S]*?<\/table>/)?.[0] ?? "";
  return [...box.matchAll(/<td[^>]*class="infobox-image"[^>]*>([\s\S]*?)<\/td>/g)].flatMap((m) => {
    const cell = m[1] ?? "";
    const file = cell.match(/href="(?:https:\/\/en\.wikipedia\.org)?\/wiki\/(File:[^"]+)"/)?.[1];
    if (!file) return [];
    const caption = cell.match(/<div class="infobox-caption"[^>]*>([\s\S]*?)<\/div>/)?.[1];
    return [
      {
        file: decodeURIComponent(file),
        bitmap: /data-file-type="bitmap"/.test(cell),
        caption: caption ? decode(caption) : "",
      },
    ];
  });
}

async function find(slug: string, article: string | null): Promise<Found | string> {
  const file = picked.get(slug);
  let shot: { file: string; caption: string } | undefined;
  if (file) shot = { file, caption: "" };
  else if (article) {
    const page = await getText(
      `https://en.wikipedia.org/wiki/${encodeURIComponent(article.replaceAll(" ", "_"))}`,
    );
    // The OS infobox puts the logo first and the screenshot after it.
    shot = infoboxImages(page)
      .filter((i) => i.bitmap && /\.(png|jpe?g|webp)$/i.test(i.file))
      .at(-1);
    if (!shot) return "no raster image in the infobox";
  } else return "no Wikipedia article (pick a Commons file with --file)";
  const source = `https://commons.wikimedia.org/wiki/${encodeURIComponent(shot.file.replaceAll(" ", "_")).replace("%3A", ":")}`;
  let filePage: string;
  try {
    // The page escapes underscores in class names and ids (licensetpl&#95;short).
    filePage = (await getText(source)).replaceAll("&#95;", "_");
  } catch (e) {
    if (e instanceof HttpError && e.status === 404)
      return `${shot.file} is not on Commons (non-free?)`;
    throw e;
  }
  // Without the ?utm_… query the page adds to its links.
  const original = filePage.match(
    /<div class="fullMedia">[\s\S]*?href="(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/[^"?]+)/,
  )?.[1];
  const size = filePage.match(/<div class="fullMedia">[\s\S]*?\(([\d,]+) × ([\d,]+) pixels/);
  if (!original || !size) return `${shot.file}: no original file link on the Commons page`;
  const licenses = [
    ...new Set(
      [...filePage.matchAll(/<span class="licensetpl_short"[^>]*>([\s\S]*?)<\/span>/g)].map((m) =>
        decode(m[1] ?? ""),
      ),
    ),
  ].filter(Boolean);
  const licenseUrl = filePage.match(/<span class="licensetpl_link"[^>]*>([\s\S]*?)<\/span>/)?.[1];
  if (!licenses.length) return `${shot.file}: no machine-readable license`;
  return {
    slug,
    article,
    file: original,
    source,
    author: infoRow(filePage, "fileinfotpl_aut"),
    license: licenses.join(" / "),
    licenseUrl: licenseUrl ? decode(licenseUrl).replace(/^http:/, "https:") : null,
    description: infoRow(filePage, "fileinfotpl_desc").replace(/^English\s*(&#58;|:)\s*/, ""),
    wikipediaCaption: shot.caption,
    date: infoRow(filePage, "fileinfotpl_date"),
    width: Number(size[1]?.replaceAll(",", "")),
    height: Number(size[2]?.replaceAll(",", "")),
  };
}

/**
 * The original file; it is resized here. (Commons renders thumbnails on
 * demand and answers bots asking for an uncached size with 429.) The image
 * host also answers bursts with 429: on one, it waits as long as Retry-After
 * asks but at least 30 s, four times at most.
 */
async function download(found: Found): Promise<Buffer> {
  let url = found.file;
  for (let attempt = 0; attempt < 8; attempt++) {
    if (!(await isAllowed(url))) throw new RobotsDisallowed(`robots.txt disallows ${url}`, url);
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT },
      redirect: "manual",
      signal: AbortSignal.timeout(120_000),
    });
    const location = res.headers.get("location");
    if (location && res.status >= 300 && res.status < 400) {
      url = new URL(location, url).href;
      continue;
    }
    if (res.status === 429 && attempt < 4) {
      const wait = Math.min(Math.max(Number(res.headers.get("retry-after")) || 0, 30), 120);
      await new Promise((done) => setTimeout(done, wait * 1000));
      continue;
    }
    if (!res.ok) throw new HttpError(`HTTP ${res.status} for ${url}`, url, res.status);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new HttpError("too many redirects", url);
}

const results: Found[] = [];
const pause = () => new Promise((done) => setTimeout(done, 5000));
for (const [slug, article] of Object.entries(WIKIPEDIA_ARTICLES)) {
  if (only.length && !only.includes(slug)) continue;
  if (!existsSync(`src/content/distros/${slug}.yaml`)) continue; // not in the catalog (yet)
  await pause(); // Wikimedia answers bursts with 429: one distro every few seconds.
  try {
    const found = await find(slug, article);
    if (typeof found === "string") {
      console.log(`${slug.padEnd(18)} — ${found}`);
      continue;
    }
    results.push(found);
    console.log(
      `${slug.padEnd(18)} ${found.width}×${found.height} ${found.license} · ${found.author} · ${found.source}`,
    );
    const out = `src/assets/screenshots/${slug}.webp`;
    // Kept unless picked again by hand (--file) or named on the command line.
    if (write && (!existsSync(out) || picked.has(slug) || only.includes(slug))) {
      await new Promise((done) => setTimeout(done, 15_000)); // one image every 15 s or more
      const info = await sharp(await download(found))
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: 85, effort: 6 })
        .toFile(out);
      console.log(
        `${"".padEnd(18)} → ${out} ${info.width}×${info.height}, ${Math.round(info.size / 1024)} KB`,
      );
    }
  } catch (e) {
    console.log(`${slug.padEnd(18)} ! ${e instanceof Error ? e.message : e}`);
  }
}
if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify(results, null, 2)}\n`);
