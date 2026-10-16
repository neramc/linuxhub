import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import AppHeader from "./AppHeader.astro";
import ActionRow from "./adw/ActionRow.astro";
import AppTile from "./adw/AppTile.astro";
import { nearestTileSize } from "./adw/app-tile";
import Badge from "./adw/Badge.astro";
import Banner from "./adw/Banner.astro";
import BoxedList from "./adw/BoxedList.astro";
import Chip from "./adw/Chip.astro";
import ChoiceGroup from "./adw/ChoiceGroup.astro";
import ComboRow from "./adw/ComboRow.astro";
import ExpanderRow from "./adw/ExpanderRow.astro";
import SearchEntry from "./adw/SearchEntry.astro";
import StatusPage from "./adw/StatusPage.astro";
import CompareTable from "./CompareTable.astro";
import DistroLogo from "./DistroLogo.astro";
import FamilyNode from "./FamilyNode.astro";
import Breadcrumb from "./site/Breadcrumb.astro";
import UseCaseChips from "./UseCaseChips.astro";

const container = await AstroContainer.create();
/** Rendered HTML without the dev-only source-location attributes. */
const render = async (...args: Parameters<typeof container.renderToString>) =>
  (await container.renderToString(...args)).replace(/ data-astro-source-(?:file|loc)="[^"]*"/g, "");

describe("nearestTileSize", () => {
  it("snaps to the supported sizes, ties going up", () => {
    expect(nearestTileSize(22)).toBe(24);
    expect(nearestTileSize(28)).toBe(24);
    expect(nearestTileSize(36)).toBe(36);
    expect(nearestTileSize(56)).toBe(64);
    expect(nearestTileSize(112)).toBe(128);
    expect(nearestTileSize(400)).toBe(160);
  });
});

describe("AppTile", () => {
  it("renders a decorative, lazy image on a sized tile with passthrough attributes", async () => {
    const html = await container.renderToString(AppTile, {
      props: {
        src: "/x.svg",
        size: 128,
        narrowSize: 96,
        fetchpriority: "high",
        "data-test": "tile",
        imgAttrs: { "data-pagefind-meta": "image[src]" },
      },
    });
    expect(html).toMatch(/class="app-tile size-128 narrow-96"/);
    expect(html).toContain('data-test="tile"');
    expect(html).toMatch(/<img [^>]*\balt(="")?[\s>]/);
    expect(html).toContain('width="96" height="96"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('fetchpriority="high"');
    expect(html).toContain('data-pagefind-meta="image[src]"');
  });
});

describe("DistroLogo", () => {
  it("snaps legacy sizes and marks wordmark logos as wide", async () => {
    const square = await container.renderToString(DistroLogo, {
      props: { file: "fedora.svg", name: "Fedora Linux", size: 112, eager: true },
    });
    expect(square).toMatch(/class="app-tile size-128 distro-logo"/);
    expect(square).toContain('loading="eager"');
    expect(square).not.toContain("fetchpriority");

    const wide = await container.renderToString(DistroLogo, {
      props: { file: "raspberry-pi-os.svg", name: "Raspberry Pi OS", size: 64, decorative: false },
    });
    expect(wide).toMatch(/class="app-tile size-64 wide distro-logo"/);
    expect(wide).toContain('alt="Raspberry Pi OS"');
  });
});

describe("Banner", () => {
  it("leads a warning with the warning icon (icon + color + text) and keeps the neutral one plain", async () => {
    const warning = await render(Banner, { props: { title: "Stale", tone: "warning" } });
    expect(warning).toMatch(/class="adw-banner warning"[^>]*role="status"/);
    expect(warning).toMatch(
      /<p class="adw-banner-title"><svg[^>]*class="adw-icon adw-banner-icon"[^>]*aria-hidden="true"/,
    );
    expect(warning).toContain("<span>Stale</span>");
    const neutral = await render(Banner, { props: { title: "Note" } });
    expect(neutral).not.toContain("<svg");
  });
});

describe("Chip", () => {
  it("marks the current link and renders buttons with type=button", async () => {
    const link = await container.renderToString(Chip, {
      props: { href: "/distros/?use=gaming", current: true, icon: "gaming" },
      slots: { default: "Gaming" },
    });
    expect(link).toContain('aria-current="page"');
    expect(link).toMatch(/class="adw-chip with-icon"/);
    const button = await container.renderToString(Chip, { slots: { default: "All" } });
    expect(button).toContain('type="button"');
    expect(button).not.toContain("aria-current");
  });

  it("carries a hidden check icon after its own icon when it can be current", async () => {
    const link = await container.renderToString(Chip, {
      props: { href: "/distros/?use=gaming", icon: "gaming", current: false },
      slots: { default: "Gaming" },
    });
    expect(link).not.toContain("aria-current");
    const icon = link.indexOf('class="adw-icon adw-chip-icon"');
    const check = link.indexOf('class="adw-icon adw-chip-check"');
    expect(icon).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(icon);
    expect(link.match(/<svg/g)).toHaveLength(2);
    const toggle = await container.renderToString(Chip, {
      props: { "aria-pressed": "false" },
      slots: { default: "All" },
    });
    expect(toggle).toMatch(/class="adw-chip"/);
    expect(toggle).toContain('class="adw-icon adw-chip-check"');
    expect(toggle.match(/<svg/g)).toHaveLength(1);
  });

  it("skips the check icon on a plain shortcut chip", async () => {
    const shortcut = await container.renderToString(Chip, {
      props: { href: "/distros/?use=gaming", icon: "gaming" },
      slots: { default: "Gaming" },
    });
    expect(shortcut).not.toContain("adw-chip-check");
    expect(shortcut.match(/<svg/g)).toHaveLength(1);
  });
});

describe("ActionRow", () => {
  it("renders the prefix slot before the text and a rich title slot inside the title", async () => {
    const html = await render(ActionRow, {
      props: { href: "/distros/fedora/", subtitle: "43" },
      slots: { prefix: '<span class="tile"></span>', title: "<b>Fedora</b>" },
    });
    expect(html).toContain('<a href="/distros/fedora/" class="adw-action-row activatable">');
    const prefix = html.indexOf('<span class="tile">');
    expect(prefix).toBeGreaterThan(-1);
    expect(prefix).toBeLessThan(html.indexOf('class="adw-row-text"'));
    expect(html).toMatch(/<span class="adw-row-title"><b>Fedora<\/b><\/span>/);
    expect(html).toContain('<span class="adw-row-subtitle">43');
    expect(html).toContain('class="adw-icon adw-row-chevron"');
  });

  it("keeps the 16px icon prop as the prefix and has no link without href", async () => {
    const html = await render(ActionRow, {
      props: { title: "Fedora 43", subtitle: "Latest", icon: "usb", property: true },
    });
    expect(html).toMatch(/<div class="adw-action-row property">/);
    expect(html).toMatch(/<svg width="16" height="16" class="adw-icon adw-row-prefix"/);
    expect(html).not.toContain("adw-row-chevron");
    // Nothing extra on the row item by default.
    expect(html).toMatch(/<li class="adw-row-item">/);
  });

  it("marks an error row and puts hidden and data-* on the row item", async () => {
    const html = await render(ActionRow, {
      props: { tone: "error", icon: "warning", hidden: true, "data-wizard-error": true },
      slots: { title: '<span role="alert">Failed.</span>', default: "<button>Retry</button>" },
    });
    expect(html).toMatch(/<li class="adw-row-item" hidden data-wizard-error/);
    expect(html).toMatch(
      /<div class="adw-action-row error">\s*<svg[^>]*class="adw-icon adw-row-prefix"/,
    );
    expect(html).toMatch(/<span class="adw-row-title"><span role="alert">Failed\.<\/span><\/span>/);
    expect(html).toMatch(/<span class="adw-row-suffix">\s*<button>Retry<\/button>/);
  });

  it("points a rel=prev row back: go-previous before the text, no chevron", async () => {
    const prev = await render(ActionRow, {
      props: { href: "/learn/history/", rel: "prev", title: "History", subtitle: "Previous" },
    });
    expect(prev).toMatch(
      /<a href="\/learn\/history\/" rel="prev" class="adw-action-row activatable">\s*<svg[^>]*class="adw-icon adw-row-prefix"/,
    );
    expect(prev).toContain('d="M12 2a1 1 0 0 0-1.707-.707l-6 6');
    expect(prev).not.toContain("adw-row-chevron");
    const next = await render(ActionRow, {
      props: { href: "/learn/why-linux/", rel: "next", title: "Why Linux", subtitle: "Next" },
    });
    expect(next).not.toContain("adw-row-prefix");
    expect(next).toContain('class="adw-icon adw-row-chevron"');
  });
});

describe("BoxedList", () => {
  it("names the group by a rich title slot in the heading of the given level", async () => {
    const html = await render(BoxedList, {
      props: { id: "month-2026-04", level: 2 },
      slots: { title: '<time datetime="2026-04">2026년 4월</time>', default: "<li>row</li>" },
    });
    expect(html).toContain('<section class="adw-group" id="month-2026-04"');
    expect(html).toContain('aria-labelledby="month-2026-04-title"');
    expect(html).toMatch(
      /<h2 class="adw-group-title" id="month-2026-04-title">\s*<time datetime="2026-04">2026년 4월<\/time>\s*<\/h2>/,
    );
    expect(html).toMatch(/<ul class="adw-boxed-list" role="list">\s*<li>row<\/li>/);
  });

  it("has no heading and no label without a title", async () => {
    const html = await render(BoxedList, { slots: { default: "<li>row</li>" } });
    expect(html).not.toContain("<h3");
    expect(html).not.toContain("aria-labelledby");
  });
});

describe("ExpanderRow", () => {
  it("puts class and data-* on a closed <details>, with a rich subtitle slot", async () => {
    const html = await render(ExpanderRow, {
      props: { title: "Official sources (3)", class: "doc-sources", "data-pagefind-ignore": "" },
      slots: { subtitle: '<time datetime="2026-10-03">Oct 3, 2026</time>', default: "<ul></ul>" },
    });
    expect(html).toMatch(/<details class="adw-expander-row doc-sources"[^>]*data-pagefind-ignore/);
    expect(html).not.toMatch(/<details[^>]*\bopen\b/);
    expect(html).toMatch(
      /<span class="adw-row-subtitle">\s*<time datetime="2026-10-03">Oct 3, 2026<\/time>\s*<\/span>/,
    );
    expect(html).toContain('class="adw-icon adw-expander-arrow"');
  });

  it("starts expanded with `open` and has no subtitle without one", async () => {
    const html = await render(ExpanderRow, { props: { title: "Windows", open: true } });
    expect(html).toMatch(/<details class="adw-expander-row"[^>]*\bopen\b/);
    expect(html).not.toContain("adw-row-subtitle");
  });
});

describe("ComboRow", () => {
  it("labels a native select with the row title and selects the given value", async () => {
    const html = await render(ComboRow, {
      props: {
        label: "Edition",
        name: "edition",
        options: [
          ["workstation", "Workstation"],
          ["kde", "KDE Plasma"],
        ],
        selected: "kde",
        hidden: true,
        "data-format-row": "",
      },
    });
    // hidden and data-* go on the row, which islands show or hide.
    expect(html).toMatch(/<li class="adw-row-item" hidden[^>]*data-format-row/);
    expect(html).toMatch(
      /<label class="adw-action-row adw-combo-row">\s*<span class="adw-row-text">\s*<span class="adw-row-title">Edition<\/span>\s*<\/span>\s*<select name="edition" class="combo-select">/,
    );
    expect(html).toMatch(/<option value="workstation">\s*Workstation\s*<\/option>/);
    expect(html).toMatch(/<option value="kde" selected>\s*KDE Plasma\s*<\/option>/);
    expect(html).not.toContain("adw-row-subtitle");
  });

  it("puts the subtitle slot under the title and can hide the select until it is filled", async () => {
    const html = await render(ComboRow, {
      props: { label: "Mirror", name: "mirror", options: [["", "Automatic"]], selectHidden: true },
      slots: { subtitle: "<span data-mirror-label>Finding the nearest mirror…</span>" },
    });
    expect(html).toMatch(/<li class="adw-row-item">/);
    expect(html).toMatch(
      /<span class="adw-row-subtitle">\s*<span data-mirror-label>Finding the nearest mirror…<\/span>\s*<\/span>/,
    );
    expect(html).toMatch(/<select name="mirror" class="combo-select" hidden>/);
    // No `selected`: the browser picks the first option.
    expect(html).not.toMatch(/<option[^>]*selected/);
  });
});

describe("ChoiceGroup", () => {
  const choices = [
    { value: "new", label: "New", checked: true },
    { value: "expert", label: "Expert" },
  ];
  /** Rendered HTML without the scoped-style attributes. */
  const plain = (html: string) => html.replace(/ data-astro-cid-\w+| astro-\w+(?=")/g, "");

  it("renders radio rows in a boxed list under the legend, every choice a label.choice", async () => {
    const html = plain(
      await render(ChoiceGroup, { props: { legend: "Experience?", name: "q", choices } }),
    );
    expect(html).toMatch(
      /^<fieldset class="adw-choice-group"><legend class="adw-choice-legend">Experience\?<\/legend>/,
    );
    expect(html).toContain('<ul class="adw-boxed-list adw-choices" role="list">');
    expect(html).toContain(
      '<li><label class="choice adw-action-row activatable"><input type="radio" name="q" value="new" checked class="adw-check"><span class="adw-row-title">New</span></label></li>',
    );
    expect(html).toContain('<input type="radio" name="q" value="expert" class="adw-check">');
    expect(html).not.toContain("adw-toggle");
  });

  it("renders check rows for a multiple choice and a toggle group for a short one", async () => {
    const checks = plain(
      await render(ChoiceGroup, {
        props: { legend: "Uses", name: "uses", type: "checkbox", choices },
      }),
    );
    expect(checks.match(/<input type="checkbox" name="uses"/g)).toHaveLength(2);
    const toggles = plain(
      await render(ChoiceGroup, {
        props: { legend: "Experience?", name: "q", choices, toggle: true },
      }),
    );
    expect(toggles).toContain(
      '<div class="adw-toggle-group adw-choices"><label class="choice adw-toggle"><input type="radio" name="q" value="new" checked class="adw-check"><span>New</span></label>',
    );
    expect(toggles).not.toContain("adw-boxed-list");
  });
});

describe("Badge", () => {
  it("is neutral by default and passes attributes through (a count an island fills in)", async () => {
    const html = await render(Badge, {
      props: { class: "numeric", "data-filter-count": "", hidden: true, "aria-hidden": "true" },
    });
    expect(html).toMatch(/^<span [^>]*><\/span>$/);
    expect(html).toContain('class="adw-badge neutral numeric"');
    expect(html).toMatch(/ data-filter-count hidden aria-hidden="true"/);
  });
});

describe("SearchEntry", () => {
  it("labels a search input and adds a script-only, localized clear button", async () => {
    const html = await render(SearchEntry, {
      props: {
        locale: "en",
        name: "q",
        label: "Search distributions",
        controls: "list",
        "data-search-input": "",
      },
    });
    expect(html).toMatch(/<div class="adw-entry">\s*<label class="adw-entry-field">/);
    expect(html).toMatch(
      /<input type="search" name="q" placeholder="Search distributions" aria-label="Search distributions" aria-controls="list"[^>]*data-search-input/,
    );
    expect(html).toMatch(
      /<button type="button"[^>]*aria-label="Clear search"[^>]*data-entry-clear[^>]*data-js-only/,
    );
  });
});

describe("UseCaseChips", () => {
  it("links each use case to the localized, filtered catalog", async () => {
    const html = await container.renderToString(UseCaseChips, {
      props: { locale: "en", active: "gaming", showAll: true },
    });
    expect(html).toContain('aria-label="Find by purpose"');
    expect(html).toContain('href="/en/distros/?use=beginner"');
    expect(html).toContain('href="/en/distros/"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/href="\/en\/distros\/\?use=gaming"[^>]*aria-current="page"/);
    expect(html.match(/data-use-chip\b/g)).toHaveLength(9);
    // A filter row: every chip can become current, so each has the check cue.
    expect(html.match(/adw-chip-check/g)).toHaveLength(9);
  });

  it("leaves the check cue out of a plain shortcut row (home)", async () => {
    const html = await container.renderToString(UseCaseChips, { props: { locale: "ko" } });
    expect(html.match(/data-use-chip\b/g)).toHaveLength(8);
    expect(html).not.toContain("aria-current");
    expect(html).not.toContain("adw-chip-check");
  });
});

describe("Breadcrumb", () => {
  it("is a localized trail of links ending with the current page", async () => {
    const html = await render(Breadcrumb, {
      props: {
        locale: "ko",
        links: [{ label: "배포판", href: "/distros/" }],
        current: "Fedora Linux",
      },
    });
    expect(html).toMatch(
      /<nav class="breadcrumb caption" aria-label="탐색 경로" data-pagefind-ignore/,
    );
    expect(html).toMatch(/<ol role="list"/);
    expect(html).toMatch(
      /<a href="\/distros\/"[^>]*>배포판<\/a><svg width="12" height="12" class="adw-icon" aria-hidden="true"/,
    );
    expect(html).toMatch(/<span aria-current="page"[^>]*>Fedora Linux<\/span>/);
    expect(html.match(/<svg/g)).toHaveLength(1);
  });
});

describe("AppHeader", () => {
  it("renders the tile, one h1, the tagline, the meta caption and the hero actions", async () => {
    const html = await render(AppHeader, {
      props: { logo: "fedora.svg", name: "Fedora Linux", tagline: "Innovation", meta: "GNOME" },
      slots: { actions: '<a href="#download">Download</a><a href="/i/">Install</a>' },
    });
    expect(html).toMatch(/class="app-tile size-128 narrow-64 distro-logo"/);
    expect(html).toContain('fetchpriority="high"');
    expect(html).toContain('data-pagefind-meta="image[src]"');
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Fedora Linux<\/h1>/);
    expect(html).toMatch(/<p class="dim-label" data-pagefind-meta="tagline"[^>]*>Innovation<\/p>/);
    expect(html).toMatch(
      /<p class="app-header-meta caption dim-label"[^>]*><span[^>]*>GNOME <\/span><\/p>/,
    );
    expect(html).toMatch(
      /<div class="button-row hero-actions" data-pagefind-ignore[^>]*><a href="#download">Download<\/a><a href="\/i\/">Install<\/a><\/div>/,
    );
  });

  it("takes a page title and a 64px tile, and drops empty parts", async () => {
    const html = await render(AppHeader, {
      props: {
        logo: "fedora.svg",
        name: "Fedora Linux",
        title: "Fedora Linux install guide",
        size: 64,
      },
    });
    expect(html).toMatch(/class="app-tile size-64 distro-logo"/);
    expect(html).not.toContain("fetchpriority");
    expect(html).toMatch(/<h1[^>]*>Fedora Linux install guide<\/h1>/);
    expect(html).not.toContain("<p");
    expect(html).not.toContain("hero-actions");
  });

  it("puts each meta fact in its own span and skips an actions slot with nothing in it", async () => {
    const html = await render(AppHeader, {
      props: {
        logo: "fedora.svg",
        name: "Fedora Linux",
        meta: ["Installer: Anaconda", "Difficulty: Medium"],
      },
      slots: { actions: "  " },
    });
    expect(
      html.match(/<span[^>]*>(Installer: Anaconda|Difficulty: Medium) <\/span>/g),
    ).toHaveLength(2);
    expect(html).not.toContain("·");
    expect(html).not.toContain("hero-actions");
  });
});

describe("StatusPage", () => {
  it("is the page's h1 under a 64px icon, with one sentence and the action", async () => {
    const html = await render(StatusPage, {
      props: { icon: "search", title: "Page not found", description: "It moved." },
      slots: { default: '<a href="/">Home</a>' },
    });
    expect(html.match(/<h1[^>]*>Page not found<\/h1>/g)).toHaveLength(1);
    expect(html).toMatch(/<svg[^>]*width="64"/);
    expect(html).toMatch(/<p class="adw-status-description"[^>]*>It moved\.<\/p>/);
    expect(html).toMatch(/<div class="adw-status-actions"[^>]*><a href="\/">Home<\/a><\/div>/);
  });
});

describe("CompareTable", () => {
  const column = (id: string, name: string) => ({
    id,
    name,
    logo: `${id}.svg`,
    href: `/distros/${id}/`,
  });
  const props = {
    rows: [
      { key: "family", label: "Family" },
      { key: "desktops", label: "Desktops" },
    ],
    columns: [column("fedora", "Fedora Linux"), column("arch", "Arch Linux"), undefined],
    cells: {
      fedora: { family: "Fedora", desktops: ["GNOME", " and KDE Plasma"] as [string, string] },
      arch: { family: "Arch", desktops: "—" },
    },
    templates: [column("arch", "Arch Linux")],
  };

  it("keeps the hooks compare.ts swaps: heads, unique cells named by their distro, templates", async () => {
    const html = await render(CompareTable, { props });
    expect(html).toMatch(/<div class="adw-table-frame compare-frame"[^>]*data-compare-table/);
    expect(html.match(/data-head="\d"/g)).toEqual([
      'data-head="0"',
      'data-head="1"',
      'data-head="2"',
    ]);
    const cells = html.match(/data-cell="[^"]+"/g) ?? [];
    expect(cells).toHaveLength(6);
    expect(new Set(cells).size).toBe(6);
    expect(html).toMatch(
      /data-cell="0:desktops" data-name="Fedora Linux"[^>]*><strong[^>]*>GNOME<\/strong> and KDE Plasma<\/td>/,
    );
    // A column with nothing chosen: an empty heading and empty, unnamed cells.
    expect(html).toMatch(/<th scope="col" role="columnheader" data-head="2"[^>]*><\/th>/);
    expect(html).toMatch(/<td role="cell" data-cell="2:family"(?! data-name)[^>]*><\/td>/);
    expect(html.match(/<template data-head-template="arch"/g)).toHaveLength(1);
    expect(html.match(/role="rowheader"/g)).toHaveLength(2);
  });
});

describe("FamilyNode", () => {
  type Node = Parameters<typeof FamilyNode>[0]["distro"];
  const distro = (id: string, name: string, year: string) =>
    ({
      id,
      data: { name, logo: { file: `${id}.svg` }, origin: { firstRelease: `${year}-01-01` } },
    }) as unknown as Node;
  const debian = distro("debian", "Debian", "1993");
  const ubuntu = distro("ubuntu", "Ubuntu", "2004");
  const mint = distro("linux-mint", "Linux Mint", "2006");

  it("renders a boxed-list row whose tree of nav rows nests the descendants", async () => {
    const html = await render(FamilyNode, {
      props: {
        distro: debian,
        childrenOf: new Map([
          ["debian", [ubuntu]],
          ["ubuntu", [mint]],
        ]),
        locale: "en",
      },
    });
    expect(html).toMatch(/^<li class="adw-row-item root"/);
    expect(html.match(/<a class="adw-nav-row node"/g)).toHaveLength(3);
    expect(html.match(/<li class="child"/g)).toHaveLength(2);
    expect(html.match(/<ul class="children" role="list"/g)).toHaveLength(2);
    expect(html).toMatch(/href="\/en\/distros\/ubuntu\/"/);
    expect(html).toMatch(
      />Linux Mint<\/span><span class="caption dim-label numeric"[^>]*>2006<\/span>/,
    );
  });
});
