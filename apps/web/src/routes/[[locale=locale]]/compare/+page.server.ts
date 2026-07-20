import { DISTROS, SPECS } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

// Compare (.ai/api.md #46) — slugs come from the URL (?slugs=a,b,c, max 4).
export const load: PageServerLoad = ({ url }) => {
	const requested = (url.searchParams.get("slugs") ?? "ubuntu,fedora,arch")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
		.slice(0, 4);
	const picked = requested
		.map((slug) => {
			const distro = DISTROS.find((d) => d.slug === slug);
			return distro ? { ...distro, specs: SPECS[slug] } : undefined;
		})
		.filter((d) => d !== undefined);
	const available = DISTROS.filter((d) => !requested.includes(d.slug)).map((d) => ({
		slug: d.slug,
		name: d.name,
	}));
	return { picked, available };
};
