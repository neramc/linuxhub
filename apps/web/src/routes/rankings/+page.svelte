<script lang="ts">
import { m } from "@linuxhub/i18n";
import LogoTile from "@linuxhub/ui/components/LogoTile.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();
let period = $state("month");
let view = $state("top");

const PERIODS = [
	{ id: "week", label: m.rankings_week },
	{ id: "month", label: m.rankings_month },
	{ id: "year", label: m.rankings_year },
	{ id: "all", label: m.rankings_all_time },
];
const VIEWS = [
	{ id: "top", label: m.rankings_top },
	{ id: "trending", label: m.rankings_trending },
	{ id: "rising", label: m.rankings_rising },
];

const entries = $derived(
	view === "top" ? data.entries : [...data.entries].sort((a, b) => b.trend - a.trend),
);
</script>

<svelte:head>
	<title>{m.rankings_title} — {m.site_name}</title>
</svelte:head>

<div class="container">
	<div class="rank-page">
		<header class="page-head">
			<h1>{m.rankings_title}</h1>
			<p class="lede">{m.rankings_lede} <a href="/about#rankings">{m.rankings_how}</a></p>
		</header>

		<div class="rank-controls">
			<div class="switcher" role="tablist" aria-label={m.rankings_period}>
				{#each PERIODS as p (p.id)}
					<button type="button" class="tab" role="tab" aria-selected={period === p.id} onclick={() => { period = p.id; }}>
						{p.label}
					</button>
				{/each}
			</div>
			<span style="flex: 1;"></span>
			<div class="switcher" role="tablist" aria-label={m.rankings_view}>
				{#each VIEWS as v (v.id)}
					<button type="button" class="tab" role="tab" aria-selected={view === v.id} onclick={() => { view = v.id; }}>
						{v.label}
					</button>
				{/each}
			</div>
		</div>

		<ol class="boxed" style="list-style: none; margin: 0; padding: 0;">
			{#each entries as entry, i (entry.slug)}
				<li>
					<a class="row" class:row--top={i < 3} href={`/distro/${entry.slug}`}>
						<span class="rank-num">{i + 1}</span>
						<LogoTile color={entry.color} initials={entry.initials} size="sm" />
						<span class="row__body">
							<span class="row__title">{entry.name}</span>
							<span class="row__subtitle">{entry.familyLine}</span>
						</span>
						<span class="row__end">
							<svg class="sparkline" viewBox="0 0 88 24" aria-hidden="true"><polyline points={entry.spark} /></svg>
							{#if entry.trend > 0}<span class="trend trend--up">▲{entry.trend}</span>
							{:else if entry.trend < 0}<span class="trend trend--down">▼{-entry.trend}</span>
							{:else}<span class="trend trend--flat">—</span>{/if}
						</span>
					</a>
				</li>
			{/each}
		</ol>

		<div class="section-title"><h2>{m.rankings_movers}</h2><a href="/hall-of-fame">{m.nav_hall_of_fame}</a></div>
		<div class="boxed" style="margin-block-end: var(--space-7);">
			{#each data.movers as entry (entry.slug)}
				<a class="row" href={`/distro/${entry.slug}`}>
					<LogoTile color={entry.color} initials={entry.initials} size="sm" />
					<span class="row__body"><span class="row__title">{entry.name}</span></span>
					<span class="row__end">
						{#if entry.trend > 0}<span class="trend trend--up">▲{entry.trend}</span>
						{:else}<span class="trend trend--down">▼{-entry.trend}</span>{/if}
					</span>
				</a>
			{/each}
		</div>
	</div>
</div>

<style>
	.rank-page {
		max-inline-size: 840px;
		margin-inline: auto;
	}

	.rank-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		margin-block-end: var(--space-4);
	}
</style>
