import { describe, expect, it } from "vitest";
import { isYoutubeApi, mightHaveAds, pruneAds, videoAdScript } from "../../src/lib/ytads";

describe("pruneAds", () => {
  it("removes the ad schedule at the top level and keeps the video", () => {
    const r = { videoDetails: { videoId: "x" }, streamingData: { formats: [1] }, adPlacements: [{}], playerAds: [{}], adSlots: [{}], adBreakHeartbeatParams: "p" };
    expect(pruneAds(r)).toBe(4);
    expect(r).toEqual({ videoDetails: { videoId: "x" }, streamingData: { formats: [1] } });
  });
  it("finds nested player responses, including inside arrays", () => {
    const r = [{ playerResponse: { adPlacements: [], videoDetails: {} } }, { response: { contents: [{ adSlots: [] }] } }];
    expect(pruneAds(r)).toBe(2);
    expect(r).toEqual([{ playerResponse: { videoDetails: {} } }, { response: { contents: [{}] } }]);
  });
  it("ignores non-objects and survives cycles", () => {
    expect(pruneAds(null)).toBe(0);
    expect(pruneAds("adPlacements")).toBe(0);
    const a: Record<string, unknown> = { adSlots: 1 };
    a.self = a;
    expect(pruneAds(a)).toBe(1);
  });
  it("stops after the node budget", () => {
    const deep = { a: { b: { adSlots: 1 } } };
    expect(pruneAds(deep, 2)).toBe(0);
    expect(pruneAds(deep)).toBe(1);
  });
});

describe("mightHaveAds", () => {
  it("only matches the keys as JSON keys", () => {
    expect(mightHaveAds('{"adPlacements":[]}')).toBe(true);
    expect(mightHaveAds('{"title":"playerAds explained"}')).toBe(false);
    expect(mightHaveAds('{"videoDetails":{}}')).toBe(false);
  });
});

describe("isYoutubeApi", () => {
  it("matches youtubei paths only", () => {
    expect(isYoutubeApi("https://www.youtube.com/youtubei/v1/player?key=1")).toBe(true);
    expect(isYoutubeApi("https://www.youtube.com/watch?v=1")).toBe(false);
    expect(isYoutubeApi("not a url")).toBe(false);
    expect(isYoutubeApi(undefined)).toBe(false);
  });
});

describe("videoAdScript", () => {
  it("runs early in the page's own world on YouTube", () => {
    expect(videoAdScript([])).toEqual({
      id: "clearslip-video-ads",
      js: ["youtube.js"],
      matches: ["*://*.youtube.com/*", "*://*.youtube-nocookie.com/*"],
      runAt: "document_start",
      world: "MAIN",
      allFrames: true,
      persistAcrossSessions: true,
    });
  });
  it("excludes YouTube hosts the user switched off, with subdomains, and ignores other sites", () => {
    expect(videoAdScript(["example.com", "youtube.com", "m.youtube.com", "notyoutube.com"]).excludeMatches).toEqual([
      "*://*.youtube.com/*",
      "*://*.m.youtube.com/*",
    ]);
  });
});
