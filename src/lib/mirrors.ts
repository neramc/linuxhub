/**
 * Mirror ranking (runs in the browser; pure functions, unit-tested).
 * Order: same country first, then great-circle distance from the visitor
 * (mirror coordinates when published, else the country's label point), then
 * the project's own quality score (lower is better), then URL for stability.
 */

export interface GeoPoint {
  cc: string | null;
  lat: number | null;
  lon: number | null;
}

/** Compact mirror record served at /data/mirrors/<slug>.json. */
export interface MirrorRecord {
  u: string;
  c: string | null;
  n: string | null;
  la: number | null;
  lo: number | null;
  s: number | null;
}

export interface MirrorPayload {
  mirrors: MirrorRecord[];
  /** Label points for the countries in the list: cc → [lat, lon]. */
  countries: Record<string, [number, number]>;
}

export interface RankedMirror extends MirrorRecord {
  km: number | null;
  sameCountry: boolean;
}

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function rankMirrors(payload: MirrorPayload, geo: GeoPoint): RankedMirror[] {
  const origin =
    geo.lat !== null && geo.lon !== null
      ? ([geo.lat, geo.lon] as const)
      : geo.cc && payload.countries[geo.cc]
        ? payload.countries[geo.cc]
        : null;

  const ranked = payload.mirrors.map((m): RankedMirror => {
    const point =
      m.la !== null && m.lo !== null
        ? ([m.la, m.lo] as const)
        : m.c
          ? payload.countries[m.c]
          : undefined;
    const km =
      origin && point ? Math.round(haversineKm(origin[0], origin[1], point[0], point[1])) : null;
    return { ...m, km, sameCountry: Boolean(geo.cc && m.c === geo.cc) };
  });

  return ranked.sort(
    (a, b) =>
      Number(b.sameCountry) - Number(a.sameCountry) ||
      (a.km ?? Number.POSITIVE_INFINITY) - (b.km ?? Number.POSITIVE_INFINITY) ||
      (a.s ?? Number.POSITIVE_INFINITY) - (b.s ?? Number.POSITIVE_INFINITY) ||
      a.u.localeCompare(b.u),
  );
}
