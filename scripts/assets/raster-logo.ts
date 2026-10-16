/**
 * Prepares an official raster logo for projects that publish no vector logo
 * (ADR-0012): fits it inside 256×256 without enlarging, keeps the original
 * colors and alpha (no quantizing, no recoloring) and writes a compressed PNG.
 * Usage: bun scripts/assets/raster-logo.ts <downloaded-file> <slug>
 */
import sharp from "sharp";

const [input, slug] = process.argv.slice(2);
if (!input || !slug || !/^[a-z0-9-]+$/.test(slug)) {
  console.error("usage: bun scripts/assets/raster-logo.ts <file> <slug>");
  process.exit(1);
}

const out = `src/assets/logos/${slug}.png`;
const info = await sharp(input)
  .trim({ threshold: 0 })
  .resize(256, 256, { fit: "inside", withoutEnlargement: true })
  .png({ compressionLevel: 9, effort: 10 })
  .toFile(out);
console.log(`${out}: ${info.width}×${info.height}, ${info.size} bytes`);
