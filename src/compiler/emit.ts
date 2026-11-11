import { applyBadfilter, applyRegexBudget, capCompact, dedupe, mergeHosts, toEntry } from "./optimise.ts";
import type { Item } from "./optimise.ts";
import { parseLine } from "./parse.ts";
import { toRule } from "./to-dnr.ts";
import type { CompileResult, DnrRule, Filter, ListId, ListInput, MapEntry, SourceInfo } from "./types.ts";

export const COMPACT_MAX = 30000;
export const REGEX_MAX = 1000;
const IDS: ListId[] = ["easylist", "easyprivacy"];

function build(items: Item[]) {
  const rules: DnrRule[] = items.map((it, i) => ({ id: i + 1, ...it.rule }));
  const map: (MapEntry | null)[] = [null, ...items.map(toEntry)];
  const regexRules = rules.filter((r) => r.condition.regexFilter !== undefined).length;
  return { rules, map, regexRules };
}

export function compile(
  lists: ListInput[],
  opts: { generatedAt: string; sources?: SourceInfo[] },
): CompileResult {
  const perList: CompileResult["report"]["perList"] = {};
  const skip = (list: ListId, reason: string) => {
    const s = perList[list].skipped;
    s[reason] = (s[reason] ?? 0) + 1;
  };
  let all: Filter[] = [];
  for (const l of lists) {
    perList[l.id] = { parsed: 0, converted: 0, skipped: {} };
    for (const line of l.text.split(/\r?\n/)) {
      const r = parseLine(line, l.id);
      if (!r) continue;
      perList[l.id].parsed++;
      if (r.ok) all.push(r.filter);
      else skip(l.id, r.reason);
    }
  }

  const bf = applyBadfilter(all);
  bf.badLines.forEach((f) => skip(f.list, "badfilter"));
  bf.cancelled.forEach((f) => skip(f.list, "badfiltered"));
  const rb = applyRegexBudget(bf.kept, REGEX_MAX);
  rb.over.forEach((f) => skip(f.list, "regex-budget"));
  all = rb.kept;

  const detail: Record<ListId, Item[]> = { easylist: [], easyprivacy: [] };
  for (const id of IDS) {
    const items = all.filter((f) => f.list === id).map((f): Item => ({ list: id, rule: toRule(f), f: [f.raw] }));
    const d = dedupe(items, false);
    d.dupes.forEach((i) => skip(i.list, "duplicate"));
    detail[id] = d.items;
    if (perList[id]) perList[id].converted = d.items.length;
  }

  const merged = dedupe(mergeHosts([...detail.easylist, ...detail.easyprivacy]), true).items;
  const capped = capCompact(merged, COMPACT_MAX);

  const compact = build(capped.items);
  const el = build(detail.easylist);
  const ep = build(detail.easyprivacy);
  return {
    rulesets: { compact: compact.rules, "detail-easylist": el.rules, "detail-easyprivacy": ep.rules },
    maps: { compact: compact.map, "detail-easylist": el.map, "detail-easyprivacy": ep.map },
    report: {
      generatedAt: opts.generatedAt,
      sources: opts.sources ?? [],
      perList,
      rulesets: {
        compact: { rules: compact.rules.length, regexRules: compact.regexRules },
        "detail-easylist": { rules: el.rules.length, regexRules: el.regexRules },
        "detail-easyprivacy": { rules: ep.rules.length, regexRules: ep.regexRules },
      },
      compactCut: capped.cut.length,
    },
  };
}
