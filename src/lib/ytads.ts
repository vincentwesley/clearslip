// Pure helpers for YouTube video ads. No chrome.* or DOM here so they are unit-testable.

/** Keys YouTube uses for a video's ad schedule (pre-roll, mid-roll, the ad slots and their tracking). */
const AD_KEYS: readonly string[] = ["adPlacements", "adSlots", "playerAds", "adBreakHeartbeatParams"];

/** Sites where the video-ad script runs. Subdomains included. */
const VIDEO_SITES: readonly string[] = ["youtube.com", "youtube-nocookie.com"];

export const VIDEO_SCRIPT_ID = "clearslip-video-ads";

/** Cheap test on raw JSON text before walking the parsed value. */
export const mightHaveAds = (text: string): boolean => AD_KEYS.some((k) => text.includes(`"${k}"`));

/**
 * Deletes the ad-schedule keys from a value in place, at any depth. Returns how many it removed.
 * Bounded so a hostile or huge object cannot stall the page.
 */
export function pruneAds(value: unknown, maxNodes = 500_000): number {
  let removed = 0;
  let seen = 0;
  const stack: unknown[] = [value];
  const visited = new WeakSet<object>();
  while (stack.length && seen < maxNodes) {
    const v = stack.pop();
    if (typeof v !== "object" || v === null || visited.has(v)) continue;
    visited.add(v);
    seen++;
    if (Array.isArray(v)) {
      for (const x of v) if (typeof x === "object" && x !== null) stack.push(x);
      continue;
    }
    const o = v as Record<string, unknown>;
    for (const k of AD_KEYS) {
      if (Object.prototype.hasOwnProperty.call(o, k)) {
        delete o[k];
        removed++;
      }
    }
    for (const k of Object.keys(o)) {
      const x = o[k];
      if (typeof x === "object" && x !== null) stack.push(x);
    }
  }
  return removed;
}

/** True for YouTube's internal API responses (player, next, reel, browse ...). */
export function isYoutubeApi(url: unknown): boolean {
  if (typeof url !== "string") return false;
  try {
    return new URL(url).pathname.startsWith("/youtubei/");
  } catch {
    return false;
  }
}

const onSite = (host: string) => VIDEO_SITES.some((s) => host === s || host.endsWith(`.${s}`));

/** Registration for the video-ad script. Hosts the user switched off are excluded (with their subdomains, like the off switch). */
export function videoAdScript(off: readonly string[]) {
  const exclude = off.filter(onSite).map((h) => `*://*.${h}/*`);
  return {
    id: VIDEO_SCRIPT_ID,
    js: ["youtube.js"],
    matches: VIDEO_SITES.map((s) => `*://*.${s}/*`),
    ...(exclude.length ? { excludeMatches: exclude } : {}),
    runAt: "document_start" as const,
    world: "MAIN" as const,
    allFrames: true,
    persistAcrossSessions: true,
  };
}
