import { compileCosmetic } from "./cosmetic.ts";
import { applyBadfilter, applyRegexBudget, capCompact, dedupe, mergeHosts } from "./optimise.ts";
import type { Item } from "./optimise.ts";
import { parseLine } from "./parse.ts";
import { toRule } from "./to-dnr.ts";
import { LIST_IDS, RULESET_IDS } from "./types.ts";
import type { CompileResult, DnrRule, Filter, ListId, ListInput, Report, RuleMap, RulesetId, SourceInfo } from "./types.ts";

export const COMPACT_MAX = 30000;
export const REGEX_MAX = 1000;

const skip = (perList: Report["perList"], list: ListId, reason: string) => {
  const s = perList[list].skipped;
  s[reason] = (s[reason] ?? 0) + 1;
};

/** Parses every line of every list; skip reasons are counted in `perList`. */
export function parseLists(lists: ListInput[]) {
  const perList: Report["perList"] = {};
  const filters: Filter[] = [];
  for (const l of lists) {
    perList[l.id] = { parsed: 0, converted: 0, skipped: {} };
    for (const line of l.text.split(/\r?\n/)) {
      const r = parseLine(line, l.id);
      if (!r) continue;
      perList[l.id].parsed++;
      if (r.ok) filters.push(r.filter);
      else skip(perList, l.id, r.reason);
    }
  }
  return { perList, filters };
}

function build(items: Item[], entry: (i: Item) => unknown) {
  const rules: DnrRule[] = items.map((it, i) => ({ id: i + 1, ...it.rule }));
  const map = [null, ...items.map(entry)] as RuleMap;
  const regexRules = rules.filter((r) => r.condition.regexFilter !== undefined).length;
  return { rules, map, regexRules };
}
const detailEntry = (i: Item) => i.f[0];
const compactEntry = (i: Item) => [LIST_IDS.indexOf(i.list), i.f.length, i.f[0]];

export function compile(
  lists: ListInput[],
  opts: { generatedAt: string; sources?: SourceInfo[] },
): CompileResult {
  const { perList, filters } = parseLists(lists);

  const bf = applyBadfilter(filters);
  bf.badLines.forEach((f) => skip(perList, f.list, "badfilter"));
  bf.cancelled.forEach((f) => skip(perList, f.list, "badfiltered"));
  const rb = applyRegexBudget(bf.kept, REGEX_MAX);
  rb.over.forEach((f) => skip(perList, f.list, "regex-budget"));

  const detail: Record<ListId, Item[]> = { easylist: [], easyprivacy: [] };
  for (const { id } of lists) {
    const items = rb.kept.filter((f) => f.list === id).map((f): Item => ({ list: id, rule: toRule(f), f: [f.raw] }));
    const d = dedupe(items, false);
    d.dupes.forEach((i) => skip(perList, i.list, "duplicate"));
    detail[id] = d.items;
    perList[id].converted = d.items.length;
  }

  const merged = dedupe(mergeHosts([...detail.easylist, ...detail.easyprivacy]), true).items;
  const capped = capCompact(merged, COMPACT_MAX);

  const built = {
    compact: build(capped.items, compactEntry),
    "detail-easylist": build(detail.easylist, detailEntry),
    "detail-easyprivacy": build(detail.easyprivacy, detailEntry),
  };
  const each = <T>(pick: (b: (typeof built)[RulesetId]) => T) =>
    Object.fromEntries(RULESET_IDS.map((id) => [id, pick(built[id])])) as Record<RulesetId, T>;
  const cosmetic = compileCosmetic(lists);
  const { stats, specific } = cosmetic;
  return {
    cosmetic,
    rulesets: each((b) => b.rules),
    maps: each((b) => b.map),
    report: {
      generatedAt: opts.generatedAt,
      sources: opts.sources ?? [],
      perList,
      rulesets: each((b) => ({ rules: b.rules.length, regexRules: b.regexRules })),
      compactCut: capped.cut.length,
      cosmetic: {
        generic: cosmetic.generic.length,
        specificHosts: stats.specificHosts,
        specificRules: stats.specificRules,
        exceptions: stats.exceptions,
        noGeneric: specific.noGeneric.length,
        noCosmetic: specific.noCosmetic.length,
        skipped: stats.skipped,
      },
    },
  };
}
