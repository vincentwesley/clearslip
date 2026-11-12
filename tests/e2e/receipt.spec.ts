import { test, expect, chromium, type BrowserContext, type Worker } from "@playwright/test";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.join(root, "dist");
const AD = "ib.adnxs.com";
const TRACKER = "0emm.com";

let server: http.Server;
let origin: string;
let ctx: BrowserContext;
let sw: Worker;
let extId: string;
let dir: string;

test.beforeAll(async () => {
  server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(
      `<!doctype html><title>t</title><body>hello` +
        `<script src="https://${AD}/a/b.js?uid=SECRET1#frag"></script>` +
        `<script src="https://${AD}/c.js?uid=SECRET2"></script>` +
        `<script src="https://${TRACKER}/t.js?id=SECRET3"></script></body>`,
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hush-receipt-"));
  ctx = await chromium.launchPersistentContext(dir, {
    channel: "chromium",
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, `--host-resolver-rules=MAP ${AD} 127.0.0.1, MAP ${TRACKER} 127.0.0.1`],
  });
  sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  extId = new URL(sw.url()).host;
  await expect.poll(() => sw.evaluate(async () => (await chrome.storage.local.get("mode")).mode), { timeout: 60000 }).toBeTruthy();
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
});
test.afterAll(async () => {
  await ctx?.close();
  server?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const tabIdOf = (): Promise<number> => sw.evaluate(async (u) => (await chrome.tabs.query({ url: `${u}*` }))[0].id as number, origin);
const stored = (): Promise<Record<string, { site: string; blocked: number; hosts: Record<string, { count: number; paths: string[] }> }>> =>
  sw.evaluate(async () => ((await chrome.storage.session.get("receipts")).receipts ?? {}) as never);

test("receipt lists blocked hosts with counts and no query strings", async () => {
  const page = await ctx.newPage();
  await page.goto(origin);
  const tabId = await tabIdOf();
  await expect.poll(async () => (await stored())[tabId]?.blocked).toBe(3);
  const rec = (await stored())[tabId];
  expect(rec.site).toBe("127.0.0.1");
  expect(rec.hosts[AD].count).toBe(2);
  expect(rec.hosts[AD].paths.sort()).toEqual(["/a/b.js", "/c.js"]);
  expect(JSON.stringify(rec)).not.toMatch(/SECRET|frag|uid=/);
  expect(await sw.evaluate(async () => Object.keys(await chrome.storage.local.get(null)).includes("receipts"))).toBe(false);

  const p = await ctx.newPage();
  await p.goto(`chrome-extension://${extId}/sidepanel.html?tabId=${tabId}`);
  await expect(p.locator("#r-blocked")).toHaveText("3");
  await expect(p.locator("#r-hosts")).toHaveText("2");
  await expect(p.locator("#r-sections .name", { hasText: AD })).toBeVisible();
  await expect(p.locator("#r-sections .name", { hasText: TRACKER })).toBeVisible();
  await p.locator("#r-sections details", { hasText: AD }).locator("summary").click();
  await expect(p.locator("#r-sections details[open] .paths")).toContainText("/a/b.js");
  await expect(p.locator("#r-sections")).not.toContainText("SECRET");

  await p.getByRole("button", { name: "Copy receipt" }).click();
  await expect(p.locator("#copy-status")).toHaveText("Copied.");
  const text = (await p.evaluate(() => navigator.clipboard.readText())).replaceAll("\r\n", "\n"); // Windows clipboard turns \n into \r\n
  expect(text).toContain("Ads (EasyList)\nib.adnxs.com  2");
  expect(text).toContain("Hush privacy receipt\nSite: 127.0.0.1\n");
  expect(text).toContain("Requests blocked: 3\nTracker hosts: 2");
  expect(text).toMatch(new RegExp(`${AD.replaceAll(".", "\\.")}  2`));
  expect(text).toMatch(new RegExp(`${TRACKER.replaceAll(".", "\\.")}  1`));
  expect(text).not.toContain("SECRET");

  // live update: a reload resets then refills
  await page.reload();
  await expect.poll(async () => (await stored())[tabId]?.blocked).toBe(3);
  await p.close();
  await page.close();
});

test("a paused site records nothing and the panel says so", async () => {
  const p0 = await ctx.newPage();
  await p0.goto(`chrome-extension://${extId}/popup.html?url=chrome://newtab`);
  await p0.evaluate(() => chrome.runtime.sendMessage({ type: "setSiteOff", host: "127.0.0.1", off: true }));
  await p0.close();
  const page = await ctx.newPage();
  await page.goto(origin);
  const tabId = await tabIdOf();
  await page.waitForTimeout(1000);
  expect((await stored())[tabId]?.blocked ?? 0).toBe(0);
  const p = await ctx.newPage();
  await p.goto(`chrome-extension://${extId}/sidepanel.html?tabId=${tabId}`);
  await expect(p.locator("#r-note")).toHaveText("Paused on 127.0.0.1, nothing is blocked here.");
  await expect(p.locator("#r-body")).toBeHidden();
  await p.evaluate(() => chrome.runtime.sendMessage({ type: "setSiteOff", host: "127.0.0.1", off: false }));
  await p.close();
  await page.close();
});

test("empty state when nothing was blocked", async () => {
  const p = await ctx.newPage();
  await p.goto(`chrome-extension://${extId}/sidepanel.html?tabId=99999`);
  await expect(p.locator("#r-note")).toContainText(/does not run|Nothing blocked/);
  await p.close();
});
