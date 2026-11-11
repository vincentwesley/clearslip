import { describe, expect, it } from "vitest";
import { compileCosmetic, parseCosmetic, safeSelectors, toCss } from "../../src/compiler/cosmetic";

describe("parseCosmetic", () => {
  it("ignores comments and network filters", () => {
    for (const l of ["", "! c", "[Adblock Plus 2.0]", "||ads.com^$script", "/a##b/", "@@||x.com^$script", "a$b#c"]) expect(parseCosmetic(l)).toBeNull();
  });
  it("generic, specific, negation and exception forms", () => {
    expect(parseCosmetic("##.ad")).toEqual({ kind: "hide", domains: [], notDomains: [], selectors: [".ad"] });
    expect(parseCosmetic("a.com,~b.a.com##div.x, .y")).toEqual({ kind: "hide", domains: ["a.com"], notDomains: ["b.a.com"], selectors: ["div.x", ".y"] });
    expect(parseCosmetic("a.com#@#.ad")).toEqual({ kind: "unhide", domains: ["a.com"], notDomains: [], selectors: [".ad"] });
    expect(parseCosmetic("#@#.ad")).toMatchObject({ kind: "unhide", domains: [] });
  });
  it("allows plain :has() and :not()", () => {
    expect(parseCosmetic("a.com##div:has(> .ad):not(.keep)")).toMatchObject({ kind: "hide", selectors: ["div:has(> .ad):not(.keep)"] });
  });
  it("pure-host network flags", () => {
    expect(parseCosmetic("@@||a.com^$generichide")).toEqual({ kind: "noGeneric", host: "a.com" });
    expect(parseCosmetic("@@||a.com^$elemhide")).toEqual({ kind: "noCosmetic", host: "a.com" });
    expect(parseCosmetic("@@||a.com/x^$elemhide")).toBeNull();
    expect(parseCosmetic("@@://localhost/$generichide")).toBeNull();
  });
  const reason = (l: string) => (parseCosmetic(l) as { reason?: string }).reason;
  it("skip reasons", () => {
    expect(reason("a.com#?#div:has(.x)")).toBe("procedural");
    for (const s of [":has-text(x)", ":-abp-has(x)", ":xpath(//a)", ":matches-css(color: red)", ":upward(2)", ":remove()", ":style(x:y)"]) expect(reason(`a.com##div${s}`)).toBe("procedural");
    expect(reason("a.com##+js(aopr, x)")).toBe("scriptlet");
    expect(reason("a.com#$#body{x:y}")).toBe("scriptlet");
    expect(reason("a.com#%#//scriptlet('x')")).toBe("scriptlet");
    expect(reason("a.com##^script:has-text(x)")).toBe("html-filter");
    expect(reason("google.*##.ad")).toBe("entity-domain");
    expect(reason("~google.*,a.com##.ad")).toBe("entity-domain");
  });
  it("rejects anything that could break out of the selector position", () => {
    for (const s of [".a{x:y}", ".a}", ".a/*", "*/.a", ".a@import", ".a\\\nb", "a<b", ".a(", ".a]", '.a[href="x', ".a,", "a\x00b"])
      expect(reason(`##${s}`), s).toBe("unsafe-selector");
    expect(safeSelectors('a[title="x,y"], b:not(.c, .d)')).toEqual(['a[title="x,y"]', "b:not(.c, .d)"]);
    expect(safeSelectors("a\\,b")).toEqual(["a\\,b"]);
  });
});

describe("compileCosmetic", () => {
  const r = compileCosmetic([
    { id: "easylist", text: "##.ad\n##.ad\n##.gone\n#@#.gone\na.com##.x\na.com,~s.a.com##.y\nb.com#@#.ad\n@@||c.com^$generichide\n@@||d.com^$elemhide\ne.com##:xpath(x)\n" },
  ]);
  it("dedupes, applies global exceptions and fills the tables", () => {
    expect(r.generic).toEqual([".ad"]);
    expect(r.specific).toEqual({
      hide: { "a.com": [".x", ".y"] },
      unhide: { "b.com": [".ad"] },
      notHide: { "s.a.com": [".y"] },
      noGeneric: ["c.com"],
      noCosmetic: ["d.com"],
    });
    expect(r.stats).toMatchObject({ generic: 2, specificHosts: 1, specificRules: 2, exceptions: 4, skipped: { procedural: 1 } });
  });
  it("css has one rule per selector", () => {
    expect(toCss([".a", "b"])).toBe(".a{display:none!important}\nb{display:none!important}");
  });
});