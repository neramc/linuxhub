import { loadDoc } from "$lib/content";
import type { PageLoad } from "./$types";

// Server load supplies distro + detail; here we attach the mdsvex content
// components (per-tab docs) in the active locale, English as fallback.
export const load: PageLoad = async ({ data, params, parent }) => {
	const { locale } = await parent();
	const [description, install, usage] = await Promise.all([
		loadDoc(params.slug, "description", locale),
		loadDoc(params.slug, "install", locale),
		loadDoc(params.slug, "usage", locale),
	]);
	return { ...data, content: { description, install, usage } };
};
