// Join getMatchedRules results with the build-time rule maps. Pure.

export interface MapEntry {
  l: "easylist" | "easyprivacy";
  f: string[];
}
export interface Match {
  rule: { ruleId: number; rulesetId: string };
}
export interface Group {
  key: string;
  label: string;
  list: MapEntry["l"];
  count: number;
}
export type Maps = Record<string, (MapEntry | null)[]>;

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
    if (!entry || entry.f.length === 0 || entry.f[0].startsWith("@@")) continue;
    total++;
    const merged = entry.f.length > 1;
    const host = merged ? null : filterHost(entry.f[0]);
    const key = merged ? `${rule.rulesetId}#${rule.ruleId}` : `${entry.l}:${host ?? "other"}`;
    const label = merged ? `${entry.f.length} hosts and patterns (merged rule)` : (host ?? "Other patterns");
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { key, label, list: entry.l, count: 1 });
  }
  return { total, groups: [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)) };
}

export const LIST_NAME: Record<MapEntry["l"], string> = { easylist: "EasyList", easyprivacy: "EasyPrivacy" };

