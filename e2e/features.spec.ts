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

test("each finder result links its distro with its tagline", async ({ page }) => {
  await page.goto("/en/finder/");
  await page.getByRole("button", { name: "Show my matches" }).click();
  const rows = page.locator("[data-result-list] li a");
  await expect(rows).toHaveCount(3);
  for (const row of await rows.all()) {
    const href = (await row.getAttribute("href")) ?? "";
    expect(href).toMatch(/^\/en\/distros\/[a-z0-9-]+\/$/);
    await expect(row.locator(".heading")).not.toBeEmpty();
    await expect(row.locator(".adw-row-subtitle").first()).not.toBeEmpty();
    await expect(row.locator(".app-tile img")).toHaveAttribute("src", /./);
  }
});

test("in forced colors a phone shows the checked toggle answer on the system highlight", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/finder/");
  const checked = page.locator('label.adw-toggle:has(input[name="experience"]:checked)');
  await expect(checked).toBeVisible();
  const { color, background } = await checked.evaluate((el) => {
    const style = getComputedStyle(el);
    return { color: style.color, background: style.backgroundColor };
  });
  // Text and fill differ, and the fill is not see-through.
  expect(background).not.toBe("rgba(0, 0, 0, 0)");
  expect(background).not.toBe(color);
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

test("compare names unknown ids and says when no column is chosen", async ({ page }) => {
  await page.goto("/compare/?d=ubuntu,nope");
  const missing = page.locator("[data-compare-missing]");
  await expect(missing).toHaveAttribute("role", "status");
  await expect(missing).toHaveText("찾을 수 없어 제외한 배포판: “nope”");
  // The known ids keep their columns, the rest stay blank (no silent refill).
  await expect(page.locator('[data-head="0"]')).toContainText("Ubuntu");
  await expect(page.locator('[data-head="1"]')).toBeEmpty();
  await expect(page.locator('select[name="d1"] option:checked')).toHaveText("선택 안 함");
  const desktops = page.locator('[data-cell="0:desktops"]');
  await expect(desktops).toHaveAttribute("data-name", "Ubuntu");
  await expect(desktops).not.toContainText("·");
  // No column left: one sentence instead of an empty table; the note is gone.
  await page.locator('select[name="d0"]').selectOption("");
  await expect(missing).toBeHidden();
  await expect(page.locator("[data-compare-empty]")).toHaveText("비교할 배포판을 위에서 고르세요.");
  await expect(page.locator("[data-compare-table]")).toBeHidden();
  await expect(page).toHaveURL(/\/compare\/$/);
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

test("Enter in the search entry opens the first result", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+k");
  const input = page.locator("[data-search-input]");
  await input.fill("Fedora");
  const first = page.locator("[data-search-results] a").first();
  await expect(first).toBeVisible({ timeout: 10_000 });
  const href = await first.getAttribute("href");
  expect(href).toBeTruthy();
  await input.press("Enter");
  await expect(page).toHaveURL(new URL(href ?? "", page.url()).href);
});

test("Enter right after typing opens a result for what was typed, not the previous query", async ({
  page,
}) => {
  await page.goto("/distros/");
  await page.keyboard.press("Control+k");
  const input = page.locator("[data-search-input]");
  await input.fill("ubuntu");
  await expect(page.locator("[data-search-results] a").first()).toHaveAttribute("href", /ubuntu/, {
    timeout: 10_000,
  });
  // The list still shows "ubuntu" while the new search runs.
  await input.fill("fedora");
  await input.press("Enter");
  await expect(page).toHaveURL(/\/distros\/fedora\//);
});

test("search shows an error with a retry when the index fails, then recovers", async ({ page }) => {
  await page.route("**/pagefind/pagefind.js*", (route) => route.abort());
  await page.goto("/");
  await page.keyboard.press("Control+k");
  const input = page.locator("[data-search-input]");
  await input.fill("Fedora");
  // One status line says what happened; the ways out sit under it.
  const error = page.locator("[data-search-actions]");
  await expect(error).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("[data-search-status]")).toHaveText(/^검색 색인을 불러오지 못했습니다/);
  await expect(error.getByRole("link", { name: "배포판 둘러보기" })).toHaveAttribute(
    "href",
    "/distros/",
  );
  await expect(page.locator("[data-search-results] a")).toHaveCount(0);
  // Not memoized: once the index is reachable again, Try again finds results.
  await page.unroute("**/pagefind/pagefind.js*");
  await error.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.locator("[data-search-results] a").first()).toBeVisible({ timeout: 10_000 });
  await expect(error).toBeHidden();
  await expect(input).toBeFocused();
});

test("no search result offers the catalog, without Try again", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+k");
  await page.locator("[data-search-input]").fill("뷁뷁뷁");
  await expect(page.locator("[data-search-status]")).toHaveText("“뷁뷁뷁”에 대한 결과가 없습니다", {
    timeout: 10_000,
  });
  const actions = page.locator("[data-search-actions]");
  await expect(actions.getByRole("link", { name: "배포판 둘러보기" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "다시 시도" })).toBeHidden();
});

test("Esc closes the search dialog with text in the entry and returns focus", async ({ page }) => {
  await page.goto("/");
  const trigger = page.locator("[data-search-open]").filter({ visible: true }).first();
  await trigger.click();
  const input = page.locator("[data-search-input]");
  await input.fill("Fedora");
  await input.press("Escape");
  await expect(page.locator("#search-dialog")).toBeHidden();
  await expect(trigger).toBeFocused();
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

test("a code block copies with a check icon and a toast", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/distros/fedora/install/");
  // The live region is in the page, empty, before the first message.
  const toast = page.locator("[data-toast]");
  await expect(toast).toHaveAttribute("role", "status");
  await expect(toast).toHaveText("");
  const pre = page.locator("article.prose pre").filter({ visible: true }).first();
  await pre.hover();
  const button = pre.getByRole("button", { name: "코드 복사" });
  await button.click();
  await expect(toast).toHaveText("클립보드에 복사했습니다");
  await expect(button.locator("svg.check-icon")).toHaveCount(1);
  const code = (await pre.locator("code").first().innerText()).trim();
  expect((await page.evaluate(() => navigator.clipboard.readText())).trim()).toBe(code);
  // Back to the copy icon after 2 s.
  await expect(button.locator("svg.copy-icon")).toHaveCount(1, { timeout: 3000 });
});

test("the wizard copies the checksum it shows", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/distros/fedora/");
  const digest = (await page.locator("[data-checksum]").innerText()).trim();
  await page.locator("#download").getByRole("button", { name: "체크섬 복사" }).click();
  await expect(page.locator("[data-toast]")).toHaveText("클립보드에 복사했습니다");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(digest);
});

test("a failed checksum copy selects the digest and says so under it", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
  });
  await page.goto("/distros/fedora/");
  const status = page.locator("#download [data-copy-status]");
  await expect(status).toHaveAttribute("role", "status");
  await expect(status).toBeEmpty();
  await page.locator("#download").getByRole("button", { name: "체크섬 복사" }).click();
  // Inside the component, not in a toast that would cover the selected text.
  await expect(status).toHaveText(/^복사하지 못했습니다\./);
  await expect(page.locator("[data-toast]")).toHaveText("");
  const digest = (await page.locator("[data-checksum]").innerText()).trim();
  expect((await page.evaluate(() => getSelection()?.toString() ?? "")).trim()).toBe(digest);
});

test("a failed copy selects the code and says so", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
  });
  await page.goto("/en/distros/fedora/install/");
  const pre = page.locator("article.prose pre").filter({ visible: true }).first();
  await pre.hover();
  await pre.getByRole("button", { name: "Copy code" }).click();
  await expect(page.locator("[data-toast]")).toHaveText(/^Couldn’t copy\./);
  const code = (await pre.locator("code").first().innerText()).trim();
  expect((await page.evaluate(() => getSelection()?.toString() ?? "")).trim()).toBe(code);
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
