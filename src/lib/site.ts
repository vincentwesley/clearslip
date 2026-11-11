// Pure helpers for the per-site off switch. No chrome.* here so they are unit-testable.

export const MAX_OFF_SITES = 1000;
export const SITE_RULE_PRIORITY = 100;

const HOST = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

/** Exact lowercase hostname of an http(s) URL, else null. IPv6 literals are unsupported. */
export function hostFromUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  return isValidHost(host) ? host : null;
}

export function isValidHost(host: unknown): host is string {
  return typeof host === "string" && HOST.test(host);
}

export interface SiteRule {
  id: number;
  priority: number;
  action: { type: "allowAllRequests" };
  condition: { requestDomains: string[]; resourceTypes: ["main_frame", "sub_frame"] };
}

export function siteRule(id: number, host: string): SiteRule {
  return {
    id,
    priority: SITE_RULE_PRIORITY,
    action: { type: "allowAllRequests" },
    condition: { requestDomains: [host], resourceTypes: ["main_frame", "sub_frame"] },
  };
}

/** Dynamic rules for a list of hosts. Ids are 1-based positions, so the same list always gives the same rules. */
export function siteRules(hosts: string[]): SiteRule[] {
  return hosts.map((h, i) => siteRule(i + 1, h));
}

/** Add or remove a host, keeping the list validated, unique, sorted and capped. */
export function withSite(off: string[], host: string, isOff: boolean): string[] {
  const set = new Set(off.filter(isValidHost));
  if (isOff) set.add(host);
  else set.delete(host);
  return [...set].sort().slice(0, MAX_OFF_SITES);
}
