<script lang="ts">
import IconDefs from "@linuxhub/ui/components/IconDefs.svelte";
import AppDrawer from "$lib/components/AppDrawer.svelte";
import AppFooter from "$lib/components/AppFooter.svelte";
import AppHeader from "$lib/components/AppHeader.svelte";
import "@linuxhub/ui/styles.css";

let { children } = $props();
</script>

<IconDefs />
<AppHeader />
<main id="main">
	{@render children()}
</main>
<AppFooter />
<AppDrawer />
