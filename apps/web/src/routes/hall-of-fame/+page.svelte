<script lang="ts">
import { m } from "@linuxhub/i18n";
import LogoTile from "@linuxhub/ui/components/LogoTile.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{m.hof_title} — {m.site_name}</title>
</svelte:head>

<div class="container">
	<div class="hof">
		<header class="page-head">
			<h1>{m.hof_title}</h1>
			<p class="lede">{m.hof_lede} {m.hof_now} <a href="/rankings">{m.nav_rankings}</a>.</p>
		</header>

		<div class="hof-grid">
			{#each data.entries as entry (entry.name)}
				<article class="boxed hof-card">
					<div class="hof-card__head">
						<LogoTile color={entry.color} initials={entry.initials} />
						<div>
							<h2 class="hof-card__name">{entry.name}</h2>
							<div class="hof-card__era">{entry.era}</div>
						</div>
						{#if entry.discontinued}
							<span class="badge badge--danger" style="margin-inline-start: auto;">{m.hof_discontinued}</span>
						{/if}
					</div>
					<p>{entry.why}</p>
					<p class="hof-card__cite">{m.hof_sources}: {entry.sources}</p>
				</article>
			{/each}
		</div>
	</div>
</div>

<style>
	.hof {
		max-inline-size: 840px;
		margin-inline: auto;
		padding-block-end: var(--space-8);
	}

	.hof-grid {
		display: grid;
		gap: var(--space-3);
	}

	@media (min-width: 1024px) {
		.hof-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	.hof-card {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-5);
		align-content: start;
	}

	.hof-card__head {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}

	.hof-card__name {
		font-size: var(--text-xl);
		font-weight: 700;
	}

	.hof-card__era {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
	}

	.hof-card__cite {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}
</style>
