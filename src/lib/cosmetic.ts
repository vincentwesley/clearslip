// Pure cosmetic-filter selection for one frame. No chrome.* so it is unit-testable.
import { toCss } from "../compiler/cosmetic.ts";
import type { Specific } from "../compiler/cosmetic.ts";
import { hostSuffixes, siteIsOff } from "./site";

export interface CosmeticPlan {
  /** Inject the packaged generic stylesheet as a file. */
  file: boolean;
  /** Generic selectors to leave out; non-empty means the caller builds generic-minus-these instead of using the file. */
  genericOff: string[];
  /** CSS for the specific selectors; may be empty. */
  css: string;
}

/**
 * What to inject into one frame. `site` is the top-level host (noCosmetic/noGeneric are per site),
 * `frame` the frame's own host (selectors and exceptions are per document). Null = inject nothing.
 */
export function planCosmetic(site: string, frame: string, data: Specific): CosmeticPlan | null {
  if (siteIsOff(data.noCosmetic, site)) return null;
  const walk = hostSuffixes(frame);
  const collect = (m: Record<string, string[]>) => walk.flatMap((h) => (Object.hasOwn(m, h) ? m[h] : [])); // "constructor" is a valid host
  const excluded = new Set([...collect(data.unhide), ...collect(data.notHide)]);
  const hide = [...new Set(collect(data.hide))].filter((s) => !excluded.has(s));
  const useGeneric = !siteIsOff(data.noGeneric, site);
  const genericOff = useGeneric ? [...new Set(collect(data.genericOff))] : [];
  const file = useGeneric && genericOff.length === 0;
  const css = toCss(hide);
  return file || genericOff.length || css ? { file, genericOff, css } : null;
}
