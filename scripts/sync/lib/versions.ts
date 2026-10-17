/** Natural version comparison: "10.2" > "9.10", "24.04.3" > "24.04", "2026.09.01" > "2026.08.01". */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[^0-9a-z]+/i);
  const pb = b.split(/[^0-9a-z]+/i);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? "";
    const y = pb[i] ?? "";
    const nx = Number(x);
    const ny = Number(y);
    if (x !== "" && y !== "" && Number.isFinite(nx) && Number.isFinite(ny)) {
      if (nx !== ny) return nx - ny;
    } else if (x !== y) {
      if (x === "") return -1;
      if (y === "") return 1;
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

export const newestFirst = (a: string, b: string) => compareVersions(b, a);

/** Picks the highest version from a list of candidates. */
export function latest(versions: string[]): string | undefined {
  return [...versions].sort(newestFirst)[0];
}

/** "2025-10-28T12:00:00Z" | "2025-10-28" → "2025-10-28"; invalid → null. */
export function isoDay(value: unknown): string | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/**
 * One convention for every distro whose official EOL names only a month or a
 * year: the last day of that month ("June 2029" → "2029-06-30") or year
 * ("2031" → "2031-12-31"). Accepts "June 2029", "Jun 2029", "2029-06" or
 * "2031"; anything else → null.
 */
export function periodEnd(value: string): string | null {
  const v = value.trim().toLowerCase();
  let year: number | undefined;
  let month: number | undefined;
  const named = v.match(/^([a-z]+)\.?\s+(\d{4})$/);
  const numeric = v.match(/^(\d{4})-(\d{1,2})$/);
  if (named?.[1] && named[2]) {
    const i = MONTHS.findIndex((m) => m.startsWith((named[1] as string).slice(0, 3)));
    if (i < 0) return null;
    year = Number(named[2]);
    month = i + 1;
  } else if (numeric?.[1] && numeric[2]) {
    year = Number(numeric[1]);
    month = Number(numeric[2]);
  } else if (/^\d{4}$/.test(v)) {
    year = Number(v);
    month = 12;
  }
  if (!year || !month || month < 1 || month > 12) return null;
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}
