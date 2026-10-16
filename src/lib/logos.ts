/**
 * Distro logo URLs. Logos live in src/assets/logos/ and are imported as plain
 * asset URLs so they get content-hashed, immutable-cached file names.
 */
const logos = import.meta.glob<string>("/src/assets/logos/*.{svg,png}", {
  query: "?url",
  import: "default",
  eager: true,
});

export function logoUrl(file: string): string {
  const url = logos[`/src/assets/logos/${file}`];
  if (!url) throw new Error(`Missing logo src/assets/logos/${file}`);
  return url;
}
