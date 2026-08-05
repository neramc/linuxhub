<script lang="ts">
// The download selector, implementing design/screens/download-selector.html
// (approved 2026-07-20, ADR-0017/0018) against the real endpoints: #14 for the
// decision tree, #15 to resolve a selection to a mirror URL, #21 to count the
// click.
//
// Nothing here composes a fact. Versions, editions, architectures, formats,
// mirrors, sizes and checksums all come from D1 by way of the BFF; this file
// only decides which of them is on screen and turns them into localized text.

import { m } from "@linuxhub/i18n";
import type {
	ApiResponse,
	ArtifactFormat,
	DownloadOptions,
	DownloadResolution,
} from "@linuxhub/shared";
import { flagEmoji } from "@linuxhub/ui";
import Icon from "@linuxhub/ui/components/Icon.svelte";
import { formatBytes, formatDate, releaseChannelLabel } from "$lib/format";

type Edition = DownloadOptions["versions"][number]["editions"][number];

let { slug, options }: { slug: string; options: DownloadOptions } = $props();

type Status = "idle" | "loading" | "ready" | "empty" | "error";

// Read once, to seed the selection. The page keys this component on the slug,
// so a different distro is a different instance rather than a stale one.
// svelte-ignore state_referenced_locally
const first = options.versions[0];
const firstEdition = first?.editions[0];

let openVersion = $state<string | null>(first?.version ?? null);
let edition = $state(firstEdition?.name ?? "");
let arch = $state(firstEdition?.archs[0] ?? "");
let format = $state<ArtifactFormat>(firstEdition?.formats[0] ?? "iso");
/** null = let the server choose; see `mirror_choice` on the response. */
let mirrorId = $state<number | null>(null);
let status = $state<Status>("idle");
let resolution = $state<DownloadResolution | null>(null);
let copied = $state(false);
/** Bumped by Retry. Part of the resolve key, so asking again for an unchanged
 *  selection is a new request rather than a no-op. */
let attempt = $state(0);

const openRow = $derived(options.versions.find((v) => v.version === openVersion) ?? null);
const editions = $derived(openRow?.editions ?? []);
const current = $derived(editions.find((e) => e.name === edition) ?? editions[0] ?? null);
const archs = $derived(current?.archs ?? []);
const formats = $derived(current?.formats ?? []);

/** A stable description of everything a resolution depends on, so the request
 *  fires when the selection changes and never because something else did. */
const selectionKey = $derived(
	openVersion === null || !current
		? ""
		: [openVersion, current.name, arch, format, mirrorId, attempt].join("|"),
);

function selectVersion(version: string) {
	if (openVersion === version) {
		openVersion = null;
		return;
	}
	openVersion = version;
	// A version may not offer the edition the previous one did; keep the
	// selection when it survives and fall back to the first that exists.
	const next = options.versions.find((v) => v.version === version);
	const keep = next?.editions.find((e) => e.name === edition) ?? next?.editions[0];
	if (keep) applyEdition(keep);
}

function applyEdition(next: Edition) {
	edition = next.name;
	if (!next.archs.includes(arch)) arch = next.archs[0] ?? "";
	if (!next.formats.includes(format)) format = next.formats[0] ?? "iso";
}

function onEditionChange(name: string) {
	const next = editions.find((e) => e.name === name);
	if (next) applyEdition(next);
}

function clearFilters() {
	const next = openRow?.editions[0];
	if (next) applyEdition(next);
	mirrorId = null;
}

async function resolve(
	version: string,
	editionName: string,
	archName: string,
	formatName: string,
	mirror: number | null,
): Promise<DownloadResolution | null> {
	const response = await fetch("/api/v1/downloads/resolve", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			slug,
			version,
			edition: editionName,
			arch: archName,
			format: formatName,
			mirror_id: mirror ?? undefined,
		}),
	});
	const body = (await response.json()) as ApiResponse<DownloadResolution>;
	if (body.ok) return body.data;
	// A 404 means this combination has no file, which is a legitimate answer
	// about the catalog; anything else is a failure of ours to report as one.
	if (body.error.code === "NOT_FOUND") return null;
	throw new Error(body.error.code);
}

$effect(() => {
	const key = selectionKey;
	if (!key || !openRow || !current || !arch) {
		status = "idle";
		resolution = null;
		return;
	}

	let cancelled = false;
	status = "loading";
	copied = false;

	resolve(openRow.version, current.name, arch, format, mirrorId)
		.then((result) => {
			if (cancelled) return;
			resolution = result;
			status = result ? "ready" : "empty";
		})
		.catch(() => {
			if (cancelled) return;
			resolution = null;
			status = "error";
		});

	// A slower earlier request must never overwrite a newer selection.
	return () => {
		cancelled = true;
	};
});

/** Counts the click. Deliberately unawaited and failure-swallowing: a
 *  measurement must never delay or break the download it is measuring. */
function track(result: DownloadResolution) {
	void fetch("/api/v1/downloads/track", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ artifact_id: result.artifact_id, mirror_id: result.mirror?.id }),
		keepalive: true,
	}).catch(() => {});
}

function start(result: DownloadResolution) {
	track(result);
	window.location.href = result.url;
}

async function download(version: string) {
	if (version === openVersion && resolution) {
		start(resolution);
		return;
	}

	// A collapsed row still downloads (approved comp: "clicking the round
	// button downloads with the current filters"), so resolve for that version
	// against the nearest equivalent selection it offers.
	const row = options.versions.find((v) => v.version === version);
	const target = row?.editions.find((e) => e.name === edition) ?? row?.editions[0];
	if (!row || !target) return;

	try {
		const result = await resolve(
			row.version,
			target.name,
			target.archs.includes(arch) ? arch : (target.archs[0] ?? ""),
			target.formats.includes(format) ? format : (target.formats[0] ?? "iso"),
			mirrorId,
		);
		if (result) start(result);
		else {
			openVersion = version;
			status = "empty";
		}
	} catch {
		openVersion = version;
		status = "error";
	}
}

async function copyChecksum() {
	if (!resolution?.sha256) return;
	try {
		await navigator.clipboard.writeText(resolution.sha256);
		copied = true;
	} catch {
		// Clipboard access can be denied; the hash is selectable either way.
	}
}

function protocolOf(url: string): string {
	try {
		return new URL(url).protocol.replace(":", "");
	} catch {
		return "";
	}
}

function badgeClass(channel: string): string {
	if (channel === "beta") return "badge badge--warning";
	if (channel === "rolling") return "badge badge--success";
	return "badge badge--success";
}
</script>

<div class="vfilters" aria-label={m.dl_title}>
	<select
		class="select"
		aria-label={m.dl_edition}
		value={current?.name ?? ""}
		onchange={(event) => onEditionChange(event.currentTarget.value)}
	>
		{#each editions as option (option.name)}
			<option value={option.name}>{option.name}</option>
		{/each}
	</select>
	<select class="select" aria-label={m.dl_architecture} bind:value={arch}>
		{#each archs as option (option)}
			<option value={option}>{option}</option>
		{/each}
	</select>
	<select class="select" aria-label={m.dl_format} bind:value={format}>
		{#each formats as option (option)}
			<option value={option}>{option}</option>
		{/each}
	</select>
	<button type="button" class="pill" onclick={clearFilters}>
		<Icon name="close" size="sm" />
		{m.dl_clear_filters}
	</button>
</div>

<div class="boxed" aria-label={m.dl_versions}>
	{#each options.versions as version, i (version.version)}
		<div class="vrow" class:vrow--open={openVersion === version.version}>
			<button
				type="button"
				class="vrow__dl"
				aria-label={`${m.dl_download_version} ${version.version}`}
				style={version.channel === "beta" ? "background: var(--color-warning);" : ""}
				onclick={() => download(version.version)}
			>
				<Icon name="download" />
			</button>
			<button
				type="button"
				class="vrow__main vrow__main--button"
				aria-expanded={openVersion === version.version}
				onclick={() => selectVersion(version.version)}
			>
				<span class="vrow__title"
					>{version.version}
					<span class={badgeClass(version.channel)}
						>{releaseChannelLabel({ channel: version.channel, lts: version.lts })}</span
					>
					{#if i === 0}<span class="badge">{m.badge_latest}</span>{/if}
				</span>
				{#if openVersion === version.version && current}
					<span class="vrow__meta">
						<span>{[current.name, arch, format].filter(Boolean).join(" · ")}</span>
					</span>
				{/if}
			</button>
			<div class="vrow__stats">
				<span>{formatDate(version.released_at)}</span>
				{#if openVersion === version.version && resolution?.size}
					<span>{formatBytes(resolution.size)}</span>
				{/if}
			</div>
		</div>

		{#if openVersion === version.version}
			<div class="vfiles">
				{#if status === "loading"}
					<div aria-busy="true" aria-label={m.dl_resolving}>
						<div class="skeleton" style="block-size: 40px; border-radius: var(--radius-sm);"></div>
						<div
							class="skeleton"
							style="block-size: 40px; border-radius: var(--radius-sm); margin-block-start: var(--space-2);"
						></div>
					</div>
				{:else if status === "empty"}
					<div class="state-block">
						<Icon name="inbox" />
						<div class="state-block__title">{m.dl_no_files_title}</div>
						<p>{m.dl_no_files_hint}</p>
						<button type="button" class="btn btn--sm" onclick={clearFilters}>
							{m.dl_clear_filters}
						</button>
					</div>
				{:else if status === "error"}
					<div class="state-block state-block--error">
						<Icon name="alert" />
						<div class="state-block__title">{m.dl_resolve_failed}</div>
						<div style="display: flex; gap: var(--space-2);">
							<button
								type="button"
								class="btn btn--sm"
								onclick={() => {
									attempt += 1;
								}}
							>
								{m.dl_retry}
							</button>
							{#if options.mirrors.length > 1}
								<button
									type="button"
									class="btn btn--sm"
									onclick={() => {
										const other = options.mirrors.find((mirror) => mirror.id !== mirrorId);
										mirrorId = other?.id ?? null;
									}}
								>
									{m.dl_another_mirror}
								</button>
							{/if}
						</div>
					</div>
				{:else if resolution}
					<span class="vfiles__title">{m.dl_mirrors}</span>
					<button
						type="button"
						class="vfile"
						aria-pressed={mirrorId === null}
						onclick={() => {
							mirrorId = null;
						}}
					>
						<span class="health-dot" aria-hidden="true"></span>
						<strong>{m.dl_auto_mirror}</strong>
						{#if resolution.mirror && mirrorId === null}
							<span class="muted">{resolution.mirror.name}</span>
						{/if}
						<span class="size"><span class="badge">{m.dl_recommended}</span></span>
					</button>
					{#each options.mirrors as mirror (mirror.id)}
						<button
							type="button"
							class="vfile"
							aria-pressed={mirrorId === mirror.id}
							onclick={() => {
								mirrorId = mirror.id;
							}}
						>
							<span class="health-dot" aria-hidden="true"></span>
							{#if mirror.country}<span class="mirror-flag">{flagEmoji(mirror.country)}</span>{/if}
							<strong>{mirror.name}</strong>
							<span class="size">{protocolOf(mirror.base_url)}</span>
						</button>
					{/each}

					{#if resolution.sha256}
						<div class="checksum" style="background: var(--color-bg);">
							<div class="checksum__row">
								<strong style="font-size: var(--text-sm);">SHA-256</strong>
								<button
									type="button"
									class="btn btn--sm"
									style="margin-inline-start: auto;"
									onclick={copyChecksum}
								>
									<Icon name={copied ? "check" : "copy"} size="sm" />
									{copied ? m.dl_copied : m.dl_copy}
								</button>
							</div>
							<code class="checksum__hash">{resolution.sha256}</code>
						</div>
					{/if}

					<div class="vfiles__links">
						{#if resolution.sig_url}
							<a href={resolution.sig_url} rel="external noreferrer">{m.dl_signature}</a>
						{/if}
						{#if current?.formats.includes("torrent") && format !== "torrent"}
							<button
								type="button"
								class="linklike"
								onclick={() => {
									format = "torrent";
								}}>{m.dl_torrent}</button
							>
						{/if}
						{#if current?.formats.includes("magnet") && format !== "magnet"}
							<button
								type="button"
								class="linklike"
								onclick={() => {
									format = "magnet";
								}}>{m.dl_magnet}</button
							>
						{/if}
					</div>

					<div class="checksum__row">
						<Icon name="check" size="sm" />
						<span class="muted" style="font-size: var(--text-sm);">{m.dl_verify_note}</span>
					</div>
				{/if}
			</div>
		{/if}
	{/each}
</div>

<style>
	/* The comp renders these as links; they are buttons here because they
	   change the selection rather than navigate. Styling them as links keeps
	   the approved appearance without inventing a control. */
	.vfiles__links {
		display: flex;
		gap: var(--space-4);
		font-size: var(--text-sm);
		flex-wrap: wrap;
	}
	.linklike {
		background: none;
		border: 0;
		padding: 0;
		font: inherit;
		color: var(--color-accent);
		text-decoration: underline;
		cursor: pointer;
	}
	.vrow__main--button {
		background: none;
		border: 0;
		font: inherit;
		color: inherit;
		text-align: start;
		cursor: pointer;
		padding: 0;
	}
</style>
