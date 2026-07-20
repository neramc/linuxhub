<script lang="ts">
import { isLocale, LOCALES, localizeHref, m, splitLocale } from "@linuxhub/i18n";
import Icon from "@linuxhub/ui/components/Icon.svelte";
import { page } from "$app/state";
import { toggleTheme, ui } from "$lib/state/ui.svelte";

const NAV = [
	{ href: "/explore", label: m.nav_explore },
	{ href: "/rankings", label: m.nav_rankings },
	{ href: "/hall-of-fame", label: m.nav_hall_of_fame },
	{ href: "/quiz", label: m.nav_quiz },
];

const activeLocale = $derived((page.data.locale as string | undefined) ?? "en");

let localeQuery = $state("");
const filteredLocales = $derived(
	LOCALES.filter((l) =>
		`${l.label} ${l.code}`.toLowerCase().includes(localeQuery.trim().toLowerCase()),
	),
);

/** Same page in another locale (en stays unprefixed). */
function switchHref(code: string): string {
	const [, path] = splitLocale(page.url.pathname, isLocale);
	const localized = code === "en" ? path : `/${code}${path === "/" ? "" : path}`;
	return localized + page.url.search;
}

function rememberLocale(code: string) {
	document.cookie = `lh-locale=${code}; path=/; max-age=31536000; samesite=lax`;
	ui.localeOpen = false;
}

function current(href: string): "page" | undefined {
	return page.url.pathname.includes(href) ? "page" : undefined;
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
		<a class="wordmark" href={localizeHref("/")}><Icon name="logo" /><span>{m.site_name}</span></a>
		<form action={localizeHref("/search")} method="get" class="search">
			<Icon name="search" size="sm" />
			<input
				class="search__input"
				type="search"
				name="q"
				placeholder={m.nav_search_label}
				aria-label={m.nav_search_label}
			/>
		</form>
		<nav class="app-nav" aria-label="Primary">
			{#each NAV as item (item.href)}
				<a href={item.href} aria-current={current(item.href)}>{item.label}</a>
			{/each}
		</nav>
		<div class="header-actions">
			<button
				type="button"
				class="icon-btn search-mobile-btn"
				aria-label={m.nav_search_label}
				onclick={() => {
					ui.paletteOpen = true;
				}}
			>
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
					<Icon name="globe" size="sm" /><span>{activeLocale.toUpperCase()}</span>
				</button>
				<div class="locale-popover" class:is-open={ui.localeOpen}>
					<div class="locale-popover__search">
						<input
							class="input"
							type="search"
							placeholder={m.nav_language}
							aria-label={m.nav_language}
							bind:value={localeQuery}
						/>
					</div>
					<div class="locale-popover__list" role="listbox" aria-label={m.nav_language}>
						{#each filteredLocales as locale (locale.code)}
							<a
								class="locale-option"
								role="option"
								aria-selected={locale.code === activeLocale}
								dir="auto"
								href={switchHref(locale.code)}
								data-sveltekit-reload
								onclick={() => rememberLocale(locale.code)}
							>
								<Icon name="check" size="sm" /><span>{locale.label}</span><span class="code">{locale.code}</span>
							</a>
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
