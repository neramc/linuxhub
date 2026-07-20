<script lang="ts">
import IconDefs from "@linuxhub/ui/components/IconDefs.svelte";
import { prefersReducedMotion } from "@linuxhub/ui/motion";
import { onNavigate } from "$app/navigation";
import AppDrawer from "$lib/components/AppDrawer.svelte";
import AppFooter from "$lib/components/AppFooter.svelte";
import AppHeader from "$lib/components/AppHeader.svelte";
import CommandPalette from "$lib/components/CommandPalette.svelte";
import "@linuxhub/ui/styles.css";

let { children } = $props();

// Cross-fade route changes via the View Transitions API where supported;
// no-ops under prefers-reduced-motion (.ai/frontend-rules.md "Theme & motion").
onNavigate((navigation) => {
	if (!document.startViewTransition || prefersReducedMotion()) return;
	return new Promise((resolve) => {
		document.startViewTransition(async () => {
			resolve();
			await navigation.complete;
		});
	});
});
</script>

<IconDefs />
<AppHeader />
<main id="main">
	{@render children()}
</main>
<AppFooter />
<AppDrawer />
<CommandPalette />
