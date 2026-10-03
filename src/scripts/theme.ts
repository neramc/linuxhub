/**
 * Style switcher (system / light / dark) in the main menu. The initial
 * data-theme is applied by the inline script in <head> before first paint;
 * this module only wires the radio buttons.
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

export {};
