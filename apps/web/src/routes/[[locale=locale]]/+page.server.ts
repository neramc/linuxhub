import type { RecentRelease } from "@linuxhub/shared";
import { unwrap } from "$lib/server/api";
import type { Distro } from "$lib/server/data";
import { BANNERS, getDistro } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

// Home composition: catalog data via the BFF endpoints; banners are
// editorial configuration joined server-side.
//
// Each list degrades to empty on its own. The home page is the first thing a
// visitor sees, and a backend hiccup should cost them a section, not the site.
export const load: PageServerLoad = async ({ fetch }) => {
	const [trendingRes, popularRes, recentRes] = await Promise.all([
		fetch("/api/v1/distros?sort=trending"),
		fetch("/api/v1/distros?sort=popularity"),
		fetch("/api/v1/releases/recent"),
	]);
	const trending = (await unwrap<Distro[]>(trendingRes, [], "home:trending")).slice(0, 6);
	const popular = (await unwrap<Distro[]>(popularRes, [], "home:popular")).slice(0, 6);
	// Facts only — the page composes the title and the channel label through
	// @linuxhub/i18n, and formats the date with Intl (ADR-0020).
	const recent = (await unwrap<RecentRelease[]>(recentRes, [], "home:recent")).map((release) => ({
		...release,
		distro: getDistro(release.slug),
	}));
	const banners = BANNERS.map((b) => ({ ...b, distro: getDistro(b.slug) })).filter(
		(b) => b.distro !== undefined,
	);
	return { banners, trending, popular, recent };
};
