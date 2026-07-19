<script lang="ts">
import { m } from "@linuxhub/i18n";
import Icon from "@linuxhub/ui/components/Icon.svelte";
</script>

<footer class="app-footer">
	<div class="container app-footer__inner">
		<div>
			<a class="wordmark" href="/"><Icon name="logo" /><span>{m.site_name}</span></a>
			<p style="margin-block-start: var(--space-3); max-inline-size: 32ch;">{m.site_tagline}</p>
		</div>
		<div class="footer-cols">
			<div>
				<h3>{m.footer_browse}</h3>
				<ul>
					<li><a href="/explore">{m.nav_explore}</a></li>
					<li><a href="/rankings">{m.nav_rankings}</a></li>
					<li><a href="/hall-of-fame">{m.nav_hall_of_fame}</a></li>
					<li><a href="/compare">{m.nav_compare}</a></li>
					<li><a href="/quiz">{m.footer_finder}</a></li>
				</ul>
			</div>
			<div>
				<h3>{m.footer_project}</h3>
				<ul>
					<li><a href="/about">{m.nav_about}</a></li>
					<li><a href="/contribute">{m.nav_contribute}</a></li>
					<li><a href="/about#crawler">{m.footer_crawler}</a></li>
					<li><a href="/about#data">{m.footer_sources}</a></li>
				</ul>
			</div>
			<div>
				<h3>{m.footer_feeds}</h3>
				<ul>
					<li><a href="/api/v1/feeds/releases.rss">{m.footer_rss}</a></li>
					<li><a href="/api/v1/feeds/releases.atom">{m.footer_atom}</a></li>
					<li><a href="/about">{m.footer_badges}</a></li>
				</ul>
			</div>
		</div>
	</div>
</footer>
