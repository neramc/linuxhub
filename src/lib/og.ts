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

const BRAND = `<g transform="translate(80 520) scale(1.75)">
  <rect x="1" y="1" width="30" height="30" rx="8" fill="#1c71d8"/>
  <rect x="1" y="1" width="30" height="9" rx="8" fill="#3584e4"/>
  <rect x="1" y="6" width="30" height="4" fill="#3584e4"/>
  <path d="M8 15.5l5 3.5-5 3.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M16 23h8" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>
</g>
<text x="148" y="563" font-family="Adwaita Sans" font-weight="800" font-size="34" fill="#1f1f22">Linuxhub</text>`;

export interface OgInput {
  title: string;
  subtitle: string;
  /** Raw SVG markup of a logo to show on the right. */
  logoSvg?: string;
}

export function renderOg({ title, subtitle, logoSvg }: OgInput): Uint8Array {
  const titleSize = title.length > 18 ? 64 : 80;
  const sub = wrap(subtitle, logoSvg ? 34 : 52, 3);
  const logo = logoSvg
    ? `<rect x="790" y="135" width="330" height="330" rx="48" fill="#ffffff" stroke="rgb(0 0 6 / 0.08)" stroke-width="2"/>
       <image x="835" y="180" width="240" height="240" preserveAspectRatio="xMidYMid meet" href="data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}"/>`
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
  <text x="80" y="${logoSvg ? 250 : 260}" font-family="Adwaita Sans" font-weight="800" font-size="${titleSize}" fill="#1f1f22" letter-spacing="-1.5">${escapeXml(title)}</text>
  ${sub.map((l, i) => `<text x="80" y="${(logoSvg ? 320 : 330) + i * 46}" font-family="Adwaita Sans" font-weight="500" font-size="34" fill="#55555c">${escapeXml(l)}</text>`).join("\n  ")}
  ${logo}
  ${BRAND}
</svg>`;
  const png = new Resvg(svg, {
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: "Adwaita Sans" },
    fitTo: { mode: "width", value: 1200 },
  }).render();
  return png.asPng();
}

export function readLogo(file: string): string {
  return readFileSync(join(root, "src/assets/logos", file), "utf8");
}
