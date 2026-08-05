import type { ApiSuccess, RecentRelease } from "@linuxhub/shared";
import type { Distro } from "$lib/server/data";
import { BANNERS, getDistro } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

// Home composition: catalog data via the BFF endpoints; banners are
// editorial configuration joined server-side.
export const load: PageServerLoad = async ({ fetch }) => {
	const [trendingRes, popularRes, recentRes] = await Promise.all([
		fetch("/api/v1/distros?sort=trending"),
		fetch("/api/v1/distros?sort=popularity"),
		fetch("/api/v1/releases/recent"),
	]);
	const trending = ((await trendingRes.json()) as ApiSuccess<Distro[]>).data.slice(0, 6);
	const popular = ((await popularRes.json()) as ApiSuccess<Distro[]>).data.slice(0, 6);
	// Facts only — the page composes the title and the channel label through
	// @linuxhub/i18n, and formats the date with Intl (ADR-0020).
	const recent = ((await recentRes.json()) as ApiSuccess<RecentRelease[]>).data.map((release) => ({
		...release,
		distro: getDistro(release.slug),
	}));
	const banners = BANNERS.map((b) => ({ ...b, distro: getDistro(b.slug) })).filter(
		(b) => b.distro !== undefined,
	);
	return { banners, trending, popular, recent };
};
