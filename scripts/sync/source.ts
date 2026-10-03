import type { Mirror, Release } from "../../src/lib/data-schemas";

export interface SyncContext {
  /** Today's date (UTC, YYYY-MM-DD). */
  today: string;
  log: (message: string) => void;
}

export interface ReleasesResult {
  /** Official endpoints/pages the data came from. */
  sources: string[];
  releases: Release[];
}

export interface MirrorsResult {
  sources: string[];
  mirrors: Mirror[];
}

/**
 * One distro's sync definition (scripts/sync/sources/<slug>.ts). `hosts` is
 * the allowlist of official hosts (exact or dot-suffix match) that artifact,
 * checksum, signature and torrent URLs may point to; validation rejects
 * anything else.
 */
export interface DistroSource {
  slug: string;
  hosts: string[];
  releases?: (ctx: SyncContext) => Promise<ReleasesResult>;
  mirrors?: (ctx: SyncContext) => Promise<MirrorsResult>;
}

export function defineSource(source: DistroSource): DistroSource {
  return source;
}

export function hostAllowed(url: string, hosts: string[]): boolean {
  const host = new URL(url).hostname;
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
}
