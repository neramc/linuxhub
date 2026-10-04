import { expect, test } from "@playwright/test";

test("home → catalog → distro detail", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("리눅스");
  await page.getByRole("link", { name: "배포판 둘러보기" }).click();
  await expect(page).toHaveURL(/\/distros\/$/);
  await page
    .getByRole("link", { name: /Fedora Linux/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/distros\/fedora\/$/);
  await expect(page.locator("h1")).toHaveText("Fedora Linux");
  await expect(page.getByRole("heading", { name: "한눈에 보기" })).toBeVisible();
});

test("catalog filters keep state in the URL", async ({ page }) => {
  await page.goto("/distros/?family=fedora");
  const visible = page.locator("[data-distro]:not([hidden])");
  await expect(visible.first()).toBeVisible();
  for (const family of await visible.evaluateAll((els) =>
    els.map((e) => (e as HTMLElement).dataset.family),
  )) {
    expect(family).toBe("fedora");
  }
  await page.locator('select[name="family"]').selectOption("");
  await expect(page).toHaveURL(/\/distros\/$/);
  await page.locator('[data-filters] input[name="q"]').fill("zzzz-no-such-distro");
  await expect(page.locator("[data-empty]")).toBeVisible();
});

test("English pages use the /en/ prefix and hreflang alternates", async ({ page }) => {
  await page.goto("/en/distros/fedora/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "At a glance" })).toBeVisible();
  await expect(page.locator('link[rel="alternate"][hreflang="ko"]')).toHaveAttribute(
    "href",
    /\/distros\/fedora\/$/,
  );
});

test("404 page", async ({ page }) => {
  const res = await page.goto("/does-not-exist/");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("theme switcher persists the choice", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "주 메뉴" }).click();
  await page.locator("label.style-option.dark").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("main menu holds the primary destinations on narrow screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/distros/fedora/");
  await expect(page.locator(".primary-nav")).toBeHidden();
  await page.getByRole("button", { name: "주 메뉴" }).click();
  const menu = page.locator("#main-menu");
  await expect(menu.getByRole("link", { name: "배포판", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  for (const name of ["리눅스 가이드", "배포판 추천", "계보", "릴리스 소식", "비교", "소개"]) {
    await expect(menu.getByRole("link", { name, exact: true })).toBeVisible();
  }
  const english = menu.getByRole("link", { name: "English" });
  await expect(english).toHaveAttribute("hreflang", "en");
  await expect(english).toHaveAttribute("href", "/en/distros/fedora/");
  await expect(menu.getByRole("link", { name: "한국어" })).toHaveCount(0);
});
