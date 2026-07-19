<script lang="ts">
let {
	color,
	initials,
	size = "md",
	src,
	alt = "",
}: {
	/** Brand hue for the tile background tint. */
	color: string;
	/** Fallback glyph when no logo asset exists. */
	initials: string;
	size?: "xs" | "sm" | "md" | "lg";
	/** Official logo SVG path (assets/distros — see ATTRIBUTION.md). */
	src?: string;
	alt?: string;
} = $props();
</script>

<span
	class="logo-tile"
	class:logo-tile--xs={size === "xs"}
	class:logo-tile--sm={size === "sm"}
	class:logo-tile--lg={size === "lg"}
	style={`--tile: ${color}`}
	aria-hidden={alt ? undefined : "true"}
>
	{#if src}
		<img class="logo-tile__img" {src} {alt} loading="lazy" />
	{:else}
		{initials}
	{/if}
</span>

<style>
	.logo-tile__img {
		inline-size: 72%;
		block-size: 72%;
		object-fit: contain;
	}
</style>
