import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Axe gate (.ai/roadmap.md DoD): serious/critical violations block.

const PAGES = ["/", "/explore", "/distro/fedora", "/rankings", "/quiz"];

for (const path of PAGES) {
	test(`axe: ${path}`, async ({ page }) => {
		await page.goto(path);
		const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
		const blocking = results.violations.filter(
			(v) => v.impact === "serious" || v.impact === "critical",
		);
		expect(
			blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
		).toEqual([]);
	});
}
