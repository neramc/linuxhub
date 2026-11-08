/**
 * What the home page shows below the carousel (ADR-0020): sections of distros
 * for one use, a weekly rotation of desktop screenshots, and counts per
 * desktop. Pure functions over catalog entries; the page passes the
 * popularity ranking and the build day in.
 */
import type { Desktop, UseCase } from "./taxonomy";

/** The parts of a catalog entry these picks read. */
export interface HomeDistro {
  id: string;
  data: {
    status: "active" | "discontinued";
    useCases: readonly UseCase[];
    desktops: readonly Desktop[];
    screenshot?: unknown;
  };
}

/**
 * `distros` (in editorial order) by English Wikipedia pageviews, most viewed
 * first; distros without a count keep their editorial order after them.
 */
export function byPopularity<T extends HomeDistro>(
  distros: readonly T[],
  views: ReadonlyMap<string, number>,
): T[] {
  return distros
    .map((d, i) => ({ d, i, v: views.get(d.id) }))
    .sort((a, b) => (b.v ?? -1) - (a.v ?? -1) || a.i - b.i)
    .map((x) => x.d);
}

export interface UseSection<T> {
  use: UseCase;
  /** Every active distro for the use (what the catalog filtered on it shows). */
  total: number;
  distros: T[];
}

/**
 * One card section per use: active distros for it, in `distros` order,
 * skipping those an earlier section (or `shown`) already has, at most `max`
 * each. A section with fewer than `min` left is dropped.
 */
export function useSections<T extends HomeDistro>(
  distros: readonly T[],
  uses: readonly UseCase[],
  shown: Iterable<string> = [],
  max = 6,
  min = 3,
): UseSection<T>[] {
  const seen = new Set(shown);
  return uses.flatMap((use) => {
    const all = distros.filter((d) => d.data.status === "active" && d.data.useCases.includes(use));
    const picked = all.filter((d) => !seen.has(d.id)).slice(0, max);
    if (picked.length < min) return [];
    for (const d of picked) seen.add(d.id);
    return [{ use, total: all.length, distros: picked }];
  });
}

const WEEK_MS = 7 * 86_400_000;

/**
 * `count` consecutive items of `items`, starting further along each week
 * (UTC weeks since the epoch), so every item comes round in turn.
 */
export function weeklyRotation<T>(items: readonly T[], count: number, now: Date): T[] {
  if (items.length <= count) return [...items];
  const start = (Math.floor(now.getTime() / WEEK_MS) * count) % items.length;
  return Array.from({ length: count }, (_, i) => items[(start + i) % items.length] as T);
}

/**
 * Active distros per desktop (any desktop they offer), largest groups first,
 * then in key order. In a group, the distros whose default desktop it is come
 * first, each part in `distros` order.
 */
export function desktopGroups<T extends HomeDistro>(
  distros: readonly T[],
  desktops: readonly Desktop[],
): { id: Desktop; members: T[] }[] {
  const active = distros.filter((d) => d.data.status === "active");
  return desktops
    .filter((id) => id !== "none")
    .map((id) => {
      const members = active.filter((d) => d.data.desktops.includes(id));
      const isDefault = (d: T) => d.data.desktops[0] === id;
      return {
        id,
        members: [...members.filter(isDefault), ...members.filter((d) => !isDefault(d))],
      };
    })
    .filter((g) => g.members.length > 0)
    .sort((a, b) => b.members.length - a.members.length);
}
