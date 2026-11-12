import { test, expect, chromium, type BrowserContext, type Worker } from "@playwright/test";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.join(root, "dist");
const AD = "https://ib.adnxs.com/hush-e2e.js";

function ruleCount(): number {
  try {
    const r = JSON.parse(fs.readFileSync(path.join(dist, "rulesets/report.json"), "utf8"));
    return Number(r?.rulesets?.compact?.rules) || 0;
  } catch {
    return 0;
  }
}
const noRules = ruleCount() === 0; // compiler output missing or empty: rule-dependent tests skip

let server: http.Server;
let origin: string;
let host: string;
let hits = 0; // fixture page loads
let ctx: BrowserContext;
let sw: Worker;
let extId: string;
let dir: string;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/") hits++; // not favicon.ico
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><title>t</title><body>hello<script src="${AD}"></script></body>`);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
  host = "127.0.0.1";
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hush-e2e-"));
  ctx = await chromium.launchPersistentContext(dir, {
    channel: "chromium", // new headless mode, required for extensions
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, "--host-resolver-rules=MAP ib.adnxs.com 127.0.0.1"], // the ad host never reaches a real server
  });
  sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  extId = new URL(sw.url()).host;
  // init stores `mode` once rulesets are chosen
  await expect.poll(() => sw.evaluate(async () => (await chrome.storage.local.get("mode")).mode), { timeout: 60000 }).toBeTruthy();
});
test.afterAll(async () => {
  await ctx?.close();
  server?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Load the fixture page and report how the ad request ended. */
async function adOutcome(keep = false): Promise<string> {
  const page = await ctx.newPage();
  const failed = new Promise<string>((resolve) => {
    page.on("requestfailed", (r) => r.url() === AD && resolve(r.failure()?.errorText ?? "failed"));
    page.on("requestfinished", (r) => r.url() === AD && resolve("finished"));
  });
  await page.goto(origin);
  const result = await Promise.race([failed, page.waitForTimeout(8000).then(() => "timeout")]);
  if (!keep) await page.close();
  return result;
}

async function send(msg: object): Promise<{ ok?: boolean; off?: string[] } | undefined> {
  const p = await ctx.newPage();
  await p.goto(`chrome-extension://${extId}/popup.html?url=chrome://newtab`);
  const res = await p.evaluate((m) => chrome.runtime.sendMessage(m), msg);
  await p.close();
  return res;
}

test.describe("rules", () => {
  test.skip(noRules, "dist/rulesets/report.json shows zero rules (compiler output missing)");

  test("known ad host is blocked, then allowed once Hush is off for the site", async () => {
    const outcome = await sw.evaluate(
      (u) => chrome.declarativeNetRequest.testMatchOutcome({ url: u, type: "script", initiator: "http://127.0.0.1" }),
      AD,
    );
    expect(outcome.matchedRules.length).toBeGreaterThan(0);
    expect(await adOutcome()).toBe("net::ERR_BLOCKED_BY_CLIENT");

    expect((await send({ type: "setSiteOff", host, off: true }))?.off).toEqual([host]);
    const page = await sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
    expect(page).toHaveLength(1);
    expect(page[0].action.type).toBe("allowAllRequests");
    const top = await sw.evaluate(
      () => chrome.declarativeNetRequest.testMatchOutcome({ url: "http://127.0.0.1/", type: "main_frame" }),
    );
    expect(top.matchedRules.some((r) => r.rulesetId === "_dynamic")).toBe(true);
    expect(await adOutcome()).not.toBe("net::ERR_BLOCKED_BY_CLIENT");

    expect((await send({ type: "setSiteOff", host, off: false }))?.off).toEqual([]);
    expect(await sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules())).toHaveLength(0);
    expect(await adOutcome()).toBe("net::ERR_BLOCKED_BY_CLIENT");
  });

  test("pausing from the popup reloads the tab and lets the blocked request through", async () => {
    const page = await ctx.newPage();
    const ad: string[] = [];
    page.on("requestfailed", (r) => r.url() === AD && ad.push(r.failure()?.errorText ?? "failed"));
    page.on("requestfinished", (r) => r.url() === AD && ad.push("finished"));
    const before = hits;
    await page.goto(origin);
    await expect.poll(() => ad.at(-1)).toBe("net::ERR_BLOCKED_BY_CLIENT");
    const tabId = await sw.evaluate(async (u) => (await chrome.tabs.query({ url: `${u}*` }))[0].id, origin);
    const p = await ctx.newPage();
    await p.goto(`chrome-extension://${extId}/popup.html?url=${encodeURIComponent(origin)}&tabId=${tabId}`);
    await p.getByRole("switch").click();
    await expect(p.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => hits).toBe(before + 2); // reloaded
    await expect.poll(() => ad.at(-1)).not.toBe("net::ERR_BLOCKED_BY_CLIENT");
    await p.getByRole("switch").click();
    await expect.poll(() => hits).toBe(before + 3);
    await expect.poll(() => ad.at(-1)).toBe("net::ERR_BLOCKED_BY_CLIENT");
    await p.close();
    await page.close();
  });

  test("popup lists what was blocked on the page", async () => {
    await adOutcome(true); // page stays open so matches keep their tab id
    const tabId = await sw.evaluate(async () => {
      const { rulesMatchedInfo } = await chrome.declarativeNetRequest.getMatchedRules({});
      return rulesMatchedInfo.at(-1)?.tabId;
    });
    expect(tabId).toBeGreaterThanOrEqual(0);
    const p = await ctx.newPage();
    await p.goto(`chrome-extension://${extId}/popup.html?url=${encodeURIComponent(origin)}&tabId=${tabId}`);
    await expect(p.locator("#groups li").first()).toContainText(/adnxs|Easy/i);
    expect(Number(await p.locator("#total").textContent())).toBeGreaterThan(0);
    await p.close();
  });
});

test.describe("popup", () => {
  test("loads without console errors; the switch toggles and persists", async () => {
    const errors: string[] = [];
    const p = await ctx.newPage();
    p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(`chrome-extension://${extId}/popup.html?url=${encodeURIComponent(origin)}`);
    const sw_ = p.getByRole("switch");
    await expect(p.locator("#host")).toHaveText(host);
    await expect(p.getByRole("switch", { name: "Pause on this site" })).toHaveAttribute("aria-checked", "false");
    await expect(p.locator("#state")).toHaveText("Hush is on");
    expect((await sw_.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await sw_.focus();
    await p.keyboard.press("Space");
    await expect(sw_).toHaveAttribute("aria-checked", "true");
    await expect(p.locator("#state")).toHaveText(`Paused on ${host}`);
    expect(await sw.evaluate(async () => (await chrome.storage.local.get("off")).off)).toEqual([host]);
    await sw_.click();
    await expect(sw_).toHaveAttribute("aria-checked", "false");
    expect(await sw.evaluate(async () => (await chrome.storage.local.get("off")).off)).toEqual([]);
    expect(errors).toEqual([]);
    await p.close();
  });

  test("unsupported pages show a message and no switch", async () => {
    const p = await ctx.newPage();
    await p.goto(`chrome-extension://${extId}/popup.html?url=chrome://newtab`);
    await expect(p.locator("#unsupported")).toBeVisible();
    await expect(p.getByRole("switch")).toBeHidden();
    await p.close();
  });

  test("ignores invalid messages", async () => {
    expect(await send({ type: "setSiteOff", host: "bad host/..", off: true })).toBeUndefined();
    expect((await send({ type: "getState" }))?.ok).toBe(true);
  });
});



