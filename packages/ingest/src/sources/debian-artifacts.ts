// Debian ISO artifacts, from the per-architecture `SHA256SUMS`.
//
// Registered in .ai/data-sources.md (verified 2026-08-09). Two things about
// that verification shape this module:
//
//   1. `cdimage.debian.org/robots.txt` carries `Disallow: /*.iso$` under
//      `User-agent: *`, which is the group our crawler falls into. The
//      checksum files are permitted; the ISOs are not. So **no sizes** — a
//      size would cost a HEAD against a path we are told not to request.
//      Linking a human to the ISO is not crawling it, so the download itself
//      is unaffected.
//   2. `current/` is a symlink that moves on every point release. Storing a
//      path under it would leave us serving a checksum from 13.6.0 against a
//      URL that quietly became 13.7.0. The point release is in the filename,
//      so paths are stored against the versioned directory instead.

import type { HttpClient } from "../http";
import type { Fetched, LiveArtifact, LiveCatalog, LiveEdition } from "../types";

export const DEBIAN_ARTIFACTS_SOURCE = "cdimage.debian.org/SHA256SUMS";

/** The base Debian artifact paths are relative to. */
export const DEBIAN_BASE = "https://cdimage.debian.org/debian-cd/";

/**
 * Architectures to ask for. Debian publishes a directory per architecture and
 * simply 404s the ones a release does not ship — `i386` already answers 404 —
 * so an absent one is skipped rather than being an error.
 */
export const DEBIAN_ARCHES = ["amd64", "arm64", "armhf", "ppc64el"] as const;

/** Where `current` lives. Read to *discover* the point release; never stored. */
export function currentChecksumsUrl(arch: string): string {
	return `${DEBIAN_BASE}current/${arch}/iso-cd/SHA256SUMS`;
}

const ARCH: Record<string, string> = {
	amd64: "x86_64",
	arm64: "aarch64",
	armhf: "armhf",
	ppc64el: "ppc64le",
};

/**
 * Filename flavour → edition.
 *
 * Debian's netinst is the plain one; `edu` and `mac` are separate published
 * images with their own audiences, and the filename names them outright. They
 * are recorded as what they say they are rather than folded into one edition.
 */
const EDITIONS: Record<string, LiveEdition> = {
	"": { name: "Netinst", kind: "minimal" },
	edu: { name: "Edu netinst", kind: "other" },
	mac: { name: "Mac netinst", kind: "other" },
};

export type ChecksumRow = { sha256: string; filename: string };

/** Same `sha256sum` format Ubuntu uses; Debian writes it in text mode, with
 *  two spaces and no asterisk. */
export function parseChecksums(text: string): ChecksumRow[] {
	const rows: ChecksumRow[] = [];
	for (const line of text.split("\n")) {
		const match = line.trim().match(/^([0-9a-f]{64})\s+[*]?(\S+)$/i);
		if (match?.[1] && match[2]) rows.push({ sha256: match[1].toLowerCase(), filename: match[2] });
	}
	return rows;
}

export type ParsedName = { point: string; edition: LiveEdition; arch: string };

/**
 * `debian-edu-13.6.0-amd64-netinst.iso` → point 13.6.0, Edu netinst, x86_64.
 *
 * Null for anything unrecognised — an unmapped flavour or architecture — on
 * the same rule as everywhere else: a row we would have to guess at is a row
 * we do not store.
 */
export function parseIsoName(filename: string): ParsedName | null {
	const match = filename.match(/^debian-(?:([a-z]+)-)?(\d[\d.]*)-([\w]+)-netinst\.iso$/);
	if (!match?.[2] || !match[3]) return null;

	const edition = EDITIONS[match[1] ?? ""];
	const arch = ARCH[match[3]];
	if (!edition || !arch) return null;

	return { point: match[2], edition, arch };
}

/** `13.6.0` → `13`, the cycle endoflife.date reports and `releases.version`
 *  holds. Getting this wrong orphans every artifact. */
export function releaseVersionOf(point: string): string {
	return point.split(".")[0] ?? point;
}

/**
 * One architecture's checksum file → editions and artifacts.
 *
 * Paths are built against the point-release directory the filenames name, not
 * against `current`, so a stored checksum and its URL cannot drift apart.
 */
export function normalizeDebianArtifacts(arch: string, text: string): LiveCatalog {
	const editions = new Map<string, LiveEdition & { version: string }>();
	const artifacts: LiveArtifact[] = [];

	for (const row of parseChecksums(text)) {
		const parsed = parseIsoName(row.filename);
		if (!parsed || parsed.arch !== ARCH[arch]) continue;

		const version = releaseVersionOf(parsed.point);
		editions.set(parsed.edition.name, { ...parsed.edition, version });
		artifacts.push({
			version,
			edition: parsed.edition.name,
			arch: parsed.arch,
			format: "iso",
			path: `${parsed.point}/${arch}/iso-cd/${row.filename}`,
			sha256: row.sha256,
			// No size: robots.txt forbids requesting the ISO. See the header.
		});
	}

	// Release cycles come from endoflife.date; this source only says what each
	// can be downloaded as.
	return { releases: [], editions: [...editions.values()], artifacts };
}

/**
 * Reads `current` for each architecture.
 *
 * Only the current stable is covered: cdimage keeps one live tree and moves
 * older point releases to `archive/`. Releases with no artifacts here keep
 * their rows and simply offer no download, which is the honest state.
 */
export async function fetchDebianArtifacts(
	http: HttpClient,
	arches: readonly string[] = DEBIAN_ARCHES,
	now = new Date(),
): Promise<Fetched<LiveCatalog>> {
	const merged: LiveCatalog = { releases: [], editions: [], artifacts: [] };
	let fetched = 0;

	for (const arch of arches) {
		let text: string;
		try {
			text = await http.getText(currentChecksumsUrl(arch));
		} catch {
			continue;
		}
		fetched++;
		const catalog = normalizeDebianArtifacts(arch, text);
		merged.editions.push(...catalog.editions);
		merged.artifacts.push(...catalog.artifacts);
	}

	// Every architecture failing is a broken source, not an empty one —
	// returning an empty catalog would log the run `ok` with nothing written.
	if (arches.length > 0 && fetched === 0) {
		throw new Error(`no checksum file could be read for any of: ${arches.join(", ")}`);
	}

	return {
		sourceUrl: `${DEBIAN_BASE}current/<arch>/iso-cd/SHA256SUMS`,
		fetchedAt: now.toISOString(),
		data: merged,
	};
}
