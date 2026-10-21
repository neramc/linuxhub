/** Calendar dates as projects print them in English release pages. */

const MONTH_PREFIXES = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");

/**
 * The date at the start of `text` as a UTC day, independent of locale and time
 * zone: "8 October, 2026", "1st February 2026", "1st December, 2014" (day
 * first) or "June 1, 2026", "Oct 8 2026" (month first). Text after the date is
 * ignored ("1st February 2026 (End of Support June 2029)"). Anything else, or
 * an impossible date such as "31 June 2026", → null.
 */
export function parseEnglishDay(text: string): string | null {
  const dayFirst = text.match(/^\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/);
  const monthFirst = text.match(/^\s*([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/);
  const [day, month, year] = dayFirst
    ? [dayFirst[1], dayFirst[2], dayFirst[3]]
    : monthFirst
      ? [monthFirst[2], monthFirst[1], monthFirst[3]]
      : [];
  const m = MONTH_PREFIXES.indexOf((month ?? "").slice(0, 3).toLowerCase());
  if (!day || !year || m < 0) return null;
  const date = new Date(Date.UTC(Number(year), m, Number(day)));
  return date.getUTCMonth() === m && date.getUTCDate() === Number(day)
    ? date.toISOString().slice(0, 10)
    : null;
}
