import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import AppTile from "./adw/AppTile.astro";
import { nearestTileSize } from "./adw/app-tile";
import Chip from "./adw/Chip.astro";
import DistroLogo from "./DistroLogo.astro";
import UseCaseChips from "./UseCaseChips.astro";

const container = await AstroContainer.create();

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
  });
});
