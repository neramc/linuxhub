import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const carousel = (page: Page) => page.locator("[data-carousel]");
const rotate = (page: Page) => page.locator("[data-rotate]");
const slides = (page: Page) => page.locator("[data-track] > *");

/** Index of the current slide according to the dots (the script's state). */
const current = (page: Page) =>
  page
    .locator("[data-dots] > *")
    .evaluateAll((dots) => dots.findIndex((d) => d.classList.contains("current")));

async function ready(page: Page, path = "/") {
  await page.goto(path);
  await expect(carousel(page)).toHaveClass(/enhanced/);
}

test.describe("popular carousel", () => {
  test("is the first thing on the home page, with five tinted slides", async ({ page }) => {
    await ready(page);
    await expect(page.locator("h1")).toContainText("리눅스");
    const first = await page.locator("main h2").first().getAttribute("id");
    expect(first).toBe("popular-title");
    await expect(carousel(page)).toHaveAttribute("aria-labelledby", "popular-title");
    await expect(carousel(page)).toHaveAttribute("aria-roledescription", "캐러셀");
    await expect(slides(page)).toHaveCount(5);
    for (const slide of await slides(page).all()) {
      await expect(slide).toHaveAttribute("role", "group");
      await expect(slide).toHaveAttribute("aria-roledescription", "슬라이드");
      await expect(slide).toHaveClass(
        /\baccent-(blue|teal|green|yellow|orange|red|pink|purple|slate)\b/,
      );
    }
    // Ranked by Wikipedia pageviews: rank labels and the basis caption with its date.
    await expect(slides(page).first()).toContainText("오늘의 인기 1위");
    await expect(page.locator("#popular time[datetime]").first()).toHaveAttribute(
      "datetime",
      /^\d{4}-\d{2}-\d{2}$/,
    );
    await expect(page.locator('#popular a[href="/about/#popularity"]')).toBeVisible();
  });

  test("keyboard focus enters at the rotation button and stops rotation", async ({ page }) => {
    await ready(page);
    await expect(rotate(page)).toHaveAttribute("aria-label", "자동 넘김 멈추기");
    await page.locator("main").focus();
    await page.keyboard.press("Tab");
    await expect(rotate(page)).toBeFocused();
    await expect(rotate(page)).toHaveAttribute("aria-label", "자동 넘김 시작");
    await page.keyboard.press("Enter");
    await expect(rotate(page)).toHaveAttribute("aria-label", "자동 넘김 멈추기");
  });

  test("only the current slide's links are reachable", async ({ page }) => {
    await ready(page);
    const inert = await slides(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).inert));
    expect(inert).toEqual([false, true, true, true, true]);
    await rotate(page).focus();
    const order: string[] = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      order.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          return el.closest("[data-track] > *")
            ? `slide:${el.closest<HTMLElement>("[data-track] > *")?.dataset.slug}`
            : (el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "");
        }),
      );
    }
    expect(order).toEqual([
      "순위 안내",
      "이전 슬라이드",
      "다음 슬라이드",
      expect.stringMatching(/^slide:/),
      order[3],
      expect.not.stringMatching(/^slide:/),
    ]);
  });

  test("next on the last slide wraps to the first and announces it", async ({ page }) => {
    await ready(page);
    const next = page.locator("[data-next]");
    for (let i = 1; i < 5; i++) await next.click();
    await expect.poll(() => current(page)).toBe(4);
    await expect(slides(page).nth(4)).not.toHaveAttribute("inert");
    const name = await slides(page).nth(4).getAttribute("data-name");
    await expect(page.locator("[data-status]")).toHaveText(`5 / 5: ${name}`);
    await next.click();
    await expect.poll(() => current(page)).toBe(0);
    await expect
      .poll(() => page.locator("[data-track]").evaluate((t) => t.scrollLeft))
      .toBeLessThan(2);
    await page.locator("[data-prev]").click();
    await expect.poll(() => current(page)).toBe(4);
  });

  test("swiping the track adopts the slide", async ({ page }) => {
    await ready(page);
    await page.locator("[data-track]").evaluate((t) => t.scrollTo({ left: t.clientWidth * 2 }));
    await expect.poll(() => current(page)).toBe(2);
    await expect(slides(page).nth(2)).not.toHaveAttribute("inert");
  });

  test("advances on its own, but not while hovered", async ({ page }) => {
    test.slow();
    await ready(page);
    await page.locator(".carousel-viewport").hover();
    await page.waitForTimeout(9000);
    expect(await current(page)).toBe(0);
    await page.mouse.move(5, 5);
    await expect.poll(() => current(page), { timeout: 10_000 }).toBe(1);
  });

  test("does not rotate with reduced motion", async ({ page }) => {
    test.slow();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await ready(page);
    await expect(rotate(page)).toHaveAttribute("aria-label", "자동 넘김 시작");
    await page.waitForTimeout(9000);
    expect(await current(page)).toBe(0);
  });

  test("controls take their space before JS (no layout shift)", async ({ browser }) => {
    const boxes = async (javaScriptEnabled: boolean) => {
      const context = await browser.newContext({
        javaScriptEnabled,
        viewport: { width: 1366, height: 900 },
      });
      const page = await context.newPage();
      await page.goto("/");
      await page.evaluate(() => document.fonts.ready);
      const result = await page.evaluate(() =>
        [".carousel-viewport", "[data-use-chips]", "#featured-title"].map((s) => {
          const r = document.querySelector(s)?.getBoundingClientRect();
          return r && [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
        }),
      );
      await context.close();
      return result;
    };
    expect(await boxes(true)).toEqual(await boxes(false));
  });

  test("the built carousel script stays under 3 KB", async ({ page, request }) => {
    await page.goto("/");
    // Astro inlines small module scripts; larger ones become /_astro/ chunks.
    const scripts = await page
      .locator("script[type=module]")
      .evaluateAll((els) => els.map((e) => [(e as HTMLScriptElement).src, e.textContent ?? ""]));
    let size = 0;
    for (const [src, inline] of scripts) {
      const body = src ? await (await request.get(src)).text() : (inline ?? "");
      if (body.includes("[data-carousel]")) size = Buffer.byteLength(body);
    }
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(3072);
  });
});

for (const javaScriptEnabled of [true, false]) {
  test(`no horizontal overflow at 390px (JS ${javaScriptEnabled ? "on" : "off"})`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled,
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    for (const path of [
      "/",
      "/en/",
      "/releases/",
      "/about/",
      "/en/about/#logos",
      "/does-not-exist/",
    ]) {
      await page.goto(path);
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width, path).toBeLessThanOrEqual(390);
    }
    await context.close();
  });
}

test("no inline style attributes on the home, releases, about and 404 pages", async ({ page }) => {
  for (const path of ["/", "/en/", "/releases/", "/about/", "/does-not-exist/"]) {
    await page.goto(path);
    expect(await page.locator("[style]").count(), path).toBe(0);
  }
});

test("home lists recommended distros not in the carousel and grouped new releases", async ({
  page,
}) => {
  await page.goto("/");
  const inCarousel = await slides(page).evaluateAll((els) =>
    els.map((e) => (e as HTMLElement).dataset.slug),
  );
  const cards = page.locator('section[aria-labelledby="featured-title"] .distro-card');
  await expect(cards).toHaveCount(6);
  for (const href of await cards.evaluateAll((els) => els.map((e) => e.getAttribute("href")))) {
    expect(inCarousel.map((s) => `/distros/${s}/`)).not.toContain(href);
  }
  const rows = page.locator('section[aria-labelledby="recent-title"] .adw-action-row');
  expect(await rows.count()).toBeLessThanOrEqual(5);
  const titles = await rows.locator(".adw-row-title").allTextContents();
  expect(new Set(titles.map((t) => t.trim().split(" ")[0])).size).toBe(titles.length);
  await expect(page.getByRole("link", { name: "배포판 둘러보기" })).toHaveAttribute(
    "href",
    "/distros/",
  );
  await expect(page.getByRole("link", { name: /리눅스가 처음이라면/ })).toHaveAttribute(
    "href",
    "/learn/",
  );
});

test("releases page groups same-day flavors and shows the day only", async ({ page }) => {
  await page.goto("/releases/");
  const months = page.locator("main section h2");
  expect(await months.count()).toBeGreaterThan(0);
  const titles = (await page.locator("main .adw-row-title").allTextContents()).map((t) => t.trim());
  // Kubuntu/Lubuntu/Xubuntu ship with Ubuntu on the same day: one row, led by Ubuntu.
  expect(titles.some((t) => t.startsWith("Kubuntu"))).toBe(false);
  for (const day of await page.locator("main .adw-row-suffix time").allTextContents()) {
    expect(day.trim()).toMatch(/^\d{1,2}일$/);
  }
});

test("RSS keeps one item per version", async ({ request }) => {
  const xml = await (await request.get("/rss.xml")).text();
  const history = JSON.parse(readFileSync("src/data/history.json", "utf8")) as {
    slug: string;
    version: string;
  }[];
  const titles = [...xml.matchAll(/<item>\s*<title>([^<]*)<\/title>/g)].map((m) => m[1]);
  // Flavors and point releases stay separate items (only the pages group them).
  const kubuntu = history.filter((h) => h.slug === "kubuntu").length;
  expect(titles.filter((t) => t?.startsWith("Kubuntu ")).length).toBe(kubuntu);
});

test("about explains the ranking and folds the logo credits", async ({ page }) => {
  await page.goto("/about/");
  await expect(page.locator("h2#popularity")).toBeVisible();
  await expect(page.locator("details.logo-credits")).not.toHaveAttribute("open");
  await expect(page.getByText(/Larry Ewing/)).toBeVisible();
  await page.goto("/about/#logos");
  await expect(page.locator("details.logo-credits")).toHaveAttribute("open");
});

test("404 has one home button and an English link", async ({ page }) => {
  const res = await page.goto("/does-not-exist/");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("link", { name: "홈으로" })).toHaveAttribute("href", "/");
  await expect(page.locator('a[href="/en/"][hreflang="en"]').last()).toBeVisible();
});

for (const path of [
  "/releases/",
  "/en/releases/",
  "/about/",
  "/en/about/#logos",
  "/does-not-exist/",
]) {
  for (const scheme of ["light", "dark"] as const) {
    test(`axe WCAG 2.2 AA: ${path} (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(
        serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
      ).toEqual([]);
    });
  }
}

test("axe on every slide of the carousel (light and dark)", async ({ page }) => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await ready(page);
    for (let i = 0; i < 5; i++) {
      if (i > 0) await page.locator("[data-next]").click();
      await expect.poll(() => current(page)).toBe(i);
      const results = await new AxeBuilder({ page })
        .include("[data-carousel]")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations.map((v) => `${scheme} slide ${i + 1}: ${v.id}`)).toEqual([]);
    }
  }
});
