/** Opens the search dialog and queries Pagefind (loaded lazily on first open). */

interface PagefindResult {
  data: () => Promise<{ url: string; excerpt: string; meta: { title?: string } }>;
}
interface Pagefind {
  init: () => Promise<void>;
  debouncedSearch: (
    q: string,
    opts?: object,
    ms?: number,
  ) => Promise<{ results: PagefindResult[] } | null>;
}

const dialog = document.querySelector<HTMLDialogElement>("#search-dialog");
const input = dialog?.querySelector<HTMLInputElement>("[data-search-input]");
const list = dialog?.querySelector<HTMLUListElement>("[data-search-results]");
const status = dialog?.querySelector<HTMLElement>("[data-search-status]");
const labels = JSON.parse(dialog?.dataset.labels ?? "{}") as Record<string, string>;
let pagefind: Promise<Pagefind> | null = null;

/** Drop a trailing Korean particle so "우분투를" matches "우분투". */
function normalize(q: string): string {
  return q
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/(은|는|이|가|을|를|의|에|에서|으로|로|와|과|도)$/u, ""))
    .join(" ");
}

function load(): Promise<Pagefind> {
  pagefind ??= import(/* @vite-ignore */ `${location.origin}/pagefind/pagefind.js`).then(
    async (pf: Pagefind) => {
      await pf.init();
      return pf;
    },
  );
  return pagefind;
}

function open() {
  if (!dialog || !input) return;
  if (!dialog.open) dialog.showModal();
  input.focus();
  input.select();
  void load();
}

async function search() {
  if (!input || !list || !status) return;
  const q = normalize(input.value);
  if (!q) {
    list.replaceChildren();
    return;
  }
  status.textContent = labels.loading ?? "";
  const pf = await load();
  const res = await pf.debouncedSearch(q, {}, 150);
  if (!res) return; // superseded by a newer query
  const top = await Promise.all(res.results.slice(0, 8).map((r) => r.data()));
  list.replaceChildren(
    ...top.map((r) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = r.url;
      const title = document.createElement("span");
      title.className = "result-title";
      title.textContent = r.meta.title ?? r.url;
      const excerpt = document.createElement("span");
      excerpt.className = "result-excerpt";
      excerpt.innerHTML = r.excerpt; // Pagefind escapes page text; only <mark> is added.
      a.append(title, excerpt);
      li.append(a);
      return li;
    }),
  );
  status.textContent = top.length
    ? (labels.results ?? "").replace("{count}", String(res.results.length))
    : (labels.noResults ?? "").replace("{query}", input.value.trim());
}

for (const trigger of document.querySelectorAll("[data-search-open]"))
  trigger.addEventListener("click", open);
input?.addEventListener("input", () => void search());
document.addEventListener("keydown", (e) => {
  const typing =
    e.target instanceof HTMLElement &&
    e.target.closest("input, textarea, select, [contenteditable]");
  if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
    e.preventDefault();
    open();
  }
});
// Arrow keys move between results; Enter follows the link (native).
dialog?.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const links = [...(list?.querySelectorAll<HTMLAnchorElement>("a") ?? [])];
  if (!links.length) return;
  e.preventDefault();
  const i = links.indexOf(document.activeElement as HTMLAnchorElement);
  const next = e.key === "ArrowDown" ? Math.min(i + 1, links.length - 1) : i <= 0 ? -1 : i - 1;
  if (next === -1) input?.focus();
  else links[next]?.focus();
});
dialog?.addEventListener("click", (e) => {
  if (e.target === dialog) dialog.close(); // backdrop click
});

export {};
