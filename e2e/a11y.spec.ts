import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const pages = [
  "/",
  "/distros/",
  "/distros/fedora/",
  "/distros/fedora/install/",
  "/distros/ubuntu/install/",
  "/learn/",
  "/learn/what-is-linux/",
  "/finder/",
  "/compare/",
  "/family/",
  "/en/",
];

/** Pages also checked at phone width (390 × 844): stacked layouts, the
    narrow carousel and the compare groups. */
const phonePages = ["/", "/distros/fedora/", "/compare/", "/finder/"];

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${v.id}: ${v.nodes
          .map((n) => n.target.join(" "))
          .slice(0, 3)
          .join(", ")}`,
    );
}

for (const path of pages) {
  for (const scheme of ["light", "dark"] as const) {
    test(`axe WCAG 2.2 AA: ${path} (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(path);
      expect(await seriousViolations(page)).toEqual([]);
    });
  }
}

for (const path of phonePages) {
  for (const scheme of ["light", "dark"] as const) {
    test(`axe WCAG 2.2 AA at 390px: ${path} (${scheme})`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(path);
      expect(await seriousViolations(page)).toEqual([]);
    });
  }
}
