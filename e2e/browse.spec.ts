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
