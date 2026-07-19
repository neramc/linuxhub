<script lang="ts">
import { m } from "@linuxhub/i18n";
</script>

<svelte:head>
	<title>{m.nav_contribute} — {m.site_name}</title>
</svelte:head>

<div class="container">
	<header class="page-head">
		<h1>{m.nav_contribute}</h1>
	</header>
	<div class="state-block" style="margin-block-end: var(--space-8);">
		<div class="state-block__title">{m.nav_contribute}</div>
		<p>{m.stub_note}</p>
		<a class="btn btn--sm" href="/explore">{m.nav_explore}</a>
	</div>
</div>
