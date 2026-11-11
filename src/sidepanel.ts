import "./credits/credits.js";
import { nextTheme, type Theme } from "./theme";
import { countWords } from "./words";

const root = document.documentElement;
const btn = document.querySelector<HTMLButtonElement>("#theme")!;
const KEY = "theme";

function read(): Theme {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}
function show(t: Theme): void {
  root.dataset.theme = t;
  btn.setAttribute("aria-pressed", String(t === "light"));
  btn.textContent = t === "light" ? "Dark theme" : "Light theme";
}
show(read());
btn.addEventListener("click", () => {
  const t = nextTheme(read());
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* not persisted */
  }
  show(t);
});

const text = document.querySelector<HTMLTextAreaElement>("#text")!;
const words = document.querySelector<HTMLOutputElement>("#words")!;
text.addEventListener("input", () => {
  words.value = String(countWords(text.value));
});
