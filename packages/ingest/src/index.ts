// @linuxhub/ingest — robots-aware fetchers/normalizers for distro data.
//
// Phase 1 placeholder: fetchers are implemented in Phase 5, one per source
// registered in .ai/data-sources.md (robots/ToS verified first — binding
// crawler policy in .ai/security.md). Imported by the Worker's cron entrypoints.

export const INGEST_VERSION = "0.1.0";

// Production domain is set at Phase 7 (deployment); the UA shape is fixed by
// .ai/security.md: descriptive name + version + contact URL.
export function ingestUserAgent(siteOrigin: string): string {
	return `linuxhub-ingest/${INGEST_VERSION} (+${siteOrigin}/about#crawler)`;
}
