// CSS selector for one picked element. Pure: works on a minimal element shape so it is unit-testable without a DOM.
import { safeSelectors } from "../compiler/cosmetic.ts";

export interface El {
  tagName: string;
  id: string;
  classList: Iterable<string>;
  parentElement: El | null;
  previousElementSibling: El | null;
  nextElementSibling: El | null;
}
export interface Ctx {
  /** document.querySelectorAll(sel), or [] when the browser rejects it. */
  query(sel: string): readonly El[];
  /** CSS.escape */
  escape(s: string): string;
}

export const MAX_SELECTOR = 300;
const MAX_CLIMB = 4;
const MAX_CLASSES = 3;

/** Reject ids and classes that look generated: 4+ digits in a row, 16+ hex chars, CSS-in-JS prefixes with digits, very long. */
export const looksStable = (name: string): boolean =>
  name !== "" && name.length <= 40 && !/\d{4,}/.test(name) && !/[0-9a-f]{16,}/i.test(name) && !/^(css|sc|jsx|svelte|astro|emotion)-[\w-]*\d/i.test(name);

const tag = (e: El): string => e.tagName.toLowerCase();
const sameKind = (a: El, b: El, classes: string[]): boolean => {
  if (tag(a) !== tag(b)) return false;
  const have = new Set(b.classList);
  return classes.every((c) => have.has(c));
};

/** `#id` when stable, else `tag.class.class[:nth-of-type(n)]`. nth-of-type only when a sibling looks the same. */
function part(e: El, ctx: Ctx): { text: string; id: boolean } {
  if (looksStable(e.id) && ctx.query(`#${ctx.escape(e.id)}`).length === 1) return { text: `#${ctx.escape(e.id)}`, id: true };
  const classes = [...e.classList].filter(looksStable).slice(0, MAX_CLASSES);
  let text = tag(e) + classes.map((c) => `.${ctx.escape(c)}`).join("");
  let twin = false;
  for (let s = e.previousElementSibling; s && !twin; s = s.previousElementSibling) twin = sameKind(e, s, classes);
  for (let s = e.nextElementSibling; s && !twin; s = s.nextElementSibling) twin = sameKind(e, s, classes);
  if (twin) {
    let n = 1;
    for (let s = e.previousElementSibling; s; s = s.previousElementSibling) if (tag(s) === tag(e)) n++;
    text += `:nth-of-type(${n})`;
  }
  return { text, id: false };
}

/** A selector matching exactly `el`, or null when none that is short and safe exists. Climbs at most 4 ancestors, stopping at one with a stable id. */
export function buildSelector(el: El, ctx: Ctx): string | null {
  const parts: string[] = [];
  let cur: El | null = el;
  for (let level = 0; cur && level <= MAX_CLIMB; level++, cur = cur.parentElement) {
    if (["html", "body"].includes(tag(cur)) || !/^[a-z][a-z0-9-]*$/.test(tag(cur))) return null; // page-made tag names (createElementNS) never reach the selector
    const p = part(cur, ctx);
    parts.unshift(p.text);
    const sel = parts.join(" > ");
    const hit = ctx.query(sel);
    if (hit.length === 1 && hit[0] === el) return sel.length <= MAX_SELECTOR && safeSelectors(sel)?.length === 1 ? sel : null;
    if (p.id) return null; // stopped at a stable ancestor id and still not unique
  }
  return null;
}
