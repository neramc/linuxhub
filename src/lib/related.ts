import type { Distro } from "./catalog";

/**
 * Similar distributions: shared lineage first (same base, children, siblings),
 * then same family, then overlapping use cases; ties broken by editorial order.
 */
export function relatedDistros(distro: Distro, all: Distro[], limit = 6): Distro[] {
  const d = distro.data;
  const score = (o: Distro) => {
    const x = o.data;
    let s = 0;
    if (x.basedOn === distro.id || d.basedOn === o.id) s += 6;
    if (d.basedOn && x.basedOn === d.basedOn) s += 4;
    if (x.family === d.family) s += 3;
    s += x.useCases.filter((u) => d.useCases.includes(u)).length;
    if (x.desktops[0] === d.desktops[0]) s += 1;
    if (x.difficulty === d.difficulty) s += 0.5;
    return s;
  };
  return all
    .filter((o) => o.id !== distro.id && o.data.status === "active")
    .map((o) => ({ o, s: score(o) }))
    .sort((a, b) => b.s - a.s || a.o.data.order - b.o.data.order)
    .slice(0, limit)
    .map(({ o }) => o);
}
