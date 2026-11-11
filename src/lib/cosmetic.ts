// Pure cosmetic-filter selection for one frame. No chrome.* so it is unit-testable.
import { toCss } from "../compiler/cosmetic.ts";
import type { Specific } from "../compiler/cosmetic.ts";

/** `a.b.example.com` -> [`a.b.example.com`, `b.example.com`, `example.com`]. Stops before the bare TLD. */
export function hostSuffixes(host: string): string[] {
  const parts = host.split(".");
  const out: string[] = [];
  for (let i = 0; i < parts.length - 1 || i === 0; i++) out.push(parts.slice(i).join("."));
  return out;
}

const inList = (list: readonly string[], host: string): boolean => hostSuffixes(host).some((h) => list.includes(h));

/** True when Hush is switched off for the site (the same subdomain-inclusive match the DNR rule uses). */
export const siteIsOff = (off: readonly string[], site: string): boolean => inList(off, site);

export interface CosmeticPlan {
  /** Inject the packaged generic stylesheet as a file. */
  file: boolean;
  /** CSS string to inject (generic minus exceptions when `file` is false, plus specific); may be empty. */
  css: string;
}

/**
 * What to inject into one frame. `site` is the top-level host (off/noCosmetic/noGeneric are per site),
 * `frame` the frame's own host (selectors and exceptions are per document). Null = inject nothing.
 */
export function planCosmetic(site: string, frame: string, data: Specific, generic: readonly string[]): CosmeticPlan | null {
  if (inList(data.noCosmetic, site)) return null;
  const walk = hostSuffixes(frame);
  const collect = (m: Record<string, string[]>) => walk.flatMap((h) => m[h] ?? []);
  const excluded = new Set([...collect(data.unhide), ...collect(data.notHide)]);
  const hide = collect(data.hide).filter((s) => !excluded.has(s));
  const useGeneric = !inList(data.noGeneric, site);
  const file = useGeneric && ![...excluded].some((s) => generic.includes(s));
  const rest = useGeneric && !file ? generic.filter((s) => !excluded.has(s)) : [];
  const css = toCss([...new Set([...rest, ...hide])]);
  return file || css ? { file, css } : null;
}