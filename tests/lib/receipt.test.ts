import { describe, expect, it } from "vitest";
import { beginPage, commitsPage, listIndex, MAX_HOSTS, MAX_PATHS, MAX_TABS, receiptText, recordBlock, sections, splitUrl, type Receipts } from "../../src/lib/receipt";

const req = (url: string, type = "script") => ({ url, type });

describe("receipt store", () => {
  it("strips query and fragment, groups by host, caps paths", () => {
    const r: Receipts = {};
    beginPage(r, 1, "site.test", 1000);
    recordBlock(r, 1, req("https://ads.example/a.js?uid=42#x"), 1001, false);
    recordBlock(r, 1, req("https://ads.example/a.js?uid=43"), 1002, false);
    recordBlock(r, 1, req("https://ads.example/pixel.gif", "image"), 1003, false);
    for (let i = 0; i < 10; i++) recordBlock(r, 1, req(`https://ads.example/p${i}`), 1004, false);
    const e = r[1].hosts["ads.example"];
    expect(e.count).toBe(13);
    expect(e.types).toEqual({ script: 12, image: 1 });
    expect(e.paths).toHaveLength(MAX_PATHS);
    expect(e.paths.slice(0, 2)).toEqual(["/a.js", "/pixel.gif"]);
    expect(JSON.stringify(r)).not.toMatch(/uid|#x/);
    expect(r[1].blocked).toBe(13);
  });
  it("caps hosts per tab (oldest dropped) and tabs (least recently touched dropped)", () => {
    const r: Receipts = {};
    beginPage(r, 1, "s.test", 1);
    for (let i = 0; i <= MAX_HOSTS; i++) recordBlock(r, 1, req(`https://h${i}.example/`), 2, false);
    expect(Object.keys(r[1].hosts)).toHaveLength(MAX_HOSTS);
    expect(r[1].hosts["h0.example"]).toBeUndefined();
    expect(r[1].hosts[`h${MAX_HOSTS}.example`]).toBeDefined();
    const t: Receipts = {};
    for (let i = 0; i <= MAX_TABS; i++) beginPage(t, i, "s.test", i);
    expect(Object.keys(t)).toHaveLength(MAX_TABS);
    expect(t[0]).toBeUndefined();
  });
  it("resets on a new top-level page", () => {
    const r: Receipts = {};
    beginPage(r, 1, "a.test", 1);
    recordBlock(r, 1, req("https://x.example/"), 2, false);
    beginPage(r, 1, "b.test", 3);
    expect(r[1]).toMatchObject({ site: "b.test", blocked: 0, hosts: {} });
  });
  it("ignores paused, incognito, unknown tabs and bad URLs", () => {
    const r: Receipts = {};
    beginPage(r, 1, "a.test", 1);
    beginPage(r, 2, "b.test", 1, true);
    expect(recordBlock(r, 1, req("https://x.example/"), 2, true)).toBe(false);
    expect(recordBlock(r, 2, req("https://x.example/"), 2, false)).toBe(false);
    expect(recordBlock(r, 9, req("https://x.example/"), 2, false)).toBe(false);
    expect(recordBlock(r, 1, req("data:text/plain,x"), 2, false)).toBe(false);
    expect(r[1].blocked + r[2].blocked).toBe(0);
    expect(splitUrl("nonsense")).toBeNull();
  });
});

describe("page-controlled names", () => {
  it("rejects invalid hosts and survives prototype-key hosts", () => {
    expect(splitUrl("https://__proto__/x")).toBeNull();
    expect(splitUrl("https://127.0.0.1/x")?.host).toBe("127.0.0.1");
    expect(splitUrl("https://ads.example./x")?.host).toBe("ads.example");
    const r: Receipts = {};
    beginPage(r, 1, "s.test", 1);
    for (const h of ["constructor", "tostring", "valueof", "__proto__"]) {
      recordBlock(r, 1, req(`https://${h}/a`), 2, false);
      recordBlock(r, 1, req(`https://${h}/a`), 2, false);
    }
    expect(r[1].hosts["constructor"]).toMatchObject({ count: 2, paths: ["/a"] });
    expect(r[1].blocked).toBe(6); // __proto__ dropped
    expect(({} as Record<string, unknown>).count).toBeUndefined();
    expect(Object.getPrototypeOf(r[1].hosts)).toBe(Object.prototype);
  });
  it("a prototype-key request type is counted as its own key", () => {
    const r: Receipts = {};
    beginPage(r, 1, "s.test", 1);
    recordBlock(r, 1, req("https://a.example/", "constructor"), 2, false);
    expect(r[1].hosts["a.example"].types).toEqual({ constructor: 1 });
  });
});

describe("commitsPage", () => {
  const rec = { site: "a.test", loadedAt: 1, touched: 1, blocked: 0, hosts: {} };
  it("commits only the pending URL, once, ignoring the fragment", () => {
    const p = new Map([[1, "https://a.test/x"]]);
    expect(commitsPage(p, rec, 1, "https://a.test/y")).toBe(false); // pushState
    expect(commitsPage(p, rec, 1, "https://a.test/x#h")).toBe(true);
    expect(commitsPage(p, rec, 1, "https://a.test/x")).toBe(false); // consumed
  });
  it("a request that never commits (204, download) does not reset", () => {
    const p = new Map([[1, "https://a.test/download"]]);
    expect(commitsPage(p, rec, 1, "https://a.test/page#frag")).toBe(false);
  });
  it("falls back to a host change, or to no receipt yet; same host with a receipt and no request does not reset", () => {
    expect(commitsPage(new Map(), rec, 1, "https://b.test/")).toBe(true);
    expect(commitsPage(new Map(), undefined, 1, "https://b.test/")).toBe(true);
    expect(commitsPage(new Map(), rec, 1, "https://a.test/z")).toBe(false);
  });
});

describe("receipt view", () => {
  const maps = { "detail-easylist": [null, "||adnxs.com^$third-party"], "detail-easyprivacy": [null, "||tracker.example^"] };
  const index = listIndex(
    [
      { rule: { ruleId: 1, rulesetId: "detail-easylist" } },
      { rule: { ruleId: 1, rulesetId: "detail-easyprivacy" } },
    ],
    maps,
  );
  it("groups into Ads, Trackers and Other by host suffix", () => {
    const r: Receipts = {};
    beginPage(r, 1, "s.test", Date.UTC(2026, 10, 12));
    for (const u of ["https://ib.adnxs.com/a", "https://ib.adnxs.com/b", "https://tracker.example/t", "https://unknown.example/u"]) recordBlock(r, 1, req(u), 5, false);
    const s = sections(r[1], index);
    expect(s.map((x) => [x.key, x.rows.map((y) => [y.host, y.count])])).toEqual([
      ["ads", [["ib.adnxs.com", 2]]],
      ["trackers", [["tracker.example", 1]]],
      ["other", [["unknown.example", 1]]],
    ]);
    expect(s[0].rows[0].info?.filter).toBe("||adnxs.com^$third-party");
    const text = receiptText(r[1], index);
    expect(text).toContain("Site: s.test");
    expect(text).toContain("Loaded: 2026-11-12T");
    expect(text).toContain("Requests blocked: 4");
    expect(text).toContain("Ads (EasyList)\nib.adnxs.com  2");
  });
  it("skips merged and allow entries", () => {
    const i = listIndex(
      [
        { rule: { ruleId: 1, rulesetId: "compact" } },
        { rule: { ruleId: 2, rulesetId: "compact" } },
      ],
      { compact: [null, [0, 5, "||merged.example^"], [1, 1, "@@||allowed.example^"]] },
    );
    expect(i.size).toBe(0);
  });
});
