import { expect, test } from "@playwright/test";

test("search finds distros and links to detail", async ({ page }) => {
	await page.goto("/search?q=fedora");
	const hit = page.locator("a", { hasText: "Fedora" }).first();
	await expect(hit).toBeVisible();
});

test("quiz completes and recommends a distro", async ({ page }) => {
	await page.goto("/quiz");
	await page.getByRole("button", { name: "Start" }).click();
	// answer all seven questions with the first option
	for (let i = 0; i < 7; i += 1) {
		await page
			.locator(".boxed .row")
			.first()
			.click({ timeout: 5_000 })
			.catch(() => {});
	}
	await expect(page.getByText("Your top match")).toBeVisible();
	await expect(page.getByRole("link", { name: /^See / })).toBeVisible();
});

test("compare diffs two distros", async ({ page }) => {
	await page.goto("/compare?slugs=ubuntu,fedora");
	await expect(page.locator(".spec-table")).toBeVisible();
	await expect(page.locator("th", { hasText: "Ubuntu" })).toBeVisible();
	await expect(page.locator("th", { hasText: "Fedora" })).toBeVisible();
});
