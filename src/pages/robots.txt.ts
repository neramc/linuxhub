import { DAUM_WEBMASTER_TOOL } from "astro:env/server";
import type { APIRoute } from "astro";
import { daumRobotsLine } from "~/lib/seo";

/**
 * Every crawler may read every page; the geo function and Pagefind's index
 * fragments (fetched by the search dialog, never linked) are left out. Daum's
 * webmaster tool verifies a site by a comment line here (ADR-0020).
 */
export const GET: APIRoute = ({ site }) =>
  new Response(
    [
      ...[daumRobotsLine(DAUM_WEBMASTER_TOOL)].filter(Boolean),
      "User-agent: *",
      "Allow: /",
      "Disallow: /api/",
      "Disallow: /pagefind/",
      "",
      `Sitemap: ${new URL("/sitemap.xml", site).href}`,
      "",
    ].join("\n"),
    { headers: { "content-type": "text/plain; charset=utf-8" } },
  );
