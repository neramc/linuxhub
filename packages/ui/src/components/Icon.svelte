<script lang="ts">
let {
	name,
	size = "md",
	flip = false,
	label,
}: {
	/** Sprite symbol id without the `i-` prefix, e.g. "search". */
	name: string;
	size?: "sm" | "md";
	/** Mirror in RTL (directional glyphs like arrows/chevrons). */
	flip?: boolean;
	/** Accessible name; omitted = decorative (aria-hidden). */
	label?: string;
} = $props();
</script>

<svg
	class="icon"
	class:icon--sm={size === "sm"}
	class:icon--flip={flip}
	aria-hidden={label ? undefined : "true"}
	aria-label={label}
	role={label ? "img" : undefined}
>
	<use href={`#i-${name}`} />
</svg>
