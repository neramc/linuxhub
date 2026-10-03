import { expect, test } from "@playwright/test";

test("distro finder recommends three distributions with reasons", async ({ page }) => {
  await page.goto("/finder/");
  await page.locator('label.choice:has(input[value="new"])').click();
  await page.locator('label.choice:has(input[value="windows"])').click();
  await page.getByRole("button", { name: "추천 결과 보기" }).click();
  const results = page.locator("[data-result-list] li");
  await expect(results).toHaveCount(3);
  await expect(results.first().locator(".adw-badge").first()).toBeVisible();
});

test("compare reads and writes ?d=", async ({ page }) => {
  await page.goto("/compare/?d=fedora,ubuntu");
  await expect(page.locator('[data-head="0"]')).toContainText("Fedora");
  await page.locator('select[name="d2"]').selectOption("debian");
  await expect(page).toHaveURL(/d=fedora,ubuntu,debian/);
  await expect(page.locator('[data-head="2"]')).toContainText("Debian");
});

test("search dialog finds a distribution", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+k");
  const input = page.locator("[data-search-input]");
  await expect(input).toBeFocused();
  await input.fill("Fedora");
  await expect(page.locator("[data-search-results] a").first()).toBeVisible({ timeout: 10_000 });
});

test("install guide renders with live data and anchors", async ({ page }) => {
  await page.goto("/distros/fedora/install/");
  await expect(page.locator("#verify")).toBeAttached();
  await expect(page.locator("#usb")).toBeAttached();
  await expect(page.locator("article.prose")).toContainText(/Fedora-Workstation-Live-\d+/);
});

test("pages run under the production CSP without violations", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
  });
  for (const path of ["/", "/distros/fedora/", "/finder/", "/compare/"]) {
    const res = await page.goto(path);
    expect(res?.headers()["content-security-policy"]).toContain("script-src");
  }
  // Theme menu, search (Pagefind WebAssembly) and the download wizard all execute script.
  await page.keyboard.press("Control+k");
  await page.locator("[data-search-input]").fill("Debian");
  await expect(page.locator("[data-search-results] a").first()).toBeVisible({ timeout: 10_000 });
  expect(violations).toEqual([]);
});
