/**
 * endoflife.date v1 API (community-maintained, sourced from official
 * announcements). Used only for release/EOL dates and LTS flags; download
 * files and checksums always come from the distro's own servers.
 */
import { getJson } from "../http";
import { isoDay } from "./versions";

export interface Cycle {
  name: string;
  codename: string | null;
  label: string;
  releaseDate: string | null;
  eol: string | null;
  lts: boolean;
  latest: string | null;
  latestDate: string | null;
  isMaintained: boolean;
  link: string | null;
}

interface ApiRelease {
  name: string;
  codename?: string | null;
  label?: string;
  releaseDate?: string | null;
  isLts?: boolean;
  isEol?: boolean;
  eolFrom?: string | null;
  isMaintained?: boolean;
  latest?: { name?: string; date?: string | null; link?: string | null } | null;
}

export async function endOfLife(product: string): Promise<{ url: string; cycles: Cycle[] }> {
  const url = `https://endoflife.date/api/v1/products/${product}`;
  const data = await getJson<{ result: { releases: ApiRelease[] } }>(url);
  const cycles = data.result.releases.map((r) => ({
    name: r.name,
    codename: r.codename ?? null,
    label: r.label ?? r.name,
    releaseDate: isoDay(r.releaseDate),
    eol: isoDay(r.eolFrom),
    lts: Boolean(r.isLts),
    latest: r.latest?.name ?? null,
    latestDate: isoDay(r.latest?.date),
    isMaintained: r.isMaintained ?? !r.isEol,
    link: r.latest?.link ?? null,
  }));
  return { url: `https://endoflife.date/${product}`, cycles };
}
