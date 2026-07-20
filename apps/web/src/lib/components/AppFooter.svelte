<script lang="ts">
import { localizeHref, m } from "@linuxhub/i18n";
import Icon from "@linuxhub/ui/components/Icon.svelte";
</script>

<footer class="app-footer">
	<div class="container app-footer__inner">
		<div>
			<a class="wordmark" href={localizeHref("/")}><Icon name="logo" /><span>{m.site_name}</span></a>
			<p style="margin-block-start: var(--space-3); max-inline-size: 32ch;">{m.site_tagline}</p>
		</div>
		<div class="footer-cols">
			<div>
				<h3>{m.footer_browse}</h3>
				<ul>
					<li><a href={localizeHref("/explore")}>{m.nav_explore}</a></li>
					<li><a href={localizeHref("/rankings")}>{m.nav_rankings}</a></li>
					<li><a href={localizeHref("/hall-of-fame")}>{m.nav_hall_of_fame}</a></li>
					<li><a href={localizeHref("/compare")}>{m.nav_compare}</a></li>
					<li><a href={localizeHref("/quiz")}>{m.footer_finder}</a></li>
				</ul>
			</div>
			<div>
				<h3>{m.footer_project}</h3>
				<ul>
					<li><a href={localizeHref("/about")}>{m.nav_about}</a></li>
					<li><a href={localizeHref("/contribute")}>{m.nav_contribute}</a></li>
					<li><a href={localizeHref("/about#crawler")}>{m.footer_crawler}</a></li>
					<li><a href={localizeHref("/about#data")}>{m.footer_sources}</a></li>
				</ul>
			</div>
			<div>
				<h3>{m.footer_feeds}</h3>
				<ul>
					<li><a href="/api/v1/feeds/releases.rss">{m.footer_rss}</a></li>
					<li><a href="/api/v1/feeds/releases.atom">{m.footer_atom}</a></li>
					<li><a href={localizeHref("/about")}>{m.footer_badges}</a></li>
				</ul>
			</div>
		</div>
	</div>
</footer>
