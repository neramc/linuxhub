/** Client-side filtering/sorting for the catalog grid; state lives in the URL query. */
const form = document.querySelector<HTMLFormElement>("[data-filters]");
const grid = document.querySelector<HTMLElement>("[data-grid]");
const empty = document.querySelector<HTMLElement>("[data-empty]");
const counter = document.querySelector<HTMLElement>("[data-count]");

const KEYS = ["q", "use", "family", "desktop", "model", "level", "sort"] as const;
type Key = (typeof KEYS)[number];

/** Very small Korean-aware normalization: lowercase, strip common particles. */
function normalize(q: string): string {
  return q
    .toLowerCase()
    .trim()
    .replace(/(은|는|이|가|을|를|의|에|에서|으로|로|와|과)$/u, "");
}

if (form && grid) {
  const items = [...grid.querySelectorAll<HTMLElement>("[data-distro]")];
  const field = (name: Key) =>
    form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
  const template = grid.dataset.countLabel ?? "{count}";

  const read = (): Record<Key, string> =>
    Object.fromEntries(KEYS.map((k) => [k, field(k)?.value ?? ""])) as Record<Key, string>;

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
    if (counter) counter.textContent = template.replace("{count}", String(shown));
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
  apply(false);

  form.addEventListener("input", () => apply(true));
  form.addEventListener("submit", (e) => e.preventDefault());
  document.querySelector("[data-reset]")?.addEventListener("click", () => {
    form.reset();
    apply(true);
  });
}

export {};
