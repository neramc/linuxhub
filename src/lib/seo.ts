/**
 * Search-engine helpers (ADR-0020): site-verification values from the
 * environment, the sitemap's XML, and the distro page's Korean-aware label.
 * Pure functions; the routes and the layout do the I/O.
 */
import type { Locale } from "~/i18n";

/**
 * A site-verification token as the search console shows it, from either the
 * bare token or the whole `<meta … content="…">` tag pasted by mistake.
 * Undefined when unset or empty.
 */
export function verificationToken(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  const tag = /content\s*=\s*["']([^"']+)["']/i.exec(value);
  const token = (tag?.[1] ?? value).trim();
  return /^[\w.:=+/-]+$/.test(token) ? token : undefined;
}

/**
 * The robots.txt comment Daum's webmaster tool checks, from its value with or
 * without the `#DaumWebMasterTool:` prefix. Undefined when unset or malformed.
 */
export function daumRobotsLine(raw: string | undefined): string | undefined {
  const value = raw
    ?.trim()
    .replace(/^#?\s*DaumWebMasterTool\s*:/i, "")
    .trim();
  return value && /^[\w:.-]+$/.test(value) ? `#DaumWebMasterTool:${value}` : undefined;
}

/**
 * How a distro is named in titles and descriptions: Korean pages lead with
 * the Hangul name Korean searches use, "우분투(Ubuntu)", when there is one.
 */
export function distroLabel(name: string, nameKo: string | undefined, locale: Locale): string {
  return locale === "ko" && nameKo ? `${nameKo}(${name})` : name;
}

/** The newest of some ISO dates (YYYY-MM-DD…), or undefined when there are none. */
export function newest(...dates: (string | null | undefined)[]): string | undefined {
  return dates
    .filter((d): d is string => Boolean(d))
    .map((d) => d.slice(0, 10))
    .sort()
    .at(-1);
}

export interface SitemapEntry {
  /** Absolute URL of the page. */
  loc: string;
  /** YYYY-MM-DD of the last change to what the page shows, when known. */
  lastmod?: string | undefined;
  /** The same page in every language (hreflang → absolute URL), x-default included. */
  alternates: Record<string, string>;
}

const xmlEscape = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** A sitemaps.org urlset with hreflang alternates (xhtml:link), one <url> per entry. */
export function sitemapXml(entries: readonly SitemapEntry[]): string {
  const urls = entries.map((e) =>
    [
      "  <url>",
      `    <loc>${xmlEscape(e.loc)}</loc>`,
      ...(e.lastmod ? [`    <lastmod>${e.lastmod}</lastmod>`] : []),
      ...Object.entries(e.alternates).map(
        ([lang, href]) =>
          `    <xhtml:link rel="alternate" hreflang="${lang}" href="${xmlEscape(href)}"/>`,
      ),
      "  </url>",
    ].join("\n"),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

/** The site as an Organization (JSON-LD publisher; its logo is the 180px app icon). */
export function siteOrganization(site: URL | string, name: string) {
  return {
    "@type": "Organization",
    name,
    url: new URL("/", site).href,
    logo: {
      "@type": "ImageObject",
      url: new URL("/apple-touch-icon.png", site).href,
      width: 180,
      height: 180,
    },
  };
}
