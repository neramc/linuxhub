/**
 * Carousel enhancer for src/components/adw/Carousel.astro (WAI-ARIA APG
 * "basic" carousel). Progressive enhancement: without JS the track is a native
 * scroll-snap row and the controls stay hidden.
 * - It never moves on its own (no auto-rotation, SPEC §17, ADR-0016): only the
 *   arrows, ArrowLeft/Right on the arrows, and swipe/scroll change the slide.
 * - Only the current slide is reachable (the others are `inert`); the dots are
 *   decorative; user-initiated moves are announced in a polite status region.
 * All strings come from data-* attributes rendered by Astro (i18n stays in
 * src/i18n). Left-to-right only: the site has no RTL locale.
 */
function init(root: HTMLElement) {
  const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s) as T;
  const track = q("[data-track]");
  const slides = [...track.children] as HTMLElement[];
  const n = slides.length;
  if (n < 2) return;
  const prev = q("[data-prev]");
  const next = q("[data-next]");
  const status = q("[data-status]");
  const dots = [...root.querySelectorAll<HTMLElement>("[data-dots] > *")];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let index = Math.round(track.scrollLeft / track.clientWidth) || 0;
  let settle = 0;

  const render = (announce: boolean) => {
    slides.forEach((s, i) => {
      s.inert = i !== index;
    });
    dots.forEach((d, i) => {
      d.classList.toggle("current", i === index);
    });
    if (announce)
      status.textContent = (status.dataset.template ?? "")
        .replace("{index}", String(index + 1))
        .replace("{total}", String(n))
        .replace("{name}", slides[index]?.dataset.name ?? "");
  };

  const go = (to: number) => {
    const target = (to + n) % n;
    // Wrapping jumps instead of rewinding through every slide (GNOME Software does the same).
    const far = Math.abs(target - index) > 1;
    track.scrollTo({
      left: target * track.clientWidth,
      behavior: reduce.matches || far ? "auto" : "smooth",
    });
    index = target;
    render(true);
  };

  // Native swipe / trackpad / scrollbar: adopt the slide the user settled on.
  track.addEventListener(
    "scroll",
    () => {
      clearTimeout(settle);
      settle = window.setTimeout(() => {
        const i = Math.round(track.scrollLeft / track.clientWidth);
        if (i !== index) {
          index = i;
          render(true);
        }
      }, 120);
    },
    { passive: true },
  );

  prev.addEventListener("click", () => go(index - 1));
  next.addEventListener("click", () => go(index + 1));
  root.addEventListener("keydown", (e) => {
    // Alt+←/→ stays the browser's back/forward.
    if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || e.altKey || e.ctrlKey || e.metaKey)
      return;
    const t = e.target;
    if (t === prev || t === next) {
      e.preventDefault();
      go(index + (e.key === "ArrowLeft" ? -1 : 1));
    } else if (t instanceof Node && track.contains(t)) {
      // On a slide's link the key would scroll the track, turn this slide
      // inert under the focused link and drop focus to <body>: keep it still.
      e.preventDefault();
    }
  });

  root.classList.add("enhanced");
  render(false);
}

for (const root of document.querySelectorAll<HTMLElement>("[data-carousel]")) init(root);
