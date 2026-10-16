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

test("while another choice loads, the wizard offers no stale link or checksum", async ({
  page,
}) => {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/data/releases/**", async (route) => {
    await released;
    await route.continue();
  });
  await page.goto("/distros/fedora/");
  const wizard = page.locator("[data-wizard]");
  const download = page.locator("[data-download]");
  await expect(download).toHaveAttribute("href", /\.iso$/);
  await page.locator('select[name="edition"]').selectOption("kde");
  await expect(download).not.toHaveAttribute("href");
  await expect(download).toHaveAttribute("aria-disabled", "true");
  await expect(wizard).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("[data-verify]")).toBeHidden();
  // After 300 ms a spinner and a sentence take the file line's place; the
  // checksum element itself only ever holds a digest.
  const loading = page.locator("[data-loading]");
  await expect(loading).toBeVisible();
  await expect(loading).toHaveText("파일 정보를 불러오는 중…");
  await expect(page.locator("[data-file]")).toBeHidden();
  await expect(page.locator("[data-checksum]")).toHaveText(/^[0-9a-f]{64}$/);
  release();
  await expect(download).toHaveAttribute("href", /KDE/);
  await expect(download).not.toHaveAttribute("aria-disabled");
  await expect(wizard).not.toHaveAttribute("aria-busy");
  await expect(loading).toBeHidden();
  await expect(page.locator("[data-file]")).toContainText("KDE");
  await expect(page.locator("[data-verify]")).toBeVisible();
});

test("when other versions fail to load, the wizard keeps what it serves and can try again", async ({
  page,
}) => {
  await page.route("**/data/releases/**", (route) => route.abort());
  await page.goto("/distros/fedora/");
  const download = page.locator("[data-download]");
  const edition = page.locator('select[name="edition"]');
  const href = await download.getAttribute("href");
  const shown = await edition.inputValue();
  await edition.selectOption("kde");
  const error = page.locator("[data-wizard-error]");
  await expect(error).toBeVisible();
  await expect(error.getByRole("alert")).toHaveText(/^다른 버전 정보를 불러오지 못했습니다\./);
  // The select is back on the choice the link still serves.
  await expect(edition).toHaveValue(shown);
  await expect(download).toHaveAttribute("href", href ?? "");
  await expect(download).not.toHaveAttribute("aria-disabled");
  await expect(page.locator("[data-verify]")).toBeVisible();
  // A failure is not kept: once the data is reachable, Try again applies the choice.
  await page.unroute("**/data/releases/**");
  await error.getByRole("button", { name: "다시 시도" }).click();
  await expect(download).toHaveAttribute("href", /KDE/);
  await expect(edition).toHaveValue("kde");
  await expect(error).toBeHidden();
  await expect(edition).toBeFocused();
});

test("when the mirror list fails, the wizard names the official server and can try again", async ({
  page,
}) => {
  await page.route("**/api/geo", (route) =>
    route.fulfill({
      json: { cc: "KR", lat: 37.57, lon: 126.98 },
      headers: { "cache-control": "no-store" },
    }),
  );
  await page.route("**/data/mirrors/**", (route) => route.abort());
  await page.goto("/distros/arch/");
  const error = page.locator("[data-mirror-error]");
  await expect(error).toBeVisible({ timeout: 10_000 });
  await expect(error.getByRole("status")).toHaveText(/^미러 목록을 불러오지 못했습니다\./);
  await expect(page.locator("[data-mirror-label]")).toHaveText("공식 서버");
  const mirror = page.locator('select[name="mirror"]');
  await expect(mirror).toBeHidden();
  const download = page.locator("[data-download]");
  await expect(download).toHaveAttribute("href", /^https:\/\/geo\.mirror\.pkgbuild\.com\/.+\.iso$/);
  await page.unroute("**/data/mirrors/**");
  await error.getByRole("button", { name: "다시 시도" }).click();
  await expect(mirror).toBeVisible({ timeout: 10_000 });
  await expect(mirror).toBeFocused();
  await expect(error).toBeHidden();
  await expect(page.locator("[data-mirror-label]")).toHaveText("대한민국에서 가장 가까움");
  // The official server first, then one group per country: no star, one dot.
  await expect(mirror.locator("option").first()).toHaveText("공식 서버");
  await expect(mirror.locator("optgroup").first()).toHaveAttribute("label", "대한민국");
  const labels = await mirror.locator("option").allTextContents();
  expect(labels.every((text) => !text.includes("★") && text.split(" · ").length <= 2)).toBe(true);
  const chosen = await mirror.inputValue();
  expect((await download.getAttribute("href"))?.startsWith(chosen)).toBe(true);
});

test("the mirror suggestion does not depend on the release data", async ({ page }) => {
  await page.route("**/api/geo", (route) =>
    route.fulfill({
      json: { cc: "KR", lat: 37.57, lon: 126.98 },
      headers: { "cache-control": "no-store" },
    }),
  );
  await page.route("**/data/releases/**", (route) => route.abort());
  await page.goto("/distros/arch/");
  const mirror = page.locator('select[name="mirror"]');
  await expect(mirror).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("[data-mirror-error]")).toBeHidden();
  await expect(page.locator("[data-mirror-label]")).toHaveText("대한민국에서 가장 가까움");
  // The server's file, from the chosen mirror, without the release data.
  const download = page.locator("[data-download]");
  const chosen = await mirror.inputValue();
  const href = await download.getAttribute("href");
  expect(href?.startsWith(chosen)).toBe(true);
  expect(href).toMatch(/archlinux-.*-x86_64\.iso$/);
  // Back to the official server, still without the release data.
  await mirror.selectOption("");
  await expect(download).toHaveAttribute("href", /^https:\/\/geo\.mirror\.pkgbuild\.com\/.+\.iso$/);
  await expect(page.locator("[data-wizard-error]")).toBeHidden();
});

test.describe("without any location", () => {
  test.use({ timezoneId: "UTC" });

  test("the top-ranked official mirror is still suggested", async ({ page }) => {
    await page.route("**/api/geo", (route) =>
      route.fulfill({
        json: { cc: null, lat: null, lon: null },
        headers: { "cache-control": "no-store" },
      }),
    );
    await page.goto("/distros/arch/");
    const mirror = page.locator('select[name="mirror"]');
    await expect(mirror).toBeVisible({ timeout: 10_000 });
    // As before the redesign: without a location the project's own quality
    // order picks the mirror, labelled as a suggestion (not "for <country>").
    const chosen = await mirror.inputValue();
    expect(chosen).not.toBe("");
    await expect(page.locator("[data-mirror-label]")).toHaveText("추천 서버");
    const href = await page.locator("[data-download]").getAttribute("href");
    expect(href?.startsWith(chosen)).toBe(true);
  });
});

test("a wait the visitor caused is announced, and no stale size is shown", async ({ page }) => {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/data/releases/**", async (route) => {
    await released;
    await route.continue();
  });
  await page.goto("/distros/fedora/");
  const live = page.locator("[data-wizard-status]");
  await expect(live).toHaveAttribute("role", "status");
  await expect(live).toBeEmpty();
  // Outside the card, which is aria-busy while it waits.
  await expect(page.locator("[data-wizard] [data-wizard-status]")).toHaveCount(0);
  const label = page.locator("[data-download-label]");
  await expect(label).toContainText(" · ");
  await page.locator('select[name="edition"]').selectOption("kde");
  await expect(label).toHaveText("ISO 받기");
  await expect(live).toHaveText("파일 정보를 불러오는 중…");
  release();
  await expect(page.locator("[data-download]")).toHaveAttribute("href", /KDE/);
  await expect(label).toContainText(" · ");
  await expect(live).toBeEmpty();
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
