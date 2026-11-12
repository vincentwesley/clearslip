// Service worker. Local-only: reads packaged files and chrome.storage, makes no network calls.
import { DETAIL_IDS, RULESET_IDS, type Report } from "./compiler/types.ts";
import { toCss, type Specific } from "./compiler/cosmetic.ts";
import { planCosmetic } from "./lib/cosmetic";
import { pickMode, type Mode } from "./lib/mode";
import { beginPage, recordBlock, type Receipts } from "./lib/receipt";
import { hostFromUrl, isValidHost, siteIsOff, siteRules, withSite } from "./lib/site";

const DETAIL: string[] = [...DETAIL_IDS];

async function ruleCounts(): Promise<Record<string, number>> {
  try {
    // Packaged extension file, not a network request.
    const report = (await (await fetch(chrome.runtime.getURL("rulesets/report.json"))).json()) as Report;
    return Object.fromEntries(RULESET_IDS.map((id) => [id, Number(report?.rulesets?.[id]?.rules) || 0]));
  } catch {
    return {};
  }
}

const plan = (mode: Mode) =>
  mode === "detail"
    ? { enableRulesetIds: DETAIL, disableRulesetIds: ["compact"] }
    : { enableRulesetIds: ["compact"], disableRulesetIds: DETAIL };
const apply = (mode: Mode) => chrome.declarativeNetRequest.updateEnabledRulesets(plan(mode));

async function chooseMode(): Promise<Mode> {
  const [counts, enabled, free] = await Promise.all([
    ruleCounts(),
    chrome.declarativeNetRequest.getEnabledRulesets(),
    chrome.declarativeNetRequest.getAvailableStaticRuleCount(),
  ]);
  let mode = pickMode(counts, enabled, free);
  const { enableRulesetIds: wanted, disableRulesetIds: unwanted } = plan(mode);
  if (wanted.some((id) => !enabled.includes(id)) || unwanted.some((id) => enabled.includes(id))) {
    try {
      await apply(mode);
    } catch (e) {
      console.warn("Hush: could not switch rulesets, using compact", e);
      mode = "compact";
      await apply(mode).catch(console.error);
    }
  }
  return mode;
}

const cleanOff = (off: unknown): string[] => (Array.isArray(off) ? off.filter(isValidHost) : []);
const readOff = async (): Promise<string[]> => cleanOff((await chrome.storage.local.get("off")).off);

// Replace all dynamic rules with those for `off` in one atomic call: idempotent, no drift.
async function reconcile(off: string[]): Promise<void> {
  const want = siteRules(off);
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const byId = new Map(existing.map((r) => [r.id, r]));
  const same = byId.size === want.length && want.every((r) => byId.get(r.id)?.condition.requestDomains?.join() === r.condition.requestDomains.join());
  if (same) return;
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules: want as chrome.declarativeNetRequest.Rule[],
  });
}
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
};

async function init(): Promise<void> {
  await chrome.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: true });
  const [mode, off] = await Promise.all([chooseMode(), readOff()]);
  await chrome.storage.local.set({ mode, off });
  await reconcile(off);
}

chrome.runtime.onInstalled.addListener(() => void serial(init).catch(console.error));
chrome.runtime.onStartup.addListener(() => void serial(init).catch(console.error));

// Packaged files, read lazily (the worker may have slept) and cached for its lifetime.
const once = <T>(name: string) => {
  let p: Promise<T> | undefined;
  return () =>
    (p ??= fetch(chrome.runtime.getURL(`rulesets/${name}.json`)).then(
      (r) => r.json() as Promise<T>,
      (e) => {
        p = undefined;
        throw e;
      },
    ));
};
const loadSpecific = once<Specific>("cosmetic-specific");
const loadGeneric = once<string[]>("cosmetic-generic"); // only needed when a frame has generic exceptions
const genericMinus = new Map<string, Promise<string>>(); // frame host -> CSS of generic minus its exceptions

async function injectCosmetic(sender: chrome.runtime.MessageSender): Promise<void> {
  const tabId = sender.tab?.id;
  const site = hostFromUrl(sender.tab?.url);
  if (tabId === undefined || sender.frameId === undefined || !site) return;
  const frame = hostFromUrl(sender.url) ?? site; // about:blank / srcdoc frames inherit the site
  const [specific, off] = await Promise.all([loadSpecific(), readOff()]);
  if (siteIsOff(off, site)) return;
  const plan = planCosmetic(site, frame, specific);
  if (!plan) return;
  const target = { tabId, frameIds: [sender.frameId] };
  const insert = (o: { files: string[] } | { css: string }) => chrome.scripting.insertCSS({ target, origin: "USER", ...o });
  const calls: Promise<void>[] = [];
  if (plan.file) calls.push(insert({ files: ["rulesets/cosmetic-generic.css"] }));
  else if (plan.genericOff.length) {
    let css = genericMinus.get(frame);
    if (!css) {
      const skip = new Set(plan.genericOff);
      css = loadGeneric().then((g) => toCss(g.filter((s) => !skip.has(s))));
      genericMinus.set(frame, css);
      css.catch(() => genericMinus.delete(frame));
    }
    calls.push(css.then((c) => insert({ css: c })));
  }
  if (plan.css) calls.push(insert({ css: plan.css }));
  await Promise.all(calls);
}

// Privacy receipt: blocked requests per tab, in memory-only session storage. Observed locally, never sent anywhere.
// A main-frame request start (webRequest, no extra permission) resets the tab; other extensions' blocks look the same and are counted too.
let receipts: Promise<Receipts> | undefined;
const loadReceipts = () => (receipts ??= chrome.storage.session.get("receipts").then((s) => (s.receipts ?? {}) as Receipts));
let flushTimer: ReturnType<typeof setTimeout> | undefined;
const flush = (r: Receipts): void => {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void chrome.storage.session.set({ receipts: r }).catch(console.warn), 150);
};
let recQueue: Promise<unknown> = Promise.resolve();
const record = (fn: (r: Receipts) => Promise<void>): void => {
  recQueue = recQueue.then(async () => {
    const r = await loadReceipts();
    await fn(r);
    flush(r);
  }).catch(() => undefined);
};

chrome.webRequest.onBeforeRequest.addListener(
  (d) => {
    record(async (r) => {
      if (d.tabId < 0) return;
      const site = hostFromUrl(d.url);
      if (!site) return void delete r[d.tabId];
      const tab = await chrome.tabs.get(d.tabId).catch(() => undefined);
      beginPage(r, d.tabId, site, Date.now(), tab?.incognito ?? true);
    });
  },
  { urls: ["<all_urls>"], types: ["main_frame"] },
);
chrome.webRequest.onErrorOccurred.addListener(
  (d) => {
    if (d.error !== "net::ERR_BLOCKED_BY_CLIENT" || d.tabId < 0 || d.type === "main_frame") return;
    record(async (r) => {
      if (!r[d.tabId]) {
        // Worker woke mid-page: adopt the tab's current page.
        const tab = await chrome.tabs.get(d.tabId).catch(() => undefined);
        const site = hostFromUrl(tab?.url);
        if (!tab || !site) return;
        beginPage(r, d.tabId, site, Date.now(), tab.incognito);
      }
      recordBlock(r, d.tabId, d, Date.now(), siteIsOff(await readOff(), r[d.tabId].site));
    });
  },
  { urls: ["<all_urls>"] },
);
chrome.tabs.onRemoved.addListener((tabId) => record(async (r) => void delete r[tabId]));

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  // The content script: trust only `sender`, never the message body.
  if ((msg as { type?: unknown } | null)?.type === "cosmetic") {
    if (sender.tab && sender.id === chrome.runtime.id) void injectCosmetic(sender).catch(() => undefined);
    return false;
  }
  // Only this extension's own pages (popup, side panel).
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(""))) return false;
  const m = msg as { type?: unknown; host?: unknown; off?: unknown } | null;
  if (m?.type === "getState") {
    void (async () => {
      const { mode, off } = await chrome.storage.local.get(["mode", "off"]);
      sendResponse({ ok: true, mode: mode === "detail" ? "detail" : "compact", off: cleanOff(off) });
    })().catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (m?.type === "setSiteOff" && isValidHost(m.host) && typeof m.off === "boolean") {
    const { host, off: isOff } = m;
    void serial(async () => {
      const cur = await readOff();
      const r = withSite(cur, host, isOff);
      if (r.limit) return sendResponse({ ok: false, reason: "limit" });
      await chrome.storage.local.set({ off: r.off });
      await reconcile(r.off);
      sendResponse({ ok: true, off: r.off });
    }).catch(() => sendResponse({ ok: false }));
    return true;
  }
  return false;
});

