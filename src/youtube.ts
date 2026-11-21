// Runs inside YouTube's own pages (MAIN world), registered by the service worker on youtube.com and
// youtube-nocookie.com unless the user switched the site off. It removes the ad schedule from the
// player's data before the player reads it, so YouTube's own pre-roll and mid-roll ads are never
// scheduled, and drops feed, search, sidebar, Shorts and masthead ads and the YouTube Premium
// pop-up and banners from the page data before YouTube draws them. It never touches the DOM, stores nothing and sends nothing anywhere.
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

// Same for XMLHttpRequest with responseType "json"; responseText is covered by JSON.parse.
const xhrResponse = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "response");
const pruned = new WeakSet<object>();
if (xhrResponse?.get) {
  Object.defineProperty(XMLHttpRequest.prototype, "response", {
    ...xhrResponse,
    get: new Proxy(xhrResponse.get, {
      apply(target, self: XMLHttpRequest, args: []) {
        const v: unknown = Reflect.apply(target, self, args);
        if (typeof v === "object" && v !== null && !pruned.has(v) && self.responseType === "json" && isYoutubeApi(self.responseURL)) {
          pruned.add(v);
          pruneAds(v);
        }
        return v;
      },
    }),
  });
}

// The first page's data arrives as `var ytInitialPlayerResponse = {...}` (the video) and
// `var ytInitialData = {...}` (feed, sidebar, search). A global var assignment goes through these
// setters, so the ads are gone before YouTube reads them.
for (const name of ["ytInitialPlayerResponse", "ytInitialData"]) {
  let held: unknown;
  Object.defineProperty(window, name, {
    configurable: true,
    get: () => held,
    set: (v: unknown) => {
      pruneAds(v);
      held = v;
    },
  });
}
