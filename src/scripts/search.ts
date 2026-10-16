/**
 * Opens the search dialog and queries Pagefind (loaded lazily on first open).
 * Results are grouped by the page's `type` meta (distro / install / guide);
 * groups are ordered by their best-ranked result. Enter in the entry opens the
 * first result for what is typed (it waits for a search still running). A
 * failed or slow (8 s) index load says so in the status line, with
 * [Try again] and the catalog link under it; the next search or [Try again]
 * loads it again (SPEC §14, §16).
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
  truncated: string;
  error: string;
  groups: Record<Group, string>;
}

/** Results shown, and results fetched to re-rank from. */
const MAX_RESULTS = 10;
const FETCHED = 14;
const dialog = document.querySelector<HTMLDialogElement>("#search-dialog");
const input = dialog?.querySelector<HTMLInputElement>("[data-search-input]");
const list = dialog?.querySelector<HTMLElement>("[data-search-results]");
const status = dialog?.querySelector<HTMLElement>("[data-search-status]");
const actions = dialog?.querySelector<HTMLElement>("[data-search-actions]");
const retry = actions?.querySelector<HTMLElement>("[data-search-retry]");
const labels = JSON.parse(dialog?.dataset.labels ?? "{}") as Labels;
const hint = status?.textContent ?? "";
let pagefind: Promise<Pagefind> | null = null;
let attempt = 0;

/**
 * Lowercases and drops one trailing Korean particle per word, so "우분투를"
 * matches "우분투". Kept identical to normalize() in catalog-filter.ts: a
 * shared module would be one more request on every page (ADR-0016, C19).
 */
function normalize(q: string): string {
  return q
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/(은|는|이|가|을|를|의|에|에서|으로|로|와|과|도)$/u, ""))
    .join(" ");
}

/**
 * Pagefind, loaded once. A failed or timed-out load is forgotten, so the next
 * call tries again, from a fresh URL: the browser keeps a failed module fetch
 * for the page's lifetime.
 */
function load(): Promise<Pagefind> {
  if (pagefind) return pagefind;
  const url = `${location.origin}/pagefind/pagefind.js${attempt ? `?retry=${attempt}` : ""}`;
  const loading = Promise.race([
    import(/* @vite-ignore */ url).then(async (pf: Pagefind) => {
      await pf.options({ excerptLength: 16 });
      await pf.init();
      return pf;
    }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
  ]);
  pagefind = loading;
  loading.catch(() => {
    if (pagefind === loading) {
      pagefind = null;
      attempt++;
    }
  });
  return loading;
}

function open() {
  if (!dialog || !input) return;
  if (!dialog.open) dialog.showModal();
  input.focus();
  input.select();
  load().catch(() => {}); // a failure shows once the visitor searches
}

/** Kept identical to el() in finder.ts (ADR-0016, C19). */
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
  const a = el("a", "adw-nav-row");
  a.href = r.url;
  a.append(
    group === "distro" || (group === "install" && r.meta.image)
      ? tile(r.meta.image ?? "")
      : icon(group),
  );
  const text = el("span", "adw-row-text");
  text.append(el("span", "adw-row-title result-title", r.meta.title ?? r.url));
  const subtitle = el("span", "adw-row-subtitle result-subtitle");
  if (group === "distro" && r.meta.tagline) subtitle.textContent = r.meta.tagline;
  else subtitle.innerHTML = focusExcerpt(r.excerpt, r.meta.title ?? ""); // escaped text + <mark> only
  if (subtitle.textContent) text.append(subtitle);
  a.append(text);
  li.append(a);
  return li;
}

/**
 * One state at a time: the status sentence and, after no result or an error,
 * the ways out under it ([Try again] only after an error).
 */
function show(text: string, state?: "error" | "empty") {
  if (status) status.textContent = text;
  status?.parentElement?.toggleAttribute("data-error", state === "error");
  if (actions) actions.hidden = !state;
  if (retry) retry.hidden = state !== "error";
}

let generation = 0;
let slow = 0;
/** The latest search, which Enter waits for. */
let latest: Promise<void> = Promise.resolve();
async function search() {
  if (!input || !list) return;
  const q = normalize(input.value);
  const current = ++generation;
  clearTimeout(slow);
  if (!q) {
    list.removeAttribute("aria-busy");
    list.replaceChildren();
    show(hint);
    return;
  }
  // Say "searching" only when it takes a while (SPEC §14).
  slow = window.setTimeout(() => {
    list.setAttribute("aria-busy", "true");
    show(labels.loading ?? "");
  }, 300);
  try {
    const pf = await load();
    const res = await pf.debouncedSearch(q, {}, 150);
    if (!res || current !== generation) return; // superseded by a newer query
    const fetched = await Promise.all(res.results.slice(0, FETCHED).map((r) => r.data()));
    if (current !== generation) return;
    // Pagefind ranks short pages that mention a name above the page *about*
    // it ("ubuntu" → Zorin OS first). Lift titles that are or start with the
    // query, the distro page before its install guide.
    const titleRank = (r: PagefindData) => {
      const title = (r.meta.title ?? "").toLowerCase();
      if (title === q) return 0;
      if (title.startsWith(q)) return groupOf(r) === "distro" ? 1 : 2;
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
        const heading = el(
          "h3",
          "search-group-title caption-heading dim-label",
          labels.groups?.[group] ?? "",
        );
        heading.id = `search-group-${i}`;
        section.setAttribute("aria-labelledby", heading.id);
        const ul = el("ul");
        ul.setAttribute("role", "list");
        ul.append(...items.map((r) => row(r, group)));
        section.append(heading, ul);
        return section;
      }),
    );
    const total = String(res.results.length);
    if (!top.length) show((labels.noResults ?? "").replace("{query}", input.value.trim()), "empty");
    else if (res.results.length > top.length)
      show(
        (labels.truncated ?? "").replace("{count}", total).replace("{shown}", String(top.length)),
      );
    else show((labels.results ?? "").replace("{count}", total));
  } catch {
    if (current !== generation) return;
    list.replaceChildren();
    show(labels.error ?? "", "error");
  } finally {
    if (current === generation) {
      clearTimeout(slow);
      list.removeAttribute("aria-busy");
    }
  }
}

for (const trigger of document.querySelectorAll("[data-search-open]"))
  trigger.addEventListener("click", open);
dialog?.querySelector("[data-search-close]")?.addEventListener("click", () => dialog.close());
input?.addEventListener("input", () => {
  latest = search();
});
// Not while an IME is composing (Korean: WebKit reports the committing key
// as the legacy keyCode 229). Esc closes the dialog at once, also with text
// in the entry, which a search field would only clear (SPEC §11). Enter opens
// the first result of the query as typed, once its search is done (never the
// previous query's list).
input?.addEventListener("keydown", (e) => {
  if (e.isComposing || (e as { keyCode?: number }).keyCode === 229) return;
  if (e.key === "Escape") {
    e.preventDefault();
    dialog?.close();
  }
  if (e.key !== "Enter") return;
  e.preventDefault();
  const asked = generation;
  void latest.then(() => {
    if (asked === generation) list?.querySelector("a")?.click();
  });
});
// The entry's own clear button: empty it, search again, keep typing.
dialog?.querySelector("[data-entry-clear]")?.addEventListener("click", () => {
  if (!input) return;
  input.value = "";
  input.focus();
  latest = search();
});
// [Try again] hides with the actions: the entry takes the focus first.
retry?.addEventListener("click", () => {
  input?.focus();
  show(labels.loading ?? "");
  latest = search();
});
// Ctrl/⌘+K only: no single-key shortcut (WCAG 2.1.4).
document.addEventListener("keydown", (e) => {
  if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    open();
  }
});
// Arrow keys move between results; Enter on a result follows the link (native).
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
// Backdrop click: only outside the dialog's box. Below 600px the dialog is a
// full-height sheet whose empty lower part is the <dialog> element itself,
// and a tap there (e.g. to dismiss the keyboard) must not close search.
dialog?.addEventListener("click", (e) => {
  if (e.target !== dialog) return;
  const r = dialog.getBoundingClientRect();
  const inside =
    e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  if (!inside) dialog.close();
});

export {};
