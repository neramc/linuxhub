/**
 * Distro screenshots (ADR-0018). Files live in src/assets/screenshots/ (made
 * with `bun scripts/assets/screenshot.ts`) and go through astro:assets, which
 * writes resized, content-hashed AVIF/WebP files.
 */
import type { ImageMetadata } from "astro";

const shots = import.meta.glob<{ default: ImageMetadata }>(
  "/src/assets/screenshots/*.{webp,png,jpg}",
  { eager: true },
);

export function screenshotImage(file: string): ImageMetadata {
  const image = shots[`/src/assets/screenshots/${file}`]?.default;
  if (!image) throw new Error(`Missing screenshot src/assets/screenshots/${file}`);
  return image;
}
