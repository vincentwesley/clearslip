import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile } from "../../src/compiler/emit.ts";
import {
  applyBadfilter, applyRegexBudget, capCompact, dedupe, mergeHosts,
} from "../../src/compiler/optimise.ts";
import type { Item } from "../../src/compiler/optimise.ts";
import { parseLine } from "../../src/compiler/parse.ts";
import { toRule } from "../../src/compiler/to-dnr.ts";
import type { Filter, ListId } from "../../src/compiler/types.ts";

const filt = (line: string, list: ListId = "easylist"): Filter => {
  const r = parseLine(line, list);
  if (!r || !r.ok) throw new Error(line);
  return r.filter;
};
const item = (line: string, list: ListId = "easylist"): Item => ({ list, rule: toRule(filt(line, list)), f: [line] });
const gen = { generatedAt: "2026-01-01T00:00:00Z" };

describe("optimiser", () => {
  it("$badfilter cancels the matching filter regardless of option order", () => {
    const r = applyBadfilter([filt("||a.com^$script,image"), filt("||b.com^"), filt("||a.com^$image,script,badfilter")]);
    expect(r.kept.map((f) => f.raw)).toEqual(["||b.com^"]);
    expect(r.cancelled).toHaveLength(1);
    expect(r.badLines).toHaveLength(1);
  });
  it("dedupes identical rules, merging filter text only when asked", () => {
    expect(dedupe([item("||a.com^"), item("||A.com^")], false).items).toHaveLength(1);
    expect(dedupe([item("||a.com^"), item("||A.com^")], true).items[0].f).toEqual(["||a.com^", "||A.com^"]);
  });
  it("merges pure-host block rules with equal options only", () => {
    const m = mergeHosts([
      item("||a.com^"), item("||b.com^"), item("||c.com^$third-party"), item("||d.com^$third-party"),
      item("||e.com/path"), item("@@||f.com^"), item("||g.com^", "easyprivacy"),
    ]);
    expect(m).toHaveLength(5);
    expect(m[0].rule.condition).toEqual({ requestDomains: ["a.com", "b.com"] });
    expect(m[0].f).toEqual(["||a.com^", "||b.com^"]);
    expect(m.find((i) => i.rule.condition.domainType)?.rule.condition.requestDomains).toEqual(["c.com", "d.com"]);
  });
  it("caps compact: keeps allows, cuts patterns first, then EasyList hosts", () => {
    const items = [
      item("||ep.com^", "easyprivacy"), item("||el.com^$third-party"), item("/pattern"), item("@@||ok.com^"),
    ];
    const merged = mergeHosts(items);
    const c = capCompact(merged, 3);
    expect(c.cut.map((i) => i.f[0])).toEqual(["/pattern"]);
    expect(c.items[0].rule.action.type).toBe("allow");
    expect(capCompact(merged, 2).cut.map((i) => i.f[0])).toEqual(["||el.com^$third-party", "/pattern"]);
    expect(capCompact(merged, 0).items.map((i) => i.rule.action.type)).toEqual(["allow"]);
  });
  it("regex budget keeps exceptions first, then list order", () => {
    const fs = [filt("/a1/"), filt("/a2/"), filt("@@/a3/"), filt("||x.com^")];
    const r = applyRegexBudget(fs, 2);
    expect(r.over.map((f) => f.raw)).toEqual(["/a2/"]);
    expect(r.kept.map((f) => f.raw)).toEqual(["/a1/", "@@/a3/", "||x.com^"]);
  });
});

describe("emitter", () => {
  const text = [
    "[Adblock Plus 2.0]", "! c", "||a.com^", "||b.com^", "||a.com^", "||c.com^$third-party,script",
    "/ads/*.js$domain=x.com", "@@||ok.com^$document", "##.cosmetic", "||z.com^$popup", "||b.com^$badfilter",
  ].join("\n");
  const r = compile([{ id: "easylist", text }, { id: "easyprivacy", text: "||t.com^\n" }], gen);

  it("counts every line", () => {
    const p = r.report.perList.easylist;
    expect(p.parsed).toBe(9);
    expect(p.skipped).toMatchObject({ cosmetic: 1, "option-popup": 1, badfilter: 1, badfiltered: 1, duplicate: 1 });
    expect(p.converted + Object.values(p.skipped).reduce((a, b) => a + b, 0)).toBe(p.parsed);
  });
  it("assigns dense ids from 1 and aligned maps", () => {
    for (const id of ["compact", "detail-easylist", "detail-easyprivacy"] as const) {
      const rules = r.rulesets[id];
      expect(rules.map((x) => x.id)).toEqual(rules.map((_, i) => i + 1));
      expect(r.maps[id]).toHaveLength(rules.length + 1);
      expect(r.maps[id][0]).toBeNull();
      r.maps[id].slice(1).forEach((e) => expect(e).toBeTruthy());
    }
  });
  it("detail has one filter per rule; compact merges hosts", () => {
    expect(r.maps["detail-easylist"].slice(1).every((e) => typeof e === "string")).toBe(true);
    expect(r.maps["detail-easylist"][1]).toBe("||a.com^");
    const merged = (r.maps.compact as ([number, number, string] | null)[]).find((e) => e?.[2] === "||a.com^");
    expect(merged).toEqual([0, 1, "||a.com^"]);
    const hosts = r.rulesets.compact.map((x) => x.condition.requestDomains?.join(",")).filter(Boolean);
    expect(hosts).toContain("a.com");
    expect(hosts).toContain("t.com");
  });
  it("reports ruleset sizes and regex counts", () => {
    expect(r.report.rulesets["detail-easylist"]).toEqual({ rules: 4, regexRules: 0 });
    expect(r.report.compactCut).toBe(0);
  });
  it("enforces a global regex budget across lists", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `/r${i}x/`).join("\n");
    const big = compile([{ id: "easylist", text: many(700) }, { id: "easyprivacy", text: many(700).replace(/r/g, "q") }], gen);
    expect(big.report.rulesets["detail-easylist"].regexRules + big.report.rulesets["detail-easyprivacy"].regexRules).toBe(1000);
    expect(big.report.perList.easyprivacy.skipped["regex-budget"]).toBe(400);
  });
});

describe("clearslip-sg list", () => {
  it("compiles its three filters to block rules, in detail and compact", () => {
    const text = readFileSync(new URL("../../lists/clearslip-sg.txt", import.meta.url), "utf8");
    const r = compile([{ id: "clearslip-sg", text }], gen);
    expect(r.rulesets["detail-clearslip-sg"].map((x) => [x.action.type, x.condition.urlFilter, x.condition.domainType])).toEqual([
      ["block", "||segmento.sphdigital.com.sg^", undefined],
      ["block", "||copper6.com^", "thirdParty"],
      ["block", "||bid-openpath.ttdcdn.org^", "thirdParty"],
    ]);
    expect(r.rulesets.compact.every((x) => x.action.type === "block")).toBe(true);
    expect(r.rulesets.compact.flatMap((x) => x.condition.requestDomains ?? [])).toEqual(
      expect.arrayContaining(["segmento.sphdigital.com.sg", "copper6.com", "bid-openpath.ttdcdn.org"]),
    );
  });
});

describe("real snapshots", () => {
  it("compile within limits", () => {
    const read = (f: string) => readFileSync(new URL(`../../lists/${f}`, import.meta.url), "utf8");
    const r = compile(
      [{ id: "easylist", text: read("easylist.txt") }, { id: "easyprivacy", text: read("easyprivacy.txt") }, { id: "clearslip-sg", text: read("clearslip-sg.txt") }],
      gen,
    );
    expect(r.rulesets.compact.length).toBeLessThanOrEqual(30000);
    const detailRegex = r.report.rulesets["detail-easylist"].regexRules + r.report.rulesets["detail-easyprivacy"].regexRules;
    expect(detailRegex).toBeLessThanOrEqual(1000);
    for (const id of ["compact", "detail-easylist", "detail-easyprivacy"] as const) {
      const rules = r.rulesets[id];
      expect(rules.length).toBeGreaterThan(1000);
      expect(rules.every((x, i) => x.id === i + 1)).toBe(true);
      expect(r.maps[id]).toHaveLength(rules.length + 1);
      for (const x of rules) {
        expect(x.condition.urlFilter?.startsWith("||*")).not.toBe(true);
        expect(/[^\x20-\x7e]/.test(x.condition.urlFilter ?? "")).toBe(false);
        expect(x.condition.isUrlFilterCaseSensitive === undefined || typeof x.condition.isUrlFilterCaseSensitive === "boolean").toBe(true);
      }
    }
  }, 30000);
});
