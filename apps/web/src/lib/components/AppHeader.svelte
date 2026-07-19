<script lang="ts">
import { m } from "@linuxhub/i18n";
import Icon from "@linuxhub/ui/components/Icon.svelte";
import { page } from "$app/state";
import { toggleTheme, ui } from "$lib/state/ui.svelte";

const NAV = [
	{ href: "/explore", label: m.nav_explore },
	{ href: "/rankings", label: m.nav_rankings },
	{ href: "/hall-of-fame", label: m.nav_hall_of_fame },
	{ href: "/quiz", label: m.nav_quiz },
];

const LOCALES = [
	["English", "en"],
	["한국어", "ko"],
	["日本語", "ja"],
	["Deutsch", "de"],
	["español", "es"],
	["العربية", "ar"],
];

function current(href: string): "page" | undefined {
	return page.url.pathname.startsWith(href) ? "page" : undefined;
}
</script>

<a class="visually-hidden" href="#main">{m.skip_to_content}</a>
<header class="app-header">
	<div class="container app-header__inner">
		<button
			type="button"
			class="icon-btn hamburger"
			aria-label={m.nav_menu}
			aria-expanded={ui.drawerOpen}
			onclick={() => {
				ui.drawerOpen = true;
			}}
		>
			<Icon name="menu" />
		</button>
		<a class="wordmark" href="/"><Icon name="logo" /><span>{m.site_name}</span></a>
		<div class="search">
			<Icon name="search" size="sm" />
			<input class="search__input" type="search" placeholder={m.nav_search_label} aria-label={m.nav_search_label} />
		</div>
		<nav class="app-nav" aria-label="Primary">
			{#each NAV as item (item.href)}
				<a href={item.href} aria-current={current(item.href)}>{item.label}</a>
			{/each}
		</nav>
		<div class="header-actions">
			<button type="button" class="icon-btn search-mobile-btn" aria-label={m.nav_search_label}>
				<Icon name="search" />
			</button>
			<div class="popover-anchor">
				<button
					type="button"
					class="icon-btn locale-btn"
					aria-haspopup="listbox"
					aria-expanded={ui.localeOpen}
					onclick={() => {
						ui.localeOpen = !ui.localeOpen;
					}}
				>
					<Icon name="globe" size="sm" /><span>EN</span>
				</button>
				<div class="locale-popover" class:is-open={ui.localeOpen}>
					<div class="locale-popover__search">
						<input class="input" type="search" placeholder={m.nav_language} aria-label={m.nav_language} />
					</div>
					<div class="locale-popover__list" role="listbox" aria-label={m.nav_language}>
						{#each LOCALES as [label, code] (code)}
							<button type="button" class="locale-option" role="option" aria-selected={code === "en"} dir="auto">
								<Icon name="check" size="sm" /><span>{label}</span><span class="code">{code}</span>
							</button>
						{/each}
					</div>
				</div>
			</div>
			<button type="button" class="icon-btn" aria-label={m.nav_switch_theme} onclick={toggleTheme}>
				<Icon name="sun" />
			</button>
		</div>
	</div>
</header>
