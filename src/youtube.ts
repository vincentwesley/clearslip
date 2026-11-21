// Runs inside YouTube's own pages (MAIN world), registered by the service worker on youtube.com and
// youtube-nocookie.com unless the user switched the site off. It removes the ad schedule from the
// player's data before the player reads it, so YouTube's own pre-roll and mid-roll ads are never
// scheduled. It never touches the DOM, stores nothing and sends nothing anywhere.
// Ads a creator records into the video itself, and ads YouTube stitches into the video stream, cannot be removed this way.
import { isYoutubeApi, mightHaveAds, pruneAds } from "./lib/ytads";

// Proxies keep the wrapped functions looking native to the page.
JSON.parse = new Proxy(JSON.parse, {
  apply(target, self, args: Parameters<typeof JSON.parse>) {
    const out: unknown = Reflect.apply(target, self, args);
    if (typeof args[0] === "string" && mightHaveAds(args[0])) pruneAds(out);
    return out;
  },
});

Response.prototype.json = new Proxy(Response.prototype.json, {
  apply(target, self: Response, args: []) {
    const p = Reflect.apply(target, self, args) as Promise<unknown>;
    return isYoutubeApi(self.url) ? p.then((v) => (pruneAds(v), v)) : p;
  },
});

// The first video's data arrives in the page as `var ytInitialPlayerResponse = {...}`; a global var
// assignment goes through this setter, so the ads are gone before the player starts.
let initial: unknown;
Object.defineProperty(window, "ytInitialPlayerResponse", {
  configurable: true,
  get: () => initial,
  set: (v: unknown) => {
    pruneAds(v);
    initial = v;
  },
});
