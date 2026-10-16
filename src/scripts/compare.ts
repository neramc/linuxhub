/**
 * Swaps comparison columns from the selects and keeps ?d=a,b,c in the URL.
 * Cell values come from #compare-data; column headers (app tile + name) are
 * cloned from the server-rendered <template data-head-template="<slug>">.
 * Unknown ids in ?d= are dropped as before and named in a status caption;
 * with no column chosen, one sentence replaces the table.
 */
type Cell = string | [string, string];
type Cells = Record<string, Record<string, Cell>>;

const root = document.querySelector<HTMLElement>("[data-compare]");
const raw = document.getElementById("compare-data")?.textContent;

/** A plain value, or [emphasized, rest] → "<strong>GNOME</strong>, KDE Plasma and Xfce". */
function fillCell(cell: HTMLElement, value: Cell | undefined) {
  if (!Array.isArray(value)) {
    cell.textContent = value ?? "";
    return;
  }
  const strong = document.createElement("strong");
  strong.textContent = value[0];
  cell.replaceChildren(strong, value[1]);
}

if (root && raw) {
  const cells = JSON.parse(raw) as Cells;
  const selects = [...root.querySelectorAll<HTMLSelectElement>("[data-column] select")];
  const missing = root.querySelector<HTMLElement>("[data-compare-missing]");
  const empty = document.querySelector<HTMLElement>("[data-compare-empty]");
  const table = document.querySelector<HTMLElement>("[data-compare-table]");

  function render(column: number, id: string) {
    const c = cells[id];
    const head = document.querySelector<HTMLElement>(`[data-head="${column}"]`);
    const template = id
      ? document.querySelector<HTMLTemplateElement>(`template[data-head-template="${id}"]`)
      : null;
    head?.replaceChildren(...(c && template ? [template.content.cloneNode(true)] : []));
    // The distro's name labels each cell in the stacked (narrow) layout.
    const name = c ? (selects[column]?.selectedOptions[0]?.text ?? "") : "";
    for (const cell of document.querySelectorAll<HTMLElement>(`[data-cell^="${column}:"]`)) {
      const key = cell.dataset.cell?.split(":")[1] ?? "";
      fillCell(cell, c?.[key]);
      if (name) cell.dataset.name = name;
      else delete cell.dataset.name;
    }
  }

  function sync() {
    const ids = selects.map((s) => s.value);
    for (const [i, id] of ids.entries()) render(i, id);
    const chosen = ids.filter(Boolean);
    if (empty) empty.hidden = chosen.length > 0;
    if (table) table.hidden = !chosen.length;
    history.replaceState(null, "", chosen.length ? `?d=${chosen.join(",")}` : location.pathname);
  }

  const asked = new URLSearchParams(location.search).get("d")?.split(",").filter(Boolean) ?? [];
  const fromUrl = asked.filter((id) => cells[id]);
  const unknown = asked.filter((id) => !cells[id]);
  if (missing && unknown.length) {
    const ids = new Intl.ListFormat(document.documentElement.lang || "en").format(
      unknown.map((id) => `“${id}”`),
    );
    missing.textContent = (missing.dataset.template ?? "").replace("{ids}", ids);
    missing.hidden = false;
  }
  if (fromUrl.length) {
    for (const [i, s] of selects.entries()) s.value = fromUrl[i] ?? "";
    sync();
  }
  for (const s of selects)
    s.addEventListener("change", () => {
      // The note is about the address the page was opened with.
      if (missing) missing.hidden = true;
      sync();
    });
}

export {};
