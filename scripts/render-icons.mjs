// One-off: renders static/icons/icon.svg to PNGs with Playwright's Chromium. Run: node scripts/render-icons.mjs
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

const svg = readFileSync("static/icons/icon.svg", "utf8");
const browser = await chromium.launch();
try {
  for (const size of [16, 32, 48, 128]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<body style="margin:0">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`);
    writeFileSync(`static/icons/icon-${size}.png`, await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size } }));
    await page.close();
  }
} finally {
  await browser.close();
}
console.log("icons rendered");
