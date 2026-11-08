/**
 * /sitemap-index.xml: the address robots.txt and the search consoles knew
 * before /sitemap.xml (@astrojs/sitemap's index, ADR-0020). It stays, as an
 * index of the one sitemap, so a console that has it keeps reading the site.
 */
import type { APIRoute } from "astro";
import { getHistory, getPopularity } from "~/lib/catalog";
import { newest, notAfter, sitemapIndexXml } from "~/lib/seo";

export const GET: APIRoute = ({ site }) => {
  if (!site) throw new Error("sitemap-index.xml needs `site` in astro.config");
  const lastmod = notAfter(
    newest(...getHistory().map((h) => h.date), getPopularity()?.day),
    new Date().toISOString().slice(0, 10),
  );
  return new Response(sitemapIndexXml([{ loc: new URL("/sitemap.xml", site).href, lastmod }]), {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
};
