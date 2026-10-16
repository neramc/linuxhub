/**
 * Client-side filtering/sorting for the catalog grid; state lives in the URL
 * query. Also keeps the "Filters" disclosure (active-filter count, auto-open
 * when the URL carries facets the chip row cannot show), the Reset button
 * (disabled, never hidden, while nothing is set), the empty state (names the
 * query) and the use-case chip row (current chip, in-place filtering) in sync
 * with the form.
 */
const form = document.querySelector<HTMLFormElement>("[data-filters]");
const grid = document.querySelector<HTMLElement>("[data-grid]");
const empty = document.querySelector<HTMLElement>("[data-empty]");
const emptyTitle = empty?.querySelector<HTMLElement>("[data-empty-title]");
const counter = document.querySelector<HTMLElement>("[data-count]");
const panel = document.querySelector<HTMLDetailsElement>("[data-filter-panel]");
const chips = [...document.querySelectorAll<HTMLAnchorElement>("[data-use-chips] [data-use-chip]")];

const KEYS = ["q", "use", "family", "desktop", "model", "level", "sort"] as const;
const FACETS = ["use", "family", "desktop", "model", "level"] as const;
type Key = (typeof KEYS)[number];

/**
 * Lowercases and drops one trailing Korean particle per word, so "우분투를"
 * matches "우분투". Kept identical to normalize() in search.ts: a shared
 * module would be one more request on every page (ADR-0016, C19).
 */
function normalize(q: string): string {
  return q
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/(은|는|이|가|을|를|의|에|에서|으로|로|와|과|도)$/u, ""))
    .join(" ");
}

if (form && grid) {
  const items = [...grid.querySelectorAll<HTMLElement>("[data-distro]")];
  const field = (name: Key) =>
    form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
  const template = grid.dataset.countLabel ?? "{count}";
  const summary = panel?.querySelector<HTMLElement>("summary");
  const badge = panel?.querySelector<HTMLElement>("[data-filter-count]");
  const badgeLabel = panel?.querySelector<HTMLElement>("[data-filter-count-label]");
  // The toolbar's Reset (the empty state's own is outside the form).
  const toolbarReset = form.querySelector<HTMLElement>("[data-reset]");
  const titleText = emptyTitle?.textContent?.trim() ?? "";

  const read = (): Record<Key, string> =>
    Object.fromEntries(KEYS.map((k) => [k, field(k)?.value ?? ""])) as Record<Key, string>;

  function syncChrome(state: Record<Key, string>) {
    const active = FACETS.filter((k) => state[k]).length;
    if (badge) {
      badge.hidden = active === 0;
      badge.textContent = String(active);
    }
    if (badgeLabel)
      badgeLabel.textContent = active
        ? (summary?.dataset.activeLabel ?? "").replace("{count}", String(active))
        : "";
    // Stays focusable when disabled, so a keyboard reset keeps its focus.
    toolbarReset?.setAttribute("aria-disabled", String(!KEYS.some((k) => state[k])));
    for (const chip of chips) {
      if ((chip.dataset.useChip ?? "") === state.use) chip.setAttribute("aria-current", "page");
      else chip.removeAttribute("aria-current");
    }
  }

  function apply(updateUrl: boolean) {
    const state = read();
    const q = normalize(state.q);
    let shown = 0;
    for (const item of items) {
      const d = item.dataset;
      const ok =
        (!q || (d.search ?? "").includes(q)) &&
        (!state.use || (d.use ?? "").split(" ").includes(state.use)) &&
        (!state.family || d.family === state.family) &&
        (!state.desktop || (d.desktop ?? "").split(" ").includes(state.desktop)) &&
        (!state.model || d.model === state.model) &&
        (!state.level || d.level === state.level);
      item.hidden = !ok;
      if (ok) shown++;
    }
    const sorted = [...items].sort((a, b) => {
      if (state.sort === "name") return (a.dataset.name ?? "").localeCompare(b.dataset.name ?? "");
      if (state.sort === "updated")
        return (b.dataset.updated ?? "").localeCompare(a.dataset.updated ?? "");
      return Number(a.dataset.order) - Number(b.dataset.order);
    });
    grid?.append(...sorted);
    if (empty) empty.hidden = shown > 0;
    if (emptyTitle && !shown) {
      const query = state.q.trim();
      emptyTitle.textContent = query
        ? (emptyTitle.dataset.queryTemplate ?? "").replace("{query}", query)
        : titleText;
    }
    if (counter) counter.textContent = template.replace("{count}", String(shown));
    syncChrome(state);
    if (updateUrl) {
      const params = new URLSearchParams();
      for (const k of KEYS) if (state[k]) params.set(k, state[k]);
      const qs = params.toString();
      history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
    }
  }

  // Initial state from the URL (links like /distros/?use=gaming).
  const params = new URLSearchParams(location.search);
  for (const k of KEYS) {
    const el = field(k);
    const v = params.get(k);
    if (el && v) el.value = v;
  }
  // Show the filters when the URL sets something the chip row cannot show.
  const chipUses = new Set(chips.map((c) => c.dataset.useChip ?? ""));
  const state = read();
  if (
    panel &&
    (state.sort || FACETS.some((k) => state[k] && (k !== "use" || !chipUses.has(state.use))))
  )
    panel.open = true;
  apply(false);

  form.addEventListener("input", () => apply(true));
  form.addEventListener("submit", (e) => e.preventDefault());
  for (const chip of chips) {
    chip.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      const use = field("use");
      if (use) use.value = chip.dataset.useChip ?? "";
      apply(true);
    });
  }
  for (const reset of document.querySelectorAll<HTMLElement>("[data-reset]")) {
    reset.addEventListener("click", () => {
      if (reset.getAttribute("aria-disabled") === "true") return;
      form.reset();
      apply(true);
      // The empty state's button disappears with the empty state: the
      // search entry takes the focus instead of the page.
      if (empty?.contains(reset)) field("q")?.focus();
    });
  }
  // The entry's own clear button: empty it, filter again, keep typing.
  form.querySelector("[data-entry-clear]")?.addEventListener("click", () => {
    const q = field("q");
    if (!q) return;
    q.value = "";
    q.dispatchEvent(new Event("input", { bubbles: true }));
    q.focus();
  });
}

export {};
