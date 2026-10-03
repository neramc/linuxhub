/** Swaps comparison columns from the selects and keeps ?d=a,b,c in the URL. */
type Cells = Record<string, Record<string, string> & { name: string; logo: string; href: string }>;

const root = document.querySelector<HTMLElement>("[data-compare]");
const raw = document.getElementById("compare-data")?.textContent;

if (root && raw) {
  const cells = JSON.parse(raw) as Cells;
  const selects = [...root.querySelectorAll<HTMLSelectElement>("select[data-column]")];

  function render(column: number, id: string) {
    const c = cells[id];
    const head = document.querySelector<HTMLElement>(`[data-head="${column}"]`);
    if (head) {
      head.replaceChildren();
      if (c) {
        const a = document.createElement("a");
        a.className = "head-link";
        a.href = c.href;
        const img = document.createElement("img");
        img.src = c.logo;
        img.alt = "";
        img.width = 48;
        img.height = 48;
        const name = document.createElement("span");
        name.textContent = c.name;
        a.append(img, name);
        head.append(a);
      }
    }
    for (const cell of document.querySelectorAll<HTMLElement>(`[data-cell^="${column}:"]`)) {
      const key = cell.dataset.cell?.split(":")[1] ?? "";
      cell.textContent = c?.[key] ?? "";
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
