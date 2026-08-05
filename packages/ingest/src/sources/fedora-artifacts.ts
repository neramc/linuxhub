// Fedora's release artifact index.
// Registered in .ai/data-sources.md (verified 2026-08-05: official JSON, no
// robots rule covers the path).
//
// One flat array covering every variant × arch × format Fedora publishes, each
// entry carrying an absolute link, a sha256 and a byte size — which makes it
// the only source so far that can fill a download panel on its own.

import type { HttpClient } from "../http";
import type { Fetched, LiveCatalog, LiveEdition } from "../types";

export const FEDORA_ARTIFACTS_SOURCE = "fedoraproject.org/releases.json";
export const FEDORA_ARTIFACTS_URL = "https://fedoraproject.org/releases.json";

/** Fedora's own geo-redirector. Modelled as a mirror because that is what it
 *  is: every link in the index points at it, and it routes to a real mirror. */
export const FEDORA_REDIRECTOR = "https://download.fedoraproject.org/";

export type FedoraEntry = {
	version: string;
	arch: string;
	link: string;
	variant: string;
	subvariant: string;
	sha256: string;
	size: string;
};

/** Variants that are not a desktop or a server: images for other targets, and
 *  Everything, which is a package repository rather than a product. */
const NON_PRODUCT = new Set(["Cloud", "Container", "IoT", "Everything", "Labs"]);

/** Variant names that *are* a desktop environment. Fedora's "Workstation"
 *  ships GNOME, but the index never says so — asserting it would be a fact we
 *  cannot cite, so `desktop` is left unset rather than guessed. */
const DESKTOP_VARIANTS: Record<string, string> = {
	KDE: "kde",
	Xfce: "xfce",
	LXQt: "lxqt",
	LXDE: "lxde",
	MATE: "mate",
	Cinnamon: "cinnamon",
	Budgie: "budgie",
	SoaS: "sugar",
	Sway: "sway",
	COSMIC: "cosmic",
};

export function editionFor(variant: string): LiveEdition {
	const desktop = DESKTOP_VARIANTS[variant];
	const kind: LiveEdition["kind"] = variant.includes("Server")
		? "server"
		: NON_PRODUCT.has(variant)
			? "other"
			: "desktop";
	return desktop ? { name: variant, desktop, kind } : { name: variant, kind };
}

/**
 * Keeps the ISOs only.
 *
 * The index also lists .ociarchive, .raw.xz and .qcow2 images. They are real
 * artifacts but not ones our `format` enum covers, and not what the download
 * selector is for — someone who wants a cloud image is not on this page.
 */
export function normalizeFedoraArtifacts(entries: FedoraEntry[], versions: string[]): LiveCatalog {
	const wanted = new Set(versions);
	const catalog: LiveCatalog = { releases: [], editions: [], artifacts: [] };
	const seenEdition = new Set<string>();

	for (const entry of entries) {
		if (!entry.link.endsWith(".iso")) continue;
		// Only versions the catalog already has a release row for — the index
		// reaches further back than endoflife.date reports.
		if (!wanted.has(entry.version)) continue;
		if (!entry.link.startsWith(FEDORA_REDIRECTOR)) continue;

		const key = `${entry.version}/${entry.variant}`;
		if (!seenEdition.has(key)) {
			seenEdition.add(key);
			catalog.editions.push({ version: entry.version, ...editionFor(entry.variant) });
		}

		const size = Number.parseInt(entry.size, 10);
		catalog.artifacts.push({
			version: entry.version,
			edition: entry.variant,
			arch: entry.arch,
			format: "iso",
			// Relative to the redirector, so a mirror row can own the origin.
			path: entry.link.slice(FEDORA_REDIRECTOR.length),
			size: Number.isNaN(size) ? undefined : size,
			sha256: entry.sha256 || undefined,
		});
	}

	return catalog;
}

export async function fetchFedoraArtifacts(
	http: HttpClient,
	versions: string[],
	now = new Date(),
): Promise<Fetched<LiveCatalog>> {
	const entries = await http.getJson<FedoraEntry[]>(FEDORA_ARTIFACTS_URL);
	return {
		sourceUrl: FEDORA_ARTIFACTS_URL,
		fetchedAt: now.toISOString(),
		data: normalizeFedoraArtifacts(entries, versions),
	};
}
