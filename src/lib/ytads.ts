// Pure helpers for YouTube video ads. No chrome.* or DOM here so they are unit-testable.

/**
 * Keys YouTube uses for a video's ad schedule (pre-roll, mid-roll, the ad slots and their tracking),
 * and for the "Ad blockers are not allowed on YouTube" warning it shows when the schedule is missing.
 */
const AD_KEYS: readonly string[] = ["adPlacements", "adSlots", "playerAds", "adBreakHeartbeatParams", "enforcementMessageViewModel"];

/** Sites where the video-ad script runs. Subdomains included. */
const VIDEO_SITES: readonly string[] = ["youtube.com", "youtube-nocookie.com"];

export const VIDEO_SCRIPT_ID = "clearslip-video-ads";

/**
 * Renderers YouTube uses for ads and its own promotions in page data: feed, search and sidebar ads,
 * the home masthead ad, and the YouTube Premium pop-up and banners.
 */
const AD_RENDERERS: readonly string[] = [
  "adSlotRenderer",
  "displayAdRenderer",
  "inFeedAdLayoutRenderer",
  "promotedSparklesWebRenderer",
  "promotedSparklesTextSearchRenderer",
  "promotedVideoRenderer",
  "compactPromotedVideoRenderer",
  "searchPyvRenderer",
  "brandVideoShelfRenderer",
  "brandVideoSingletonRenderer",
  "bannerPromoRenderer",
  "statementBannerRenderer",
  "mealbarPromoRenderer",
];

/** Cheap test on raw JSON text before walking the parsed value. */
export const mightHaveAds = (text: string): boolean => AD_KEYS.some((k) => text.includes(`"${k}"`)) || AD_RENDERERS.some((k) => text.includes(`"${k}"`));

const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const holdsAdRenderer = (v: unknown): boolean => obj(v) && AD_RENDERERS.some((k) => Object.prototype.hasOwnProperty.call(v, k));
const dig = (v: unknown, ...path: string[]): unknown => path.reduce<unknown>((x, k) => (obj(x) ? x[k] : undefined), v);

/** One entry of a list (feed tile, search result, sidebar item, Shorts entry, side panel) that is an ad. */
export function isAdItem(v: unknown): boolean {
  if (!obj(v)) return false;
  return (
    holdsAdRenderer(v) ||
    holdsAdRenderer(dig(v, "richItemRenderer", "content")) ||
    holdsAdRenderer(dig(v, "richSectionRenderer", "content")) ||
    dig(v, "command", "reelWatchEndpoint", "adClientParams", "isAd") === true ||
    dig(v, "engagementPanelSectionListRenderer", "panelIdentifier") === "engagement-panel-ads" ||
    dig(v, "engagementPanelSectionListRenderer", "targetId") === "engagement-panel-ads"
  );
}

/**
 * Deletes the ad-schedule keys, ad list entries and properties that hold only an ad (the masthead,
 * Premium pop-ups) from a value in place, at any depth. Returns how many it removed.
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
      for (let i = v.length - 1; i >= 0; i--) {
        if (isAdItem(v[i])) {
          v.splice(i, 1);
          removed++;
        }
      }
      for (const x of v) if (typeof x === "object" && x !== null) stack.push(x);
      continue;
    }
    const o = v as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      if (AD_KEYS.includes(k) || (holdsAdRenderer(o[k]) && Object.keys(o[k] as object).length === 1)) {
        delete o[k];
        removed++;
        continue;
      }
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
