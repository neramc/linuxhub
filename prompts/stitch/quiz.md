# Stitch Brief — Distro-Finder Quiz

*(Use together with `_foundation.md`.)*

## Purpose
A friendly "which distro is for you?" flow for newcomers: 6–8 questions →
3 scored recommendations. Personality-quiz warmth with product-grade polish;
zero jargon until results.

## Layout
**Intro screen:** centered card (max 560px): playful title (2xl/600, e.g.
"Find your Linux"), 2-line explainer, time hint ("under a minute"), primary
Button "Start", ghost "Skip to Explore".

**Question screens (QuizStepper):** progress bar (thin, accent, animated
width) + "3 of 7" (xs muted); question (xl/600, max 30ch); answers as large
option cards (radius 10, icon + short label + optional sm muted example),
2-col grid desktop / 1-col mobile. Single-select advances after a brief
confirm tint; a multi-select question uses checkboxes + "Next" button.
Back arrow top-left; "skip question" ghost link bottom.

**Result screen:** headline "Your matches"; **top match** as a large
celebratory card — logo 96px, name (2xl/700), match reasoning in 2–3 plain
sentences ("You wanted stability and a gentle start — Mint tracks Ubuntu
LTS…"), primary "See Fedora" + secondary "Download". Below: 2 runner-up
DistroCards with one-line reasons. Footer actions: "Retake" ghost, "Compare
these three →" link.

## Components
QuizStepper, Button, Chip, DistroCard, Badge, SkeletonCard, ErrorState,
Toast.

## Content & states
- Loading: question set loads behind the intro screen; result computes with
  a brief "Matching…" state (max ~1s feel) using a subtle logo shuffle
  animation — design its static variant too.
- Empty: n/a (question set is static) — but design the "no strong match"
  result variant: neutral tone + link to Explore.
- Error: submitting fails → inline ErrorState with retry, answers preserved.

## Interaction & motion
Questions slide horizontally (base; mirrors in RTL); progress bar animates
width (base); selected option springs slightly; result card enters with slow
rise + a single soft confetti-free flourish (e.g. accent ring pulse).
Reduced motion: cross-fades, static progress, no pulse.

## Accessibility
One question per screen, question as heading; options are radiogroup/
checkbox group, fully arrow-key navigable; progress announced ("question 3
of 7"); auto-advance has enough delay to not disorient screen readers;
result reasoning is real text, not tooltip-hidden.

## Reference
Modrinth's playfulness for option cards and the result moment; Flathub calm
for pacing — friendly, never childish.
