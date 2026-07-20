<script lang="ts">
import { localizeHref, m } from "@linuxhub/i18n";
import Icon from "@linuxhub/ui/components/Icon.svelte";
import LogoTile from "@linuxhub/ui/components/LogoTile.svelte";
import { goto } from "$app/navigation";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();
let diffOnly = $state(false);

const ROWS = [
	{ key: "familyLine", label: m.compare_family, fromDistro: true },
	{ key: "releaseModel", label: m.compare_release_model, fromDistro: false },
	{ key: "latest", label: m.compare_latest, fromDistro: false },
	{ key: "desktop", label: m.compare_desktop, fromDistro: false },
	{ key: "pkg", label: m.compare_pkg, fromDistro: false },
	{ key: "minMem", label: m.compare_memory, fromDistro: false },
] as const;

function valueFor(distro: (typeof data.picked)[number], row: (typeof ROWS)[number]): string {
	if (row.fromDistro) return distro.familyLine;
	return distro.specs?.[row.key as keyof typeof distro.specs] ?? "—";
}

function isDiff(row: (typeof ROWS)[number]): boolean {
	return new Set(data.picked.map((d) => valueFor(d, row))).size > 1;
}

function setSlugs(slugs: string[]) {
	void goto(localizeHref(`/compare?slugs=${slugs.join(",")}`), { noScroll: true });
}

function remove(slug: string) {
	setSlugs(data.picked.map((d) => d.slug).filter((s) => s !== slug));
}

function add(slug: string) {
	if (slug) setSlugs([...data.picked.map((d) => d.slug), slug]);
}
</script>

<svelte:head>
	<title>{m.compare_title} — {m.site_name}</title>
</svelte:head>

<div class="container" style="padding-block-end: var(--space-8);">
	<header class="page-head">
		<h1>{m.compare_title}</h1>
		<p class="lede">{m.compare_lede}</p>
	</header>

	<div class="picker-bar">
		{#each data.picked as distro (distro.slug)}
			<div class="picker-slot">
				<LogoTile color={distro.color} initials={distro.initials} size="sm" src={distro.logo} />
				<strong>{distro.name}</strong>
				<button
					type="button"
					class="icon-btn"
					aria-label={`${m.compare_remove} ${distro.name}`}
					onclick={() => remove(distro.slug)}
				>
					<Icon name="close" size="sm" />
				</button>
			</div>
		{/each}
		{#if data.picked.length < 4}
			<label class="picker-slot picker-slot--empty">
				<span class="visually-hidden">{m.compare_add}</span>
				<select
					class="select"
					style="background: none;"
					onchange={(e) => {
						add(e.currentTarget.value);
						e.currentTarget.value = "";
					}}
				>
					<option value="">{m.compare_add}</option>
					{#each data.available as option (option.slug)}
						<option value={option.slug}>{option.name}</option>
					{/each}
				</select>
			</label>
		{/if}
	</div>

	{#if data.picked.length < 2}
		<div class="state-block">
			<Icon name="info" />
			<div class="state-block__title">{m.compare_pick_two}</div>
			<p>{m.compare_pick_hint}</p>
		</div>
	{:else}
		<div class="list-toolbar">
			<button
				type="button"
				class="pill"
				aria-pressed={diffOnly}
				onclick={() => {
					diffOnly = !diffOnly;
				}}
			>
				{m.compare_diff_only}
			</button>
		</div>

		<div class="table-scroll">
			<table class="spec-table">
				<thead>
					<tr>
						<th scope="col"></th>
						{#each data.picked as distro (distro.slug)}
							<th scope="col">{distro.name}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each ROWS as row (row.key)}
						{#if !diffOnly || isDiff(row)}
							<tr>
								<th scope="row">{row.label}</th>
								{#each data.picked as distro (distro.slug)}
									<td class={isDiff(row) ? "cell--diff" : "cell--same"}>{valueFor(distro, row)}</td>
								{/each}
							</tr>
						{/if}
					{/each}
					<tr>
						<th scope="row">{m.compare_popularity}</th>
						{#each data.picked as distro (distro.slug)}
							<td class="cell--same">#{distro.rank} · {distro.downloads}</td>
						{/each}
					</tr>
				</tbody>
				<tfoot>
					<tr>
						<th scope="row"></th>
						{#each data.picked as distro (distro.slug)}
							<td>
								<a class="btn btn--primary btn--sm btn--block" href={localizeHref(`/distro/${distro.slug}#downloads`)}>
									{m.detail_download}
								</a>
							</td>
						{/each}
					</tr>
				</tfoot>
			</table>
		</div>
	{/if}
</div>

<style>
	.picker-bar {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-3);
		margin-block: var(--space-4) var(--space-5);
	}

	@media (min-width: 480px) {
		.picker-bar {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (min-width: 1024px) {
		.picker-bar {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	.picker-slot {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-block-size: 64px;
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-md);
		background: var(--color-surface);
	}

	.picker-slot strong {
		min-inline-size: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.picker-slot .icon-btn {
		margin-inline-start: auto;
		inline-size: 32px;
		block-size: 32px;
	}

	.picker-slot--empty {
		background: none;
		border: 2px dashed var(--color-border);
		justify-content: center;
	}

	.picker-slot--empty:hover {
		border-color: var(--color-accent);
	}
</style>
