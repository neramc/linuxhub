import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  accentFromPixels,
  brandAccent,
  dominantColor,
  nearestAccent,
  rgbToOklch,
} from "./brand-accent";
import { ACCENTS } from "./schemas";

/** A flat RGBA buffer of `n` pixels of one color. */
function fill(n: number, [r, g, b, a = 255]: number[]): number[] {
  return Array.from({ length: n }, () => [r, g, b, a] as number[]).flat();
}

describe("nearestAccent (adw_accent_color_nearest_from_rgba)", () => {
  it.each([
    [345.1, "pink"],
    [345, "purple"],
    [280.1, "purple"],
    [280, "blue"],
    [230.1, "blue"],
    [230, "teal"],
    [175.1, "teal"],
    [175, "green"],
    [115.1, "green"],
    [115, "yellow"],
    [75.6, "yellow"],
    [75.5, "orange"],
    [35.1, "orange"],
    [35, "red"],
    [10.1, "red"],
    [10, "pink"],
    [5, "pink"],
  ])("hue %s → %s", (h, accent) => {
    expect(nearestAccent({ C: 0.1, h })).toBe(accent);
  });

  it("treats chroma below 0.04 as gray (slate) whatever the hue", () => {
    expect(nearestAccent({ C: 0.039, h: 250 })).toBe("slate");
    expect(nearestAccent({ C: 0.04, h: 250 })).toBe("blue");
  });

  it("reproduces libadwaita's own accents from their hex values", () => {
    const palette: Record<string, [number, number, number]> = {
      blue: [0x35, 0x84, 0xe4],
      teal: [0x21, 0x90, 0xa4],
      green: [0x3a, 0x94, 0x4a],
      yellow: [0xc8, 0x88, 0x00],
      orange: [0xed, 0x5b, 0x00],
      red: [0xe6, 0x2d, 0x42],
      pink: [0xd5, 0x61, 0x99],
      purple: [0x91, 0x41, 0xac],
      slate: [0x6f, 0x83, 0x96],
    };
    for (const [name, [r, g, b]] of Object.entries(palette)) {
      expect(nearestAccent(rgbToOklch(r, g, b)), name).toBe(name);
    }
  });
});

describe("rgbToOklch", () => {
  it("maps white and black to achromatic extremes", () => {
    const white = rgbToOklch(255, 255, 255);
    expect(white.L).toBeCloseTo(1, 3);
    expect(white.C).toBeLessThan(0.001);
    expect(rgbToOklch(0, 0, 0).L).toBeCloseTo(0, 6);
  });
});

describe("dominantColor / accentFromPixels", () => {
  it("ignores transparent and gray pixels", () => {
    const px = [
      ...fill(500, [255, 255, 255]),
      ...fill(400, [20, 20, 20]),
      ...fill(300, [0, 0, 0, 0]),
      ...fill(100, [0xe9, 0x54, 0x20]),
    ];
    expect(dominantColor(px)).toEqual({ r: 0xe9, g: 0x54, b: 0x20 });
    expect(accentFromPixels(px)).toBe("orange");
  });

  it("weights by chroma, so a saturated mark beats a large pale area", () => {
    const px = [...fill(300, [0xe0, 0xe8, 0xf0]), ...fill(200, [0x00, 0x99, 0x33])];
    expect(accentFromPixels(px)).toBe("green");
  });

  it("is slate when under 5% of opaque pixels have color", () => {
    const px = [...fill(97, [0, 0, 0]), ...fill(3, [0xff, 0x00, 0x00])];
    expect(dominantColor(px)).toBeUndefined();
    expect(accentFromPixels(px)).toBe("slate");
    expect(accentFromPixels([])).toBe("slate");
  });
});

describe("brandAccent", () => {
  it("prefers the catalog override", async () => {
    expect(await brandAccent("ubuntu.svg", "purple")).toBe("purple");
  });

  // The current official logos (accentPalette.md). A changed logo or a new
  // algorithm shows up here; add new logos to the table when they arrive.
  const expected: Record<string, string> = {
    "arch.svg": "blue",
    "cachyos.svg": "green",
    "debian.svg": "red",
    "deepin.svg": "blue",
    "devuan.svg": "slate",
    "elementary-os.svg": "slate",
    "endeavouros.svg": "purple",
    "fedora.svg": "blue",
    "kali-linux.svg": "slate",
    "kde-neon.svg": "blue",
    "kubuntu.svg": "blue",
    "linux-lite.svg": "yellow",
    "linux-mint.svg": "green",
    "lubuntu.svg": "blue",
    "manjaro.svg": "teal",
    "mx-linux.svg": "slate",
    "parrot-os.svg": "teal",
    "peppermint-os.svg": "red",
    "pop-os.svg": "teal",
    "q4os.svg": "blue",
    "raspberry-pi-os.svg": "red",
    "tuxedo-os.svg": "slate",
    "ubuntu-mate.svg": "green",
    "ubuntu.svg": "orange",
    "xubuntu.svg": "blue",
    "zorin-os.svg": "blue",
  };

  it("maps every current logo to its expected accent", async () => {
    const files = readdirSync("src/assets/logos").filter((f) => /\.(svg|png)$/.test(f));
    const actual: Record<string, string> = {};
    for (const file of files) actual[file] = await brandAccent(file);
    for (const value of Object.values(actual)) expect(ACCENTS).toContain(value);
    expect(Object.fromEntries(Object.keys(expected).map((f) => [f, actual[f]]))).toEqual(expected);
  });
});
