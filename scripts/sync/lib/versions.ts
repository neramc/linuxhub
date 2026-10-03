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
