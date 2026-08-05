// Arch Linux monthly ISO snapshots.
// Registered in .ai/data-sources.md (verified 2026-08-05: official JSON, no
// robots rule covers the path).
//
// This is also what gives Arch any releases at all. Rolling distros have no
// version cycles for endoflife.date to report, so the catalog had none — but
// Arch does cut a dated ISO every month, and those are the versions a person
// actually downloads.

import type { HttpClient } from "../http";
import type { Fetched, LiveCatalog } from "../types";

export const ARCH_RELEASES_SOURCE = "archlinux.org/releng/releases";
export const ARCH_RELEASES_URL = "https://archlinux.org/releng/releases/json/";

/** Snapshots kept per run. The download selector shows a version list, not an
 *  archive — and Arch keeps years of monthly ISOs. */
export const SNAPSHOT_LIMIT = 6;

/** Arch publishes exactly one install medium per snapshot, an x86_64 live ISO
 *  that is also the installer. */
export const ARCH_EDITION = "ISO";
export const ARCH_ARCH = "x86_64";

export type ArchRelease = {
	version: string;
	release_date: string;
	available: boolean;
	sha256_sum: string | null;
	iso_url: string | null;
	torrent_url: string | null;
	magnet_uri: string | null;
};

export function normalizeArchReleases(releases: ArchRelease[]): LiveCatalog {
	const catalog: LiveCatalog = { releases: [], editions: [], artifacts: [] };

	for (const release of releases.filter((r) => r.available).slice(0, SNAPSHOT_LIMIT)) {
		const version = release.version;
		catalog.releases.push({
			cycle: version,
			releaseDate: release.release_date,
			lts: false,
			// A rolling snapshot is superseded, never end-of-lifed: yesterday's
			// ISO still installs, it just updates more on first boot.
			supported: true,
		});
		catalog.editions.push({ version, name: ARCH_EDITION, kind: "minimal" });

		if (release.iso_url) {
			catalog.artifacts.push({
				version,
				edition: ARCH_EDITION,
				arch: ARCH_ARCH,
				format: "iso",
				// Mirror-relative: Arch mirror base URLs end at the archlinux root,
				// and iso_url is absolute from there.
				path: release.iso_url.replace(/^\//, ""),
				sha256: release.sha256_sum ?? undefined,
			});
		}
		// The torrent page and the magnet live on archlinux.org, not on a mirror,
		// so they are stored as the absolute references they are.
		if (release.torrent_url) {
			catalog.artifacts.push({
				version,
				edition: ARCH_EDITION,
				arch: ARCH_ARCH,
				format: "torrent",
				path: new URL(release.torrent_url, "https://archlinux.org").toString(),
			});
		}
		if (release.magnet_uri) {
			catalog.artifacts.push({
				version,
				edition: ARCH_EDITION,
				arch: ARCH_ARCH,
				format: "magnet",
				path: release.magnet_uri,
			});
		}
	}

	return catalog;
}

export async function fetchArchReleases(
	http: HttpClient,
	now = new Date(),
): Promise<Fetched<LiveCatalog>> {
	const body = await http.getJson<{ releases: ArchRelease[] }>(ARCH_RELEASES_URL);
	return {
		sourceUrl: ARCH_RELEASES_URL,
		fetchedAt: now.toISOString(),
		data: normalizeArchReleases(body.releases),
	};
}
