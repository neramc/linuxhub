/**
 * Swaps comparison columns from the selects and keeps ?d=a,b,c in the URL.
 * Cell values come from #compare-data; column headers (app tile + name) are
 * cloned from the server-rendered <template data-head-template="<slug>">.
 */
type Cell = string | string[];
type Cells = Record<string, Record<string, Cell>>;

const root = document.querySelector<HTMLElement>("[data-compare]");
const raw = document.getElementById("compare-data")?.textContent;

/** A plain value, or [emphasized, …rest] → "<strong>first</strong> · rest". */
function fillCell(cell: HTMLElement, value: Cell | undefined) {
  if (!Array.isArray(value)) {
    cell.textContent = value ?? "";
    return;
  }
  const [first = "", ...rest] = value;
  const strong = document.createElement("strong");
  strong.textContent = first;
  cell.replaceChildren(strong, ...(rest.length ? [` · ${rest.join(", ")}`] : []));
}

if (root && raw) {
  const cells = JSON.parse(raw) as Cells;
  const selects = [...root.querySelectorAll<HTMLSelectElement>("select[data-column]")];

  function render(column: number, id: string) {
    const c = cells[id];
    const head = document.querySelector<HTMLElement>(`[data-head="${column}"]`);
    const template = id
      ? document.querySelector<HTMLTemplateElement>(`template[data-head-template="${id}"]`)
      : null;
    head?.replaceChildren(...(c && template ? [template.content.cloneNode(true)] : []));
    for (const cell of document.querySelectorAll<HTMLElement>(`[data-cell^="${column}:"]`)) {
      const key = cell.dataset.cell?.split(":")[1] ?? "";
      fillCell(cell, c?.[key]);
    }
  }

  function sync() {
    const ids = selects.map((s) => s.value);
    for (const [i, id] of ids.entries()) render(i, id);
    const chosen = ids.filter(Boolean);
    history.replaceState(null, "", chosen.length ? `?d=${chosen.join(",")}` : location.pathname);
  }

  const fromUrl =
    new URLSearchParams(location.search)
      .get("d")
      ?.split(",")
      .filter((id) => cells[id]) ?? [];
  if (fromUrl.length) {
    for (const [i, s] of selects.entries()) s.value = fromUrl[i] ?? "";
    sync();
  }
  for (const s of selects) s.addEventListener("change", sync);
}

export {};
