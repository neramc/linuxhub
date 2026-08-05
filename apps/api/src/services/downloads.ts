// Download options and resolution (.ai/architecture.md § "Data flow — download
// resolution").

import type {
	ArtifactFormat,
	DownloadOptions,
	DownloadResolution,
	ReleaseChannel,
	ResolveRequest,
} from "@linuxhub/shared";
import { releaseChannel } from "@linuxhub/shared";
import { isAbsoluteRef } from "../db/artifacts";
import * as db from "../db/downloads";
import type { Env } from "../env";
import { cached, generation, hashQuery, TTL } from "../lib/cache";
import { notFound } from "../lib/errors";

/** Joins a mirror base and a mirror-relative path without doubling or losing
 *  the separator between them. */
export function joinMirror(baseUrl: string, path: string): string {
	return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

/** Flattens the option rows into the nested tree the selector walks. */
export function buildOptions(slug: string, rows: db.OptionRow[], mirrors: db.MirrorChoice[]) {
	const versions: DownloadOptions["versions"] = [];

	for (const row of rows) {
		let version = versions.find((v) => v.version === row.version);
		if (!version) {
			version = {
				version: row.version,
				channel: releaseChannel.catch("stable" as ReleaseChannel).parse(row.channel),
				lts: row.lts === 1,
				released_at: row.released_at,
				editions: [],
			};
			versions.push(version);
		}

		let edition = version.editions.find((e) => e.name === row.edition);
		if (!edition) {
			edition = {
				name: row.edition,
				desktop: row.desktop,
				kind:
					(row.kind as DownloadOptions["versions"][number]["editions"][number]["kind"]) ?? "other",
				archs: [],
				formats: [],
			};
			version.editions.push(edition);
		}

		if (!edition.archs.includes(row.arch)) edition.archs.push(row.arch);
		const format = row.format as ArtifactFormat;
		if (!edition.formats.includes(format)) edition.formats.push(format);
	}

	return { slug, versions, mirrors } satisfies DownloadOptions;
}

export async function downloadOptions(env: Env, slug: string): Promise<DownloadOptions> {
	const gen = await generation(env.KV_CACHE, slug);
	return cached(env.KV_CACHE, `cache:dlopts:${slug}:${gen}`, TTL.detail, async () => {
		const [rows, mirrors] = await Promise.all([
			db.downloadOptionRows(env.DB, slug),
			db.listDownloadMirrors(env.DB, slug),
		]);
		// An empty option tree is a real answer for a distro whose artifacts are
		// not sourced yet, but a slug that does not exist is not.
		if (rows.length === 0 && mirrors.length === 0) throw notFound("distro");
		return buildOptions(slug, rows, mirrors);
	});
}

export async function resolveDownload(
	env: Env,
	request: ResolveRequest,
): Promise<DownloadResolution> {
	const key = `dl:${hashQuery({ ...request })}`;
	return cached(env.KV_CACHE, key, TTL.detail, async () => {
		const artifact = await db.findArtifact(
			env.DB,
			request.slug,
			request.version,
			request.edition,
			request.arch,
			request.format,
		);
		if (!artifact) throw notFound("artifact");

		// A torrent page or a magnet URI is already a complete reference and no
		// mirror serves it — handing one a mirror would corrupt it.
		if (isAbsoluteRef(artifact.path)) {
			return {
				url: artifact.path,
				artifact_id: artifact.artifact_id,
				size: artifact.size,
				sha256: artifact.sha256,
				sig_url: artifact.sig_url,
				mirror: null,
				mirror_choice: "origin" as const,
			};
		}

		const { mirror, choice } = await db.chooseMirror(
			env.DB,
			artifact.artifact_id,
			request.mirror_id,
			request.country,
		);
		if (!mirror) throw notFound("mirror for artifact");

		return {
			url: joinMirror(mirror.base_url, artifact.path),
			artifact_id: artifact.artifact_id,
			size: artifact.size,
			sha256: artifact.sha256,
			sig_url: artifact.sig_url,
			mirror,
			mirror_choice: choice,
		};
	});
}

export async function trackDownload(
	env: Env,
	artifactId: number,
	mirrorId: number | undefined,
	now = new Date(),
): Promise<void> {
	await db.trackDownload(env.KV_RATE, artifactId, mirrorId, now.toISOString().slice(0, 10));
}
