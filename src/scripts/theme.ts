/**
 * Main menu behaviour (MainMenu.astro), loaded on every page:
 * - the style switcher (system / light / dark). The initial data-theme is
 *   applied by the inline script in <head> before first paint; this module
 *   only wires the radio buttons.
 * - the popover closes when keyboard focus leaves it (SPEC §10). Focus moving
 *   to the menu button keeps it open, so a click on the button still toggles.
 * - the language row keeps the query and hash (e.g. compare's ?d=), added
 *   when the link is pointed at, focused or clicked. The server href is the
 *   path only, which is what no-JS visitors get.
 */
const KEY = "lh-theme";
type Choice = "system" | "light" | "dark";

function read(): Choice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(choice: Choice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* storage unavailable (private mode): the choice lasts for this page */
  }
}

const current = read();
for (const input of document.querySelectorAll<HTMLInputElement>('input[name="lh-theme"]')) {
  input.checked = input.value === current;
  input.addEventListener("change", () => {
    if (input.checked) apply(input.value as Choice);
  });
}

const menu = document.getElementById("main-menu");
const button = document.querySelector<HTMLElement>('[popovertarget="main-menu"]');
if (menu && button) {
  // A null relatedTarget (a click on the menu's padding, the window losing
  // focus) is left to light dismiss.
  const closeOnLeave = (e: FocusEvent) => {
    const next = e.relatedTarget;
    if (!(next instanceof Node) || menu.contains(next) || button.contains(next)) return;
    if (menu.matches(":popover-open")) menu.hidePopover();
  };
  menu.addEventListener("focusout", closeOnLeave);
  button.addEventListener("focusout", closeOnLeave);
}

const language = document.querySelector<HTMLAnchorElement>("a[data-lang-switch]");
const keepQuery = () => {
  if (!language) return;
  const hash = location.hash === "#main" ? "" : location.hash;
  language.href = language.pathname + location.search + hash;
};
// Before any use of the link: hover or touch (then a click, middle click,
// context menu or drag), keyboard focus, or an assistive-technology click.
for (const type of ["pointerenter", "focus", "click"]) language?.addEventListener(type, keepQuery);

export {};
