import { test, expect, chromium, type BrowserContext, type Page, type Worker } from "@playwright/test";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.join(root, "dist");
const HOST = "127.0.0.1";

let server: http.Server;
let origin: string;
let ctx: BrowserContext;
let sw: Worker;
let extId: string;
let dir: string;
let page: Page;
let tabId: number;

test.beforeAll(async () => {
  server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(
      `<!doctype html><title>t</title><body><main><p>intro</p>` +
        `<div class="promo-box" onclick="document.title='page-clicked'">Buy now</div><p>outro</p></main></body>`,
    );
  });
  await new Promise<void>((r) => server.listen(0, HOST, r));
  origin = `http://${HOST}:${(server.address() as { port: number }).port}/`;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "clearslip-zap-"));
  ctx = await chromium.launchPersistentContext(dir, {
    channel: "chromium",
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  extId = new URL(sw.url()).host;
  await expect.poll(() => sw.evaluate(async () => (await chrome.storage.local.get("mode")).mode), { timeout: 60000 }).toBeTruthy();
  page = await ctx.newPage();
  await page.goto(origin);
  tabId = await sw.evaluate(async (u) => (await chrome.tabs.query({ url: `${u}*` }))[0].id as number, origin);
});
test.afterAll(async () => {
  await ctx?.close();
  server?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** From an extension page, as the popup does. */
async function ext<T>(msg: object): Promise<T> {
  const p = await ctx.newPage();
  await p.goto(`chrome-extension://${extId}/popup.html?url=chrome://newtab`);
  const res = await p.evaluate((m) => chrome.runtime.sendMessage(m), msg);
  await p.close();
  await page.bringToFront();
  return res as T;
}
const startPicker = () => ext<{ ok: boolean }>({ type: "startPicker", tabId });
const display = () => page.locator(".promo-box").evaluate((e) => getComputedStyle(e).display);
const pickerHosts = () => page.locator('div[style*="2147483647"]').count();

test("escape leaves the DOM as it was and removes the listeners; starting twice injects once", async () => {
  await page.reload();
  const before = await page.evaluate(() => document.documentElement.outerHTML);
  expect((await startPicker()).ok).toBe(true);
  expect((await startPicker()).ok).toBe(true);
  await expect.poll(pickerHosts).toBe(1);
  await page.locator(".promo-box").hover();
  await page.keyboard.press("Escape");
  await expect.poll(pickerHosts).toBe(0);
  expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(before);
  await page.locator(".promo-box").click(); // listeners gone: the page's own handler runs again
  await expect.poll(() => page.title()).toBe("page-clicked");
  await page.reload();
});

test("pick, hide, persist, list, show again; the page never sees the pick", async () => {
  expect((await startPicker()).ok).toBe(true);
  const box = page.locator(".promo-box");
  await box.hover();
  await box.click();
  expect(await page.title()).toBe("t"); // the page's click handler did not run
  await page.keyboard.press("Enter"); // focus is on "Hide"
  await expect.poll(display).toBe("none");
  await expect.poll(pickerHosts).toBe(0);
  expect(await sw.evaluate(async () => (await chrome.storage.local.get("zaps")).zaps)).toEqual({ [HOST]: ["div.promo-box"] });

  await page.reload();
  await expect.poll(display).toBe("none");

  const panel = await ctx.newPage();
  await panel.goto(`chrome-extension://${extId}/sidepanel.html?tabId=${tabId}`);
  await expect(panel.locator("#z-list code")).toHaveText(["div.promo-box"]);
  await panel.getByRole("button", { name: /^Show again/ }).click();
  await expect(panel.locator("#z-section")).toBeHidden();
  await expect.poll(display).not.toBe("none");
  await panel.close();
});

test("pausing the site shows the hidden element again; resuming hides it", async () => {
  expect((await startPicker()).ok).toBe(true);
  await page.locator(".promo-box").hover();
  await page.locator(".promo-box").click();
  await page.keyboard.press("Enter");
  await expect.poll(display).toBe("none");

  await ext({ type: "setSiteOff", host: HOST, off: true });
  expect((await startPicker()).ok).toBe(false); // popup hides the button; the worker refuses too
  await page.reload();
  await expect.poll(display).not.toBe("none");
  await ext({ type: "setSiteOff", host: HOST, off: false });
  await page.reload();
  await expect.poll(display).toBe("none");

  expect(await ext({ type: "clearZaps", host: HOST })).toEqual({ ok: true });
  await page.reload();
  await expect.poll(display).not.toBe("none");
});

test("the worker ignores zap messages that do not come from a tab, and unsafe selectors",async () => {
  const bad = await ext<{ ok: boolean } | undefined>({ type: "zap", selector: ".x" }); // extension page: no sender.tab
  expect(bad ?? { ok: false }).toMatchObject({ ok: false });
  expect(await sw.evaluate(async () => (await chrome.storage.local.get("zaps")).zaps ?? {})).toEqual({});
  expect(await ext({ type: "removeZap", host: HOST, selector: "a{}" })).toBeUndefined(); // invalid selector: no handler answers
});

test("popup shows the button, hides it while paused", async () => {
  const p = await ctx.newPage();
  await p.goto(`chrome-extension://${extId}/popup.html?url=${encodeURIComponent(origin)}&tabId=${tabId}`);
  await expect(p.locator("#zap")).toBeVisible();
  await p.locator("#toggle").click();
  await expect(p.locator("#zap")).toBeHidden();
  await p.locator("#toggle").click();
  await expect(p.locator("#zap")).toBeVisible();
  await p.close();
});
