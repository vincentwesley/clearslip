// Privacy receipt store and formatting. Pure: no chrome.* so it is unit-testable.
import { LISTS, LIST_IDS, type ListId } from "../compiler/types.ts";
import { filterHost, type Maps, type Match } from "./matched";
import { hostFromUrl, hostSuffixes, isValidHost } from "./site";

export const MAX_HOSTS = 200; // per tab, oldest host dropped
export const MAX_TABS = 50; // oldest tab dropped
export const MAX_PATHS = 5; // distinct paths kept per host
const MAX_PATH_LEN = 200;

export interface HostEntry {
  count: number;
  types: Record<string, number>;
  paths: string[]; // pathname only: no query, no fragment
}
export interface TabReceipt {
  site: string;
  loadedAt: number;
  touched: number;
  blocked: number;
  skip?: true; // incognito: nothing is recorded
  hosts: Record<string, HostEntry>;
}
export type Receipts = Record<string, TabReceipt>;

/** Host and query-free path of a request URL, else null. */
export function splitUrl(url: unknown): { host: string; path: string } | null {
  let u: URL;
  try {
    u = new URL(String(url));
  } catch {
    return null;
  }
  if (!/^(https?|wss?):$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!isValidHost(host)) return null; // page-controlled: also keeps `__proto__` and friends out of the lookups below
  return { host, path: u.pathname.slice(0, MAX_PATH_LEN) };
}

const noHash = (u: string): string => u.split("#")[0];

/**
 * Decides whether a tab's receipt starts over. `pending` holds the last main-frame request URL per tab
 * (set on webRequest.onBeforeRequest); a tabs.onUpdated "loading" for that same URL means the navigation
 * really committed. Requests that never commit (204, downloads, aborted) leave a stale entry that never
 * matches a later URL; pushState and #fragment changes have no request, so they never match either.
 * Fallback for pages swapped in without a request (prerender activation): no receipt yet, or the host changed.
 * Known limitation: a same-host back/forward-cache navigation has no request, so it keeps the previous page's receipt.
 */
export function commitsPage(pending: Map<number, string>, rec: TabReceipt | undefined, tabId: number, url: string): boolean {
  const want = pending.get(tabId);
  if (want !== undefined && noHash(want) === noHash(url)) {
    pending.delete(tabId);
    return true;
  }
  return !rec || hostFromUrl(url) !== rec.site;
}

/** A new top-level page replaces whatever the tab had. */
export function beginPage(r: Receipts, tabId: number, site: string, now: number, skip = false): void {
  r[tabId] = { site, loadedAt: now, touched: now, blocked: 0, hosts: {}, ...(skip && { skip: true as const }) };
  const ids = Object.keys(r);
  if (ids.length > MAX_TABS) {
    const oldest = ids.reduce((a, b) => (r[a].touched <= r[b].touched ? a : b));
    delete r[oldest];
  }
}

/** Count one blocked request. False when nothing was recorded (no page, incognito, paused, unusable URL). */
export function recordBlock(r: Receipts, tabId: number, req: { url: string; type: string }, now: number, paused: boolean): boolean {
  const tab = r[tabId];
  const u = splitUrl(req.url);
  if (!tab || tab.skip || paused || !u) return false;
  let e = Object.hasOwn(tab.hosts, u.host) ? tab.hosts[u.host] : undefined; // "constructor" is a valid host
  if (!e) {
    const keys = Object.keys(tab.hosts);
    if (keys.length >= MAX_HOSTS) delete tab.hosts[keys[0]]; // insertion order = first seen
    e = tab.hosts[u.host] = { count: 0, types: {}, paths: [] };
  }
  e.count++;
  e.types[req.type] = (Object.hasOwn(e.types, req.type) ? e.types[req.type] : 0) + 1;
  if (e.paths.length < MAX_PATHS && !e.paths.includes(u.path)) e.paths.push(u.path);
  tab.blocked++;
  tab.touched = now;
  return true;
}

export interface ListInfo {
  list: ListId;
  filter: string;
}
/** Hosts named by block filters that fired, from getMatchedRules + the build-time maps. Merged (compact) rules and allow rules stay unknown. */
export function listIndex(matches: Match[], maps: Maps): Map<string, ListInfo> {
  const out = new Map<string, ListInfo>();
  for (const { rule } of matches) {
    const entry = maps[rule.rulesetId]?.[rule.ruleId];
    if (!entry) continue;
    const [list, n, filter] =
      typeof entry === "string" ? [rule.rulesetId.slice("detail-".length) as ListId, 1, entry] : [LIST_IDS[entry[0]], entry[1], entry[2]];
    const host = n > 1 || filter.startsWith("@@") ? null : filterHost(filter);
    if (host && !out.has(host)) out.set(host, { list, filter });
  }
  return out;
}

export interface Row extends HostEntry {
  host: string;
  info?: ListInfo;
}
export interface Section {
  key: "ads" | "trackers" | "other";
  title: string;
  rows: Row[];
}
const TITLES = { ads: "Ads", trackers: "Trackers", other: "Other" } as const;

/** Rows grouped by the list that blocks the host (EasyList = Ads, EasyPrivacy = Trackers), busiest first. Empty sections are omitted. */
export function sections(tab: TabReceipt, index: Map<string, ListInfo>): Section[] {
  const groups: Record<Section["key"], Row[]> = { ads: [], trackers: [], other: [] };
  for (const [host, e] of Object.entries(tab.hosts)) {
    const info = hostSuffixes(host)
      .map((h) => index.get(h))
      .find(Boolean);
    groups[info ? (info.list === "easylist" ? "ads" : "trackers") : "other"].push({ host, ...e, info });
  }
  return (Object.keys(groups) as Section["key"][])
    .filter((k) => groups[k].length)
    .map((key) => ({ key, title: TITLES[key], rows: groups[key].sort((a, b) => b.count - a.count || a.host.localeCompare(b.host)) }));
}

/** Plain-text receipt for the clipboard. */
export function receiptText(tab: TabReceipt, index: Map<string, ListInfo>): string {
  const lines = [
    "Hush privacy receipt",
    `Site: ${tab.site}`,
    `Loaded: ${new Date(tab.loadedAt).toISOString()}`,
    `Requests blocked: ${tab.blocked}`,
    `Tracker hosts: ${Object.keys(tab.hosts).length}`,
  ];
  for (const s of sections(tab, index)) {
    lines.push("", s.key === "other" ? s.title : `${s.title} (${LISTS[s.key === "ads" ? "easylist" : "easyprivacy"].name})`);
    for (const r of s.rows) lines.push(`${r.host}  ${r.count}`);
  }
  return lines.join("\n") + "\n";
}
