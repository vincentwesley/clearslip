// Pure store logic for selectors the user hid with the zapper. `Zaps` is `{ [exact site host]: selector[] }` in chrome.storage.local.
import { safeSelectors, toCss } from "../compiler/cosmetic.ts";
import { MAX_SELECTOR } from "./selector";
import { isValidHost } from "./site";

export const MAX_ZAPS_PER_HOST = 100;
export const MAX_ZAP_HOSTS = 500;
export type Zaps = Record<string, string[]>;

/** The one selector in `raw` if it is safe to put in a stylesheet and short enough, else null. */
export function validSelector(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > MAX_SELECTOR) return null;
  const s = safeSelectors(raw);
  return s?.length === 1 ? s[0] : null;
}

/** Stored data is untrusted after an upgrade or a bug: keep only valid hosts and selectors, within the caps. */
export function cleanZaps(raw: unknown): Zaps {
  const out: Zaps = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [host, list] of Object.entries(raw)) {
    if (!isValidHost(host) || !Array.isArray(list) || Object.keys(out).length >= MAX_ZAP_HOSTS) continue;
    const sels = [...new Set(list.map(validSelector).filter((s): s is string => s !== null))].slice(0, MAX_ZAPS_PER_HOST);
    if (sels.length) out[host] = sels;
  }
  return out;
}

/** Saved selectors for exactly this host (parent domains do not inherit). */
export const zapsFor = (zaps: Zaps, host: string): string[] => (Object.hasOwn(zaps, host) ? zaps[host] : []);

export type AddResult = { ok: true; zaps: Zaps } | { ok: false; reason: "invalid" | "limit-selectors" | "limit-hosts" };

export function addZap(zaps: Zaps, host: unknown, selector: unknown): AddResult {
  const sel = validSelector(selector);
  if (!isValidHost(host) || !sel) return { ok: false, reason: "invalid" };
  const cur = zapsFor(zaps, host);
  if (cur.includes(sel)) return { ok: true, zaps };
  if (cur.length >= MAX_ZAPS_PER_HOST) return { ok: false, reason: "limit-selectors" };
  if (!cur.length && Object.keys(zaps).length >= MAX_ZAP_HOSTS) return { ok: false, reason: "limit-hosts" };
  return { ok: true, zaps: { ...zaps, [host]: [...cur, sel] } };
}

/** Remove one selector (or all of the host's when `selector` is undefined). Hosts left empty are dropped. */
export function removeZap(zaps: Zaps, host: string, selector?: string): Zaps {
  const left = selector === undefined ? [] : zapsFor(zaps, host).filter((s) => s !== selector);
  const rest = Object.fromEntries(Object.entries(zaps).filter(([h]) => h !== host));
  return left.length ? { ...rest, [host]: left } : rest;
}

/** Stylesheet hiding the host's saved selectors; "" when none. */
export const zapCss = (zaps: Zaps, host: string): string => toCss(zapsFor(zaps, host));
