import { type FinderAnswers, type FinderDistro, type Reason, recommend } from "~/lib/finder";

type Item = FinderDistro & { tagline: string; logo: string; href: string };

const form = document.querySelector<HTMLFormElement>("[data-finder]");
const results = document.querySelector<HTMLElement>("[data-results]");
const list = document.querySelector<HTMLOListElement>("[data-result-list]");
const raw = document.getElementById("finder-data")?.textContent;

if (form && results && list && raw) {
  const { distros, reasons } = JSON.parse(raw) as {
    distros: Item[];
    reasons: Record<Reason, string>;
  };

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const answers: FinderAnswers = {
      experience: (data.get("experience") as FinderAnswers["experience"]) ?? undefined,
      uses: data.getAll("uses") as string[],
      hardware: (data.get("hardware") as FinderAnswers["hardware"]) ?? undefined,
      look: (data.get("look") as FinderAnswers["look"]) ?? undefined,
      updates: (data.get("updates") as FinderAnswers["updates"]) ?? undefined,
      privacy: (data.get("privacy") as FinderAnswers["privacy"]) ?? undefined,
    };
    const top = recommend(distros, answers, 3);
    list.replaceChildren(
      ...top.map((r, i) => {
        const item = r.distro as Item;
        const li = el("li");
        const a = el("a", "adw-card activatable");
        a.setAttribute("href", item.href);
        const img = el("img");
        img.src = item.logo;
        img.alt = "";
        img.width = 64;
        img.height = 64;
        const text = el("div");
        const title = el("p");
        title.append(el("span", "result-rank", `${i + 1}. `), el("span", "result-name", item.name));
        const badges = el("div", "result-reasons");
        for (const reason of r.reasons)
          badges.append(el("span", "adw-badge accent", reasons[reason]));
        text.append(title, el("p", "dim-label", item.tagline), badges);
        a.append(img, text);
        li.append(a);
        return li;
      }),
    );
    const compare = results.querySelector<HTMLAnchorElement>("[data-compare-link]");
    if (compare)
      compare.href = `${form.dataset.compare}?d=${top.map((r) => r.distro.id).join(",")}`;
    results.hidden = false;
    results.querySelector<HTMLElement>("h2")?.focus();
    results.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  });

  results.querySelector("[data-restart]")?.addEventListener("click", () => {
    form.reset();
    results.hidden = true;
    window.scrollTo({ top: 0 });
  });
}
