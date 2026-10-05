/**
 * Opens the search dialog and queries Pagefind (loaded lazily on first open).
 * Results are grouped by the page's `type` meta (distro / install / guide);
 * groups are ordered by their best-ranked result.
 */

interface PagefindData {
  url: string;
  excerpt: string;
  meta: { title?: string; type?: string; tagline?: string; image?: string };
}
interface PagefindResult {
  data: () => Promise<PagefindData>;
}
interface Pagefind {
  init: () => Promise<void>;
  options: (opts: { excerptLength?: number }) => Promise<void>;
  debouncedSearch: (
    q: string,
    opts?: object,
    ms?: number,
  ) => Promise<{ results: PagefindResult[] } | null>;
}

type Group = "distro" | "install" | "guide" | "other";
interface Labels {
  noResults: string;
  loading: string;
  results: string;
  groups: Record<Group, string>;
}

/** Results shown, and results fetched to re-rank from. */
const MAX_RESULTS = 10;
const FETCHED = 14;
const dialog = document.querySelector<HTMLDialogElement>("#search-dialog");
const input = dialog?.querySelector<HTMLInputElement>("[data-search-input]");
const list = dialog?.querySelector<HTMLElement>("[data-search-results]");
const status = dialog?.querySelector<HTMLElement>("[data-search-status]");
const labels = JSON.parse(dialog?.dataset.labels ?? "{}") as Labels;
const hint = status?.textContent ?? "";
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
      await pf.options({ excerptLength: 16 });
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

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
};

function groupOf(r: PagefindData): Group {
  const type = r.meta.type;
  return type === "distro" || type === "install" || type === "guide" ? type : "other";
}

/** The logo on a 36px app tile (the same markup as AppTile.astro). */
function tile(src: string): HTMLElement {
  const wrap = el("span", "app-tile size-36");
  const img = el("img");
  img.src = src;
  img.alt = "";
  img.width = 27;
  img.height = 27;
  img.decoding = "async";
  // Wordmark logos use the wider logo box, as DistroLogo does at build time.
  img.addEventListener("load", () => {
    if (img.naturalHeight && img.naturalWidth / img.naturalHeight >= 2) wrap.classList.add("wide");
  });
  wrap.append(img);
  return wrap;
}

function icon(group: Group): Node {
  const template = dialog?.querySelector<HTMLTemplateElement>(
    `template[data-search-icon="${group}"]`,
  );
  return template ? template.content.cloneNode(true) : el("span", "result-icon");
}

/**
 * Start a one-line excerpt just before its first match, so the highlighted
 * word is visible even when the line is cut off with an ellipsis. Pagefind
 * escapes the page text; the only markup is <mark>.
 */
function focusExcerpt(html: string, title: string): string {
  // Pagefind's excerpt often opens with the page title ("Fedora Linux 설치
  // 가이드. 설치 프로그램: …"); the title is already the row's first line.
  const stop = html.indexOf(". ");
  if (stop > 0) {
    const lead = html
      .slice(0, stop)
      .replace(/<\/?mark>/g, "")
      .replace(/^…\s*/, "")
      .trim();
    if (lead && title.toLowerCase().includes(lead.toLowerCase())) html = html.slice(stop + 2);
  }
  const at = html.indexOf("<mark>");
  if (at < 0) return html;
  const before = html.slice(0, at).split(/\s+/);
  return before.length > 3 ? `… ${before.slice(-3).join(" ")}${html.slice(at)}` : html;
}

function row(r: PagefindData, group: Group): HTMLLIElement {
  const li = el("li");
  const a = el("a");
  a.href = r.url;
  a.append(
    group === "distro" || (group === "install" && r.meta.image)
      ? tile(r.meta.image ?? "")
      : icon(group),
  );
  const text = el("span", "result-text");
  text.append(el("span", "result-title", r.meta.title ?? r.url));
  const subtitle = el("span", "result-subtitle");
  if (group === "distro" && r.meta.tagline) subtitle.textContent = r.meta.tagline;
  else subtitle.innerHTML = focusExcerpt(r.excerpt, r.meta.title ?? ""); // escaped text + <mark> only
  if (subtitle.textContent) text.append(subtitle);
  a.append(text);
  li.append(a);
  return li;
}

let generation = 0;
async function search() {
  if (!input || !list || !status) return;
  const q = normalize(input.value);
  const current = ++generation;
  if (!q) {
    list.replaceChildren();
    status.textContent = hint;
    return;
  }
  status.textContent = labels.loading ?? "";
  const pf = await load();
  const res = await pf.debouncedSearch(q, {}, 150);
  if (!res || current !== generation) return; // superseded by a newer query
  const fetched = await Promise.all(res.results.slice(0, FETCHED).map((r) => r.data()));
  if (current !== generation) return;
  // Pagefind ranks short pages that mention a name above the page *about*
  // it ("ubuntu" → Zorin OS first). Lift titles that are or start with the
  // query, the distro page before its install guide.
  const needle = q.toLowerCase();
  const titleRank = (r: PagefindData) => {
    const title = (r.meta.title ?? "").toLowerCase();
    if (title === needle) return 0;
    if (title.startsWith(needle)) return groupOf(r) === "distro" ? 1 : 2;
    return 3;
  };
  const top = fetched
    .map((r, i) => ({ r, i, f: titleRank(r) }))
    .sort((a, b) => a.f - b.f || a.i - b.i)
    .slice(0, MAX_RESULTS)
    .map((x) => x.r);
  // Group by type; a group's position is its best-ranked result's position.
  const groups = new Map<Group, PagefindData[]>();
  for (const r of top) {
    const g = groupOf(r);
    groups.set(g, [...(groups.get(g) ?? []), r]);
  }
  list.replaceChildren(
    ...[...groups].map(([group, items], i) => {
      const section = el("section", "search-group");
      const heading = el("h2", "search-group-title", labels.groups?.[group] ?? "");
      heading.id = `search-group-${i}`;
      section.setAttribute("aria-labelledby", heading.id);
      const ul = el("ul");
      ul.setAttribute("role", "list");
      ul.append(...items.map((r) => row(r, group)));
      section.append(heading, ul);
      return section;
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
