import { describe, expect, it } from "vitest";
import { filterHost, groupMatches, type Maps } from "../../src/lib/matched";

describe("filterHost", () => {
  it("extracts hosts from host-anchored filters", () => {
    expect(filterHost("||DoubleClick.net^$third-party")).toBe("doubleclick.net");
    expect(filterHost("@@||ads.example.com/ok.js")).toBe("ads.example.com");
    expect(filterHost("|https://track.example.org/p")).toBe("track.example.org");
  });
  it("returns null for pattern filters", () => {
    for (const f of ["/ads/banner.", "/regex\\d+/", "||ads*.example.com^", "-ad-", "||localhost^"]) expect(filterHost(f)).toBeNull();
  });
});

describe("groupMatches", () => {
  const maps: Maps = {
    "detail-easylist": [null, "||ads.a.com^", "/banner/", "@@||ok.a.com^"],
    compact: [null, [1, 3, "||x.com^"]],
  };
  const m = (rulesetId: string, ruleId: number) => ({ rule: { rulesetId, ruleId } });
  it("counts real matches, groups by host, skips allow rules and unknown ids", () => {
    const r = groupMatches([m("detail-easylist", 1), m("detail-easylist", 1), m("detail-easylist", 2), m("detail-easylist", 3), m("detail-easylist", 99), m("_dynamic", 1)], maps);
    expect(r.total).toBe(3);
    expect(r.groups.map((g) => [g.label, g.count])).toEqual([["ads.a.com", 2], ["Other patterns", 1]]);
  });
  it("shows a merged compact rule as one group with its filter count", () => {
    const r = groupMatches([m("compact", 1)], maps);
    expect(r.groups[0]).toMatchObject({ list: "easyprivacy", count: 1 });
    expect(r.groups[0].label).toContain("3 hosts");
  });
});
