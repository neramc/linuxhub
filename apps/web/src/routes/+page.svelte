<script lang="ts">
import { m } from "@linuxhub/i18n";
import DistroCard from "@linuxhub/ui/components/DistroCard.svelte";
import Icon from "@linuxhub/ui/components/Icon.svelte";
import LogoTile from "@linuxhub/ui/components/LogoTile.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

const KICKERS: Record<string, string> = {
	home_distro_of_day: m.home_distro_of_day,
	home_editors_pick: m.home_editors_pick,
	home_rising: m.home_rising,
};

const CATEGORIES = [
	{ slug: "desktop", label: m.cat_desktop, icon: "monitor", g1: "#62a0ea", g2: "#1a5fb4" },
	{ slug: "server", label: m.cat_server, icon: "server", g1: "#c061cb", g2: "#613583" },
	{ slug: "beginners", label: m.cat_beginners, icon: "check", g1: "#57e389", g2: "#1a7f4e" },
	{ slug: "lightweight", label: m.cat_lightweight, icon: "cpu", g1: "#ffa348", g2: "#c64600" },
	{ slug: "security", label: m.cat_security, icon: "alert", g1: "#f66151", g2: "#a51d2d" },
	{ slug: "gaming", label: m.cat_gaming, icon: "dice", g1: "#5bc8af", g2: "#0e7f6b" },
	{ slug: "diy", label: m.cat_diy, icon: "sliders", g1: "#f8c445", g2: "#b08000" },
];

let track: HTMLElement | undefined = $state();

function slide(direction: number) {
	track?.scrollBy({ left: direction * track.clientWidth, behavior: "smooth" });
}
</script>

<svelte:head>
	<title>{m.site_name}</title>
	<meta name="description" content={m.site_tagline} />
</svelte:head>

<div class="container">
	<div style="padding-block-start: var(--space-5);">
		<div class="banner-carousel">
			<button type="button" class="banner-nav banner-nav--prev" aria-label={m.banner_prev} onclick={() => slide(-1)}>
				<Icon name="arrow-start" size="sm" flip />
			</button>
			<div class="banner-track" bind:this={track} aria-label={m.home_distro_of_day}>
				{#each data.banners as banner (banner.slug)}
					{#if banner.distro}
						<a class="banner-tile" href={`/distro/${banner.slug}`} style={`--tile: ${banner.distro.color}`}>
							<LogoTile color={banner.distro.color} initials={banner.distro.initials} size="lg" />
							<span class="banner-tile__body">
								<span class="banner-tile__kicker">{KICKERS[banner.kicker]}</span>
								<span class="banner-tile__name">{banner.distro.name}</span>
								<span class="banner-tile__tagline">{banner.tagline}</span>
							</span>
						</a>
					{/if}
				{/each}
			</div>
			<button type="button" class="banner-nav banner-nav--next" aria-label={m.banner_next} onclick={() => slide(1)}>
				<Icon name="arrow-end" size="sm" flip />
			</button>
		</div>
		<div class="carousel-dots" aria-hidden="true">
			{#each data.banners as banner, i (banner.slug)}
				<span class:is-active={i === 0}></span>
			{/each}
		</div>
	</div>

	<nav class="cat-tiles" aria-label={m.home_categories} style="margin-block-start: var(--space-5);">
		{#each CATEGORIES as cat (cat.slug)}
			<a class="cat-tile" href={`/explore?category=${cat.slug}`} style={`--g1: ${cat.g1}; --g2: ${cat.g2}`}>
				<Icon name={cat.icon} />
				{cat.label}
			</a>
		{/each}
		<a class="cat-tile" href="/explore" style="--g1: #9a9996; --g2: #5e5c64">
			<Icon name="search" />
			{m.home_all_categories}
		</a>
	</nav>

	<div class="section-title"><h2>{m.home_trending}</h2><a href="/rankings">{m.home_see_more}</a></div>
	<div class="card-grid">
		{#each data.trending as distro (distro.slug)}
			<DistroCard
				href={`/distro/${distro.slug}`}
				name={distro.name}
				summary={distro.summary}
				color={distro.color}
				initials={distro.initials}
			/>
		{/each}
	</div>

	<div class="section-title"><h2>{m.home_popular}</h2><a href="/rankings">{m.home_see_more}</a></div>
	<div class="card-grid">
		{#each data.popular as distro (distro.slug)}
			<DistroCard
				href={`/distro/${distro.slug}`}
				name={distro.name}
				summary={distro.summary}
				color={distro.color}
				initials={distro.initials}
			/>
		{/each}
	</div>

	<div class="section-title"><h2>{m.home_recently_updated}</h2><a href="/explore">{m.home_see_more}</a></div>
	<div class="boxed">
		{#each data.recent as release (release.title)}
			<a class="row" href={`/distro/${release.slug}`}>
				{#if release.distro}
					<LogoTile color={release.distro.color} initials={release.distro.initials} size="sm" />
				{/if}
				<span class="row__body">
					<span class="row__title">{release.title}</span>
					<span class="row__subtitle">{release.subtitle}</span>
				</span>
				<span class="row__end">{release.date}</span>
			</a>
		{/each}
	</div>

	<div class="section-title"><h2>{m.home_not_sure}</h2></div>
	<div class="boxed" style="margin-block-end: var(--space-7);">
		<a class="row" href="/quiz">
			<Icon name="help" size="sm" />
			<span class="row__body">
				<span class="row__title">{m.home_finder_title}</span>
				<span class="row__subtitle">{m.home_finder_sub}</span>
			</span>
			<Icon name="chevron-end" size="sm" flip />
		</a>
		<a class="row" href="/compare">
			<Icon name="sliders" size="sm" />
			<span class="row__body">
				<span class="row__title">{m.home_compare_title}</span>
				<span class="row__subtitle">{m.home_compare_sub}</span>
			</span>
			<Icon name="chevron-end" size="sm" flip />
		</a>
	</div>
</div>
