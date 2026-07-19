<script lang="ts">
import { m } from "@linuxhub/i18n";
import DistroCard from "@linuxhub/ui/components/DistroCard.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

const PILLS = [
	{ slug: null, label: m.explore_all },
	{ slug: "desktop", label: m.cat_desktop },
	{ slug: "server", label: m.cat_server },
	{ slug: "beginners", label: m.cat_beginners },
	{ slug: "lightweight", label: m.cat_lightweight },
	{ slug: "security", label: m.cat_security },
	{ slug: "gaming", label: m.cat_gaming },
	{ slug: "diy", label: m.cat_diy },
];
</script>

<svelte:head>
	<title>{m.explore_title} — {m.site_name}</title>
</svelte:head>

<div class="container">
	<header class="page-head">
		<h1>{m.explore_title}</h1>
	</header>

	<nav class="pill-row" aria-label={m.home_categories} style="margin-block-end: var(--space-4);">
		{#each PILLS as pill (pill.slug ?? "all")}
			<a
				class="pill"
				class:pill--active={data.category === pill.slug}
				href={pill.slug ? `/explore?category=${pill.slug}` : "/explore"}
			>
				{pill.label}
			</a>
		{/each}
	</nav>

	<div class="list-toolbar">
		<span class="list-toolbar__count"><strong>{data.total}</strong> {m.explore_count}</span>
		<label class="list-toolbar__sort"
			>{m.explore_sort_by}
			<select
				class="select"
				aria-label={m.explore_sort_by}
				onchange={(e) => {
					const params = new URLSearchParams(location.search);
					params.set("sort", e.currentTarget.value);
					location.search = params.toString();
				}}
			>
				<option value="popularity" selected={data.sort === "popularity"}>{m.sort_popularity}</option>
				<option value="name" selected={data.sort === "name"}>{m.sort_name}</option>
				<option value="trending" selected={data.sort === "trending"}>{m.sort_latest}</option>
			</select>
		</label>
	</div>

	{#if data.distros.length === 0}
		<div class="state-block">
			<div class="state-block__title">{m.state_empty_catalog}</div>
			<a class="btn btn--sm" href="/explore">{m.dl_clear_filters}</a>
		</div>
	{:else}
		<div
			class="card-grid"
			style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); padding-block-end: var(--space-7);"
		>
			{#each data.distros as distro (distro.slug)}
				<DistroCard
					href={`/distro/${distro.slug}`}
					name={distro.name}
					summary={distro.summary}
					color={distro.color}
					initials={distro.initials}
				/>
			{/each}
		</div>
	{/if}
</div>
