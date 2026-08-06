import { expect, test } from "@playwright/test";

// The files a public deployment is expected to serve, and the links the site
// itself points at. Both feeds were linked from the footer and answered 404
// until they were built; this is what keeps that from happening again.

test("robots.txt is served at the root and points at the sitemap", async ({ page }) => {
	const response = await page.request.get("/robots.txt");
	expect(response.status()).toBe(200);

	const body = await response.text();
	expect(body).toContain("User-agent: *");
	expect(body).toContain("Disallow: /api/");
	expect(body).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/);
});

test("robots.txt is not geo-redirected into a locale", async ({ page }) => {
	// A crawler from a Korean IP must not be bounced to /ko/robots.txt, which
	// does not exist. The locale hook redirects everything else.
	const response = await page.request.get("/robots.txt", {
		headers: { "x-vercel-ip-country": "KR" },
		maxRedirects: 0,
	});
	expect(response.status()).toBe(200);
});

test("sitemap.xml lists both translated locales and every distro page", async ({ page }) => {
	const response = await page.request.get("/sitemap.xml");
	expect(response.status()).toBe(200);
	expect(response.headers()["content-type"]).toContain("xml");

	const body = await response.text();
	expect(body).toContain('hreflang="x-default"');
	expect(body).toContain('hreflang="ko"');
	expect(body).toContain("/distro/fedora</loc>");
	expect(body).toContain("/ko/distro/fedora</loc>");
});

test("the footer's feed links resolve", async ({ page }) => {
	await page.goto("/");

	for (const [name, type] of [
		["releases.rss", "rss"],
		["releases.atom", "atom"],
	]) {
		const href = await page.locator(`footer a[href$="${name}"]`).first().getAttribute("href");
		expect(href, `footer does not link ${name}`).toBeTruthy();

		const response = await page.request.get(href as string);
		expect(response.status(), `${name} is not served`).toBe(200);
		expect(response.headers()["content-type"]).toContain(type as string);
		expect(await response.text()).toContain("<?xml");
	}
});
