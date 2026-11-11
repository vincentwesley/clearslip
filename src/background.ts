// Service worker. Local-only: reads packaged files and chrome.storage, makes no network calls.
import { DETAIL_IDS, type Report } from "./compiler/types.ts";
import { isValidHost, siteRules, withSite } from "./lib/site";

type Mode = "detail" | "compact";
const DETAIL: string[] = [...DETAIL_IDS];

async function detailRuleTotal(): Promise<{ detail: number; compact: number }> {
  try {
    // Packaged extension file, not a network request.
    const report = (await (await fetch(chrome.runtime.getURL("rulesets/report.json"))).json()) as Report;
    const n = (id: string): number => Number(report?.rulesets?.[id]?.rules) || 0;
    return { detail: DETAIL.reduce((s, id) => s + n(id), 0), compact: n("compact") };
  } catch {
    return { detail: 0, compact: 0 };
  }
}

const plan = (mode: Mode) =>
  mode === "detail"
    ? { enableRulesetIds: DETAIL, disableRulesetIds: ["compact"] }
    : { enableRulesetIds: ["compact"], disableRulesetIds: DETAIL };
const apply = (mode: Mode) => chrome.declarativeNetRequest.updateEnabledRulesets(plan(mode));

async function chooseMode(): Promise<Mode> {
  const [{ detail, compact }, enabled, free] = await Promise.all([
    detailRuleTotal(),
    chrome.declarativeNetRequest.getEnabledRulesets(),
    chrome.declarativeNetRequest.getAvailableStaticRuleCount(),
  ]);
  let mode: Mode = detail > 0 && free + (enabled.includes("compact") ? compact : 0) >= detail ? "detail" : "compact";
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

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
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
      const off = withSite(await readOff(), host, isOff);
      await chrome.storage.local.set({ off });
      await reconcile(off);
      sendResponse({ ok: true, off });
    }).catch(() => sendResponse({ ok: false }));
    return true;
  }
  return false;
});
