/**
 * libadwaita AdwToast: a small dark pill at the bottom of the window that
 * confirms an action whose result is otherwise invisible (SPEC §12). The live
 * region (`[data-toast]`, role="status") is rendered empty by Base.astro, so
 * the first message is announced as well. One message at a time: a new one
 * replaces the current one and restarts its 4 s.
 */
const SHOWN_MS = 4000;
/** Past the fade-out (--duration), the region is emptied again. */
const FADE_MS = 250;

let hideTimer: number | undefined;
let clearTimer: number | undefined;

export function toast(message: string): void {
  const region = document.querySelector<HTMLElement>("[data-toast]");
  if (!region) return;
  window.clearTimeout(hideTimer);
  window.clearTimeout(clearTimer);
  region.textContent = message;
  region.dataset.visible = "";
  hideTimer = window.setTimeout(() => {
    delete region.dataset.visible;
    // No stale message stays in the page for a screen reader to find later.
    clearTimer = window.setTimeout(() => region.replaceChildren(), FADE_MS);
  }, SHOWN_MS);
}
