// Fedora MirrorManager mirror list.
// Registered in .ai/data-sources.md (verified 2026-07-19: official mirror-list
// endpoint). Returns a plain-text list of URLs already ranked for the caller's
// region, with no health or country metadata — so mirrors from this source
// carry an empty country and default to healthy.

import type { HttpClient } from "../http";
import type { Fetched, LiveMirror } from "../types";
import { MIRROR_LIMIT } from "./arch-mirrors";

export const FEDORA_MIRRORS_SOURCE = "mirrors.fedoraproject.org";

export function fedoraMirrorlistUrl(repo: string, arch = "x86_64"): string {
	return `https://mirrors.fedoraproject.org/mirrorlist?repo=${repo}&arch=${arch}`;
}

/** The response is a comment header followed by one URL per line. */
export function normalizeFedoraMirrors(text: string): LiveMirror[] {
	const seen = new Set<string>();
	const mirrors: LiveMirror[] = [];
	for (const line of text.split("\n")) {
		const url = line.trim();
		if (!url.startsWith("http")) continue;
		try {
			const host = new URL(url).hostname;
			if (seen.has(host)) continue;
			seen.add(host);
			mirrors.push({ name: host, url, note: `via ${FEDORA_MIRRORS_SOURCE}` });
			if (mirrors.length >= MIRROR_LIMIT) break;
		} catch {
			// A malformed line is not a reason to lose the rest of the list.
		}
	}
	return mirrors;
}

export async function fetchFedoraMirrors(
	http: HttpClient,
	repo: string,
	now = new Date(),
): Promise<Fetched<LiveMirror[]>> {
	const sourceUrl = fedoraMirrorlistUrl(repo);
	return {
		sourceUrl,
		fetchedAt: now.toISOString(),
		data: normalizeFedoraMirrors(await http.getText(sourceUrl)),
	};
}
