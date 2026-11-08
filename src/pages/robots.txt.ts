import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) =>
  new Response(
    [
      "#DaumWebMasterTool:b4b5128b81100cda5fe5bbf7e724c28c09e79d77601e39039e16ee41f5d2b071:8eDCqJCqTZrYCvf1G9zNRA==",
      "User-agent: *",
      "Allow: /",
      "Disallow: /api/",
      "",
      `Sitemap: ${new URL("/sitemap-index.xml", site).href}`,
      "",
    ].join("\n"),
    { headers: { "content-type": "text/plain; charset=utf-8" } },
  );
