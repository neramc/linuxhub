/**
 * /sitemap.xml (ADR-0020): every indexable page in both languages, with its
 * hreflang alternates and, where the page shows dated content, the day that
 * content last changed (a release in the synced history, a document's
 * lastReviewed, the popularity day). Pages that are noindex (unwritten
 * install guides, the design showcase, 404) are left out;
 * scripts/check-links.ts checks this list against the build.
 */
import type { APIRoute } from "astro";
import { DEFAULT_LOCALE, LOCALE_META, LOCALES, type Locale, localizePath } from "~/i18n";
import { getDistroDoc, getDistros, getHistory, getPopularity } from "~/lib/catalog";
import { getChapters } from "~/lib/learn";
import { newest, notAfter, type SitemapEntry, sitemapXml } from "~/lib/seo";

export const GET: APIRoute = async ({ site }) => {
  if (!site) throw new Error("sitemap.xml needs `site` in astro.config");
  const url = (path: string, locale: Locale) => new URL(localizePath(path, locale), site).href;
  const entries: SitemapEntry[] = [];
  // The build day stands in for today (the site is rebuilt when data changes).
  const today = new Date().toISOString().slice(0, 10);
  /** A page in the locales where it exists, each with that locale's lastmod. */
  const add = (
    path: string,
    lastmod: Partial<Record<Locale, string | undefined>>,
    locales: readonly Locale[] = LOCALES,
  ) => {
    const alternates = Object.fromEntries(
      locales.map((l) => [LOCALE_META[l].htmlLang, url(path, l)]),
    );
    if (locales.includes(DEFAULT_LOCALE)) alternates["x-default"] = url(path, DEFAULT_LOCALE);
    for (const l of locales)
      entries.push({ loc: url(path, l), lastmod: notAfter(lastmod[l], today), alternates });
  };
  const both = (date: string | undefined) => ({ ko: date, en: date });

  const history = getHistory();
  const lastRelease = newest(...history.map((h) => h.date));
  const releasedOn = (slug: string) =>
    newest(...history.filter((h) => h.slug === slug).map((h) => h.date));

  add("/", both(newest(lastRelease, getPopularity()?.day)));
  add("/distros/", {});
  add("/releases/", both(lastRelease));
  for (const path of ["/finder/", "/compare/", "/family/", "/about/"]) add(path, {});

  for (const d of await getDistros()) {
    const released = releasedOn(d.id);
    const docDate = async (l: Locale, doc: "overview" | "install") =>
      (await getDistroDoc(d.id, l, doc))?.data.lastReviewed;
    add(`/distros/${d.id}/`, {
      ko: newest(released, await docDate("ko", "overview")),
      en: newest(released, await docDate("en", "overview")),
    });
    // An install guide that is not written yet is a short noindex page.
    const guides: Locale[] = [];
    for (const l of LOCALES) if (await docDate(l, "install")) guides.push(l);
    if (guides.length)
      add(
        `/distros/${d.id}/install/`,
        {
          ko: newest(released, await docDate("ko", "install")),
          en: newest(released, await docDate("en", "install")),
        },
        guides,
      );
  }

  const chapters = new Map(
    await Promise.all(LOCALES.map(async (l) => [l, await getChapters(l)] as const)),
  );
  add(
    "/learn/",
    Object.fromEntries(
      LOCALES.map((l) => [l, newest(...(chapters.get(l) ?? []).map((c) => c.data.lastReviewed))]),
    ),
  );
  const slugs = new Set([...chapters.values()].flat().map((c) => c.slug));
  for (const slug of slugs) {
    const present = LOCALES.filter((l) => chapters.get(l)?.some((c) => c.slug === slug));
    add(
      `/learn/${slug}/`,
      Object.fromEntries(
        present.map((l) => [l, chapters.get(l)?.find((c) => c.slug === slug)?.data.lastReviewed]),
      ),
      present,
    );
  }

  return new Response(sitemapXml(entries), {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
};
