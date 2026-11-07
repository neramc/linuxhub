/**
 * Distro logo URLs. Logos live in src/assets/logos/ and are imported as asset
 * URLs, so they get content-hashed, immutable-cached file names. Vite inlines
 * an asset under 4 KB as a data: URI instead; that suits a logo in the first
 * screen (no extra request before it paints), but a page that lists many
 * logos further down would carry them all in its HTML, so those ask for the
 * file (ADR-0020).
 */
const inlined = import.meta.glob<string>("/src/assets/logos/*.{svg,png}", {
  query: "?url",
  import: "default",
  eager: true,
});
const files = import.meta.glob<string>("/src/assets/logos/*.{svg,png}", {
  query: "?no-inline",
  import: "default",
  eager: true,
});

/** The logo's URL: a data: URI for a small logo when `inline`, else always its file. */
export function logoUrl(file: string, { inline = true }: { inline?: boolean } = {}): string {
  const url = (inline ? inlined : files)[`/src/assets/logos/${file}`];
  if (!url) throw new Error(`Missing logo src/assets/logos/${file}`);
  return url;
}
