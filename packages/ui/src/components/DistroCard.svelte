<script lang="ts">
import LogoTile from "./LogoTile.svelte";

let {
	href,
	name,
	summary,
	color,
	initials,
}: {
	href: string;
	name: string;
	summary?: string;
	color: string;
	initials: string;
} = $props();
</script>

<a class="app-card" {href}>
	<LogoTile {color} {initials} />
	<span class="app-card__body">
		<span class="app-card__name">{name}</span>
		{#if summary}<span class="app-card__summary">{summary}</span>{/if}
	</span>
</a>
