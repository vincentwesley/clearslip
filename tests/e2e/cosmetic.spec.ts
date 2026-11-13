import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.join(root, "dist");
const generic: string[] = JSON.parse(fs.readFileSync(path.join(dist, "rulesets/cosmetic-generic.json"), "utf8"));
const ID = (generic.find((s) => /^#[A-Za-z][\w-]*$/.test(s)) ?? "#none").slice(1); // a real id selector from the compiled list

// The page tries to defeat the rule with an author !important rule and an inline !important style.
const box = `<div id="${ID}" style="display:block!important">ad</div><style>#${ID}{display:block!important}</style>`;
const html = (inner: string) => `<!doctype html><title>t</title><body>${inner}</body>`;

let server: http.Server;
let origin: string;
let ctx: BrowserContext;
let dir: string;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(req.url === "/frame" ? html(box) : html(`${box}<iframe id="f" src="/frame"></iframe>`));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "clearslip-cos-"));
  ctx = await chromium.launchPersistentContext(dir, {
    channel: "chromium",
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  await expect.poll(() => sw.evaluate(async () => (await chrome.storage.local.get("mode")).mode), { timeout: 60000 }).toBeTruthy();
});
test.afterAll(async () => {
  await ctx?.close();
  server?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const display = (p: Page | ReturnType<Page["frame"]>) => p!.evaluate((id) => getComputedStyle(document.getElementById(id)!).display, ID);

async function setOff(off: boolean): Promise<void> {
  const sw = ctx.serviceWorkers()[0];
  const extId = new URL(sw.url()).host;
  const p = await ctx.newPage();
  await p.goto(`chrome-extension://${extId}/popup.html?url=chrome://newtab`);
  await p.evaluate((o) => chrome.runtime.sendMessage({ type: "setSiteOff", host: "127.0.0.1", off: o }), off);
  await p.close();
}

test("generic selector hides the element despite page !important, also in a same-origin iframe; off restores it", async () => {
  test.skip(ID === "none", "no generic id selector compiled");
  const page = await ctx.newPage();
  await page.goto(origin);
  await expect.poll(() => display(page)).toBe("none");
  const frame = page.frame({ url: `${origin}frame` })!;
  await expect.poll(() => display(frame)).toBe("none");

  await setOff(true);
  try {
    await page.reload();
    await page.waitForLoadState("load");
    await page.waitForTimeout(1500); // give a (wrongly) injected sheet time to land
    expect(await display(page)).toBe("block");
    expect(await display(page.frame({ url: `${origin}frame` })!)).toBe("block");
  } finally {
    await setOff(false);
  }
  await page.reload();
  await expect.poll(() => display(page)).toBe("none");
  await page.close();
});

test("the content script is the only thing on the page: it does not touch the DOM", async () => {
  const page = await ctx.newPage();
  await page.goto(origin);
  expect(await page.evaluate(() => document.querySelectorAll("style, link, script").length)).toBe(1); // the page's own <style>
  await page.close();
});