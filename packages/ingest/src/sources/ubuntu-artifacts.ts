// Ubuntu ISO artifacts, from the per-version `SHA256SUMS`.
//
// Registered in .ai/data-sources.md (verified 2026-08-05: plain text, and
// `releases.ubuntu.com/robots.txt` disallows only `.pool` directories).
//
// The file is a checksum list and nothing else — no sizes, no editions, no
// architectures as fields. All of that is encoded in the filename, which is
// the one thing this module knows how to read:
//
//     <sha256> *ubuntu-26.04-desktop-amd64.iso
//     <sha256> *ubuntu-24.04.3-live-server-amd64.iso

import type { HttpClient } from "../http";
import type { Fetched, LiveArtifact, LiveCatalog, LiveEdition } from "../types";

export const UBUNTU_ARTIFACTS_SOURCE = "releases.ubuntu.com/SHA256SUMS";

/** The base Ubuntu artifact paths are relative to. It serves them directly, so
 *  unlike Fedora's mirrorlist this really is a download base. */
export const UBUNTU_BASE = "https://releases.ubuntu.com/";

export function checksumsUrl(version: string): string {
	return `${UBUNTU_BASE}${version}/SHA256SUMS`;
}

/** Upstream's names on the left, ours on the right. Anything not listed is
 *  skipped rather than guessed — an arch we cannot name is one we cannot
 *  honestly offer. */
const ARCH: Record<string, string> = {
	amd64: "x86_64",
	arm64: "aarch64",
	riscv64: "riscv64",
	ppc64el: "ppc64le",
	s390x: "s390x",
};

/** Filename fragment → edition. `kind` follows `.ai/database.md`'s enum.
 *
 * No `desktop` (the environment) is set for the desktop edition: the filename
 * says "desktop", not "GNOME". Naming the environment would be inference, and
 * the same rule already governs Fedora's Workstation. */
const EDITIONS: Record<string, LiveEdition> = {
	desktop: { name: "Desktop", kind: "desktop" },
	"live-server": { name: "Server", kind: "server" },
	server: { name: "Server", kind: "server" },
	netboot: { name: "Netboot", kind: "minimal" },
};

export type ChecksumRow = { sha256: string; filename: string };

/** `<hex> *<name>` per line. The `*` marks binary mode in the sha256sum
 *  format; a space instead is text mode, and both appear in the wild. */
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
 * `ubuntu-24.04.3-live-server-amd64.iso` → point `24.04.3`, Server, x86_64.
 *
 * Returns null for anything this cannot name confidently: `.wsl` images, an
 * unrecognised edition, an arch not in the map. Skipping beats storing a row
 * we would have to guess at.
 */
export function parseIsoName(filename: string): ParsedName | null {
	const match = filename.match(/^ubuntu-(\d[\w.]*)-(.+)-([\w]+)\.iso$/);
	if (!match?.[1] || !match[2] || !match[3]) return null;

	const arch = ARCH[match[3]];
	const edition = EDITIONS[match[2]];
	if (!arch || !edition) return null;

	return { point: match[1], edition, arch };
}

/** `24.04.4` sorts above `24.04.3`, numerically per segment rather than
 *  lexically — `24.04.10` must not lose to `24.04.9`. */
function pointIsNewer(a: string, b: string): boolean {
	const left = a.split(".").map(Number);
	const right = b.split(".").map(Number);
	for (let i = 0; i < Math.max(left.length, right.length); i++) {
		const l = left[i] ?? 0;
		const r = right[i] ?? 0;
		if (l !== r) return l > r;
	}
	return false;
}

/**
 * One version's checksum file → editions and artifacts.
 *
 * `version` is the release we file these under (`24.04`), which is not the
 * point release in the filename (`24.04.3`). A directory can list several
 * point releases at once, and `artifacts` is unique on
 * (edition, arch, format) — so only the newest point of each survives, which
 * is also the only one anybody should be handed.
 */
export function normalizeUbuntuArtifacts(version: string, text: string): LiveCatalog {
	const best = new Map<string, { point: string; artifact: LiveArtifact; edition: LiveEdition }>();

	for (const row of parseChecksums(text)) {
		const parsed = parseIsoName(row.filename);
		if (!parsed) continue;

		const key = `${parsed.edition.name}|${parsed.arch}`;
		const existing = best.get(key);
		if (existing && !pointIsNewer(parsed.point, existing.point)) continue;

		best.set(key, {
			point: parsed.point,
			edition: parsed.edition,
			artifact: {
				version,
				edition: parsed.edition.name,
				arch: parsed.arch,
				format: "iso",
				// Mirror-relative, so it extends UBUNTU_BASE and any future mirror.
				path: `${version}/${row.filename}`,
				sha256: row.sha256,
			},
		});
	}

	const editions = new Map<string, LiveEdition & { version: string }>();
	for (const { edition } of best.values()) {
		editions.set(edition.name, { ...edition, version });
	}

	return {
		// Ubuntu's release cycles come from endoflife.date; this source only
		// says what each of them can be downloaded as.
		releases: [],
		editions: [...editions.values()],
		artifacts: [...best.values()].map((entry) => entry.artifact),
	};
}

/**
 * Fills in sizes, which `SHA256SUMS` does not carry, with one HEAD per file.
 *
 * Bounded by construction: the caller passes the versions already in the
 * catalog, and each yields at most a handful of ISOs. The client paces these
 * like any other request, and a size it cannot learn stays absent rather than
 * becoming a guess.
 */
export async function withSizes(http: HttpClient, catalog: LiveCatalog): Promise<LiveCatalog> {
	const artifacts = await Promise.all(
		catalog.artifacts.map(async (artifact) => {
			const size = await http.head(`${UBUNTU_BASE}${artifact.path}`);
			return size === null ? artifact : { ...artifact, size };
		}),
	);
	return { ...catalog, artifacts };
}

/**
 * Fetches the checksum file for each version given.
 *
 * A version whose directory is gone — Ubuntu removes them at EOL — is skipped
 * rather than failing the run: the other versions are still worth having, and
 * the release row stays, correctly, without artifacts.
 */
export async function fetchUbuntuArtifacts(
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
		const catalog = await withSizes(http, normalizeUbuntuArtifacts(version, text));
		merged.editions.push(...catalog.editions);
		merged.artifacts.push(...catalog.artifacts);
	}

	// Every version failing is a broken source, not an empty one. Returning an
	// empty catalog would log the run as `ok` with nothing written, which is the
	// shape of a silent failure — the caller logs a thrown error instead.
	if (versions.length > 0 && fetched === 0) {
		throw new Error(`no checksum file could be read for any of: ${versions.join(", ")}`);
	}

	return {
		sourceUrl: `${UBUNTU_BASE}<version>/SHA256SUMS`,
		fetchedAt: now.toISOString(),
		data: merged,
	};
}
