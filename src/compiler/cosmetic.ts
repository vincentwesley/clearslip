// Cosmetic filters (element hiding) -> generic CSS + per-host selector tables. Pure: no Chrome or Node APIs.
import { asciiHost } from "./parse.ts";
import type { ListInput } from "./types.ts";

/** Compact per-host table; see docs/COMPILER-SPEC.md "Cosmetic filtering". */
export interface Specific {
  hide: Record<string, string[]>; // host -> selectors hidden on it and its subdomains
  unhide: Record<string, string[]>; // `host#@#sel`: selectors NOT hidden on host (generic or specific)
  notHide: Record<string, string[]>; // `a.com,~host##sel`: sel not hidden on ~host
  noGeneric: string[]; // `@@||host^$generichide`
  noCosmetic: string[]; // `@@||host^$elemhide`
}

export interface CosmeticResult {
  generic: string[];
  specific: Specific;
  stats: { generic: number; specificHosts: number; specificRules: number; exceptions: number; skipped: Record<string, number> };
}

type Line =
  | { kind: "hide" | "unhide"; domains: string[]; notDomains: string[]; selectors: string[] }
  | { kind: "noGeneric" | "noCosmetic"; host: string }
  | { kind: "skip"; reason: string };

const PROCEDURAL =
  /:(?:has-text|xpath|matches-[a-z-]+|upward|remove|style|contains|if|if-not|nth-ancestor|min-text-length|watch-attr|others|-js-[a-z-]+)\(|:-abp-/i;
const NET_FLAG = /^@@\|\|([a-z0-9][a-z0-9.-]*)\^\$(generichide|elemhide)$/i;
const DOMAINS = /^[a-z0-9._*~,-]*$/i;

/**
 * Splits a selector list at top-level commas and rejects anything that could break out of the selector
 * position of `selector{...}` or swallow the next rule: braces, comments, `@`, `<`, control characters,
 * backslash-newline, unbalanced quotes/brackets. Returns null when unsafe.
 */
export function safeSelectors(raw: string): string[] | null {
  // eslint-disable-next-line no-control-regex
  if (/[{}@<\x00-\x1f\x7f]|\/\*|\*\/|\\[\r\n]/.test(raw)) return null;
  const out: string[] = [];
  const stack: string[] = [];
  let quote = "";
  let start = 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "\\") i++;
    else if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") stack.push(c === "(" ? ")" : "]");
    else if (c === ")" || c === "]") {
      if (stack.pop() !== c) return null;
    } else if (c === "," && stack.length === 0) {
      out.push(raw.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (quote || stack.length) return null;
  out.push(raw.slice(start).trim());
  return out.every((s) => s !== "") ? out : null;
}

/** One list line -> a cosmetic line, a skip with reason, or null when it is not a cosmetic filter. */
export function parseCosmetic(rawLine: string): Line | null {
  const raw = rawLine.trim();
  if (raw === "" || raw.startsWith("!") || raw.startsWith("[") || raw.startsWith("/")) return null;
  const flag = NET_FLAG.exec(raw);
  if (flag) {
    const host = asciiHost(flag[1]);
    return host ? { kind: flag[2].toLowerCase() === "generichide" ? "noGeneric" : "noCosmetic", host } : null;
  }
  const hash = raw.indexOf("#");
  if (hash < 0) return null;
  const domainPart = raw.slice(0, hash);
  const op = /^#[@?$%]*#/.exec(raw.slice(hash));
  if (!op || !DOMAINS.test(domainPart)) return null; // network filter that merely contains '#'
  const sel = raw.slice(hash + op[0].length);
  const skip = (reason: string): Line => ({ kind: "skip", reason });
  if (op[0].includes("?")) return skip("procedural");
  if (op[0].includes("$") || op[0].includes("%") || sel.startsWith("+js(")) return skip("scriptlet");
  if (sel.startsWith("^")) return skip("html-filter");
  if (PROCEDURAL.test(sel)) return skip("procedural");

  const domains: string[] = [];
  const notDomains: string[] = [];
  for (const d of domainPart.split(",")) {
    if (d === "") continue;
    const neg = d.startsWith("~");
    const bare = neg ? d.slice(1) : d;
    if (bare.includes("*")) return skip("entity-domain");
    const h = asciiHost(bare);
    if (!h) return skip("domain-invalid");
    (neg ? notDomains : domains).push(h);
  }
  const selectors = safeSelectors(sel);
  if (!selectors) return skip("unsafe-selector");
  return { kind: op[0] === "#@#" ? "unhide" : "hide", domains, notDomains, selectors };
}

const push = (m: Record<string, string[]>, host: string, sels: string[]) => {
  const a = (m[host] ??= []);
  for (const s of sels) if (!a.includes(s)) a.push(s);
};

export function compileCosmetic(lists: ListInput[]): CosmeticResult {
  const generic = new Set<string>();
  const globalUnhide = new Set<string>();
  const specific: Specific = { hide: {}, unhide: {}, notHide: {}, noGeneric: [], noCosmetic: [] };
  const skipped: Record<string, number> = {};
  let specificRules = 0;
  let exceptions = 0;
  for (const l of lists) {
    for (const text of l.text.split(/\r?\n/)) {
      const r = parseCosmetic(text);
      if (!r) continue;
      if (r.kind === "skip") skipped[r.reason] = (skipped[r.reason] ?? 0) + 1;
      else if ("host" in r) {
        if (!specific[r.kind].includes(r.host)) specific[r.kind].push(r.host);
        exceptions++;
      } else if (r.kind === "unhide") {
        exceptions++;
        if (r.domains.length === 0) r.selectors.forEach((s) => globalUnhide.add(s));
        for (const d of r.domains) push(specific.unhide, d, r.selectors);
      } else {
        if (r.domains.length === 0) r.selectors.forEach((s) => generic.add(s));
        for (const d of r.domains) {
          specificRules += r.selectors.length;
          push(specific.hide, d, r.selectors);
        }
        for (const d of r.notDomains) push(specific.notHide, d, r.selectors);
      }
    }
  }
  return {
    generic: [...generic].filter((s) => !globalUnhide.has(s)),
    specific,
    stats: { generic: generic.size, specificHosts: Object.keys(specific.hide).length, specificRules, exceptions, skipped },
  };
}

/** One rule per selector, so a selector the browser rejects cannot disable the others. */
export const toCss = (selectors: readonly string[]): string => selectors.map((s) => `${s}{display:none!important}`).join("\n");