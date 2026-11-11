// Service worker. Local-only: reads packaged files and chrome.storage, makes no network calls.
import { DETAIL_IDS, RULESET_IDS, type Report } from "./compiler/types.ts";
import type { Specific } from "./compiler/cosmetic.ts";
import { planCosmetic, siteIsOff } from "./lib/cosmetic";
import { pickMode, type Mode } from "./lib/mode";
import { hostFromUrl, isValidHost, siteRules, withSite } from "./lib/site";

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
let cosmeticData: Promise<{ specific: Specific; generic: string[] }> | undefined;
const loadCosmetic = () =>
  (cosmeticData ??= Promise.all(["cosmetic-specific", "cosmetic-generic"].map(async (n) => (await fetch(chrome.runtime.getURL(`rulesets/${n}.json`))).json())).then(
    ([specific, generic]) => ({ specific, generic }),
    (e) => {
      cosmeticData = undefined;
      throw e;
    },
  ));

async function injectCosmetic(sender: chrome.runtime.MessageSender): Promise<void> {
  const tabId = sender.tab?.id;
  const site = hostFromUrl(sender.tab?.url);
  if (tabId === undefined || sender.frameId === undefined || !site) return;
  const frame = hostFromUrl(sender.url) ?? site; // about:blank / srcdoc frames inherit the site
  if (siteIsOff(await readOff(), site)) return;
  const { specific, generic } = await loadCosmetic();
  const plan = planCosmetic(site, frame, specific, generic);
  if (!plan) return;
  const target = { tabId, frameIds: [sender.frameId] };
  if (plan.file) await chrome.scripting.insertCSS({ target, files: ["rulesets/cosmetic-generic.css"], origin: "USER" });
  if (plan.css) await chrome.scripting.insertCSS({ target, css: plan.css, origin: "USER" });
}

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

