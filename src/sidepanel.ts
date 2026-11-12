import "./credits/credits.js";
import { nextTheme, type Theme } from "./theme";

const root = document.documentElement;
const btn = document.querySelector<HTMLButtonElement>("#theme")!;
const KEY = "theme";

function read(): Theme {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}
function show(t: Theme): void {
  root.dataset.theme = t;
  btn.setAttribute("aria-pressed", String(t === "light"));
  btn.textContent = t === "light" ? "Dark theme" : "Light theme";
}
show(read());
btn.addEventListener("click", () => {
  const t = nextTheme(read());
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* not persisted */
  }
  show(t);
});
// ---- Privacy receipt. All page data (hosts, paths, filters) is untrusted: textContent only. ----
import { loadMaps } from "./lib/maps";
import { listIndex, receiptText, sections, type ListInfo, type TabReceipt, type Receipts } from "./lib/receipt";
import { hostFromUrl, siteIsOff } from "./lib/site";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const el = (tag: string, cls?: string, text?: string): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const params = new URLSearchParams(location.search); // `?tabId=` lets tests aim the panel at a tab

async function pickTab(): Promise<chrome.tabs.Tab | undefined> {
  try {
    if (params.has("tabId")) return await chrome.tabs.get(Number(params.get("tabId")));
    return (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  } catch {
    return undefined;
  }
}

// Which list blocks which host comes from getMatchedRules, throttled to stay inside its quota.
let index = new Map<string, ListInfo>();
let indexKey = "";
let lastResolve = 0;
let retry: ReturnType<typeof setTimeout> | undefined;
async function resolveLists(tabId: number, tab: TabReceipt, key: string): Promise<void> {
  if (key !== indexKey) {
    index = new Map();
    indexKey = key;
    lastResolve = 0;
  }
  const unknown = Object.keys(tab.hosts).some((h) => ![...index.keys()].some((k) => h === k || h.endsWith(`.${k}`)));
  if (!unknown) return;
  const wait = lastResolve + 30000 - Date.now();
  if (wait > 0) {
    clearTimeout(retry);
    retry = setTimeout(() => void refresh(), wait);
    return;
  }
  lastResolve = Date.now();
  try {
    const { rulesMatchedInfo } = await chrome.declarativeNetRequest.getMatchedRules({ tabId });
    const matches = rulesMatchedInfo.filter((m) => m.rule.rulesetId !== "_dynamic");
    index = listIndex(matches, await loadMaps([...new Set(matches.map((m) => m.rule.rulesetId))]));
  } catch {
    /* rows stay under "Other" */
  }
}

function row(r: ReturnType<typeof sections>[number]["rows"][number], open: boolean): HTMLDetailsElement {
  const d = el("details", "row") as HTMLDetailsElement;
  d.open = open;
  const s = el("summary");
  s.append(el("span", "name mono", r.host), el("span", "count mono", String(r.count)));
  const chips = el("span", "chips");
  for (const [t, n] of Object.entries(r.types)) chips.append(el("span", "chip", n > 1 ? `${t} x${n}` : t));
  s.append(chips);
  const paths = el("ul", "paths mono");
  for (const p of r.paths) paths.append(el("li", undefined, p));
  d.append(s, paths, el("p", "hint mono", r.info ? `Filter: ${r.info.filter}` : "Filter: not identified"));
  return d;
}

let current: { text: string } | undefined;
function render(note: string | null, site: string, tab?: TabReceipt): void {
  $("r-site").textContent = site;
  $("r-time").textContent = tab ? `Page loaded ${new Date(tab.loadedAt).toLocaleString()}` : "";
  $("r-note").textContent = note ?? "";
  $("r-note").hidden = note === null;
  $("r-body").hidden = !tab;
  current = undefined;
  if (!tab) return;
  $("r-blocked").textContent = String(tab.blocked);
  $("r-hosts").textContent = String(Object.keys(tab.hosts).length);
  const open = new Set([...document.querySelectorAll("#r-sections details[open] .name")].map((n) => n.textContent));
  $("r-sections").replaceChildren(
    ...sections(tab, index).map((s) => {
      const sec = el("section", "group");
      sec.append(el("h3", undefined, `${s.title} (${s.rows.length})`));
      for (const r of s.rows) sec.append(row(r, open.has(r.host)));
      return sec;
    }),
  );
  current = { text: receiptText(tab, index) };
}

let seq = 0;
async function refresh(): Promise<void> {
  const mine = ++seq;
  const tab = await pickTab();
  const host = hostFromUrl(tab?.url);
  if (tab?.id === undefined || !host) return render("Hush does not run on this page.", tab?.url ? "This page" : "No page");
  const [state, stored] = await Promise.all([
    chrome.runtime.sendMessage({ type: "getState" }).catch(() => undefined) as Promise<{ ok?: boolean; off?: string[] } | undefined>,
    chrome.storage.session.get("receipts"),
  ]);
  if (mine !== seq) return;
  if (state?.ok && siteIsOff(state.off ?? [], host)) return render(`Paused on ${host}, nothing is blocked here.`, host);
  const rec = (stored.receipts as Receipts | undefined)?.[tab.id];
  if (!rec || rec.skip || rec.site !== host || rec.blocked === 0) return render("Nothing blocked on this page yet.", host);
  await resolveLists(tab.id, rec, `${tab.id}:${rec.loadedAt}`);
  if (mine === seq) render(null, host, rec);
}

$("copy").addEventListener("click", () => {
  if (!current) return;
  navigator.clipboard.writeText(current.text).then(
    () => ($("copy-status").textContent = "Copied."),
    () => ($("copy-status").textContent = "Could not copy."),
  );
});
chrome.storage.session.onChanged.addListener(() => void refresh());
chrome.storage.local.onChanged.addListener((c) => c.off && void refresh()); // pause switch changed
chrome.tabs.onActivated.addListener(() => void refresh());
chrome.tabs.onUpdated.addListener((_id, c) => c.url && void refresh());
void refresh();
