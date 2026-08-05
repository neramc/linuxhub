import type { ApiResponse, DownloadOptions } from "@linuxhub/shared";
import { error } from "@sveltejs/kit";
import type { DetailPayload, Distro } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ fetch, params }) => {
	// Both in flight together: the download matrix is a second round trip, and
	// serializing it would add its latency to every distro page.
	const [detailRes, optionsRes] = await Promise.all([
		fetch(`/api/v1/distros/${params.slug}`),
		fetch(`/api/v1/distros/${params.slug}/download-options`),
	]);

	const body = (await detailRes.json()) as ApiResponse<{ distro: Distro; detail: DetailPayload }>;
	if (!body.ok) {
		error(404, "distro not found");
	}

	// Downloads are additive: a distro whose artifacts are not sourced yet still
	// has a page, so a failure here costs the selector, never the page.
	const options = (await optionsRes
		.json()
		.catch(() => null)) as ApiResponse<DownloadOptions> | null;
	const downloads: DownloadOptions =
		options?.ok === true ? options.data : { slug: params.slug, versions: [], mirrors: [] };

	return { ...body.data, downloads };
};
