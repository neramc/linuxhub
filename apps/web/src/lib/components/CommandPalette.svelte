<script lang="ts">
import { m } from "@linuxhub/i18n";
import type { ApiSuccess } from "@linuxhub/shared";
import Icon from "@linuxhub/ui/components/Icon.svelte";
import LogoTile from "@linuxhub/ui/components/LogoTile.svelte";
import { goto } from "$app/navigation";
import type { Distro } from "$lib/server/data";
import { ui } from "$lib/state/ui.svelte";

let query = $state("");
let selected = $state(0);
let all: Distro[] = $state([]);
let input: HTMLInputElement | undefined = $state();

const results = $derived(
	query.trim()
		? all.filter((d) => d.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6)
		: all.slice(0, 6),
);

async function ensureData() {
	if (all.length > 0) return;
	const res = await fetch("/api/v1/distros");
	all = ((await res.json()) as ApiSuccess<Distro[]>).data;
}

$effect(() => {
	if (ui.paletteOpen) {
		query = "";
		selected = 0;
		void ensureData();
		setTimeout(() => input?.focus(), 0);
	}
});

function close() {
	ui.paletteOpen = false;
}

function pick(index: number) {
	const distro = results[index];
	if (distro) {
		close();
		void goto(`/distro/${distro.slug}`);
	} else if (query.trim()) {
		close();
		void goto(`/search?q=${encodeURIComponent(query.trim())}`);
	}
}

function onkeydown(e: KeyboardEvent) {
	if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
		e.preventDefault();
		ui.paletteOpen = true;
		return;
	}
	if (!ui.paletteOpen) return;
	if (e.key === "Escape") close();
	else if (e.key === "ArrowDown") {
		e.preventDefault();
		selected = Math.min(selected + 1, results.length);
	} else if (e.key === "ArrowUp") {
		e.preventDefault();
		selected = Math.max(selected - 1, 0);
	} else if (e.key === "Enter") {
		e.preventDefault();
		pick(selected);
	}
}
</script>

<svelte:window {onkeydown} />

{#if ui.paletteOpen}
	<div class="palette-scrim" onclick={close} aria-hidden="true"></div>
	<div class="palette" role="dialog" aria-modal="true" aria-label={m.nav_search_label}>
		<div class="palette__input">
			<Icon name="search" />
			<input
				bind:this={input}
				bind:value={query}
				oninput={() => {
					selected = 0;
				}}
				type="search"
				aria-label={m.nav_search_label}
				placeholder={m.nav_search_label}
			/>
			<span class="kbd">esc</span>
		</div>
		<div class="palette__list" role="listbox" aria-label={m.nav_search_label}>
			{#each results as distro, i (distro.slug)}
				<button
					type="button"
					class="palette__item"
					role="option"
					aria-selected={selected === i}
					onclick={() => pick(i)}
					onmouseenter={() => {
						selected = i;
					}}
				>
					<LogoTile color={distro.color} initials={distro.initials} size="xs" src={distro.logo} />
					<span>{distro.name}</span>
					<span class="code">{distro.familyLine}</span>
				</button>
			{/each}
			{#if query.trim()}
				<button
					type="button"
					class="palette__item"
					role="option"
					aria-selected={selected === results.length}
					onclick={() => pick(results.length)}
				>
					<Icon name="search" size="sm" />
					<span>“{query.trim()}”</span>
				</button>
			{/if}
		</div>
		<div class="palette__foot">
			<span>{m.palette_hint_nav}</span><span>{m.palette_hint_open}</span><span>{m.palette_hint_close}</span>
		</div>
	</div>
{/if}

<style>
	.palette-scrim {
		position: fixed;
		inset: 0;
		z-index: 70;
		background: rgb(0 0 0 / 0.4);
	}

	.palette {
		position: fixed;
		inset-block-start: 12vh;
		inset-inline-start: 50%;
		transform: translateX(-50%);
		z-index: 71;
		inline-size: min(560px, calc(100vw - var(--space-6)));
		background: var(--color-surface-raised);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-dialog);
		overflow: hidden;
	}

	.palette__input {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-5);
		border-block-end: 1px solid var(--color-border);
	}

	.palette__input input {
		flex: 1;
		border: 0;
		background: none;
		color: var(--color-text);
		font: inherit;
		font-size: var(--text-lg);
		outline: none;
		min-inline-size: 0;
	}

	.palette__list {
		padding: var(--space-2);
		display: grid;
		gap: 2px;
		max-block-size: 50vh;
		overflow-y: auto;
	}

	.palette__item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--color-text);
		font: inherit;
		font-size: var(--text-sm);
		text-align: start;
		cursor: pointer;
	}

	.palette__item[aria-selected="true"] {
		background: var(--color-accent-soft);
	}

	.palette__item .code {
		margin-inline-start: auto;
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}

	.palette__foot {
		display: flex;
		gap: var(--space-4);
		padding: var(--space-2) var(--space-4);
		border-block-start: 1px solid var(--color-border);
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}
</style>
