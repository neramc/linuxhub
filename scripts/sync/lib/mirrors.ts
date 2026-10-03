/** Helpers for building official mirror lists. */
import countries from "../../../src/data/geo/countries.json";
import { request } from "../http";

const CODES = Object.keys(countries as Record<string, unknown>);
const english = new Intl.DisplayNames(["en"], { type: "region" });
const BY_NAME = new Map<string, string>();
for (const code of CODES) {
  const name = english.of(code);
  if (name) BY_NAME.set(normalize(name), code);
}
const ALIASES: Record<string, string> = {
  usa: "US",
  "united states of america": "US",
  uk: "GB",
  "great britain": "GB",
  england: "GB",
  russia: "RU",
  "russian federation": "RU",
  korea: "KR",
  "south korea": "KR",
  "korea republic of": "KR",
  "republic of korea": "KR",
  taiwan: "TW",
  vietnam: "VN",
  "viet nam": "VN",
  iran: "IR",
  czechia: "CZ",
  "czech republic": "CZ",
  moldova: "MD",
  "hong kong": "HK",
  turkey: "TR",
  türkiye: "TR",
  "the netherlands": "NL",
  holland: "NL",
  macedonia: "MK",
  "north macedonia": "MK",
  bosnia: "BA",
  "bosnia and herzegovina": "BA",
  "ivory coast": "CI",
  laos: "LA",
  syria: "SY",
  tanzania: "TZ",
  bolivia: "BO",
  venezuela: "VE",
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "South Korea" / "KR" / "Korea, Republic of" → "KR"; unknown → null. */
export function countryCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (/^[A-Z]{2}$/.test(v) && CODES.includes(v)) return v;
  const n = normalize(v.replace(/,\s*(.+)$/, " $1"));
  return ALIASES[n] ?? BY_NAME.get(n) ?? ALIASES[normalize(v)] ?? null;
}

export const withSlash = (url: string) => (url.endsWith("/") ? url : `${url}/`);

/** True when `url` answers over HTTPS (HEAD, robots-aware). Used to keep only HTTPS mirrors. */
export async function httpsReachable(url: string): Promise<boolean> {
  try {
    const res = await request(url, { method: "HEAD", noCache: true });
    return res.status < 400;
  } catch {
    return false;
  }
}

/** Runs `fn` over items with at most `limit` in flight (different hosts are paced independently). */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i] as T);
      }
    }),
  );
  return out;
}
