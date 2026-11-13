// Live-web check: each site loaded once without and once with Clearslip, sequentially. Run with `npm run test:real`.
import { test, expect, chromium, type BrowserContext } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.join(root, "dist");
const DOC = path.join(root, "docs/real-site-check.md");
const BLOCKED = "net::ERR_BLOCKED_BY_CLIENT";
const generic: string[] = JSON.parse(fs.readFileSync(path.join(dist, "rulesets/cosmetic-generic.json"), "utf8"));

const SITES = [
  { url: "https://www.theguardian.com/international", news: true },
  { url: "https://www.bbc.com/news", news: true },
  { url: "https://www.straitstimes.com/", news: true },
  { url: "https://www.channelnewsasia.com/", news: true },
  { url: "https://mothership.sg/", news: true },
  { url: "https://www.speedtest.net/", news: false },
  { url: "https://en.wikipedia.org/wiki/Ad_blocking", news: false, control: true },
];

interface Run {
  ok: boolean; // main document loaded
  reason: string;
  requests: number;
  blocked: number;
  bytes: number;
  loadMs: number;
  bodyLen: number;
  matched: number | null; // generic selectors matching >= 1 element (Clearslip run only)
  pageErrors: string[];
  blockedHosts: string[];
}
interface Row {
  url: string;
  plain: Run;
  clearslip: Run | null;
}
const rows: Row[] = [];
let chromiumVersion = "";

async function measure(url: string, withClearslip: boolean): Promise<Run> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clearslip-real-"));
  const args = withClearslip ? [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`] : [];
  const ctx: BrowserContext = await chromium.launchPersistentContext(dir, { channel: "chromium", args });
  try {
    if (withClearslip) {
      const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
      await expect.poll(() => sw.evaluate(async () => (await chrome.storage.local.get("mode")).mode), { timeout: 60000 }).toBeTruthy();
    }
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    const run: Run = { ok: false, reason: "", requests: 0, blocked: 0, bytes: 0, loadMs: 0, bodyLen: 0, matched: null, pageErrors: [], blockedHosts: [] };
    cdp.on("Network.loadingFinished", (e) => (run.bytes += e.encodedDataLength ?? 0));
    page.on("request", () => run.requests++);
    page.on("requestfailed", (r) => {
      if (r.failure()?.errorText === BLOCKED) {
        run.blocked++;
        run.blockedHosts.push(r.url().slice(0, 140)); // full URL, shortened (field name kept short)
      }
    });
    page.on("pageerror", (e) => run.pageErrors.push(String(e.message).slice(0, 160)));
    let status = 0;
    try {
      const res = await page.goto(url, { waitUntil: "load", timeout: 20000 });
      status = res?.status() ?? 0;
    } catch (e) {
      run.reason = String((e as Error).message).split("\n")[0].slice(0, 120);
    }
    if (!run.reason) {
      await page.waitForTimeout(5000);
      const info = await page.evaluate(() => ({
        title: document.title.trim(),
        len: document.body?.innerText.length ?? 0,
        load: Math.round((performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.loadEventStart ?? 0),
      }));
      run.bodyLen = info.len;
      run.loadMs = info.load;
      run.ok = status > 0 && status < 400 && info.title !== "" && info.len > 500;
      if (!run.ok) run.reason = `status ${status}, title "${info.title.slice(0, 40)}", body ${info.len}`;
      if (withClearslip && process.env.CLEARSLIP_SHOTS === "1") {
        const shots = path.join(root, "test-results/real/shots");
        fs.mkdirSync(shots, { recursive: true });
        const host = new URL(url).hostname;
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.screenshot({ path: path.join(shots, `${host}-top.png`) });
        await page.evaluate(() => window.scrollTo(0, 1500));
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(shots, `${host}-scrolled.png`) });
      }
      if (withClearslip) {
        run.matched = await page.evaluate((sels) => {
          let n = 0;
          for (const s of sels) {
            try {
              if (document.querySelector(s)) n++;
            } catch {
              /* invalid selector in this engine */
            }
          }
          return n;
        }, generic);
      }
    }
    chromiumVersion ||= ctx.browser()?.version() ?? (await page.evaluate(() => navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? ""));
    return run;
  } finally {
    await ctx.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** One retry, only when the first attempt did not load. */
async function attempt(url: string, withClearslip: boolean): Promise<Run> {
  const first = await measure(url, withClearslip);
  return first.ok ? first : measure(url, withClearslip);
}

const kb = (b: number) => `${(b / 1024).toFixed(0)} kB`;
function writeDoc(): void {
  let head = "";
  try {
    head = fs.readFileSync(DOC, "utf8");
  } catch {
    /* first run */
  }
  const keep = head.includes("## Problems seen") ? head.slice(head.indexOf("## Problems seen")) : "## Problems seen\n\n(none recorded yet)\n";
  const commit = execFileSync("git", ["-C", root, "rev-parse", "--short", "HEAD"]).toString().trim();
  const lines = rows.map((r) => {
    const site = new URL(r.url).hostname + new URL(r.url).pathname.replace(/\/$/, "");
    if (!r.plain.ok || !r.clearslip) return `| ${site} | unreachable without Clearslip (${r.plain.reason}) | | | | | | |`;
    const h = r.clearslip;
    return `| ${site} | ${r.plain.requests} -> ${h.requests} | ${h.blocked} | ${kb(r.plain.bytes)} -> ${kb(h.bytes)} | ${r.plain.loadMs} -> ${h.loadMs} ms | ${h.matched} | ${h.ok ? "yes" : "NO: " + h.reason} | ${r.plain.pageErrors.length} -> ${h.pageErrors.length} |`;
  });
  const text = `# Real-site check

Headless Chromium ${chromiumVersion}, unpacked \`dist\` build, Clearslip commit ${commit}, ${new Date().toISOString().slice(0, 10)}. Each site: one fresh profile without the extension, one with Clearslip; load, then 5 s settle. Single run per condition: **timing and request counts are indicative only** (ads, A/B tests and CDN choice vary per load). Reproduce with \`npm run test:real\` (live network, local only, never CI).

"Selectors matched" = how many of the generic cosmetic selectors match at least one element on the settled page (Clearslip run). "Page OK" = HTTP status below 400, non-empty title, body text over 500 characters. "Errors" = uncaught page errors, plain -> Clearslip.

| Site | Requests | Blocked | Transferred | Load event | Selectors matched | Page OK | Errors |
|---|---|---|---|---|---|---|---|
${lines.join("\n")}

${keep}`;
  fs.writeFileSync(DOC, text);
}

test.describe.configure({ mode: "serial" });
test.afterAll(() => {
  if (rows.length) writeDoc();
});

for (const site of SITES) {
  test(site.url, async () => {
    const plain = await attempt(site.url, false);
    if (!plain.ok) {
      rows.push({ url: site.url, plain, clearslip: null });
      test.info().annotations.push({ type: "unreachable", description: plain.reason });
      return;
    }
    const clearslip = await attempt(site.url, true);
    rows.push({ url: site.url, plain, clearslip });
    const base = (u: string) => new URL(u).hostname.split(".").slice(-2).join(".");
    console.log(site.url, "blocked hosts:", [...new Set(clearslip.blockedHosts.map((u) => new URL(u).hostname))].slice(0, 12).join(", "));
    console.log("  first-party blocked:", clearslip.blockedHosts.filter((u) => base(u) === base(site.url)).join(" | "));
    console.log("  errors plain:", plain.pageErrors.join(" | "), "|| clearslip:", [...new Set(clearslip.pageErrors)].join(" | "));
    expect.soft(clearslip.ok, `main document loads with Clearslip (${clearslip.reason})`).toBe(true);
    if (site.news) expect.soft(clearslip.blocked, "at least one request blocked").toBeGreaterThan(0);
    if (site.control) expect.soft(Math.abs(clearslip.bodyLen - plain.bodyLen) / plain.bodyLen, "body text within 10% of plain").toBeLessThanOrEqual(0.1);
  });
}
