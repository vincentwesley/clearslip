// Live-web benchmark: Hush vs uBlock Origin Lite vs AdGuard MV3 vs no blocker. Run with `npm run bench` (local only, never CI).
// Raw output goes to .bench/results.json (+ .bench/sg-survivors.json); `scripts/bench-report.ts` turns it into docs/benchmark/.
import { test, chromium, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const benchDir = path.join(root, ".bench");
const BLOCKED = "net::ERR_BLOCKED_BY_CLIENT";
const RUNS = 3;
const CONDS = ["none", "hush", "ubol", "adguard"] as const;
type Cond = (typeof CONDS)[number];

const SITES = [
  { url: "https://www.theguardian.com/international" },
  { url: "https://www.bbc.com/news" },
  { url: "https://www.straitstimes.com/", sg: true },
  { url: "https://www.channelnewsasia.com/", sg: true },
  { url: "https://mothership.sg/", sg: true },
  { url: "https://www.speedtest.net/" },
  { url: "https://en.wikipedia.org/wiki/Ad_blocking" },
  { url: "https://www.todayonline.com/", sg: true },
  { url: "https://www.hardwarezone.com.sg/", sg: true },
  { url: "https://www.propertyguru.com.sg/", sg: true },
  { url: "https://sg.carousell.com/", sg: true },
  { url: "https://www.asiaone.com/", sg: true },
];

// Simplification: registrable domain = last two labels, or last three when the last two are a known two-level suffix.
const TWO_LEVEL = new Set(["com.sg", "org.sg", "edu.sg", "gov.sg", "net.sg", "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.jp", "co.nz", "co.in", "com.cn", "com.hk", "com.my", "com.br"]);
const regDomain = (host: string): string => {
  const p = host.split(".");
  return p.slice(TWO_LEVEL.has(p.slice(-2).join(".")) ? -3 : -2).join(".");
};

interface Run {
  loaded: boolean; // navigation reached `load`
  ok: boolean; // main document OK: status < 400, non-empty title, body text > 500 chars
  reason: string;
  requests: number;
  blocked: number;
  thirdPartyDone: number;
  bytes: number;
  loadMs: number;
  pageErrors: number;
  blockedHosts: string[];
  survivors: Record<string, number>; // "host|path|type" -> count (third-party requests that completed)
}

const results: {
  meta: Record<string, unknown>;
  sites: { url: string; sg: boolean; excluded: string | null; runs: Record<Cond, Run[]> }[];
} = { meta: {}, sites: [] };
let chromiumVersion = "";

const extDir = (c: Cond): string => path.join(benchDir, c === "hush" ? "../dist" : c);

function readManifest(dir: string): { name?: string; version?: string } {
  return JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
}

/** Launch a fresh profile; for extensions wait for the service worker and (competitors) first-run ruleset setup. */
async function launch(cond: Cond, notes: Record<string, unknown>): Promise<{ ctx: BrowserContext; dir: string }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hush-bench-"));
  const ext = path.resolve(root, extDir(cond));
  const args = cond === "none" ? [] : [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`];
  const ctx = await chromium.launchPersistentContext(dir, { channel: "chromium", args });
  if (cond === "none") return { ctx, dir };
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker", { timeout: 30000 }));
  const deadline = Date.now() + (cond === "hush" ? 60000 : 15000);
  let info: Record<string, unknown> = {};
  while (Date.now() < deadline) {
    info = await sw
      .evaluate(async () => {
        const rs = await chrome.declarativeNetRequest.getEnabledRulesets();
        const perms = await chrome.permissions.getAll();
        const stored = await chrome.storage.local.get(null).catch(() => ({}));
        return { rulesets: rs.length, origins: perms.origins ?? [], storedKeys: Object.keys(stored) };
      })
      .catch(() => ({}));
    if ((info.rulesets as number) > 0) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!notes[cond]) notes[cond] = info;
  return { ctx, dir };
}

async function measure(cond: Cond, url: string, sg: boolean, notes: Record<string, unknown>): Promise<Run> {
  const run: Run = { loaded: false, ok: false, reason: "", requests: 0, blocked: 0, thirdPartyDone: 0, bytes: 0, loadMs: 0, pageErrors: 0, blockedHosts: [], survivors: {} };
  let ctx: BrowserContext | undefined;
  let dir = "";
  try {
    ({ ctx, dir } = await launch(cond, notes));
    const page: Page = await ctx.newPage();
    for (const p of ctx.pages()) if (p !== page) await p.close().catch(() => {}); // onboarding tabs
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    cdp.on("Network.loadingFinished", (e) => (run.bytes += e.encodedDataLength ?? 0));
    const pageHost = new URL(url).hostname;
    const pageReg = regDomain(pageHost);
    page.on("request", () => run.requests++);
    page.on("requestfailed", (r) => {
      if (r.failure()?.errorText === BLOCKED) {
        run.blocked++;
        run.blockedHosts.push(new URL(r.url()).hostname);
      }
    });
    page.on("requestfinished", (r) => {
      let u: URL;
      try {
        u = new URL(r.url());
      } catch {
        return;
      }
      if (!/^https?:$/.test(u.protocol) || regDomain(u.hostname) === pageReg) return;
      run.thirdPartyDone++;
      if (cond === "hush" && sg) {
        const key = `${u.hostname}|${u.pathname}|${r.resourceType()}`;
        run.survivors[key] = (run.survivors[key] ?? 0) + 1;
      }
    });
    page.on("pageerror", () => run.pageErrors++);
    let status = 0;
    try {
      status = (await page.goto(url, { waitUntil: "load", timeout: 25000 }))?.status() ?? 0;
      run.loaded = true;
    } catch (e) {
      run.reason = String((e as Error).message).split("\n")[0].slice(0, 120);
    }
    if (run.loaded) {
      await page.waitForTimeout(5000);
      const info = await page.evaluate(() => ({
        title: document.title.trim(),
        len: document.body?.innerText.length ?? 0,
        load: Math.round((performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.loadEventStart ?? 0),
        ua: navigator.userAgent,
      }));
      run.loadMs = info.load;
      run.ok = status > 0 && status < 400 && info.title !== "" && info.len > 500;
      if (!run.ok) run.reason = `status ${status}, title "${info.title.slice(0, 40)}", body ${info.len}`;
      chromiumVersion ||= info.ua.match(/Chrome\/([\d.]+)/)?.[1] ?? "";
    }
  } catch (e) {
    run.reason = String((e as Error).message).split("\n")[0].slice(0, 160);
  } finally {
    await ctx?.close().catch(() => {});
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
  return run;
}

async function attempt(cond: Cond, url: string, sg: boolean, notes: Record<string, unknown>): Promise<Run> {
  const first = await measure(cond, url, sg, notes);
  return first.ok ? first : measure(cond, url, sg, notes); // one retry only
}

function save(): void {
  fs.writeFileSync(path.join(benchDir, "results.json"), JSON.stringify(results));
}

function writeSurvivors(): void {
  const surv: Record<string, { host: string; path: string; type: string; count: number; sites: Set<string> }> = {};
  const blockedBy: Record<string, Set<string>> = { ubol: new Set(), adguard: new Set() };
  for (const s of results.sites) {
    if (!s.sg || s.excluded) continue;
    for (const r of s.runs.hush)
      for (const [k, n] of Object.entries(r.survivors)) {
        const [host, p, type] = k.split("|");
        const e = (surv[k] ??= { host, path: p, type, count: 0, sites: new Set() });
        e.count += n;
        e.sites.add(new URL(s.url).hostname);
      }
    for (const c of ["ubol", "adguard"] as const) for (const r of s.runs[c]) for (const h of r.blockedHosts) blockedBy[c].add(h);
  }
  const out = Object.values(surv)
    .map((e) => ({ ...e, sites: [...e.sites], blockedUnder: (["ubol", "adguard"] as const).filter((c) => blockedBy[c].has(e.host)) }))
    .sort((a, b) => b.count - a.count);
  fs.writeFileSync(path.join(benchDir, "sg-survivors.json"), JSON.stringify(out, null, 1));
}

test("benchmark", async () => {
  test.setTimeout(6 * 3600 * 1000);
  const versions = JSON.parse(fs.readFileSync(path.join(benchDir, "versions.json"), "utf8")) as Record<string, { version?: string; error?: string }>;
  const active = CONDS.filter((c) => c === "none" || c === "hush" || (versions[c] && !versions[c].error && fs.existsSync(path.join(benchDir, c, "manifest.json"))));
  const notes: Record<string, unknown> = {};
  const commit = execFileSync("git", ["-C", root, "rev-parse", "--short", "HEAD"]).toString().trim();
  const dirty = execFileSync("git", ["-C", root, "status", "--porcelain", "src", "static", "lists"]).toString().trim() !== "";
  results.meta = {
    date: new Date().toISOString().slice(0, 10),
    hushCommit: commit,
    hushDirty: dirty,
    versions,
    manifests: Object.fromEntries(active.filter((c) => c !== "none").map((c) => [c, readManifest(path.resolve(root, extDir(c)))])),
    runs: RUNS,
    conditions: active,
    firstRunState: notes,
  };
  for (const site of SITES) {
    const entry = { url: site.url, sg: !!site.sg, excluded: null as string | null, runs: { none: [], hush: [], ubol: [], adguard: [] } as Record<Cond, Run[]> };
    results.sites.push(entry);
    for (let i = 0; i < RUNS; i++) {
      for (const cond of active) {
        const run = await attempt(cond, site.url, !!site.sg, notes);
        entry.runs[cond].push(run);
        console.log(new URL(site.url).hostname, i + 1, cond, run.ok ? `req ${run.requests} blocked ${run.blocked} 3p ${run.thirdPartyDone}` : `FAIL ${run.reason}`);
        if (cond === "none" && !run.ok && i === 0) break;
      }
      if (entry.runs.none[0] && !entry.runs.none[0].ok) {
        entry.excluded = `unreachable without a blocker (${entry.runs.none[0].reason})`;
        break;
      }
    }
    results.meta.chromium = chromiumVersion;
    save();
  }
  writeSurvivors();
});
