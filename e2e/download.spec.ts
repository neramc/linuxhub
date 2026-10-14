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

test("the detail page offers exactly two hero actions and ends the wizard with the USB step", async ({
  page,
}) => {
  await page.goto("/distros/fedora/");
  const actions = page.locator(".hero-actions a");
  await expect(actions).toHaveCount(2);
  await expect(actions.first()).toHaveAttribute("href", "#download");
  await expect(actions.nth(1)).toHaveAttribute("href", "/distros/fedora/install/");
  await expect(page.locator('#download a[href="/distros/fedora/install/#usb"]')).toBeVisible();
});

test("secondary facts sit in a closed native disclosure", async ({ page }) => {
  await page.goto("/en/distros/fedora/");
  const more = page.locator("details", { hasText: "More details" });
  await expect(more).not.toHaveAttribute("open");
  const use = more.locator('a[href^="/en/distros/?use="]').first();
  await expect(use).toBeHidden();
  await more.locator("summary").click();
  await expect(use).toBeVisible();
});

test("the install guide does not scroll sideways on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/distros/fedora/install/");
  await expect(page.locator("article.prose")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator("details.doc-sources")).not.toHaveAttribute("open");
});

test("a distro without a written guide links the official install docs, never missing sections", async ({
  page,
}) => {
  await page.goto("/distros/ubuntu/");
  const actions = page.locator(".hero-actions a");
  await expect(actions).toHaveCount(2);
  await expect(actions.first()).toHaveAttribute("href", "#download");
  await expect(actions.nth(1)).toHaveAttribute("href", /^https:\/\//);
  await expect(actions.nth(1)).toHaveAttribute("target", "_blank");
  await expect(page.locator('#download a[href^="/distros/ubuntu/install/"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: "다음 단계: 공식 설치 안내" })).toHaveAttribute(
    "href",
    /^https:\/\//,
  );
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1366, height: 900 },
]) {
  test(`detail pages have one suggested button at ${viewport.width}px: the wizard's`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    for (const slug of ["fedora", "ubuntu", "elementary-os"]) {
      await page.goto(`/distros/${slug}/`);
      // SPEC §7: one suggested action per view. The hero's Download is the
      // default variant, so the wizard's final button is the only one.
      const suggested = page.locator("main .adw-button.suggested");
      await expect(suggested).toHaveCount(1);
      await expect(page.locator("#download .adw-button.suggested")).toBeVisible();
    }
  });
}

test("an install guide that is not written yet is a noindex page with one action", async ({
  page,
  request,
}) => {
  await page.goto("/distros/ubuntu/install/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  // Not in the search index (Pagefind indexes only pages with a body) or the sitemap.
  await expect(page.locator("[data-pagefind-body]")).toHaveCount(0);
  const sitemap = await (await request.get("/sitemap-0.xml")).text();
  expect(sitemap).toContain("/distros/fedora/install/");
  expect(sitemap).not.toContain("/distros/ubuntu/install/");
  // One h1, no h2 above the section size (title-2, 22px), one action: the official docs.
  await expect(page.locator("h1")).toHaveCount(1);
  const h2Sizes = await page
    .locator("h2")
    .evaluateAll((els) => els.map((el) => Number.parseFloat(getComputedStyle(el).fontSize)));
  expect(h2Sizes.every((size) => size <= 22)).toBe(true);
  const suggested = page.locator(".adw-button.suggested");
  await expect(suggested).toHaveCount(1);
  await expect(suggested).toHaveAttribute("href", /^https:\/\//);
  await expect(suggested).toHaveAttribute("target", "_blank");
  await expect(suggested).toContainText("공식 설치 문서");
});
