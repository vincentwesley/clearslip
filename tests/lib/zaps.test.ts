import { describe, expect, it } from "vitest";
import { addZap, cleanZaps, MAX_ZAP_HOSTS, MAX_ZAPS_PER_HOST, removeZap, validSelector, zapCss, zapsFor, type Zaps } from "../../src/lib/zaps";

describe("validSelector", () => {
  it("accepts exactly one safe selector of at most 300 chars", () => {
    expect(validSelector("#a > div.b")).toBe("#a > div.b");
    expect(validSelector("a, b")).toBeNull();
    expect(validSelector("a{color:red}")).toBeNull();
    expect(validSelector("a".repeat(301))).toBeNull();
    expect(validSelector(42)).toBeNull();
    expect(validSelector("")).toBeNull();
  });
});

describe("zap store", () => {
  it("adds, de-duplicates and removes per exact host", () => {
    let z: Zaps = {};
    const a = addZap(z, "site.test", ".ad");
    expect(a.ok && (z = a.zaps)).toBeTruthy();
    const again = addZap(z, "site.test", ".ad");
    expect(again).toEqual({ ok: true, zaps: z });
    z = (addZap(z, "site.test", "#x") as { zaps: Zaps }).zaps;
    expect(zapsFor(z, "site.test")).toEqual([".ad", "#x"]);
    expect(zapsFor(z, "www.site.test")).toEqual([]); // no inheritance
    expect(zapCss(z, "site.test")).toBe(".ad{display:none!important}\n#x{display:none!important}");
    z = removeZap(z, "site.test", ".ad");
    expect(zapsFor(z, "site.test")).toEqual(["#x"]);
    expect(removeZap(z, "site.test")).toEqual({});
  });
  it("refuses invalid input and the caps", () => {
    expect(addZap({}, "bad host", ".a")).toEqual({ ok: false, reason: "invalid" });
    expect(addZap({}, "site.test", "a{}")).toEqual({ ok: false, reason: "invalid" });
    const full: Zaps = { "s.test": Array.from({ length: MAX_ZAPS_PER_HOST }, (_, i) => `.c${i}`) };
    expect(addZap(full, "s.test", ".new")).toEqual({ ok: false, reason: "limit-selectors" });
    expect(addZap(full, "s.test", ".c1")).toMatchObject({ ok: true });
    const many: Zaps = Object.fromEntries(Array.from({ length: MAX_ZAP_HOSTS }, (_, i) => [`h${i}.test`, [".a"]]));
    expect(addZap(many, "new.test", ".a")).toEqual({ ok: false, reason: "limit-hosts" });
    expect(addZap(many, "h1.test", ".b")).toMatchObject({ ok: true });
  });
  it("prototype-key hosts are plain data", () => {
    expect(zapsFor({}, "constructor")).toEqual([]);
    expect(zapsFor({}, "tostring")).toEqual([]);
    expect(addZap({}, "__proto__", ".a")).toEqual({ ok: false, reason: "invalid" });
    const r = addZap({}, "constructor", ".a");
    expect(r.ok && zapsFor(r.zaps, "constructor")).toEqual([".a"]);
    expect(({} as Record<string, unknown>).a).toBeUndefined();
    expect(zapCss({}, "valueof")).toBe("");
  });
  it("cleanZaps drops junk from storage", () => {
    expect(cleanZaps(null)).toEqual({});
    expect(cleanZaps([1])).toEqual({});
    expect(cleanZaps({ "ok.test": [".a", ".a", "x{}", 5], "bad host": [".a"], "e.test": "no" })).toEqual({ "ok.test": [".a"] });
  });
});
