export type Theme = "dark" | "light";

export function nextTheme(t: Theme): Theme {
  return t === "dark" ? "light" : "dark";
}
