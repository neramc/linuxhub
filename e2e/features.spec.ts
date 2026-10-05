import { expect, test } from "@playwright/test";

test("distro finder recommends three distributions with reasons", async ({ page }) => {
  await page.goto("/finder/");
  await page.locator('label.choice:has(input[value="new"])').click();
  await page.locator('label.choice:has(input[value="windows"])').click();
  await page.getByRole("button", { name: "추천 결과 보기" }).click();
  const results = page.locator("[data-result-list] li");
  await expect(results).toHaveCount(3);
  // Each result: app tile, name and one dim line of concrete reasons (no chips).
  const first = results.first();
  await expect(first.locator(".app-tile img")).toBeVisible();
  await expect(first.locator(".result-why")).toBeVisible();
  await expect(first.locator(".result-why")).not.toBeEmpty();
  await expect(first.locator(".adw-badge")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "가장 잘 맞는 배포판" })).toBeFocused();
});

test("compare reads and writes ?d=", async ({ page }) => {
  await page.goto("/compare/?d=fedora,ubuntu");
  await expect(page.locator('[data-head="0"]')).toContainText("Fedora");
  await expect(page.locator('[data-head="0"] .app-tile img')).toBeVisible();
  await expect(page.locator('[data-cell="0:desktops"] strong')).toHaveText("GNOME");
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

test("search groups results by type and finds Korean aliases", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+k");
  const input = page.locator("[data-search-input]");
  const results = page.locator("[data-search-results]");
  // A distro result: app tile, name and the tagline (not a raw excerpt).
  await input.fill("민트");
  const mint = results.locator('a[href="/distros/linux-mint/"]');
  await expect(mint).toBeVisible({ timeout: 10_000 });
  await expect(mint.locator(".app-tile img")).toBeVisible();
  await expect(mint.locator(".result-title")).toHaveText("Linux Mint");
  await expect(mint.locator(".result-subtitle")).not.toContainText("민트");
  await expect(results.getByRole("heading", { name: "배포판" })).toBeVisible();
  // Linux guide chapters form their own group.
  await input.fill("커널");
  await expect(results.getByRole("heading", { name: "리눅스 가이드" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(results.locator('a[href^="/learn/"]').first()).toBeVisible();
});

test("search dialog fits a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("[data-search-open]").first().click();
  const dialog = page.locator("#search-dialog");
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const close = await dialog.getByRole("button", { name: "검색 닫기" }).boundingBox();
  expect(box && close && close.x + close.width <= box.x + box.width).toBe(true);
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
