/**
 * Display formats shared by pages and islands. No Astro imports, so a client
 * script can import it too (catalog.ts re-exports it for build-time code).
 */

/** "2.3 GB", "12 GB": decimal units, one decimal below 10. */
export function formatBytes(bytes: number | null, locale: string): string | null {
  if (!bytes) return null;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} ${units[unit]}`;
}

/**
 * The one full-date format of the site (SPEC §13): "2026년 4월 23일" in
 * Korean, "Apr 23, 2026" in English. `iso` is a YYYY-MM-DD day in UTC.
 */
export function formatDate(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: locale.startsWith("ko") ? "long" : "medium",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}
