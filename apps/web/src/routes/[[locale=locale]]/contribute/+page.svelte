<script lang="ts">
import { localizeHref, m } from "@linuxhub/i18n";
import Icon from "@linuxhub/ui/components/Icon.svelte";

type Tab = "suggest" | "report" | "feedback";
let tab: Tab = $state("suggest");
let sent = $state(false);

const TABS: Array<{ id: Tab; label: string }> = [
	{ id: "suggest", label: m.contribute_suggest },
	{ id: "report", label: m.contribute_report },
	{ id: "feedback", label: m.contribute_feedback },
];

// Submission wiring (hCaptcha verify + POST endpoints) lands with Phase 5;
// until then the form completes locally so the full flow is reviewable.
function submit(e: SubmitEvent) {
	e.preventDefault();
	sent = true;
}
</script>

<svelte:head>
	<title>{m.contribute_title} — {m.site_name}</title>
</svelte:head>

<div class="container">
	<div class="contrib">
		<header class="page-head">
			<h1>{m.contribute_title}</h1>
			<p class="lede">{m.contribute_lede}</p>
		</header>

		{#if sent}
			<div class="contrib-card thanks">
				<Icon name="check" />
				<div class="thanks__title">{m.form_thanks}</div>
				<div style="display: flex; gap: var(--space-2);">
					<button
						type="button"
						class="btn btn--sm"
						style="background: var(--color-bg);"
						onclick={() => {
							sent = false;
						}}
					>
						{m.form_again}
					</button>
					<a class="btn btn--sm" style="background: var(--color-bg);" href={localizeHref("/explore")}>{m.nav_explore}</a>
				</div>
			</div>
		{:else}
			<div class="switcher" role="tablist" aria-label={m.contribute_title}>
				{#each TABS as t (t.id)}
					<button
						type="button"
						class="tab"
						role="tab"
						aria-selected={tab === t.id}
						onclick={() => {
							tab = t.id;
						}}
					>
						{t.label}
					</button>
				{/each}
			</div>

			<form class="contrib-card" onsubmit={submit}>
				{#if tab === "suggest"}
					<div class="field">
						<label class="field__label" for="s-name">{m.form_distro_name}</label>
						<input class="input" id="s-name" type="text" required />
					</div>
					<div class="field">
						<label class="field__label" for="s-url">{m.form_homepage}</label>
						<input class="input" id="s-url" type="url" required />
					</div>
					<div class="field">
						<label class="field__label" for="s-why">{m.form_why}</label>
						<textarea class="textarea" id="s-why" aria-describedby="s-why-hint" required></textarea>
						<p class="field__hint" id="s-why-hint">{m.form_why_hint}</p>
					</div>
					<div class="field">
						<label class="field__label" for="s-mail"
							>{m.form_email} <span class="optional">({m.form_email_hint})</span></label
						>
						<input class="input" id="s-mail" type="email" />
					</div>
				{:else if tab === "report"}
					<div class="field">
						<label class="field__label" for="r-kind">{m.form_whats_broken}</label>
						<select class="select" id="r-kind">
							<option>Mirror is down</option>
							<option>Wrong download link</option>
							<option>Checksum doesn't match</option>
							<option>Outdated information</option>
							<option>Something else</option>
						</select>
					</div>
					<div class="field">
						<label class="field__label" for="r-where">{m.form_which_page}</label>
						<input class="input" id="r-where" type="text" required />
					</div>
					<div class="field">
						<label class="field__label" for="r-detail">{m.form_details}</label>
						<textarea class="textarea" id="r-detail" required></textarea>
					</div>
				{:else}
					<div class="field">
						<label class="field__label" for="fb-topic">{m.form_topic}</label>
						<select class="select" id="fb-topic">
							<option>General</option>
							<option>Design</option>
							<option>Translations</option>
							<option>Data accuracy</option>
						</select>
					</div>
					<div class="field">
						<label class="field__label" for="fb-msg">{m.form_message}</label>
						<textarea class="textarea" id="fb-msg" required></textarea>
					</div>
				{/if}

				<div class="captcha-slot">
					<span class="field__label">{m.form_captcha}</span>
					<div class="captcha-slot__box">
						<Icon name="check" />
						{m.form_captcha_note}
					</div>
				</div>
				<button type="submit" class="btn btn--primary btn--lg btn--block">{m.form_send}</button>
			</form>
		{/if}
	</div>
</div>

<style>
	.contrib {
		max-inline-size: 560px;
		margin-inline: auto;
		padding-block-end: var(--space-8);
	}

	.contrib-card {
		display: grid;
		gap: var(--space-5);
		padding: var(--space-6);
		background: var(--color-surface);
		border-radius: var(--radius-md);
		margin-block-start: var(--space-4);
	}

	.contrib-card :global(.input),
	.contrib-card :global(.select),
	.contrib-card :global(.textarea) {
		background: var(--color-bg);
	}

	.captcha-slot {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-4);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
	}

	.captcha-slot__box {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-block-size: 64px;
		padding-inline: var(--space-4);
		border: 2px dashed var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		font-size: var(--text-sm);
	}

	.thanks {
		text-align: center;
		justify-items: center;
		padding: var(--space-7) var(--space-5);
	}

	.thanks :global(.icon) {
		inline-size: 40px;
		block-size: 40px;
		color: var(--color-success);
	}

	.thanks__title {
		font-size: var(--text-lg);
		font-weight: 600;
	}
</style>
