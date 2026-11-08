import { expect, test } from "@playwright/test";

/** Search-engine plumbing (ADR-0020, docs/seo.md). */

test("robots.txt allows crawling, names the sitemap and carries Daum's line", async ({
  request,
}) => {
  const res = await request.get("/robots.txt");
  expect(res.headers()["content-type"]).toContain("text/plain");
  const body = await res.text();
  const lines = body.split("\n");
  // Daum's webmaster tool line first, exactly as registered (base64 padding included).
  expect(lines[0]).toBe(
    "#DaumWebMasterTool:b4b5128b81100cda5fe5bbf7e724c28c09e79d77601e39039e16ee41f5d2b071:8eDCqJCqTZrYCvf1G9zNRA==",
  );
  expect(lines).toContain("User-agent: *");
  expect(lines).toContain("Allow: /");
  expect(lines).toContain("Disallow: /api/");
  // Nothing a page needs is disallowed.
  const disallowed = lines.filter((l) => l.startsWith("Disallow:")).map((l) => l.slice(9).trim());
  expect(disallowed.sort()).toEqual(["/api/", "/pagefind/"]);
  expect(body).toMatch(/^Sitemap: https?:\/\/[^\s]+\/sitemap\.xml$/m);
});

test("sitemap.xml and the old sitemap-index.xml are well-formed", async ({ page, request }) => {
  await page.goto("/");
  for (const [path, root] of [
    ["/sitemap.xml", "urlset"],
    ["/sitemap-index.xml", "sitemapindex"],
  ] as const) {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("xml");
    const xml = await res.text();
    const parsed = await page.evaluate((text) => {
      const doc = new DOMParser().parseFromString(text, "application/xml");
      return {
        error: doc.getElementsByTagName("parsererror").length > 0,
        root: doc.documentElement.localName,
        ns: doc.documentElement.namespaceURI,
      };
    }, xml);
    expect(parsed).toEqual({
      error: false,
      root,
      ns: "http://www.sitemaps.org/schemas/sitemap/0.9",
    });
  }
  const index = await (await request.get("/sitemap-index.xml")).text();
  expect(
    [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1] ?? "").pathname),
  ).toEqual(["/sitemap.xml"]);
});

test("sitemap.xml lists indexable pages with their alternates", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.headers()["content-type"]).toContain("xml");
  const xml = await res.text();
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1] ?? "").pathname);
  expect(paths).toContain("/");
  expect(paths).toContain("/en/");
  expect(paths).toContain("/distros/ubuntu/");
  expect(paths).toContain("/en/learn/what-is-linux/");
  // Written install guides only; unwritten ones are noindex.
  expect(paths).toContain("/distros/fedora/install/");
  expect(paths).not.toContain("/distros/ubuntu/install/");
  expect(new Set(paths).size).toBe(paths.length);
  expect(xml).toMatch(/hreflang="x-default"/);
  expect(xml).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
});

test("a Korean distro page leads with the Hangul name", async ({ page }) => {
  await page.goto("/distros/ubuntu/");
  await expect(page).toHaveTitle(/^우분투\(Ubuntu\) .+ 다운로드와 설치 – Linuxhub$/);
  await expect(page.locator("h1")).toHaveText("Ubuntu 우분투");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /^우분투\(Ubuntu\): /,
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /max-image-preview:large/,
  );
  const app = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((els) => els.map((e) => JSON.parse(e.textContent ?? "{}")));
  expect(app.find((x) => x["@type"] === "SoftwareApplication")?.alternateName).toBe("우분투");

  await page.goto("/en/distros/ubuntu/");
  await expect(page.locator("h1")).toHaveText("Ubuntu");
  await expect(page).toHaveTitle(/^Ubuntu .+: download and install – Linuxhub$/);
});

test("noindex pages say so and stay out of the sitemap", async ({ page }) => {
  await page.goto("/distros/ubuntu/install/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
});

test("favicon.ico and the IndexNow key are served from the root", async ({ request }) => {
  const ico = await request.get("/favicon.ico");
  expect(ico.ok()).toBe(true);
  expect((await ico.body()).subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]));
  const key = "b26e3336ffae790029ee6eec37086deb";
  expect((await (await request.get(`/${key}.txt`)).text()).trim()).toBe(key);
});
