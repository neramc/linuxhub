/**
 * Copy buttons: one on every code block inside `.prose`, and every
 * server-rendered `[data-copy]` button (its value is the text to copy, e.g.
 * the download wizard's checksum).
 *
 * Loaded by src/components/CopyButtons.astro, whose template holds the
 * strings (i18n) and the icons (src/assets/icons): nothing is hardcoded
 * here. Copied: the button shows the check icon for 2 s and a toast confirms
 * it (SPEC §7). Not copied (no clipboard access): the text is selected so it
 * can be copied by hand, and the button's component says so where it shows
 * the text (SPEC §12, §16): the `[data-copy-status]` line right after the
 * button's box (the wizard's checksum); a code block, which has none, in the
 * toast.
 */
import { toast } from "./toast";

const CHECK_MS = 2000;

const assets = document.querySelector<HTMLTemplateElement>("template[data-copy-assets]");
const strings: DOMStringMap = assets?.dataset ?? {};
const timers = new WeakMap<HTMLElement, number>();

/** A fresh copy of the template's `copy` or `check` icon. */
const icon = (name: "copy" | "check" | "warning") =>
  assets?.content.querySelector(`.${name}-icon`)?.cloneNode(true);

/** Swaps the button's icon. */
function showIcon(button: HTMLElement, name: "copy" | "check") {
  const next = icon(name);
  if (next) button.querySelector("svg")?.replaceWith(next);
}

/** The element that shows `text` next to the button: the code of its block, or a sibling. */
function shownText(button: HTMLElement, text: string): Element | undefined {
  const code = button.closest("pre")?.querySelector("code");
  if (code) return code;
  return [...(button.parentElement?.children ?? [])].find(
    (el) => el !== button && el.textContent?.trim() === text,
  );
}

async function copy(text: string, button: HTMLElement) {
  const next = button.parentElement?.nextElementSibling;
  const status = next instanceof HTMLElement && "copyStatus" in next.dataset ? next : null;
  if (status) status.textContent = "";
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const source = shownText(button, text);
    if (source) window.getSelection()?.selectAllChildren(source);
    // Icon + error colour + sentence (SPEC §16); the colour comes from CSS.
    if (status) status.replaceChildren(icon("warning") ?? "", strings.failed ?? "");
    else toast(strings.failed ?? "");
    return;
  }
  window.clearTimeout(timers.get(button));
  if (!("copied" in button.dataset)) showIcon(button, "check");
  button.dataset.copied = "";
  timers.set(
    button,
    window.setTimeout(() => {
      delete button.dataset.copied;
      showIcon(button, "copy");
    }, CHECK_MS),
  );
  toast(strings.copied ?? "");
}

for (const pre of document.querySelectorAll<HTMLPreElement>(".prose pre")) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "adw-button flat image-button code-copy";
  button.setAttribute("aria-label", strings.codeLabel ?? "");
  button.title = strings.codeLabel ?? "";
  const copyIcon = icon("copy");
  if (copyIcon) button.append(copyIcon);
  button.addEventListener("click", () => {
    void copy(pre.querySelector("code")?.innerText ?? pre.innerText, button);
  });
  pre.append(button);
}

document.addEventListener("click", (event) => {
  const target = (event.target as Element | null)?.closest<HTMLElement>("[data-copy]");
  if (target?.dataset.copy) void copy(target.dataset.copy, target);
});
