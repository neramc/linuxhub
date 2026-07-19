<script lang="ts">
import { m } from "@linuxhub/i18n";
import Icon from "@linuxhub/ui/components/Icon.svelte";
import LogoTile from "@linuxhub/ui/components/LogoTile.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

// Split text on the query so matches render bold (design: search comp).
function highlight(text: string, q: string): Array<{ part: string; hit: boolean }> {
	if (!q) return [{ part: text, hit: false }];
	const lower = text.toLowerCase();
	const needle = q.toLowerCase();
	const out: Array<{ part: string; hit: boolean }> = [];
	let i = 0;
	while (true) {
		const at = lower.indexOf(needle, i);
		if (at === -1) {
			out.push({ part: text.slice(i), hit: false });
			break;
		}
		if (at > i) out.push({ part: text.slice(i, at), hit: false });
		out.push({ part: text.slice(at, at + needle.length), hit: true });
		i = at + needle.length;
	}
	return out.filter((s) => s.part !== "");
}
</script>

<svelte:head>
	<title>{data.q} — {m.site_name}</title>
</svelte:head>

<div class="container">
	<div class="search-page">
		<header class="page-head">
			<h1><span class="muted">{data.total} {m.search_results_for}</span> “{data.q}”</h1>
		</header>

		<form action="/search" method="get" class="search" style="margin-block-end: var(--space-5);">
			<Icon name="search" />
			<input
				class="search__input"
				type="search"
				name="q"
				value={data.q}
				aria-label={m.nav_search_label}
				style="min-block-size: 48px;"
			/>
		</form>

		{#if data.results.length === 0}
			<div class="state-block" style="margin-block-end: var(--space-8);">
				<Icon name="search" />
				<div class="state-block__title">{m.search_no_matches} “{data.q}”</div>
				<p>{m.search_try}</p>
				<div style="display: flex; gap: var(--space-2);">
					<a class="btn btn--sm" href="/explore">{m.nav_explore}</a>
					<a class="btn btn--sm" href="/contribute">{m.search_suggest}</a>
				</div>
			</div>
		{:else}
			<div class="boxed" style="margin-block-end: var(--space-8);">
				{#each data.results as distro (distro.slug)}
					<a class="row" href={`/distro/${distro.slug}`}>
						<LogoTile color={distro.color} initials={distro.initials} size="sm" />
						<span class="row__body">
							<span class="row__title">
								{#each highlight(distro.name, data.q) as seg, i (i)}{#if seg.hit}<strong>{seg.part}</strong>{:else}{seg.part}{/if}{/each}
							</span>
							<span class="row__subtitle">
								{#each highlight(distro.summary, data.q) as seg, i (i)}{#if seg.hit}<strong>{seg.part}</strong>{:else}{seg.part}{/if}{/each}
							</span>
						</span>
						<span class="row__end">{distro.downloads}</span>
					</a>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.search-page {
		max-inline-size: 840px;
		margin-inline: auto;
	}
</style>
