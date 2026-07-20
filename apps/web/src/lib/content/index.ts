// Distro MDX loader — resolves content/distros/<slug>/<locale>/<doc>.md
// (repo root, compiled by mdsvex) to a Svelte component + frontmatter, with
// the English-fallback behavior specified in .ai/i18n.md.

import type { Component } from "svelte";

export type DistroDoc = "description" | "install" | "usage";

export type ContentMeta = {
	title: string;
	summary: string;
	distro: string;
	doc: DistroDoc;
	locale: string;
	official_links?: { homepage?: string; docs?: string };
	sources?: string[];
	last_reviewed?: string;
	translated?: boolean;
};

type ContentModule = { default: Component; metadata: ContentMeta };

export type LoadedDoc = {
	component: Component;
	meta: ContentMeta;
	/** false → English fallback is being shown for a non-English locale. */
	translated: boolean;
};

const modules = import.meta.glob<ContentModule>("../../../../../content/distros/*/*/*.md");

const index = new Map<string, () => Promise<ContentModule>>();
for (const [path, loader] of Object.entries(modules)) {
	const match = path.match(/content\/distros\/([^/]+)\/([^/]+)\/([^/]+)\.md$/);
	if (match) index.set(`${match[1]}/${match[2]}/${match[3]}`, loader);
}

export async function loadDoc(
	slug: string,
	doc: DistroDoc,
	locale: string,
): Promise<LoadedDoc | null> {
	const exact = index.get(`${slug}/${locale}/${doc}`);
	const loader = exact ?? index.get(`${slug}/en/${doc}`);
	if (!loader) return null;
	const mod = await loader();
	const authored = exact !== undefined || locale === "en";
	// The YAML parser turns ISO dates into Date objects — normalize back.
	const reviewed: unknown = mod.metadata.last_reviewed;
	return {
		component: mod.default,
		meta: {
			...mod.metadata,
			last_reviewed:
				reviewed instanceof Date
					? reviewed.toISOString().slice(0, 10)
					: reviewed
						? String(reviewed).slice(0, 10)
						: undefined,
		},
		translated: authored && mod.metadata.translated !== false,
	};
}
