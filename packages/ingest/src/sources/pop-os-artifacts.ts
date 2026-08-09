// Pop!_OS ISO artifacts, from the build API its own updater calls.
//
// Registered in .ai/data-sources.md (verified 2026-08-09: 200, and
// api.pop-os.org serves no robots.txt).
//
// The friendliest source here so far: one call per version and channel returns
// the absolute URL, the size and the sha256 together, so nothing has to be
// parsed out of a filename and no HEAD is needed.
//
//   {"version":"24.04","url":"https://iso.pop-os.org/24.04/amd64/intel/20/…iso",
//    "size":2955067392,"sha_sum":"a0…","channel":"intel","build":"20"}

import type { HttpClient } from "../http";
import type { Fetched, LiveCatalog, LiveEdition } from "../types";

export const POP_OS_ARTIFACTS_SOURCE = "api.pop-os.org/builds";
export const POP_OS_API = "https://api.pop-os.org/builds/";

/** The base the published URLs live under, and therefore the one our paths are
 *  stored relative to. */
export const POP_OS_BASE = "https://iso.pop-os.org/";

/**
 * Channels to ask for.
 *
 * These are **graphics driver builds**, not desktop environments or editions in
 * the usual sense: both ship the same COSMIC/GNOME desktop, and the difference
 * is whether NVIDIA's proprietary driver is preinstalled. They are named for
 * what they are, because "Intel" and "NVIDIA" as bare edition names would read
 * as processor architectures next to `x86_64`.
 */
export const POP_OS_CHANNELS: ReadonlyArray<{ channel: string; edition: LiveEdition }> = [
	{ channel: "intel", edition: { name: "Desktop (Intel/AMD graphics)", kind: "desktop" } },
	{ channel: "nvidia", edition: { name: "Desktop (NVIDIA graphics)", kind: "desktop" } },
];

/** Pop!_OS publishes amd64 only through this API. */
const ARCH = "x86_64";

export function buildUrl(version: string, channel: string): string {
	return `${POP_OS_API}${version}/${channel}`;
}

export type PopBuild = {
	version: string;
	url: string;
	size?: number;
	sha_sum?: string;
	channel?: string;
	build?: string;
};

/**
 * One build response → an edition and its artifact.
 *
 * `url` is absolute and under `iso.pop-os.org`, so it is stored relative to
 * that base like every other mirror-relative path. A URL from somewhere else
 * is skipped rather than stored as an absolute reference: an artifact whose
 * path is not relative to its base cannot be served by a second mirror later,
 * and `isAbsoluteRef` would exempt it from mirror linking entirely.
 */
export function normalizePopBuild(
	version: string,
	edition: LiveEdition,
	build: PopBuild,
): LiveCatalog {
	if (!build.url.startsWith(POP_OS_BASE)) {
		return { releases: [], editions: [], artifacts: [] };
	}

	return {
		// Release cycles come from endoflife.date; this says what each is
		// downloadable as.
		releases: [],
		editions: [{ ...edition, version }],
		artifacts: [
			{
				version,
				edition: edition.name,
				arch: ARCH,
				format: "iso",
				path: build.url.slice(POP_OS_BASE.length),
				size: build.size,
				sha256: build.sha_sum,
			},
		],
	};
}

/**
 * Fetches the current build for each version × channel.
 *
 * A channel a version does not publish answers with an empty body, which the
 * JSON parse rejects — skipped, like Ubuntu's removed directories, because the
 * other combinations are still worth having.
 */
export async function fetchPopOsArtifacts(
	http: HttpClient,
	versions: string[],
	now = new Date(),
): Promise<Fetched<LiveCatalog>> {
	const merged: LiveCatalog = { releases: [], editions: [], artifacts: [] };
	let fetched = 0;

	for (const version of versions) {
		for (const { channel, edition } of POP_OS_CHANNELS) {
			let build: PopBuild;
			try {
				build = await http.getJson<PopBuild>(buildUrl(version, channel));
			} catch {
				continue;
			}
			if (!build?.url) continue;
			fetched++;

			const catalog = normalizePopBuild(version, edition, build);
			merged.editions.push(...catalog.editions);
			merged.artifacts.push(...catalog.artifacts);
		}
	}

	// Every combination failing is a broken source, not an empty one.
	if (versions.length > 0 && fetched === 0) {
		throw new Error(`no build could be read for any of: ${versions.join(", ")}`);
	}

	return {
		sourceUrl: `${POP_OS_API}<version>/<channel>`,
		fetchedAt: now.toISOString(),
		data: merged,
	};
}
