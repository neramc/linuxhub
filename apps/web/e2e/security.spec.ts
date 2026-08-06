import { expect, test } from "@playwright/test";

// The headers in .ai/security.md § "Headers". They are asserted here rather
// than trusted, because a header that is wrong is invisible: the page looks
// exactly the same either way.

const EXPECTED: Record<string, string | RegExp> = {
	"strict-transport-security": "max-age=63072000; includeSubDomains; preload",
	"referrer-policy": "strict-origin-when-cross-origin",
	"x-content-type-options": "nosniff",
	"x-frame-options": "DENY",
	"permissions-policy": /camera=\(\)/,
	"content-security-policy": /default-src 'self'/,
};

test("every response carries the documented security headers", async ({ page }) => {
	const response = await page.goto("/");
	expect(response).not.toBeNull();
	const headers = response?.headers() ?? {};

	for (const [name, expected] of Object.entries(EXPECTED)) {
		const actual = headers[name];
		expect(actual, `missing header: ${name}`).toBeTruthy();
		if (typeof expected === "string") expect(actual).toBe(expected);
		else expect(actual).toMatch(expected);
	}
});

test("the policy forbids third-party origins and framing", async ({ page }) => {
	const response = await page.goto("/");
	const csp = response?.headers()["content-security-policy"] ?? "";

	expect(csp).toContain("frame-ancestors 'none'");
	expect(csp).toContain("object-src 'none'");
	expect(csp).toContain("base-uri 'self'");
	// connect-src 'self' is what keeps the BFF the only thing the browser talks
	// to — the download selector calls /api/v1/downloads/*, never a mirror.
	expect(csp).toContain("connect-src 'self'");
});

test("browsing violates nothing the policy blocks", async ({ page }) => {
	const violations: string[] = [];
	page.on("console", (message) => {
		const text = message.text();
		if (/content security policy/i.test(text)) violations.push(text);
	});

	await page.goto("/");
	await page.goto("/explore");
	await page.locator(".card-grid a").first().click();
	await page.waitForLoadState("networkidle");

	expect(violations).toEqual([]);
});

test("the pre-paint theme script survives the policy", async ({ page }) => {
	// It moved out of app.html to satisfy script-src 'self'. If the move broke
	// the URL, dark-mode visitors get a flash of light before hydration — a
	// regression nothing else here would catch.
	const script = await page.request.get("/theme.js");
	expect(script.status()).toBe(200);
	expect(await script.text()).toContain("lh-theme");

	await page.emulateMedia({ colorScheme: "dark" });
	await page.goto("/");
	await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
