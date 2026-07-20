import { expect, test } from "@playwright/test";

// Core browse → detail → download flow (.ai/roadmap.md Phase 6 DoD).

test("home renders banners, categories, and live release feed", async ({ page }) => {
	await page.goto("/");
	await expect(page).toHaveTitle(/Linuxhub/);
	await expect(page.getByRole("link", { name: /Fedora/ }).first()).toBeVisible();
	// live-data-derived "recently updated" list has rows with dates
	await expect(page.getByRole("heading", { name: "Recently updated" })).toBeVisible();
});

test("explore filters by category and opens a distro", async ({ page }) => {
	await page.goto("/explore?category=beginners");
	const cards = page.locator(".card-grid a");
	await expect(cards.first()).toBeVisible();
	await page.goto("/explore");
	await page.locator(".card-grid a", { hasText: "Fedora" }).first().click();
	await expect(page).toHaveURL(/\/distro\/fedora/);
	await expect(page.getByRole("heading", { level: 1, name: "Fedora" })).toBeVisible();
});

test("detail shows live versions, mirrors, and MDX tabs", async ({ page }) => {
	await page.goto("/distro/fedora");

	// live version rows with channel badges
	const firstRow = page.locator(".vrow").first();
	await expect(firstRow).toBeVisible();
	await expect(firstRow.locator(".badge", { hasText: "latest" }).first()).toBeVisible();

	// first row is expanded by default → mirror list with the automatic row
	await expect(page.getByText("Automatic — nearest mirror")).toBeVisible();
	// live Fedora mirrors come from mirrors.fedoraproject.org
	await expect(page.getByText("via mirrors.fedoraproject.org").first()).toBeVisible();

	// selecting a mirror marks it pressed
	const mirror = page.locator(".vfile").nth(1);
	await mirror.click();
	await expect(mirror).toHaveAttribute("aria-pressed", "true");

	// MDX install tab renders authored content with code blocks and sources
	await page.getByRole("tab", { name: "Install" }).click();
	await expect(page.locator("article.prose pre").first()).toBeVisible();
	await expect(page.locator("article.prose .sources")).toContainText("official sources");

	// provenance line from the committed snapshot
	await expect(page.getByText(/snapshot \d{4}-\d{2}-\d{2}/)).toBeVisible();
});

test("rolling distro shows a rolling channel row", async ({ page }) => {
	await page.goto("/distro/arch");
	await expect(page.locator(".vrow__title").first()).toContainText("rolling");
});
