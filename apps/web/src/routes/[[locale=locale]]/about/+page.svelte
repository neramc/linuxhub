<script lang="ts">
import { localizeHref, m } from "@linuxhub/i18n";
import Icon from "@linuxhub/ui/components/Icon.svelte";

const SECTIONS = [
	{ id: "what", title: m.about_what },
	{ id: "rankings", title: m.about_rankings },
	{ id: "data", title: m.about_data },
	{ id: "content", title: m.about_content },
	{ id: "crawler", title: m.about_crawler },
	{ id: "contact", title: m.about_contact },
];
</script>

<svelte:head>
	<title>{m.about_title} — {m.site_name}</title>
</svelte:head>

<div class="container">
	<header class="page-head">
		<h1>{m.about_title}</h1>
	</header>

	<div class="about-layout">
		<div class="prose about-prose">
			<section id="what">
				<h2>{m.about_what}</h2>
				<p>{m.about_what_p1}</p>
				<p>{m.about_what_p2}</p>
			</section>
			<section id="rankings">
				<h2>{m.about_rankings}</h2>
				<p>{m.about_rankings_p}</p>
			</section>
			<section id="data">
				<h2>{m.about_data}</h2>
				<p>{m.about_data_p}</p>
			</section>
			<section id="content">
				<h2>{m.about_content}</h2>
				<p>{m.about_content_p}</p>
			</section>
			<section id="crawler">
				<h2>{m.about_crawler}</h2>
				<p>{m.about_crawler_p}</p>
			</section>
			<section id="contact">
				<h2>{m.about_contact}</h2>
				<p>{m.about_contact_p}</p>
				<div style="display: flex; gap: var(--space-3); flex-wrap: wrap;">
					<a class="btn btn--primary" href={localizeHref("/contribute")}>{m.nav_contribute}</a>
					<a class="btn" href="https://github.com/neramc/linuxhub">
						GitHub
						<Icon name="external" size="sm" />
					</a>
				</div>
			</section>
		</div>

		<nav class="toc" aria-label={m.about_on_this_page}>
			<h2>{m.about_on_this_page}</h2>
			<ul>
				{#each SECTIONS as section (section.id)}
					<li><a href={`#${section.id}`}>{section.title}</a></li>
				{/each}
			</ul>
		</nav>
	</div>
</div>

<style>
	.about-layout {
		display: grid;
		gap: var(--space-7);
		padding-block-end: var(--space-8);
	}

	@media (min-width: 1024px) {
		.about-layout {
			grid-template-columns: minmax(0, 1fr) 220px;
		}
	}

	.about-prose {
		max-inline-size: 68ch;
	}

	.about-prose section {
		scroll-margin-block-start: 80px;
	}

	.about-prose section + section {
		margin-block-start: var(--space-7);
	}

	.toc {
		display: none;
	}

	@media (min-width: 1024px) {
		.toc {
			display: block;
			position: sticky;
			inset-block-start: calc(64px + var(--space-6));
			align-self: start;
		}
	}

	.toc h2 {
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
		margin-block-end: var(--space-3);
	}

	.toc ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-1);
	}

	.toc a {
		display: block;
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-full);
		color: var(--color-text-muted);
		font-size: var(--text-sm);
	}

	.toc a:hover {
		color: var(--color-text);
		background: var(--color-subtle-hover);
		text-decoration: none;
	}
</style>
