// Content index generator (Bun CLI).
//
//   bun packages/ingest/src/content-index.ts
//
// Reads the frontmatter of every authored doc under content/distros and writes
// content-index.json next to this file. The Worker imports that JSON to seed
// `distros` identity and the `content_index` registry — it has no filesystem,
// and .ai/content.md already specifies that "the build registers every doc into
// D1 content_index".
//
// The point of routing identity through the MDX rather than a hand-kept table:
// name, summary, and homepage are then the same values a human reviewed and
// cited in `sources`, so nothing about a distro is asserted anywhere without a
// resolvable citation and a `last_reviewed` date.

import { readdir } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import type { ContentDistroRow, ContentDoc, ContentDocRow, ContentIndex } from "./content";

const CONTENT_DIR = new URL("../../../content/distros", import.meta.url).pathname;
const OUT = new URL("./content-index.json", import.meta.url).pathname;

export type ContentFrontmatter = {
	title: string;
	summary: string;
	distro: string;
	doc: ContentDoc;
	locale: string;
	official_links?: { homepage?: string; docs?: string };
	sources?: string[];
	last_reviewed?: string;
	translated?: boolean;
};

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

export function readFrontmatter(raw: string, path: string): ContentFrontmatter {
	const match = raw.match(FRONTMATTER);
	if (!match?.[1]) throw new Error(`no frontmatter in ${path}`);
	const meta = parseYaml(match[1]) as ContentFrontmatter;
	for (const field of ["title", "summary", "distro", "doc", "locale"] as const) {
		if (!meta[field]) throw new Error(`${path}: frontmatter is missing "${field}"`);
	}
	return meta;
}

/** The YAML parser turns bare ISO dates into Date objects — normalize back. */
function isoDate(value: unknown): string | null {
	if (value instanceof Date) return value.toISOString().slice(0, 10);
	return value ? String(value).slice(0, 10) : null;
}

export async function buildIndex(contentDir = CONTENT_DIR): Promise<ContentIndex> {
	const distros: ContentDistroRow[] = [];

	for (const slug of (await readdir(contentDir, { withFileTypes: true }))
		.filter((e) => e.isDirectory())
		.map((e) => e.name)
		.sort()) {
		const docs: ContentDocRow[] = [];
		let identity: ContentFrontmatter | undefined;
		let identityPath = "";

		for (const locale of (await readdir(`${contentDir}/${slug}`, { withFileTypes: true }))
			.filter((e) => e.isDirectory())
			.map((e) => e.name)
			.sort()) {
			for (const file of (await readdir(`${contentDir}/${slug}/${locale}`))
				.filter((f) => f.endsWith(".md"))
				.sort()) {
				const path = `${contentDir}/${slug}/${locale}/${file}`;
				const meta = readFrontmatter(await Bun.file(path).text(), path);
				if (meta.distro !== slug || meta.locale !== locale) {
					throw new Error(`${path}: frontmatter distro/locale does not match its directory`);
				}
				docs.push({
					doc: meta.doc,
					locale,
					source_urls: meta.sources ?? [],
					reviewed_at: isoDate(meta.last_reviewed),
				});
				// English `description` carries the catalog identity.
				if (locale === "en" && meta.doc === "description") {
					identity = meta;
					identityPath = path;
				}
			}
		}

		if (!identity) {
			throw new Error(`${slug}: no en/description.md, so it has no citable identity`);
		}
		const homepage = identity.official_links?.homepage;
		if (!homepage) {
			throw new Error(`${identityPath}: official_links.homepage is required for the catalog`);
		}

		distros.push({
			slug,
			name: identity.title,
			summary: identity.summary,
			homepage,
			logo_path: `/distros/${slug}.svg`,
			source_url: identity.sources?.[0] ?? homepage,
			docs,
		});
	}

	return { generated_at: new Date().toISOString(), distros };
}

if (import.meta.main) {
	const index = await buildIndex();
	await Bun.write(OUT, `${JSON.stringify(index, null, "\t")}\n`);
	const docs = index.distros.reduce((n, d) => n + d.docs.length, 0);
	console.log(`wrote ${OUT}\n${index.distros.length} distros, ${docs} docs`);
}
