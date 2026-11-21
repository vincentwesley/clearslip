// YouTube itself blocks automated browsers, so this serves a stand-in www.youtube.com page that
// delivers ad schedules the three ways the real site does: inline ytInitialPlayerResponse,
// JSON.parse on fetched text, and Response.json() on /youtubei/ calls.
import { test, expect, chromium, type BrowserContext, type Page, type Worker } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.join(root, "dist");
const WATCH = "https://www.youtube.com/watch?v=clearslip";
const PLAYER = JSON.stringify({ videoDetails: { videoId: "clearslip" }, adPlacements: [{ kind: "preroll" }], playerAds: [{}], adSlots: [{}], auxiliaryUi: { messageRenderers: { enforcementMessageViewModel: {} } } });
const FEED = JSON.stringify({ contents: [{ richItemRenderer: { content: { adSlotRenderer: {} } } }, { richItemRenderer: { content: { videoRenderer: { videoId: "v" } } } }], overlay: { mealbarPromoRenderer: {} } });
const PAGE = `<!doctype html><title>yt</title><body><script>
var ytInitialPlayerResponse = ${PLAYER};
var ytInitialData = ${FEED};
window.result = { initial: ytInitialPlayerResponse, feed: ytInitialData };
fetch("/youtubei/v1/player").then((r) => r.json()).then((v) => (window.result.json = v));
fetch("/youtubei/v1/next").then((r) => r.text()).then((t) => (window.result.parsed = JSON.parse(t)));
const x = new XMLHttpRequest();
x.open("GET", "/youtubei/v1/browse");
x.responseType = "json";
x.onload = () => (window.result.xhr = x.response);
x.send();
fetch("/other.json").then((r) => r.json()).then((v) => (window.result.other = v));
</script></body>`;

let ctx: BrowserContext;
let sw: Worker;
let extId: string;
let dir: string;

test.beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "clearslip-e2e-"));
  ctx = await chromium.launchPersistentContext(dir, {
    channel: process.env.E2E_CHANNEL ?? "chromium",
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  await ctx.route("https://www.youtube.com/**", (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === "/watch") return route.fulfill({ contentType: "text/html", body: PAGE });
    if (u.pathname === "/youtubei/v1/next") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ playerResponse: JSON.parse(PLAYER) }) });
    return route.fulfill({ contentType: "application/json", body: PLAYER }); // /youtubei/v1/player and /other.json
  });
  sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  extId = new URL(sw.url()).host;
  await expect.poll(() => sw.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).length), { timeout: 60000 }).toBe(1);
});
test.afterAll(async () => {
  await ctx?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function results(): Promise<{ page: Page; r: Record<string, Record<string, unknown>> }> {
  const page = await ctx.newPage();
  await page.goto(WATCH);
  await page.waitForFunction(() => {
    const r = (window as unknown as { result?: Record<string, unknown> }).result;
    return r?.json && r?.parsed && r?.other && r?.xhr;
  });
  const r = await page.evaluate(() => (window as unknown as { result: Record<string, Record<string, unknown>> }).result);
  return { page, r };
}

async function send(msg: object) {
  const p = await ctx.newPage();
  await p.goto(`chrome-extension://${extId}/popup.html?url=chrome://newtab`);
  const res = await p.evaluate((m) => chrome.runtime.sendMessage(m), msg);
  await p.close();
  return res;
}

test("video ad schedules are removed and the video data is kept", async () => {
  const { page, r } = await results();
  for (const v of [r.initial, r.json, r.xhr, r.parsed.playerResponse as Record<string, unknown>]) {
    expect(v).toEqual({ videoDetails: { videoId: "clearslip" }, auxiliaryUi: { messageRenderers: {} } });
  }
  expect(r.feed).toEqual({ contents: [{ richItemRenderer: { content: { videoRenderer: { videoId: "v" } } } }] });
  expect(r.other).toHaveProperty("adPlacements"); // not a /youtubei/ call and never JSON.parse'd: untouched
  expect(await page.evaluate(() => String(JSON.parse))).toContain("[native code]");
  await page.close();
});

test("switching YouTube off leaves its ads alone, switching it back on removes them again", async () => {
  await send({ type: "setSiteOff", host: "www.youtube.com", off: true });
  let { page, r } = await results();
  expect(r.initial).toHaveProperty("adPlacements");
  expect(r.feed).toHaveProperty("overlay");
  expect(r.json).toHaveProperty("playerAds");
  await page.close();

  await send({ type: "setSiteOff", host: "www.youtube.com", off: false });
  ({ page, r } = await results());
  expect(r.initial).not.toHaveProperty("adPlacements");
  expect(r.json).not.toHaveProperty("playerAds");
  await page.close();
});
