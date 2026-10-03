/**
 * Adds an Adwaita "copy" button to every code block inside `.prose`, and wires
 * any `[data-copy]` button (its value is the text to copy).
 */
import { toast } from "./toast";

const COPY_ICON =
  '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3 1C1.906 1 1 1.906 1 3v8c0 1.094.906 2 2 2V3h8c0-1.094-.906-2-2-2zm3 3C4.906 4 4 4.906 4 6v7c0 1.094.906 2 2 2h7c1.094 0 2-.906 2-2V6c0-1.094-.906-2-2-2zm0 2h7v7H6z"/></svg>';

const root = document.documentElement;
const labels = {
  copy: root.lang === "ko" ? "복사" : "Copy",
  copied: root.lang === "ko" ? "클립보드에 복사했습니다" : "Copied to clipboard",
  failed: root.lang === "ko" ? "복사하지 못했습니다" : "Could not copy",
};

async function copy(text: string, button: HTMLElement) {
  try {
    await navigator.clipboard.writeText(text);
    button.dataset.copied = "";
    toast(labels.copied);
    window.setTimeout(() => delete button.dataset.copied, 1500);
  } catch {
    toast(labels.failed);
  }
}

for (const pre of document.querySelectorAll<HTMLPreElement>(".prose pre")) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "adw-button flat image-button code-copy";
  button.setAttribute("aria-label", labels.copy);
  button.title = labels.copy;
  button.innerHTML = COPY_ICON;
  button.addEventListener("click", () =>
    copy(pre.querySelector("code")?.innerText ?? pre.innerText, button),
  );
  pre.append(button);
}

document.addEventListener("click", (event) => {
  const target = (event.target as Element | null)?.closest<HTMLElement>("[data-copy]");
  if (target?.dataset.copy) void copy(target.dataset.copy, target);
});
