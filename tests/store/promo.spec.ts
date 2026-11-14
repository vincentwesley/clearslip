// Chrome Web Store small promo tile (440x280). Run: npx playwright test -c tests/store/playwright.store.config.ts --grep promo
import { test, chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

test("promo tile", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 440, height: 280 } });
  await page.goto(pathToFileURL(path.join(here, "promo.html")).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(here, "../../docs/store/promo-440x280.png") });
  await browser.close();
});
