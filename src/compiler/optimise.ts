import type { Filter, RuleBody, ListId } from "./types.ts";

/** A rule body plus the filters it came from. */
export interface Item {
  list: ListId;
  rule: RuleBody;
  f: string[];
}

const sorted = (a: string[]) => [...a].sort();

/** Canonical key of a filter's meaning, ignoring option order and the $badfilter flag. */
export function filterKey(f: Filter): string {
  return JSON.stringify([
    f.exception, f.kind, f.pattern, sorted(f.types), sorted(f.notTypes), f.thirdParty,
    sorted(f.domains), sorted(f.notDomains), f.matchCase, f.important, f.document,
  ]);
}

/** Splits filters into kept, badfilter lines and the filters they cancelled. */
export function applyBadfilter(filters: Filter[]) {
  const bad = new Set(filters.filter((f) => f.badfilter).map(filterKey));
  const kept: Filter[] = [];
  const badLines: Filter[] = [];
  const cancelled: Filter[] = [];
  for (const f of filters) {
    if (f.badfilter) badLines.push(f);
    else if (bad.has(filterKey(f))) cancelled.push(f);
    else kept.push(f);
  }
  return { kept, badLines, cancelled };
}

/** Keeps the first `max` regex filters (exceptions first, then list order); returns the rest as over budget. */
export function applyRegexBudget(filters: Filter[], max: number) {
  const regex = filters.filter((f) => f.kind === "regex");
  const ordered = [...regex.filter((f) => f.exception), ...regex.filter((f) => !f.exception)];
  const over = new Set(ordered.slice(max));
  return { kept: filters.filter((f) => !over.has(f)), over: [...over] };
}

/** Drops exact duplicate rules within a list, keeping the first; `merge` collects filter texts instead. */
export function dedupe(items: Item[], merge: boolean) {
  const seen = new Map<string, Item>();
  const dupes: Item[] = [];
  for (const it of items) {
    const k = it.list + JSON.stringify(it.rule);
    const prev = seen.get(k);
    if (!prev) seen.set(k, { ...it, f: [...it.f] });
    else if (merge) prev.f.push(...it.f);
    else dupes.push(it);
  }
  return { items: [...seen.values()], dupes };
}

const PURE_HOST = /^\|\|([a-z0-9]([a-z0-9.-]*[a-z0-9])?)\^$/;
export const MERGE_CHUNK = 1000;

export function pureHost(r: RuleBody): string | null {
  const c = r.condition;
  if (r.action.type !== "block" || c.regexFilter || c.isUrlFilterCaseSensitive) return null;
  return c.urlFilter ? (PURE_HOST.exec(c.urlFilter)?.[1] ?? null) : null;
}

/** Merges pure-host block rules with identical options (per list) into requestDomains rules. */
export function mergeHosts(items: Item[]): Item[] {
  const out: Item[] = [];
  const groups = new Map<string, { item: Item; hosts: string[] }>();
  for (const it of items) {
    const host = pureHost(it.rule);
    if (host === null) {
      out.push(it);
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { urlFilter, isUrlFilterCaseSensitive, ...rest } = it.rule.condition;
    const base = { ...it.rule, condition: rest };
    const k = it.list + JSON.stringify(base);
    let g = groups.get(k);
    if (!g || g.hosts.length >= MERGE_CHUNK) {
      const hosts: string[] = [];
      g = { item: { list: it.list, rule: { ...base, condition: { ...rest, requestDomains: hosts } }, f: [] }, hosts };
      groups.set(k, g);
      out.push(g.item);
    }
    g.hosts.push(host);
    g.item.f.push(...it.f);
  }
  return out;
}

/**
 * Orders compact items (allow rules, then EasyPrivacy hosts, EasyList hosts, pattern rules) and
 * cuts from the end until at most `max` remain. Allow rules are never cut.
 */
export function capCompact(items: Item[], max: number) {
  const isHost = (i: Item) => i.rule.condition.requestDomains !== undefined;
  const allow = items.filter((i) => i.rule.action.type !== "block");
  const block = items.filter((i) => i.rule.action.type === "block");
  const ordered = [
    ...allow,
    ...block.filter((i) => isHost(i) && i.list === "easyprivacy"),
    ...block.filter((i) => isHost(i) && i.list === "easylist"),
    ...block.filter((i) => !isHost(i)),
  ];
  const keep = ordered.slice(0, Math.max(max, allow.length));
  return { items: keep, cut: ordered.slice(keep.length) };
}
