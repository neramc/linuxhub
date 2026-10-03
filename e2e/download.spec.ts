import { expect, test } from "@playwright/test";

test("download wizard serves the default image without interaction", async ({ page }) => {
  await page.goto("/distros/fedora/");
  const button = page.locator("[data-download]");
  await expect(button).toHaveAttribute("href", /^https:\/\/download\.fedoraproject\.org\/.+\.iso$/);
  await expect(page.locator("[data-checksum]")).toHaveText(/^[0-9a-f]{64}$/);
});

test("changing the edition updates file, link and checksum", async ({ page }) => {
  await page.goto("/distros/fedora/");
  const before = await page.locator("[data-checksum]").textContent();
  await page.locator('select[name="edition"]').selectOption("kde");
  await expect(page.locator("[data-file]")).toContainText("KDE");
  await expect(page.locator("[data-download]")).toHaveAttribute("href", /KDE/);
  await expect(page.locator("[data-checksum]")).not.toHaveText(before ?? "");
});

test("mirror list distros suggest the nearest official mirror", async ({ page }) => {
  await page.route("**/api/geo", (route) =>
    route.fulfill({
      json: { cc: "KR", lat: 37.57, lon: 126.98 },
      headers: { "cache-control": "no-store" },
    }),
  );
  await page.goto("/distros/arch/");
  const mirror = page.locator('select[name="mirror"]');
  await expect(mirror).toBeVisible({ timeout: 10_000 });
  const href = await page.locator("[data-download]").getAttribute("href");
  const chosen = await mirror.inputValue();
  expect(chosen).toMatch(/^https:\/\//);
  expect(href?.startsWith(chosen)).toBe(true);
  expect(href).toMatch(/archlinux-.*-x86_64\.iso$/);
});
