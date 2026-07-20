import { expect, test } from "@playwright/test";

// Locale routing, fallback, and RTL (.ai/i18n.md).

test("korean locale renders the translated UI", async ({ page }) => {
	await page.goto("/ko");
	await expect(page.locator("html")).toHaveAttribute("lang", "ko");
	await expect(page.getByRole("link", { name: "탐색" }).first()).toBeVisible();
	await expect(page.getByRole("heading", { name: "최근 업데이트" })).toBeVisible();
});

test("arabic locale mirrors the layout", async ({ page }) => {
	await page.goto("/ar/distro/fedora");
	await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
	// untranslated content falls back to English with the badge
	await expect(page.getByText("English fallback").first()).toBeVisible();
});

test("/en canonicalizes to the unprefixed route", async ({ page }) => {
	const response = await page.goto("/en/explore");
	expect(response?.url()).not.toContain("/en/");
	await expect(page).toHaveURL(/\/explore$/);
});

test("unknown locale prefixes 404", async ({ browser }) => {
	const context = await browser.newContext();
	await context.addCookies([{ name: "lh-locale", value: "en", url: "http://127.0.0.1:4174" }]);
	const page = await context.newPage();
	const response = await page.goto("/zz/explore");
	expect(response?.status()).toBe(404);
	await context.close();
});

test("locale switcher navigates to the localized route", async ({ page }) => {
	await page.goto("/explore");
	await page.locator(".locale-btn").click();
	await page.locator(".locale-popover__search input").fill("한국");
	await page.locator(".locale-option", { hasText: "한국어" }).click();
	await expect(page).toHaveURL(/\/ko\/explore/);
	await expect(page.locator("html")).toHaveAttribute("lang", "ko");
});
