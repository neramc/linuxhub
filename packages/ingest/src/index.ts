// @linuxhub/ingest — robots-aware fetchers/normalizers for distro data.
//
// Phase 1 placeholder: fetchers are implemented in Phase 5, one per source
// registered in .ai/data-sources.md (robots/ToS verified first — binding
// crawler policy in .ai/security.md). Imported by the Worker's cron entrypoints.

export const INGEST_VERSION = "0.1.0";

/**
 * Public site origin, used as the contact URL every ingest request advertises.
 *
 * **This is the build-time default. To change the domain, edit two places:**
 *   1. `SITE_ORIGIN` under `[vars]` in `apps/api/wrangler.toml` — the value the
 *      deployed Worker actually uses, and the one that matters in production;
 *   2. this constant — the fallback for the local snapshot CLI and for a Worker
 *      running without the var set.
 *
 * Both are listed in `docs/deployment.md`. Keep them in agreement: a contact URL
 * that does not resolve makes us a badly-behaved crawler (.ai/security.md).
 */
export const DEFAULT_SITE_ORIGIN = "https://linuxhub.kro.kr";

// The UA shape is fixed by .ai/security.md: descriptive name + version +
// contact URL, so a source operator can always find out who we are.
export function ingestUserAgent(siteOrigin: string): string {
	return `linuxhub-ingest/${INGEST_VERSION} (+${siteOrigin}/about#crawler)`;
}
