<script lang="ts">
import { localizeHref, m } from "@linuxhub/i18n";
import Icon from "@linuxhub/ui/components/Icon.svelte";
import { page } from "$app/state";
import { toggleTheme, ui } from "$lib/state/ui.svelte";

const NAV = [
	{ href: "/explore", label: m.nav_explore, icon: "compass" },
	{ href: "/rankings", label: m.nav_rankings, icon: "chart" },
	{ href: "/hall-of-fame", label: m.nav_hall_of_fame, icon: "trophy" },
	{ href: "/quiz", label: m.nav_quiz, icon: "help" },
	{ href: "/compare", label: m.nav_compare, icon: "sliders" },
	{ href: "/about", label: m.nav_about, icon: "info" },
	{ href: "/contribute", label: m.nav_contribute, icon: "heart" },
];

function close() {
	ui.drawerOpen = false;
}

function onkeydown(e: KeyboardEvent) {
	if (e.key === "Escape") {
		ui.drawerOpen = false;
		ui.localeOpen = false;
	}
}
</script>

<svelte:window {onkeydown} />

<div
	class="drawer-scrim"
	class:drawer-scrim--open={ui.drawerOpen}
	onclick={close}
	aria-hidden="true"
></div>
<nav class="drawer" class:drawer--open={ui.drawerOpen} aria-label={m.nav_menu} inert={!ui.drawerOpen}>
	<div class="drawer__head">
		<a class="wordmark" href={localizeHref("/")}><Icon name="logo" /><span>{m.site_name}</span></a>
		<button type="button" class="icon-btn" aria-label={m.nav_close_menu} onclick={close}>
			<Icon name="close" />
		</button>
	</div>
	<div class="drawer__nav">
		{#each NAV as item (item.href)}
			<a
				href={item.href}
				aria-current={page.url.pathname.startsWith(item.href) ? "page" : undefined}
				onclick={close}
			>
				<Icon name={item.icon} size="sm" />{item.label}
			</a>
		{/each}
		<hr class="drawer__divider" />
		<button type="button" class="drawer__utility" onclick={toggleTheme}>
			<span>{m.nav_theme}</span><Icon name="sun" size="sm" />
		</button>
	</div>
	<div class="drawer__foot"><span>RSS</span><span>GitHub</span></div>
</nav>

<style>
	/* The comp toggles via body.drawer-open; the app scopes it locally. */
	.drawer-scrim--open {
		opacity: 1;
		pointer-events: auto;
	}

	.drawer--open {
		transform: translateX(0);
	}

	:global([dir="rtl"]) .drawer--open {
		transform: translateX(0);
	}
</style>
