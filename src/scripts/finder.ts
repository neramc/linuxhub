/**
 * Distro finder: scores the catalog with src/lib/finder.ts and shows the top
 * three as clones of the server-rendered ActionRow <template id="finder-row">,
 * filled with the distro's tile (from <template id="finder-tiles">), name and
 * tagline. Each row explains itself in one dim line
 * of up to three concrete reasons, joined as a list ("Good for gaming, KDE
 * Plasma desktop and long-term support"), preferring reasons that differ
 * between the results.
 */
import {
  type FinderAnswers,
  type FinderDistro,
  type FinderResult,
  type Reason,
  recommend,
  scoreDistro,
} from "~/lib/finder";

/** A finder-data entry: the scoring attributes plus the row's tagline. */
type Item = FinderDistro & { tagline: string };

interface Why {
  label: string;
  experience: Record<FinderDistro["difficulty"], string>;
  use: string;
  uses: Record<string, string>;
  hardware: string;
  look: string;
  desktops: Record<string, string>;
  updates: Record<FinderDistro["releaseModel"], string>;
  privacy: string;
}

const form = document.querySelector<HTMLFormElement>("[data-finder]");
const results = document.querySelector<HTMLElement>("[data-results]");
const list = document.querySelector<HTMLOListElement>("[data-result-list]");
const rowTemplate = document.querySelector<HTMLTemplateElement>("#finder-row");
const tiles = document.querySelector<HTMLTemplateElement>("#finder-tiles");
const check = document.querySelector<HTMLTemplateElement>("#finder-check");
const raw = document.getElementById("finder-data")?.textContent;

/** Most telling reasons first. */
const PRIORITY: Reason[] = ["use", "privacy", "hardware", "look", "updates", "experience"];

if (form && results && list && raw) {
  const { distros, why } = JSON.parse(raw) as { distros: Item[]; why: Why };
  const lang = document.documentElement.lang || "en";
  const listFormat = new Intl.ListFormat(lang, { style: "long", type: "conjunction" });
  /** Use-case labels are title-cased ("Gaming"); inside a phrase they are not. */
  const midSentence = (label: string) =>
    lang.startsWith("en") ? label.charAt(0).toLowerCase() + label.slice(1) : label;

  /** Kept identical to el() in search.ts (ADR-0016, C19). */
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  };

  /** The desktop that earned the "look" points: the default one if it fits. */
  const lookDesktop = (d: FinderDistro, look: FinderAnswers["look"]) =>
    d.desktops.find((x) => scoreDistro({ ...d, desktops: [x] }, { look }).reasons.includes("look"));

  /** One short phrase per matched reason, in PRIORITY order. */
  function phrases(r: FinderResult, a: FinderAnswers): string[] {
    const d = r.distro;
    const out: string[] = [];
    for (const reason of PRIORITY) {
      if (!r.reasons.includes(reason)) continue;
      if (reason === "use") {
        // "Everyday desktop" fits nearly every distro: name it only when alone.
        const all = (a.uses ?? []).filter((u) => d.useCases.includes(u));
        const matched = all.length > 1 ? all.filter((u) => u !== "desktop") : all;
        if (matched.length)
          out.push(
            why.use.replace(
              "{uses}",
              listFormat.format(matched.map((u) => midSentence(why.uses[u] ?? u))),
            ),
          );
      } else if (reason === "privacy") out.push(why.privacy);
      else if (reason === "hardware") out.push(why.hardware.replace("{ram}", String(d.ramGB)));
      else if (reason === "look") {
        const desktop = lookDesktop(d, a.look);
        if (desktop) out.push(why.look.replace("{desktop}", why.desktops[desktop] ?? desktop));
      } else if (reason === "updates") out.push(why.updates[d.releaseModel]);
      else if (reason === "experience") out.push(why.experience[d.difficulty]);
    }
    return out;
  }

  /** Up to three phrases per result, dropping ones every result shares. */
  function explain(top: FinderResult[], a: FinderAnswers): string[][] {
    const all = top.map((r) => phrases(r, a));
    return all.map((mine) => {
      const distinct = mine.filter(
        (p) => all.length < 2 || !all.every((other) => other.includes(p)),
      );
      const picked =
        distinct.length >= 2
          ? distinct
          : [...distinct, ...mine.filter((p) => !distinct.includes(p))];
      return picked.slice(0, 3);
    });
  }

  /** The distro's row (an <li>): link, tile (loaded now that it is shown), name, tagline. */
  function row(d: Item): HTMLElement | undefined {
    const li = rowTemplate?.content.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
    const a = li?.querySelector("a");
    if (!li || !a) return undefined;
    a.setAttribute("href", `${a.getAttribute("href")}${d.id}/`);
    const tile = tiles?.content.querySelector(`[data-tile="${CSS.escape(d.id)}"]`);
    if (tile) {
      const copy = tile.cloneNode(true) as HTMLElement;
      copy.querySelector("img")?.setAttribute("loading", "eager");
      a.prepend(copy);
    }
    const name = li.querySelector(".heading");
    if (name) name.textContent = d.name;
    li.querySelector(".adw-row-text")?.append(el("span", "adw-row-subtitle", d.tagline));
    return li;
  }

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
    const reasons = explain(top, answers);
    list.replaceChildren(
      ...top.flatMap((r, i) => {
        const li = row(r.distro as Item); // recommend() returns the entries it was given
        if (!li) return [];
        const lines = reasons[i] ?? [];
        if (lines.length) {
          const line = el("span", "adw-row-subtitle result-why");
          if (check) line.append(check.content.cloneNode(true));
          // The phrases are written mid-sentence (en lower case); the list
          // starts with a capital. Korean phrases end in a predicate, after
          // which "및" does not read: a comma list there.
          const joined = lang.startsWith("ko") ? lines.join(", ") : listFormat.format(lines);
          const sentence = el("span");
          sentence.append(
            el("span", "visually-hidden", `${why.label}: `),
            joined.charAt(0).toUpperCase() + joined.slice(1),
          );
          line.append(sentence);
          li.querySelector(".adw-row-text")?.append(line);
        }
        return [li];
      }),
    );
    const compare = results.querySelector<HTMLAnchorElement>("[data-compare-link]");
    if (compare)
      compare.href = `${form.dataset.compare}?d=${top.map((r) => r.distro.id).join(",")}`;
    results.hidden = false;
    results.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    results.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  });

  results.querySelector("[data-restart]")?.addEventListener("click", () => {
    form.reset();
    results.hidden = true;
    list.replaceChildren();
    window.scrollTo({ top: 0 });
    form.querySelector<HTMLInputElement>("input:checked")?.focus({ preventScroll: true });
  });
}
