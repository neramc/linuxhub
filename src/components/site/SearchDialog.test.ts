import { readFileSync } from "node:fs";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import SearchDialog from "./SearchDialog.astro";

const container = await AstroContainer.create();
/** Rendered HTML without the dev-only source-location attributes. */
const render = async (...args: Parameters<typeof container.renderToString>) =>
  (await container.renderToString(...args)).replace(/ data-astro-source-(?:file|loc)="[^"]*"/g, "");

describe("SearchDialog", () => {
  it("has a titled header, a search landmark without a form, and one hidden actions row", async () => {
    const html = await render(SearchDialog, { props: { locale: "en" } });
    // No <form method="dialog">: Enter in the entry must not close the dialog.
    expect(html).not.toContain("<form");
    expect(html).toMatch(/<dialog id="search-dialog"[^>]*aria-labelledby="search-title"/);
    expect(html).toMatch(/<h2 id="search-title"[^>]*>Search<\/h2>/);
    expect(html).toMatch(
      /<button type="button"[^>]*aria-label="Close search"[^>]*data-search-close/,
    );
    expect(html).toMatch(/role="search"[^>]*>\s*<div class="adw-entry">/);
    expect(html).toMatch(/aria-controls="search-results"[^>]*data-search-input/);
    expect(html).toMatch(/<span data-search-status aria-live="polite"[^>]*>Type a distro name/);
    // Empty and error states share the status line (its sentences are in the
    // labels) and one actions row: Try again and the catalog link, no icons.
    const actions =
      html.match(
        /<div class="search-actions button-row"[^>]*data-search-actions hidden[^>]*>[\s\S]*?<\/div>/,
      )?.[0] ?? "";
    expect(actions).toMatch(/<button type="button"[^>]*data-search-retry[^>]*>[\s\S]*Try again/);
    expect(actions).toMatch(/<a [^>]*href="\/en\/distros\/"[^>]*>[\s\S]*All distributions/);
    expect(actions).not.toContain("<svg");
    expect(html).toContain("The search index didn’t load.");
    // The script fills the counts from these templates.
    expect(html).toContain("Showing {shown} of {count} results");
  });
});

describe("normalize()", () => {
  // Two copies on purpose (a shared module would be one more request on every
  // page, ADR-0016); they must not drift apart.
  const source = (file: string) =>
    readFileSync(new URL(`../../scripts/${file}`, import.meta.url), "utf8").match(
      /function normalize\([\s\S]*?\n}\n/,
    )?.[0];

  it("is the same in the search dialog and the catalog filter", () => {
    expect(source("search.ts")).toBeTruthy();
    expect(source("search.ts")).toBe(source("catalog-filter.ts"));
  });
});
