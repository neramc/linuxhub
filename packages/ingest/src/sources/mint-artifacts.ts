// Linux Mint ISO artifacts, from the per-version `sha256sum.txt`.
//
// Registered in .ai/data-sources.md (verified 2026-08-09). The host is the
// Linux Foundation's Mint mirror: Mint distributes through mirrors rather than
// one origin, and publishes the same signed checksum file on each.
//
//     <sha256> *linuxmint-22.2-cinnamon-64bit.iso
//
// Unlike every other source wired so far, Mint's editions **are** desktop
// environments — Cinnamon, MATE and Xfce are the whole difference between the
// images. So this is the one place `desktop` gets set, which is exactly the
// carve-out the Fedora rule anticipated: name the environment when the source
// names it, and never otherwise.

import type { HttpClient } from "../http";
import type { Fetched, LiveArtifact, LiveCatalog, LiveEdition } from "../types";

export const MINT_ARTIFACTS_SOURCE = "mirrors.kernel.org/linuxmint/sha256sum.txt";
export const MINT_BASE = "https://mirrors.edge.kernel.org/linuxmint/stable/";

export function checksumsUrl(version: string): string {
	return `${MINT_BASE}${version}/sha256sum.txt`;
}

/** Mint's filenames say `64bit`/`32bit` rather than an architecture name. */
const ARCH: Record<string, string> = {
	"64bit": "x86_64",
	"32bit": "i686",
};

/**
 * Filename fragment → edition.
 *
 * Each carries `desktop`, because here the fragment genuinely is the desktop
 * environment. `edge` is the same Cinnamon image on a newer kernel, which is a
 * kernel choice rather than a desktop one — so it is named for that and gets
 * no `desktop` of its own beyond Cinnamon's.
 */
const EDITIONS: Record<string, LiveEdition> = {
	cinnamon: { name: "Cinnamon", desktop: "cinnamon", kind: "desktop" },
	mate: { name: "MATE", desktop: "mate", kind: "desktop" },
	xfce: { name: "Xfce", desktop: "xfce", kind: "desktop" },
	"cinnamon-edge": { name: "Cinnamon (edge kernel)", desktop: "cinnamon", kind: "desktop" },
};

export type ChecksumRow = { sha256: string; filename: string };

export function parseChecksums(text: string): ChecksumRow[] {
	const rows: ChecksumRow[] = [];
	for (const line of text.split("\n")) {
		const match = line.trim().match(/^([0-9a-f]{64})\s+[*]?(\S+)$/i);
		if (match?.[1] && match[2]) rows.push({ sha256: match[1].toLowerCase(), filename: match[2] });
	}
	return rows;
}

export type ParsedName = { version: string; edition: LiveEdition; arch: string };

/** `linuxmint-22.2-cinnamon-64bit.iso` → 22.2, Cinnamon, x86_64. Null for
 *  anything unrecognised, as everywhere else. */
export function parseIsoName(filename: string): ParsedName | null {
	const match = filename.match(/^linuxmint-(\d[\d.]*)-([a-z-]+)-(\d+bit)\.iso$/);
	if (!match?.[1] || !match[2] || !match[3]) return null;

	const edition = EDITIONS[match[2]];
	const arch = ARCH[match[3]];
	if (!edition || !arch) return null;

	return { version: match[1], edition, arch };
}

/**
 * One version's checksum file → editions and artifacts.
 *
 * Mint's directory version and its filename version are the same, so unlike
 * Ubuntu there is no point-release mismatch to reconcile. Entries naming a
 * different version than the directory are skipped rather than misfiled.
 */
export function normalizeMintArtifacts(version: string, text: string): LiveCatalog {
	const editions = new Map<string, LiveEdition & { version: string }>();
	const artifacts: LiveArtifact[] = [];

	for (const row of parseChecksums(text)) {
		const parsed = parseIsoName(row.filename);
		if (!parsed || parsed.version !== version) continue;

		editions.set(parsed.edition.name, { ...parsed.edition, version });
		artifacts.push({
			version,
			edition: parsed.edition.name,
			arch: parsed.arch,
			format: "iso",
			path: `${version}/${row.filename}`,
			sha256: row.sha256,
		});
	}

	return { releases: [], editions: [...editions.values()], artifacts };
}

/** Sizes, which `sha256sum.txt` does not carry. One paced HEAD each; a size
 *  the mirror will not report stays absent rather than guessed. */
export async function withSizes(http: HttpClient, catalog: LiveCatalog): Promise<LiveCatalog> {
	const artifacts = await Promise.all(
		catalog.artifacts.map(async (artifact) => {
			const size = await http.head(`${MINT_BASE}${artifact.path}`);
			return size === null ? artifact : { ...artifact, size };
		}),
	);
	return { ...catalog, artifacts };
}

export async function fetchMintArtifacts(
	http: HttpClient,
	versions: string[],
	now = new Date(),
): Promise<Fetched<LiveCatalog>> {
	const merged: LiveCatalog = { releases: [], editions: [], artifacts: [] };
	let fetched = 0;

	for (const version of versions) {
		let text: string;
		try {
			text = await http.getText(checksumsUrl(version));
		} catch {
			continue;
		}
		fetched++;
		const catalog = await withSizes(http, normalizeMintArtifacts(version, text));
		merged.editions.push(...catalog.editions);
		merged.artifacts.push(...catalog.artifacts);
	}

	// Every version failing is a broken source, not an empty one.
	if (versions.length > 0 && fetched === 0) {
		throw new Error(`no checksum file could be read for any of: ${versions.join(", ")}`);
	}

	return {
		sourceUrl: `${MINT_BASE}<version>/sha256sum.txt`,
		fetchedAt: now.toISOString(),
		data: merged,
	};
}
