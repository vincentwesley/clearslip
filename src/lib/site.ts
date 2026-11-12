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

/** `a.b.example.com` -> [`a.b.example.com`, `b.example.com`, `example.com`]. Stops before the bare TLD. */
export function hostSuffixes(host: string): string[] {
  const parts = host.split(".");
  const out: string[] = [];
  for (let i = 0; i < parts.length - 1 || i === 0; i++) out.push(parts.slice(i).join("."));
  return out;
}

/** True when the host or a parent domain is in `off` (the same subdomain-inclusive match the DNR rule uses). */
export const siteIsOff = (off: readonly string[], site: string): boolean => hostSuffixes(site).some((h) => off.includes(h));

/** Add or remove a host, keeping the list validated, unique and sorted. At the cap an add is refused (`limit`) and the list is returned unchanged. */
export function withSite(off: string[], host: string, isOff: boolean): { off: string[]; limit: boolean } {
  const set = new Set(off.filter(isValidHost));
  if (isOff && !set.has(host) && set.size >= MAX_OFF_SITES) return { off: [...set].sort(), limit: true };
  if (isOff) set.add(host);
  else set.delete(host);
  return { off: [...set].sort(), limit: false };
}

