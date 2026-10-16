import { expect, test } from "@playwright/test";

for (const path of ["/learn/what-is-linux/", "/en/learn/what-is-linux/"]) {
  test(`a chapter's sources open on a phone without clipped text: ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    const sources = page.locator("details.doc-sources");
    await expect(sources).not.toHaveAttribute("open");
    await sources.locator("summary").click();
    await expect(sources).toHaveAttribute("open", "");
    await expect(sources.locator(".adw-expander-content a").first()).toBeVisible();
    // The boxed list clips its content (overflow: hidden), so every line of
    // the expander, long URLs included, has to wrap inside it.
    const clipped = await sources.evaluate((details) => {
      const list = details.closest(".adw-boxed-list");
      if (!list) return ["no boxed list"];
      const { left, right } = list.getBoundingClientRect();
      return [...details.querySelectorAll<HTMLElement>(".adw-expander-content *")]
        .filter((el) => {
          const box = el.getBoundingClientRect();
          const scrolls =
            getComputedStyle(el).display !== "inline" && el.scrollWidth > el.clientWidth + 1;
          return box.left < left - 0.5 || box.right > right + 0.5 || scrolls;
        })
        .map((el) => `${el.tagName.toLowerCase()}: ${el.textContent?.trim().slice(0, 40)}`);
    });
    expect(clipped).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("a chapter shows the chapters and its sections beside the article, prev and next after it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/learn/history/");
  const sidebar = page.locator(".doc-sidebar");
  await expect(sidebar).toBeVisible();
  await expect(page.locator(".toc-narrow")).toBeHidden();
  await expect(sidebar.locator('a[aria-current="page"]')).toHaveAttribute(
    "href",
    "/learn/history/",
  );
  // The current chapter's h2 sections, each pointing at a heading of the article.
  // One landmark for the chapters; the sections are a named list inside it.
  await expect(sidebar.getByRole("navigation")).toHaveCount(1);
  const sections = sidebar.getByRole("list", { name: "이 장의 내용" }).getByRole("link");
  expect(await sections.count()).toBeGreaterThan(0);
  for (const href of await sections.evaluateAll((els) => els.map((e) => e.getAttribute("href")))) {
    await expect(page.locator(`article.prose h2[id="${href?.slice(1)}"]`)).toHaveCount(1);
  }
  const pager = page.getByRole("navigation", { name: "이전 장과 다음 장" });
  await expect(pager.locator('a[rel="prev"]')).toHaveAttribute("href", "/learn/what-is-linux/");
  await expect(pager.locator('a[rel="next"]')).toHaveAttribute("href", "/learn/why-linux/");

  // Below 1000px the same list is a closed disclosure above the article.
  await page.setViewportSize({ width: 390, height: 844 });
  const disclosure = page.locator(".toc-narrow details");
  await expect(sidebar).toBeHidden();
  await expect(disclosure).not.toHaveAttribute("open");
  await disclosure.locator("summary").click();
  await expect(disclosure.locator('a[aria-current="page"]')).toBeVisible();
});
