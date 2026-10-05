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
  // A facet in the URL opens the Filters disclosure and counts as one filter.
  const filters = page.locator("[data-filter-panel]");
  await expect(filters).toHaveAttribute("open", "");
  await expect(page.locator("[data-filter-count]")).toHaveText("1");
  const visible = page.locator("[data-distro]:not([hidden])");
  await expect(visible.first()).toBeVisible();
  for (const family of await visible.evaluateAll((els) =>
    els.map((e) => (e as HTMLElement).dataset.family),
  )) {
    expect(family).toBe("fedora");
  }
  await page.locator('select[name="family"]').selectOption("");
  await expect(page).toHaveURL(/\/distros\/$/);
  await expect(page.locator("[data-filter-count]")).toBeHidden();
  await page.locator('[data-filters] input[name="q"]').fill("zzzz-no-such-distro");
  await expect(page.locator("[data-empty]")).toBeVisible();
});

test("catalog filters disclosure and use-case chips", async ({ page }) => {
  await page.goto("/distros/");
  const filters = page.locator("[data-filter-panel]");
  await expect(filters).not.toHaveAttribute("open", "");
  await filters.locator("summary").click();
  await page.locator('select[name="level"]').selectOption("beginner");
  await expect(page).toHaveURL(/level=beginner/);
  await expect(page.locator("[data-filter-count]")).toHaveText("1");
  // The chip row filters in place and marks the current chip.
  const chips = page.locator("[data-use-chips]");
  await chips.locator('[data-use-chip="gaming"]').click();
  await expect(page).toHaveURL(/use=gaming/);
  await expect(chips.locator('[data-use-chip="gaming"]')).toHaveAttribute("aria-current", "page");
  await expect(page.locator('select[name="use"]')).toHaveValue("gaming");
  for (const uses of await page
    .locator("[data-distro]:not([hidden])")
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.use))) {
    expect(uses?.split(" ")).toContain("gaming");
  }
  await chips.locator('[data-use-chip=""]').click();
  await expect(page).not.toHaveURL(/use=/);
  // A use-case link from the home page keeps the disclosure closed (the chip shows it).
  await page.goto("/distros/?use=gaming");
  await expect(filters).not.toHaveAttribute("open", "");
  await expect(chips.locator('[data-use-chip="gaming"]')).toHaveAttribute("aria-current", "page");
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
