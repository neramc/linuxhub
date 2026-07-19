<script lang="ts">
let {
	color,
	initials,
	size = "md",
}: {
	/** Brand hue for the placeholder tile (production: official SVG logo). */
	color: string;
	initials: string;
	size?: "xs" | "sm" | "md" | "lg";
} = $props();
</script>

<span
	class="logo-tile"
	class:logo-tile--xs={size === "xs"}
	class:logo-tile--sm={size === "sm"}
	class:logo-tile--lg={size === "lg"}
	style={`--tile: ${color}`}
	aria-hidden="true"
>
	{initials}
</span>
