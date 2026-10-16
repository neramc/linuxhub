/**
 * Open Graph images (1200×630 PNG) rendered at build time with resvg from an
 * SVG template. Text is Latin only (distro names, English taglines), so the
 * small static Adwaita Sans instances in src/assets/fonts/ are enough.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const root = process.cwd();
const fontFiles = [
  join(root, "src/assets/fonts/AdwaitaSans-og-800.ttf"),
  join(root, "src/assets/fonts/AdwaitaSans-og-500.ttf"),
];

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function wrap(text: string, max: number, lines: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line ? `${line} ${w}` : w).length > max) {
      out.push(line);
      line = w;
      if (out.length === lines) break;
    } else line = line ? `${line} ${w}` : w;
  }
  if (out.length < lines && line) out.push(line);
  if (out.length === lines && words.join(" ").length > out.join(" ").length) {
    out[lines - 1] = `${(out[lines - 1] ?? "").replace(/[\s,.;:]*$/, "")}…`;
  }
  return out;
}

/** Tux (src/assets/brand/README.md) + the site name, bottom left. */
const TUX = readFileSync(join(root, "src/assets/brand/tux.svg")).toString("base64");
const BRAND = `<image x="80" y="504" width="54" height="64" href="data:image/svg+xml;base64,${TUX}"/>
<text x="150" y="551" font-family="Adwaita Sans" font-weight="800" font-size="34" fill="#1f1f22">Linuxhub</text>`;

export interface OgInput {
  title: string;
  subtitle: string;
  /** Logo to show on the right, as a data: URI (see readLogo). */
  logo?: string;
}

export function renderOg({ title, subtitle, logo: logoHref }: OgInput): Uint8Array {
  const titleSize = title.length > 18 ? 64 : 80;
  const sub = wrap(subtitle, logoHref ? 34 : 52, 3);
  const logo = logoHref
    ? `<rect x="790" y="135" width="330" height="330" rx="48" fill="#ffffff" stroke="rgb(0 0 6 / 0.08)" stroke-width="2"/>
       <image x="835" y="180" width="240" height="240" preserveAspectRatio="xMidYMid meet" href="${logoHref}"/>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="0.15" cy="0" r="0.9">
      <stop offset="0" stop-color="#1c71d8" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#1c71d8" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#fafafb"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <text x="80" y="${logoHref ? 250 : 260}" font-family="Adwaita Sans" font-weight="800" font-size="${titleSize}" fill="#1f1f22" letter-spacing="-1.5">${escapeXml(title)}</text>
  ${sub.map((l, i) => `<text x="80" y="${(logoHref ? 320 : 330) + i * 46}" font-family="Adwaita Sans" font-weight="500" font-size="34" fill="#55555c">${escapeXml(l)}</text>`).join("\n  ")}
  ${logo}
  ${BRAND}
</svg>`;
  const png = new Resvg(svg, {
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: "Adwaita Sans" },
    fitTo: { mode: "width", value: 1200 },
  }).render();
  return png.asPng();
}

/** A logo from src/assets/logos/ as a data: URI (SVG or PNG, ADR-0012). */
export function readLogo(file: string): string {
  const mime = file.endsWith(".png") ? "image/png" : "image/svg+xml";
  const data = readFileSync(join(root, "src/assets/logos", file)).toString("base64");
  return `data:${mime};base64,${data}`;
}
