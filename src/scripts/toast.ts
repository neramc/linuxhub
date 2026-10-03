/**
 * libadwaita AdwToast: a small dark pill at the bottom of the window that
 * announces a transient message (also to screen readers via aria-live).
 */
let region: HTMLElement | null = null;
let timer: number | undefined;

export function toast(message: string, ms = 2500): void {
  if (!region) {
    region = document.createElement("div");
    region.className = "adw-toast";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    document.body.append(region);
  }
  region.textContent = message;
  region.dataset.visible = "";
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    if (region) delete region.dataset.visible;
  }, ms);
}
