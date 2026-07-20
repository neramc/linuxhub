<script lang="ts">
import { localizeHref, m } from "@linuxhub/i18n";
import Icon from "@linuxhub/ui/components/Icon.svelte";
import { page } from "$app/state";

const notFound = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{page.status} — {m.site_name}</title>
</svelte:head>

<div class="container">
	<div class="err">
		<span class="err__code" aria-hidden="true">{page.status}</span>
		<h1>{notFound ? m.error_404_title : m.error_500_title}</h1>
		<p>{notFound ? m.error_404_body : m.error_500_body}</p>
		{#if notFound}
			<div class="search">
				<Icon name="search" />
				<input class="search__input" type="search" placeholder={m.nav_search_label} aria-label={m.nav_search_label} />
			</div>
		{/if}
		<div class="err__actions">
			{#if notFound}
				<a class="btn btn--primary" href={localizeHref("/")}>{m.error_back_home}</a>
				<a class="btn" href={localizeHref("/distro/fedora")}><Icon name="dice" size="sm" />{m.error_random}</a>
			{:else}
				<button type="button" class="btn btn--primary" onclick={() => location.reload()}>{m.error_try_again}</button>
				<a class="btn" href={localizeHref("/")}>{m.error_back_home}</a>
			{/if}
		</div>
	</div>
</div>

<style>
	.err {
		max-inline-size: 440px;
		margin-inline: auto;
		text-align: center;
		display: grid;
		gap: var(--space-4);
		justify-items: center;
		padding: var(--space-8) var(--space-4);
	}

	.err__code {
		font-size: var(--text-4xl);
		font-weight: 700;
		line-height: 1;
		color: var(--color-text-muted);
		opacity: 0.4;
		user-select: none;
	}

	.err h1 {
		font-size: var(--text-xl);
		font-weight: 700;
	}

	.err p {
		color: var(--color-text-muted);
	}

	.err .search {
		inline-size: 100%;
		max-inline-size: 340px;
	}

	.err__actions {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
		justify-content: center;
	}
</style>
