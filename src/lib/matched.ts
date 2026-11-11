// Join getMatchedRules results with the build-time rule maps. Pure.

import { LIST_IDS, type ListId, type RuleMap } from "../compiler/types.ts";

export interface Match {
  rule: { ruleId: number; rulesetId: string };
}
export interface Group {
  key: string;
  label: string;
  list: ListId;
  count: number;
}
export type Maps = Record<string, RuleMap>;

/** Host of a filter pattern (`||host^`, `|https://host/`, `@@||host/...`), else null. */
export function filterHost(filter: string): string | null {
  const m = /^(?:@@)?(?:\|\||\|?https?:\/\/)([a-z0-9][a-z0-9.-]*\.[a-z0-9-]+)(?=[/^$:?|]|$)/i.exec(filter);
  return m ? m[1].toLowerCase() : null;
}
/**
 * One group per tracker host (detail mode). In compact mode a merged rule becomes
 * one group listing how many filters it covers. Allow rules are not "blocked" and are skipped.
 */
export function groupMatches(matches: Match[], maps: Maps): { total: number; groups: Group[] } {
  const groups = new Map<string, Group>();
  let total = 0;
  for (const { rule } of matches) {
    const entry = maps[rule.rulesetId]?.[rule.ruleId];
    if (!entry) continue;
    // detail-*: the filter text (list implied by the ruleset id); compact: [listIndex, count, firstFilter].
    const [list, n, first] =
      typeof entry === "string" ? [rule.rulesetId.slice("detail-".length) as ListId, 1, entry] : [LIST_IDS[entry[0]], entry[1], entry[2]];
    if (first.startsWith("@@")) continue;
    total++;
    const merged = n > 1;
    const host = merged ? null : filterHost(first);
    const key = merged ? `${rule.rulesetId}#${rule.ruleId}` : `${list}:${host ?? "other"}`;
    const label = merged ? `${n} hosts and patterns (merged rule)` : (host ?? "Other patterns");
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { key, label, list, count: 1 });
  }
  return { total, groups: [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)) };
}

