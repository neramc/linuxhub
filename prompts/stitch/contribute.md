# Stitch Brief — Contribute / Report

*(Use together with `_foundation.md`.)*

## Purpose
Anonymous, captcha-gated community forms: suggest a distro, report a broken
mirror/link, send feedback. Low-friction, trustworthy, spam-resistant.
No accounts exist — say so plainly.

## Layout
1. Page header: title (2xl/600) + one paragraph: contributions are anonymous,
   reviewed by maintainers, protected by a captcha.
2. **Form type Tabs** — "Suggest a distro" · "Report a problem" ·
   "Feedback". One shared card layout (max 560px, surface, radius 16,
   padding 24):
   - **Suggest:** distro name (input), homepage URL (input), why it belongs
     (textarea, counter 500), optional email for follow-up (input, marked
     optional).
   - **Report:** what's broken (select: mirror down / wrong link / bad
     checksum / outdated info / other), which page/mirror (input, pre-filled
     when arriving from a distro page), details (textarea).
   - **Feedback:** topic (select), message (textarea).
3. **CaptchaGate** sits between fields and submit: bordered slot with
   explanatory microcopy ("One quick check — no account needed").
4. Primary Button full-width "Send"; after success the card swaps to a
   thank-you state: success-colored check, "Thanks — we review every
   submission", buttons "Send another" / "Back to Explore".

Labels above fields (never placeholder-as-label); helper text sm muted;
validation errors danger text + danger border below the field.

## Components
Tabs, CaptchaGate, Button, Badge, Toast, ErrorState, form inputs (design
input/select/textarea styles here — they become the canonical form styles).

## Content & states
- Loading: captcha slot shows a skeleton shimmer while the widget loads.
- Empty: n/a (forms start empty by nature).
- Error: submit failure → inline danger alert above the button, input
  preserved; rate-limited (429) → specific message "Too many submissions —
  try again in a minute."; captcha failed → error on the CaptchaGate slot.

## Interaction & motion
Tab switch cross-fades forms (base) preserving typed input per tab; invalid
submit shakes the offending field 2px (fast, once); success state swaps with
a slow fade + check draw-in. Reduced motion: fades only, no shake (use
border flash).

## Accessibility
Every field labeled + described (aria-describedby for helpers/errors);
errors announced assertively and focus moves to the first invalid field;
captcha has an accessible fallback note; success state gets focus so it's
announced.

## Reference
Flathub's quiet form language; keep the captcha visually integrated, not
bolted on.
