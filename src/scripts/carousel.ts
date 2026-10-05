/**
 * Carousel enhancer for src/components/adw/Carousel.astro (WAI-ARIA APG
 * "basic" carousel with auto-rotation). Progressive enhancement: without JS
 * the track is a native scroll-snap row and the controls stay hidden.
 * - Rotates every 8 s while the carousel is on screen and the tab is visible;
 *   mouse hover pauses it, keyboard focus stops it until the user restarts it,
 *   and prefers-reduced-motion starts it stopped.
 * - Only the current slide is reachable (the others are `inert`); the dots are
 *   decorative; user-initiated moves are announced in a polite status region.
 * All strings come from data-* attributes rendered by Astro (i18n stays in
 * src/i18n). Left-to-right only: the site has no RTL locale.
 */
const DELAY = 8000;

function init(root: HTMLElement) {
  const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s) as T;
  const track = q("[data-track]");
  const slides = [...track.children] as HTMLElement[];
  const n = slides.length;
  if (n < 2) return;
  const rotate = q<HTMLButtonElement>("[data-rotate]");
  const status = q("[data-status]");
  const dots = [...root.querySelectorAll<HTMLElement>("[data-dots] > *")];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let index = Math.round(track.scrollLeft / track.clientWidth) || 0;
  let playing = !reduce.matches;
  let hover = false;
  let onScreen = true;
  let timer = 0;
  let settle = 0;

  const schedule = () => {
    clearTimeout(timer);
    if (playing && !hover && onScreen && !document.hidden)
      timer = window.setTimeout(() => go(index + 1, false), DELAY);
  };

  const render = (announce: boolean) => {
    slides.forEach((s, i) => {
      s.inert = i !== index;
    });
    dots.forEach((d, i) => {
      d.classList.toggle("current", i === index);
    });
    const label = rotate.dataset[playing ? "stop" : "start"] ?? "";
    rotate.setAttribute("aria-label", label);
    rotate.title = label;
    rotate.classList.toggle("playing", playing);
    if (announce)
      status.textContent = (status.dataset.template ?? "")
        .replace("{index}", String(index + 1))
        .replace("{total}", String(n))
        .replace("{name}", slides[index]?.dataset.name ?? "");
  };

  function go(to: number, user: boolean) {
    const next = (to + n) % n;
    // Wrapping jumps instead of rewinding through every slide (GNOME Software does the same).
    const far = Math.abs(next - index) > 1;
    track.scrollTo({
      left: next * track.clientWidth,
      behavior: reduce.matches || far ? "auto" : "smooth",
    });
    index = next;
    render(user);
    schedule();
  }

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
          schedule();
        }
      }, 120);
    },
    { passive: true },
  );

  rotate.addEventListener("click", () => {
    playing = !playing;
    render(false);
    schedule();
  });
  q("[data-prev]").addEventListener("click", () => go(index - 1, true));
  q("[data-next]").addEventListener("click", () => go(index + 1, true));
  root.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      go(index + (e.key === "ArrowLeft" ? -1 : 1), true);
    }
  });
  // APG: keyboard focus stops rotation until the user restarts it; mouse hover only pauses.
  root.addEventListener("focusin", (e) => {
    if ((e.target as HTMLElement).matches(":focus-visible") && playing) {
      playing = false;
      render(false);
      schedule();
    }
  });
  root.addEventListener("pointerenter", (e) => {
    if (e.pointerType === "mouse") {
      hover = true;
      schedule();
    }
  });
  root.addEventListener("pointerleave", () => {
    hover = false;
    schedule();
  });
  document.addEventListener("visibilitychange", schedule);
  new IntersectionObserver(
    ([entry]) => {
      onScreen = !!entry?.isIntersecting;
      schedule();
    },
    { threshold: 0.5 },
  ).observe(root);
  reduce.addEventListener("change", () => {
    if (reduce.matches) playing = false;
    render(false);
    schedule();
  });

  root.classList.add("enhanced");
  render(false);
  schedule();
}

for (const root of document.querySelectorAll<HTMLElement>("[data-carousel]")) init(root);
