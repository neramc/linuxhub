/**
 * Fedora MirrorManager (mirrormanager.fedoraproject.org), the public mirror
 * list of Fedora and CentOS: one table row per active mirror with its country,
 * host and, per product ("Fedora Linux", "CentOS", …), the mirror's own URL
 * for that product's tree. Used with the list pages the projects point to
 * (/mirrors/Fedora/<N>/x86_64, /mirrors/CentOS); robots.txt allows them
 * (Crawl-delay 1), admin.fedoraproject.org/mirrormanager is disallowed.
 *
 * `page_size=500` returns every row in one request. The page states the
 * number of mirrors ("We currently have N active mirrors"); a different
 * number of parsed rows means the page changed and throws.
 */
import type { Mirror } from "../../../src/lib/data-schemas";
import { getText } from "../http";
import { countryCode, withSlash } from "./mirrors";

export interface MirrorManagerRow {
  /** Mirror root for the product, ending with "/". */
  root: string;
  country: string | null;
}

const text = (s: string | undefined) =>
  (s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Rows of a MirrorManager list page whose `product` entry has an HTTPS URL
 * (exported for tests). `total` is the mirror count the page states, `rows`
 * the number of table rows found.
 */
export function parseMirrorManager(html: string, product: string) {
  const total = Number(html.match(/We currently have (\d+) active mirrors/)?.[1]);
  const rows = html.split('<tr class="mirror-row">').slice(1);
  const mirrors = new Map<string, MirrorManagerRow>();
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    for (const item of (cells[3] ?? "").split("<li>").slice(1)) {
      if (text(item.split("<a")[0]) !== product) continue;
      const href = item.match(/<a href="(https:\/\/[^"]+)">https<\/a>/)?.[1];
      if (!href) continue;
      // Some mirrors register their root as ".../." for the same directory.
      const root = withSlash(href.replace(/\/\.$/, ""));
      mirrors.set(root, { root, country: countryCode(text(cells[0])) });
    }
  }
  return {
    total: Number.isFinite(total) ? total : null,
    rows: rows.length,
    mirrors: [...mirrors.values()],
  };
}

/**
 * The official mirrors with an HTTPS root for `product`, from the list page at
 * `listUrl` (no query string). Country always, no coordinates or score (the
 * page publishes none; its bandwidth column is not a quality score).
 */
export async function mirrorManagerMirrors(
  listUrl: string,
  product: string,
): Promise<{ source: string; mirrors: Mirror[] }> {
  const source = `${listUrl}?page_size=500&page_number=1`;
  const page = parseMirrorManager(await getText(source, { accept: "text/html" }), product);
  if (page.total === null || page.rows !== page.total)
    throw new Error(
      `MirrorManager list changed: ${page.rows} rows for ${page.total ?? "?"} mirrors (${listUrl})`,
    );
  if (!page.mirrors.length) throw new Error(`MirrorManager list has no HTTPS "${product}" mirror`);
  return {
    source,
    mirrors: page.mirrors.map((m) => ({
      url: m.root,
      country: m.country,
      name: new URL(m.root).hostname,
      lat: null,
      lon: null,
      score: null,
    })),
  };
}
