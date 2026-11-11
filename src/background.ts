// Service worker. Local-only: reads packaged files and chrome.storage, makes no network calls.
import { isValidHost, siteRules, withSite } from "./lib/site";

type Mode = "detail" | "compact";
const DETAIL = ["detail-easylist", "detail-easyprivacy"];

async function detailRuleTotal(): Promise<{ detail: number; compact: number }> {
  try {
    // Packaged extension file, not a network request.
    const report = await (await fetch(chrome.runtime.getURL("rulesets/report.json"))).json();
    const n = (id: string): number => Number(report?.rulesets?.[id]?.rules) || 0;
    return { detail: DETAIL.reduce((s, id) => s + n(id), 0), compact: n("compact") };
  } catch {
    return { detail: 0, compact: 0 };
  }
}

async function chooseMode(): Promise<Mode> {
  const { detail, compact } = await detailRuleTotal();
  const enabled = await chrome.declarativeNetRequest.getEnabledRulesets();
  const compactOn = enabled.includes("compact");
  const room = (await chrome.declarativeNetRequest.getAvailableStaticRuleCount()) + (compactOn ? compact : 0);
  let mode: Mode = detail > 0 && room >= detail ? "detail" : "compact";
  const wanted = mode === "detail" ? DETAIL : ["compact"];
  const unwanted = mode === "detail" ? ["compact"] : DETAIL;
  if (wanted.some((id) => !enabled.includes(id)) || unwanted.some((id) => enabled.includes(id))) {
    try {
      await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: wanted, disableRulesetIds: unwanted });
    } catch (e) {
      console.warn("Hush: could not switch rulesets, using compact", e);
      mode = "compact";
      await chrome.declarativeNetRequest
        .updateEnabledRulesets({ enableRulesetIds: ["compact"], disableRulesetIds: DETAIL })
        .catch(console.error);
    }
  }
  return mode;
}

async function readOff(): Promise<string[]> {
  const { off } = await chrome.storage.local.get("off");
  return Array.isArray(off) ? off.filter(isValidHost) : [];
}

// Replace all dynamic rules with those for `off` in one atomic call: idempotent, no drift.
async function reconcile(off: string[]): Promise<void> {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules: siteRules(off) as chrome.declarativeNetRequest.Rule[],
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
  const mode = await chooseMode();
  const off = await readOff();
  await chrome.storage.local.set({ mode, off });
  await reconcile(off);
}

chrome.runtime.onInstalled.addListener(() => void serial(init).catch(console.error));
chrome.runtime.onStartup.addListener(() => void serial(init).catch(console.error));

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  // Only this extension's own pages (popup, side panel).
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(""))) return false;
  const m = msg as { type?: unknown; host?: unknown; off?: unknown } | null;
  if (m?.type === "getState") {
    void (async () => {
      const { mode } = await chrome.storage.local.get("mode");
      sendResponse({ ok: true, mode: mode === "detail" ? "detail" : "compact", off: await readOff() });
    })().catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (m?.type === "setSiteOff" && isValidHost(m.host) && typeof m.off === "boolean") {
    const { host, off: isOff } = m;
    void serial(async () => {
      const off = withSite(await readOff(), host, isOff);
      await chrome.storage.local.set({ off });
      await reconcile(off);
      sendResponse({ ok: true, off });
    }).catch(() => sendResponse({ ok: false }));
    return true;
  }
  return false;
});
