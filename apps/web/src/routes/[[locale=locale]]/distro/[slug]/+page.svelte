<script lang="ts">
import { localizeHref, m } from "@linuxhub/i18n";
import DistroCard from "@linuxhub/ui/components/DistroCard.svelte";
import Icon from "@linuxhub/ui/components/Icon.svelte";
import LogoTile from "@linuxhub/ui/components/LogoTile.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

let tab: "description" | "install" | "usage" = $state("description");
let openVersion: number | null = $state(0);
let mirror = $state(0);

const activeDoc = $derived(data.content[tab]);
const docsUrl = $derived(
	data.content.description?.meta.official_links?.docs ?? data.detail.homepage,
);
// One link per hostname keeps the sources line readable.
const sourceLinks = $derived.by(() => {
	const seen = new Set<string>();
	const links: { host: string; url: string }[] = [];
	for (const url of activeDoc?.meta.sources ?? []) {
		const host = new URL(url).hostname;
		if (seen.has(host)) continue;
		seen.add(host);
		links.push({ host, url });
	}
	return links;
});
</script>

<svelte:head>
	<title>{data.distro.name} — {m.site_name}</title>
	<meta name="description" content={data.detail.summary} />
</svelte:head>

<div class="container">
	<div class="detail">
		<header class="detail-head">
			<LogoTile color={data.distro.color} initials={data.distro.initials} size="lg" src={data.distro.logo} />
			<div class="detail-head__id">
				<h1>{data.distro.name}</h1>
				<p class="detail-head__summary">{data.detail.summary}</p>
				<div class="detail-head__badges">
					<span class="badge badge--neutral">{data.detail.badges.family}</span>
					{#if data.detail.badges.active}<span class="badge badge--success">{m.badge_active}</span>{/if}
					{#if data.content.description && !data.content.description.translated}<span
							class="badge badge--warning">{m.badge_english_fallback}</span
						>{/if}
				</div>
			</div>
			<div class="detail-head__actions">
				<a class="btn btn--primary btn--lg" href="#downloads">
					<Icon name="download" />
					{m.detail_download}
				</a>
				<a class="btn btn--lg" href={data.detail.homepage} rel="external noreferrer">
					{m.detail_official_site}
					<Icon name="external" size="sm" />
				</a>
			</div>
		</header>

		<div>
			<div class="carousel" aria-label={m.detail_screenshots}>
				<div class="carousel__frame" role="img" aria-label={m.detail_screenshots}>
					{data.distro.name} · {m.detail_screenshots}
				</div>
				<div class="carousel__frame carousel__frame--peek" aria-hidden="true"></div>
			</div>
			<div class="carousel-dots" aria-hidden="true">
				<span class="is-active"></span><span></span><span></span>
			</div>
		</div>

		<div class="meta-tiles" aria-label={m.detail_at_a_glance}>
			{#each data.detail.meta as tile (tile.icon)}
				<div class="meta-tile">
					<Icon name={tile.icon} />
					<span class="meta-tile__value">{tile.value}</span>
					<span class="meta-tile__label">{"labelKey" in tile && tile.labelKey ? m[tile.labelKey as keyof typeof m] : tile.label}</span>
				</div>
			{/each}
		</div>

		<section aria-label={m.detail_documentation}>
			<div class="switcher" role="tablist" aria-label={m.detail_documentation}>
				<button type="button" class="tab" role="tab" aria-selected={tab === "description"} onclick={() => { tab = "description"; }}>
					{m.detail_description}
				</button>
				<button type="button" class="tab" role="tab" aria-selected={tab === "install"} onclick={() => { tab = "install"; }}>
					{m.detail_install}
				</button>
				<button type="button" class="tab" role="tab" aria-selected={tab === "usage"} onclick={() => { tab = "usage"; }}>
					{m.detail_usage}
				</button>
			</div>
			<article class="prose" style="padding-block-start: var(--space-4); max-inline-size: none;">
				{#if activeDoc}
					{@const Doc = activeDoc.component}
					{#if !activeDoc.translated}
						<p><span class="badge badge--warning">{m.badge_english_fallback}</span></p>
					{/if}
					<Doc />
					{#if sourceLinks.length > 0}
						<footer class="sources">
							{m.detail_sources}
							{#each sourceLinks as source, i (source.url)}
								{i > 0 ? " · " : " "}<a href={source.url} rel="external noreferrer">{source.host}</a>
							{/each}
							{#if activeDoc.meta.last_reviewed}
								· {m.detail_last_reviewed} {activeDoc.meta.last_reviewed}
							{/if}
						</footer>
					{/if}
				{:else}
					<p class="muted">{m.state_loading}…</p>
				{/if}
			</article>
		</section>

		<section id="downloads" aria-label={m.dl_title}>
			<div class="section-title" style="margin-block-start: 0;"><h2>{m.dl_title}</h2></div>

			<div class="vfilters" aria-label={m.explore_filters}>
				<select class="select" aria-label={m.dl_edition}>
					{#each data.detail.editions as edition (edition)}
						<option>{edition}</option>
					{/each}
				</select>
				<select class="select" aria-label={m.dl_architecture}>
					{#each data.detail.architectures as arch (arch)}
						<option>{arch}</option>
					{/each}
				</select>
				<select class="select" aria-label={m.dl_format}>
					{#each data.detail.formats as format (format)}
						<option>{format}</option>
					{/each}
				</select>
			</div>

			<div class="boxed" aria-label={m.dl_versions}>
				{#each data.detail.versions as version, i (version.version)}
					<div
						class="vrow"
						class:vrow--open={openVersion === i}
						style={version.channel === "eol" ? "opacity: 0.6;" : ""}
					>
						<button
							type="button"
							class="vrow__dl"
							aria-label={`${m.dl_download_version} ${version.version}`}
							style={version.channel === "beta"
								? "background: var(--color-warning);"
								: version.channel === "eol"
									? "background: var(--color-text-muted);"
									: ""}
						>
							<Icon name="download" />
						</button>
						<button
							type="button"
							class="vrow__main"
							style="background: none; border: 0; font: inherit; color: inherit; text-align: start; cursor: pointer; padding: 0;"
							aria-expanded={openVersion === i}
							onclick={() => {
								openVersion = openVersion === i ? null : i;
							}}
						>
							<span class="vrow__title"
								>{version.version}
								{#if version.channel === "release"}<span class="badge badge--success">release</span>{/if}
								{#if version.channel === "rolling"}<span class="badge badge--success">rolling</span>{/if}
								{#if version.channel === "beta"}<span class="badge badge--warning">beta</span>{/if}
								{#if version.channel === "eol"}<span class="badge badge--neutral">end of life</span>{/if}
								{#if i === 0}<span class="badge">{m.badge_latest}</span>{/if}
							</span>
							<span class="vrow__meta">
								<span>{version.line}</span>
								<span>{version.note}</span>
							</span>
						</button>
						<div class="vrow__stats">
							<span>{version.date}</span>
							{#if version.size}<span>{version.size}</span>{/if}
							{#if version.downloads}<span>{version.downloads}</span>{/if}
						</div>
					</div>
					{#if openVersion === i}
						<div class="vfiles">
							<span class="vfiles__title">{m.dl_mirror_nearest}</span>
							{#each data.detail.mirrors as mirrorRow, j (mirrorRow.name)}
								<button
									type="button"
									class="vfile"
									aria-pressed={mirror === j}
									disabled={!mirrorRow.healthy}
									style={mirrorRow.healthy ? "" : "opacity: 0.5; cursor: not-allowed;"}
									onclick={() => {
										mirror = j;
									}}
								>
									<span class="health-dot" class:health-dot--down={!mirrorRow.healthy} aria-hidden="true"></span>
									{#if mirrorRow.flag}<span class="mirror-flag">{mirrorRow.flag}</span>{/if}
									<strong>{mirrorRow.name}</strong>
									<span class="muted">{mirrorRow.note}</span>
									{#if mirrorRow.auto}<span class="size"><span class="badge">{m.dl_recommended}</span></span>{/if}
								</button>
							{/each}
							<div class="checksum" style="background: var(--color-bg);">
								<div class="checksum__row">
									<Icon name="check" size="sm" />
									<span class="muted" style="font-size: var(--text-sm);">{m.dl_verify_note}</span>
									<a
										class="btn btn--sm"
										style="margin-inline-start: auto; flex-shrink: 0;"
										href={data.detail.homepage}
										rel="external noreferrer"
									>
										{m.dl_how_to_verify}
										<Icon name="external" size="sm" />
									</a>
								</div>
							</div>
						</div>
					{/if}
				{/each}
			</div>
			<p class="muted" style="font-size: var(--text-xs); margin-block-start: var(--space-3);">
				{m.dl_selection_note}
			</p>
			<p class="muted" style="font-size: var(--text-xs); margin-block-start: var(--space-1);">
				{m.detail_data_note} {data.detail.fetchedAt.slice(0, 10)}
			</p>
		</section>

		<section aria-label={m.detail_requirements}>
			<div class="section-title" style="margin-block-start: 0;"><h2>{m.detail_requirements}</h2></div>
			<div class="table-scroll">
				<table class="spec-table">
					<thead>
						<tr><th scope="col"></th><th scope="col">{m.detail_minimum}</th><th scope="col">{m.detail_recommended}</th></tr>
					</thead>
					<tbody>
						{#each data.detail.requirements as req (req.row)}
							<tr><th scope="row">{req.row}</th><td>{req.min}</td><td>{req.rec}</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<section aria-label={m.detail_links}>
			<div class="section-title" style="margin-block-start: 0;"><h2>{m.detail_links}</h2></div>
			<div class="boxed">
				<a class="row" href={data.detail.homepage} rel="external noreferrer">
					<span class="row__body"><span class="row__title">{m.detail_official_site}</span></span>
					<Icon name="external" size="sm" />
				</a>
				<a class="row" href={docsUrl} rel="external noreferrer">
					<span class="row__body"><span class="row__title">{m.detail_documentation}</span></span>
					<Icon name="external" size="sm" />
				</a>
				<a class="row" href={localizeHref("/contribute")}>
					<span class="row__body"><span class="row__title">{m.detail_report_page}</span></span>
					<Icon name="chevron-end" size="sm" flip />
				</a>
			</div>
		</section>

		{#if data.detail.related.length > 0}
			<section aria-label={m.detail_similar}>
				<div class="section-title" style="margin-block-start: 0;">
					<h2>{m.detail_similar}</h2>
					<a href={localizeHref("/explore")}>{m.home_see_more}</a>
				</div>
				<div class="card-grid">
					{#each data.detail.related as rel (rel.slug)}
						<DistroCard
							href={localizeHref(`/distro/${rel.slug}`)}
							name={rel.name}
							summary={rel.summary}
							color={rel.color}
							initials={rel.initials}
							logo={rel.logo}
						/>
					{/each}
				</div>
			</section>
		{/if}
	</div>
</div>

<style>
	.detail {
		max-inline-size: 940px;
		margin-inline: auto;
		display: grid;
		gap: var(--space-6);
		padding-block: var(--space-6) var(--space-7);
	}

	.detail > :global(*) {
		min-inline-size: 0;
	}

	.detail-head {
		display: flex;
		align-items: center;
		gap: var(--space-5);
		flex-wrap: wrap;
	}

	.detail-head__id {
		display: grid;
		gap: var(--space-1);
		min-inline-size: 0;
	}

	.detail-head h1 {
		font-size: var(--text-3xl);
		font-weight: 700;
		line-height: var(--leading-3xl);
		letter-spacing: -0.01em;
	}

	.detail-head__summary {
		color: var(--color-text-muted);
	}

	.detail-head__badges {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-block-start: var(--space-1);
	}

	.detail-head__actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-inline-start: auto;
		flex-wrap: wrap;
	}

	@media (max-width: 639px) {
		.detail-head__actions {
			inline-size: 100%;
			margin-inline-start: 0;
		}

		.detail-head__actions :global(.btn--primary) {
			flex: 1;
		}
	}
</style>
