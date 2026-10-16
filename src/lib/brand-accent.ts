/**
 * Brand tint for a distro (ADR-0014): the libadwaita accent color nearest to
 * the dominant color of its official logo. Build time only: the logo is
 * rasterized (SVG with resvg, PNG with sharp) and never altered or shipped.
 *
 * 1. `logo.accent` in the catalog wins (an editorial override, still one of
 *    the nine accents).
 * 2. Otherwise every opaque pixel (alpha ≥ 0.5) is converted to OKLCH. Pixels
 *    with chroma < 0.04 (white, black, grays: libadwaita's own achromatic
 *    cut-off) are skipped; the rest add weight alpha × chroma to one of 36 hue
 *    bins of 10°.
 * 3. Logos whose chromatic pixels are under 5% of the opaque ones are "slate".
 * 4. Otherwise the heaviest bin's weighted mean color is mapped with
 *    libadwaita's adw_accent_color_nearest_from_rgba().
 *
 * Results are memoized per file. The page uses them as `accent-<name>` classes
 * (tokens.css), so no inline styles are needed (CSP).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Accent } from "./schemas";

export type { Accent } from "./schemas";

export interface Oklch {
  /** Lightness 0..1 */
  L: number;
  /** Chroma, 0 for grays */
  C: number;
  /** Hue in degrees, 0 ≤ h < 360 */
  h: number;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** sRGB (0..255 per channel) to OKLCH, using Björn Ottosson's OKLab matrices. */
export function rgbToOklch(r: number, g: number, b: number): Oklch {
  const R = toLinear(r / 255);
  const G = toLinear(g / 255);
  const B = toLinear(b / 255);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  let h = (Math.atan2(bb, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C: Math.hypot(a, bb), h };
}

/** Chroma below which a color counts as gray (adw-accent-color.c). */
export const ACHROMATIC = 0.04;

/**
 * libadwaita's adw_accent_color_nearest_from_rgba() (adw-accent-color.c,
 * 1.10): grays become slate, everything else is binned by OKLCH hue.
 */
export function nearestAccent({ C, h }: Pick<Oklch, "C" | "h">): Accent {
  if (C < ACHROMATIC) return "slate";
  if (h > 345) return "pink";
  if (h > 280) return "purple";
  if (h > 230) return "blue";
  if (h > 175) return "teal";
  if (h > 115) return "green";
  if (h > 75.5) return "yellow";
  if (h > 35) return "orange";
  if (h > 10) return "red";
  return "pink";
}

/**
 * The dominant brand color of RGBA pixels (alpha-weighted, grays ignored), or
 * undefined when under 5% of the opaque pixels have any color.
 */
export function dominantColor(
  rgba: ArrayLike<number>,
): { r: number; g: number; b: number } | undefined {
  const bins = Array.from({ length: 36 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  let opaque = 0;
  let chromatic = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const alpha = (rgba[i + 3] ?? 0) / 255;
    if (alpha < 0.5) continue;
    opaque++;
    const r = rgba[i] ?? 0;
    const g = rgba[i + 1] ?? 0;
    const b = rgba[i + 2] ?? 0;
    const { C, h } = rgbToOklch(r, g, b);
    if (C < ACHROMATIC) continue;
    chromatic++;
    const bin = bins[Math.floor(h / 10) % 36];
    if (!bin) continue;
    const w = alpha * C;
    bin.w += w;
    bin.r += r * w;
    bin.g += g * w;
    bin.b += b * w;
  }
  if (opaque === 0 || chromatic / opaque < 0.05) return undefined;
  const best = bins.reduce((a, b) => (b.w > a.w ? b : a));
  if (best.w <= 0) return undefined;
  return {
    r: Math.round(best.r / best.w),
    g: Math.round(best.g / best.w),
    b: Math.round(best.b / best.w),
  };
}

/** The accent for RGBA pixels: the nearest accent to the dominant color, else slate. */
export function accentFromPixels(rgba: ArrayLike<number>): Accent {
  const color = dominantColor(rgba);
  return color ? nearestAccent(rgbToOklch(color.r, color.g, color.b)) : "slate";
}

const LOGO_DIR = join(process.cwd(), "src/assets/logos");
const RASTER = 128;

/** A logo from src/assets/logos/ as RGBA pixels, about 128px wide. */
async function logoPixels(file: string): Promise<ArrayLike<number>> {
  const buf = readFileSync(join(LOGO_DIR, file));
  if (file.endsWith(".svg")) {
    const { Resvg } = await import("@resvg/resvg-js");
    return new Resvg(buf, {
      fitTo: { mode: "width", value: RASTER },
      background: "rgba(0,0,0,0)",
      font: { loadSystemFonts: false },
    }).render().pixels;
  }
  const { default: sharp } = await import("sharp");
  const { data } = await sharp(buf)
    .resize(RASTER, RASTER, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data;
}

const memo = new Map<string, Promise<Accent>>();

/**
 * The accent for a logo file in src/assets/logos/ (memoized), or `override`
 * when the catalog sets `logo.accent`.
 */
export function brandAccent(file: string, override?: Accent): Promise<Accent> {
  if (override) return Promise.resolve(override);
  let accent = memo.get(file);
  if (!accent) {
    accent = logoPixels(file).then(accentFromPixels);
    memo.set(file, accent);
  }
  return accent;
}
