/**
 * Raster brand icons from the Tux SVG (src/assets/brand/README.md):
 * public/apple-touch-icon.png, 180×180, Tux centered on the light Adwaita
 * window background (iOS fills transparent icons with black).
 * Usage: bun scripts/assets/brand-icons.ts
 */
import sharp from "sharp";

const SIZE = 180;
const TUX_HEIGHT = 140;

const tux = await sharp("src/assets/brand/tux.svg", { density: 600 })
  .resize({ height: TUX_HEIGHT })
  .png()
  .toBuffer();
const { width = 0 } = await sharp(tux).metadata();

const info = await sharp({
  create: { width: SIZE, height: SIZE, channels: 4, background: "#fafafb" },
})
  .composite([{ input: tux, left: Math.round((SIZE - width) / 2), top: (SIZE - TUX_HEIGHT) / 2 }])
  .png({ compressionLevel: 9, effort: 10 })
  .toFile("public/apple-touch-icon.png");
console.log(`public/apple-touch-icon.png: ${info.width}×${info.height}, ${info.size} bytes`);
