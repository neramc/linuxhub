import { describe, expect, it } from "vitest";
import { haversineKm, type MirrorPayload, rankMirrors } from "./mirrors";

const payload: MirrorPayload = {
  countries: { KR: [36.38, 128.13], JP: [36.0, 138.0], US: [39.54, -97.48], DE: [51.1, 10.4] },
  mirrors: [
    { u: "https://us.example/", c: "US", n: "us", la: null, lo: null, s: 1 },
    { u: "https://jp.example/", c: "JP", n: "jp", la: null, lo: null, s: 1 },
    { u: "https://kr-b.example/", c: "KR", n: "kr-b", la: null, lo: null, s: 3 },
    { u: "https://kr-a.example/", c: "KR", n: "kr-a", la: null, lo: null, s: 1 },
    { u: "https://de.example/", c: "DE", n: "de", la: 50.11, lo: 8.68, s: null },
  ],
};

describe("haversineKm", () => {
  it("measures Seoul → Tokyo at roughly 1,160 km", () => {
    expect(haversineKm(37.57, 126.98, 35.68, 139.69)).toBeGreaterThan(1100);
    expect(haversineKm(37.57, 126.98, 35.68, 139.69)).toBeLessThan(1200);
  });
});

describe("rankMirrors", () => {
  it("puts same-country mirrors first, best score first", () => {
    const ranked = rankMirrors(payload, { cc: "KR", lat: 37.57, lon: 126.98 });
    // Seoul: Korea first (score 1 before 3), then Japan, Frankfurt, central US.
    expect(ranked.map((m) => m.n)).toEqual(["kr-a", "kr-b", "jp", "de", "us"]);
    expect(ranked[0]?.sameCountry).toBe(true);
  });

  it("orders foreign mirrors by distance", () => {
    const ranked = rankMirrors(payload, { cc: "FR", lat: 48.86, lon: 2.35 });
    expect(ranked[0]?.n).toBe("de");
    expect(ranked.at(-1)?.n).not.toBe("de");
  });

  it("falls back to the country label point when coordinates are missing", () => {
    const ranked = rankMirrors(payload, { cc: "JP", lat: null, lon: null });
    expect(ranked[0]?.n).toBe("jp");
    expect(ranked[1]?.c).toBe("KR");
  });

  it("keeps a stable order without any location", () => {
    const ranked = rankMirrors(payload, { cc: null, lat: null, lon: null });
    expect(ranked.every((m) => m.km === null)).toBe(true);
    expect(ranked[0]?.s).toBe(1);
  });
});
