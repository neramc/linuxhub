/** Release feed (RSS 2.0) per locale: /rss.xml (ko) and /en/rss.xml. */
import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { type Locale, localePaths, localizePath, useTranslations } from "~/i18n";
import { getDistros, getHistory } from "~/lib/catalog";

export const getStaticPaths = localePaths;

export const GET: APIRoute = async ({ props, site }) => {
  const locale = props.locale as Locale;
  const t = useTranslations(locale);
  const bySlug = new Map((await getDistros()).map((d) => [d.id, d]));
  const items = getHistory()
    .filter((h) => bySlug.has(h.slug))
    .slice(0, 50)
    .map((h) => {
      const d = bySlug.get(h.slug);
      return {
        title: `${d?.data.name} ${h.version}`,
        // The fragment keeps each release's link (= RSS guid) unique.
        link: `${new URL(localizePath(`/distros/${h.slug}/`, locale), site).href}#v${encodeURIComponent(h.version)}`,
        pubDate: new Date(`${h.date}T00:00:00Z`),
        description: d?.data.tagline[locale] ?? "",
      };
    });
  return rss({
    title: `${t("site.name")} – ${t("releases.title")}`,
    description: t("releases.lead"),
    site: new URL(localizePath("/", locale), site).href,
    items,
    customData: `<language>${locale}</language>`,
  });
};
