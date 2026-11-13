// Chrome Web Store screenshots (1280x800) from the real extension on a real ad-heavy site.
// Run: npm run build && npx playwright test -c tests/store/playwright.store.config.ts   (live network, local only, never CI)
import { test, expect, chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.join(root, "dist");
const out = path.join(root, "docs/store");
const SITE = "https://www.channelnewsasia.com/";
const VIEW = { width: 1280, height: 800 };

// Centre an extension page on a plain backdrop so the image is exactly 1280x800.
const frame = (w: number, h?: number) => `
  html { overflow: hidden; width: auto !important; height: 100vh; display: grid; place-items: center; background: #0b0e08; }
  body { width: ${w}px !important; ${h ? `height: ${h}px; overflow: auto;` : ""} box-shadow: 0 0 0 2px #4fe0a0, 0 0 40px rgba(79,224,160,.25); }`;

test("store screenshots", async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hush-store-"));
  const ctx = await chromium.launchPersistentContext(dir, {
    channel: "chromium",
    viewport: VIEW,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  try {
    const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
    const id = new URL(sw.url()).host;
    await expect.poll(() => sw.evaluate(async () => (await chrome.storage.local.get("mode")).mode), { timeout: 60000 }).toBeTruthy();

    const site = await ctx.newPage();
    await site.goto(SITE, { waitUntil: "load", timeout: 45000 });
    await site.waitForTimeout(8000);
    const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: "https://www.channelnewsasia.com/*" }))[0].id as number);
    const q = `tabId=${tabId}&url=${encodeURIComponent(SITE)}`;

    const popup = await ctx.newPage();
    await popup.setViewportSize(VIEW);
    await popup.goto(`chrome-extension://${id}/popup.html?${q}`);
    await expect(popup.locator("#groups li").first()).toBeVisible({ timeout: 20000 });
    await popup.addStyleTag({ content: frame(360) });
    await popup.screenshot({ path: path.join(out, "1-popup.png") });

    const panel = await ctx.newPage();
    await panel.setViewportSize(VIEW);
    await panel.goto(`chrome-extension://${id}/sidepanel.html?tabId=${tabId}`);
    await panel.waitForTimeout(2500);
    await panel.addStyleTag({ content: frame(460, 760) });
    await panel.screenshot({ path: path.join(out, "2-receipt.png") });

    // Picker: start it the way the popup does, hover a big element, click it.
    await site.bringToFront();
    await site.setViewportSize(VIEW);
    await popup.evaluate((t) => chrome.runtime.sendMessage({ type: "startPicker", tabId: t }), tabId);
    await site.mouse.move(630, 630);
    await site.mouse.move(640, 640);
    await site.mouse.click(640, 640);
    // The bar lives in a closed shadow root, so step Up a fixed number of times to reach a card-sized element.
    for (let i = 0; i < 1; i++) {
      await site.keyboard.press("ArrowUp");
      await site.waitForTimeout(300);
    }
    await site.waitForTimeout(500);
    await site.screenshot({ path: path.join(out, "3-hide-something.png") });
  } finally {
    await ctx.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
