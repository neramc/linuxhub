// Shape of the generated content index.
//
// Kept apart from the generator (`content-index.ts`) on purpose: the generator
// is a Bun CLI that touches the filesystem, and the Worker must be able to
// import these types without dragging Bun/Node APIs into the workerd bundle.

export type ContentDoc = "description" | "install" | "usage";

export type ContentDocRow = {
	doc: ContentDoc;
	locale: string;
	source_urls: string[];
	reviewed_at: string | null;
};

export type ContentDistroRow = {
	slug: string;
	name: string;
	summary: string;
	homepage: string;
	logo_path: string;
	/** The authored doc the identity above was read from — `distros.source_url`. */
	source_url: string;
	docs: ContentDocRow[];
};

export type ContentIndex = {
	generated_at: string;
	distros: ContentDistroRow[];
};
