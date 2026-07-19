<script lang="ts">
import { m } from "@linuxhub/i18n";
import Icon from "@linuxhub/ui/components/Icon.svelte";
import LogoTile from "@linuxhub/ui/components/LogoTile.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

type Stage = "intro" | "questions" | "result";
let stage: Stage = $state("intro");
let step = $state(0);
let scores: Record<string, number> = $state({});

const total = $derived(data.quiz.length);

function answer(weights: Record<string, number>) {
	for (const [slug, w] of Object.entries(weights)) {
		scores[slug] = (scores[slug] ?? 0) + w;
	}
	next();
}

function next() {
	if (step + 1 >= total) stage = "result";
	else step += 1;
}

function back() {
	if (step === 0) stage = "intro";
	else step -= 1;
}

function restart() {
	stage = "intro";
	step = 0;
	scores = {};
}

const matches = $derived(
	Object.entries(scores)
		.sort((a, b) => b[1] - a[1])
		.map(([slug]) => data.distros.find((d) => d.slug === slug))
		.filter((d) => d !== undefined)
		.slice(0, 3),
);
</script>

<svelte:head>
	<title>{m.quiz_title} — {m.site_name}</title>
</svelte:head>

<div class="container" style="padding-block: var(--space-6) var(--space-8);">
	{#if stage === "intro"}
		<div class="quiz-card quiz-card--intro">
			<h1>{m.quiz_title}</h1>
			<p class="muted">{m.quiz_intro}</p>
			<p class="muted" style="font-size: var(--text-sm);">{m.quiz_time}</p>
			<div style="display: flex; flex-wrap: wrap; gap: var(--space-3); justify-content: center;">
				<button
					type="button"
					class="btn btn--primary btn--lg"
					onclick={() => {
						stage = "questions";
					}}
				>
					{m.quiz_start}
				</button>
				<a class="btn btn--lg" href="/explore">{m.quiz_browse}</a>
			</div>
		</div>
	{:else if stage === "questions"}
		{@const question = data.quiz[step]}
		<div class="quiz-card">
			<div class="quiz-head">
				<div class="quiz-head__meta">
					<button type="button" class="btn btn--sm" style="background: var(--color-bg);" onclick={back}>
						<Icon name="arrow-start" size="sm" flip />
						{m.quiz_back}
					</button>
					<span>{step + 1} / {total}</span>
				</div>
				<div
					class="quiz-progress"
					role="progressbar"
					aria-valuenow={step + 1}
					aria-valuemin={0}
					aria-valuemax={total}
					style="background: var(--color-bg);"
				>
					<div class="quiz-progress__bar" style={`inline-size: ${Math.round(((step + 1) / total) * 100)}%;`}></div>
				</div>
				<h1 class="quiz-question">{question.q}</h1>
			</div>
			<div class="boxed" style="background: var(--color-bg);">
				{#each question.options as option (option.label)}
					<button type="button" class="row" onclick={() => answer(option.w)}>
						<Icon name={option.icon} />
						<span class="row__body">
							<span class="row__title">{option.label}</span>
							{#if option.sub}<span class="row__subtitle">{option.sub}</span>{/if}
						</span>
						<Icon name="chevron-end" size="sm" flip />
					</button>
				{/each}
			</div>
			<button
				type="button"
				class="btn btn--sm"
				style="justify-self: center; background: var(--color-bg);"
				onclick={next}
			>
				{m.quiz_skip}
			</button>
		</div>
	{:else}
		{@const top = matches[0]}
		<div style="display: grid; gap: var(--space-4);">
			{#if top}
				<div class="match-card" style={`background: color-mix(in srgb, ${top.color} 12%, var(--color-surface));`}>
					<span class="badge">{m.quiz_top_match}</span>
					<LogoTile color={top.color} initials={top.initials} size="lg" src={top.logo} />
					<h1 style="font-size: var(--text-2xl); font-weight: 700;">{top.name}</h1>
					<p class="muted" style="max-inline-size: 44ch;">{top.summary}</p>
					<div style="display: flex; flex-wrap: wrap; gap: var(--space-3); justify-content: center;">
						<a class="btn btn--primary btn--lg" href={`/distro/${top.slug}`}>{m.quiz_see} {top.name}</a>
						<a class="btn btn--lg" href={`/distro/${top.slug}#downloads`} style="background: var(--color-bg);">
							{m.detail_download}
						</a>
					</div>
				</div>
			{/if}
			{#if matches.length > 1}
				<div class="boxed runner-ups">
					{#each matches.slice(1) as runner (runner.slug)}
						<a class="row" href={`/distro/${runner.slug}`}>
							<LogoTile color={runner.color} initials={runner.initials} size="sm" src={runner.logo} />
							<span class="row__body">
								<span class="row__title">{runner.name}</span>
								<span class="row__subtitle">{runner.summary}</span>
							</span>
							<Icon name="chevron-end" size="sm" flip />
						</a>
					{/each}
				</div>
			{/if}
			<div style="display: flex; flex-wrap: wrap; gap: var(--space-3); justify-content: center;">
				<button type="button" class="btn btn--sm" onclick={restart}>{m.quiz_retake}</button>
				<a class="btn btn--sm" href={`/compare?slugs=${matches.map((d) => d.slug).join(",")}`}>
					{m.quiz_compare_matches}
				</a>
			</div>
		</div>
	{/if}
</div>

<style>
	.quiz-card {
		max-inline-size: 560px;
		margin-inline: auto;
		display: grid;
		gap: var(--space-5);
		padding: var(--space-6);
		background: var(--color-surface);
		border-radius: var(--radius-md);
	}

	.quiz-card--intro {
		text-align: center;
		gap: var(--space-4);
	}

	.quiz-card--intro h1 {
		font-size: var(--text-2xl);
		font-weight: 700;
	}

	.quiz-head {
		display: grid;
		gap: var(--space-3);
	}

	.quiz-head__meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
	}

	.quiz-question {
		font-size: var(--text-xl);
		font-weight: 700;
		line-height: var(--leading-xl);
	}

	.match-card {
		max-inline-size: 560px;
		margin-inline: auto;
		inline-size: 100%;
		display: grid;
		gap: var(--space-4);
		justify-items: center;
		text-align: center;
		padding: var(--space-7) var(--space-6);
		border-radius: var(--radius-lg);
	}

	.runner-ups {
		max-inline-size: 560px;
		margin-inline: auto;
		inline-size: 100%;
	}
</style>
