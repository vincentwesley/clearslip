import { describe, expect, it } from "vitest";
import { parseLine } from "../../src/compiler/parse.ts";
import { toRule } from "../../src/compiler/to-dnr.ts";

const rule = (line: string) => {
  const r = parseLine(line, "easylist");
  if (!r || !r.ok) throw new Error(`not parsed: ${line} ${JSON.stringify(r)}`);
  return toRule(r.filter);
};
const reason = (line: string) => {
  const r = parseLine(line, "easylist");
  return r && !r.ok ? r.reason : r === null ? "ignored" : "ok";
};

describe("non-filter lines", () => {
  it.each(["", "   ", "! comment", "[Adblock Plus 2.0]"])("ignores %j", (l) => expect(reason(l)).toBe("ignored"));
});

describe("pattern syntax", () => {
  it("keeps anchors, wildcards and separators", () => {
    expect(rule("||ads.example.com^").condition.urlFilter).toBe("||ads.example.com^");
    expect(rule("||example.com/ads/*banner").condition.urlFilter).toBe("||example.com/ads/*banner");
    expect(rule("|https://example.com/x|").condition.urlFilter).toBe("|https://example.com/x|");
    expect(rule("/adframe.").condition.urlFilter).toBe("/adframe.");
  });
  it("always sets case sensitivity explicitly", () => {
    expect(rule("||a.com^").condition.isUrlFilterCaseSensitive).toBe(false);
    expect(rule("||a.com^$match-case").condition.isUrlFilterCaseSensitive).toBe(true);
  });
  it("lowercases unless match-case", () => {
    expect(rule("||A.com/Foo").condition.urlFilter).toBe("||a.com/foo");
    expect(rule("/Foo$match-case").condition.urlFilter).toBe("/Foo");
  });
  it("punycodes IDN hosts", () => {
    expect(rule("||bücher.example^").condition.urlFilter).toBe("||xn--bcher-kva.example^");
  });
  it("converts regex filters", () => {
    expect(rule("/ads\\d+\\.js/").condition.regexFilter).toBe("ads\\d+\\.js");
  });
  it("allows $domain-only filters", () => {
    expect(rule("$domain=a.com|~b.com,script").condition).toMatchObject({
      initiatorDomains: ["a.com"],
      excludedInitiatorDomains: ["b.com"],
      resourceTypes: ["script"],
    });
    expect(rule("$domain=a.com").condition.urlFilter).toBeUndefined();
  });
});

describe("options", () => {
  it("maps third-party", () => {
    expect(rule("||a.com^$third-party").condition.domainType).toBe("thirdParty");
    expect(rule("||a.com^$~third-party").condition.domainType).toBe("firstParty");
  });
  it("maps resource types and negations", () => {
    expect(rule("||a.com^$script,image,subdocument,xmlhttprequest").condition.resourceTypes).toEqual([
      "script", "image", "sub_frame", "xmlhttprequest",
    ]);
    expect(rule("||a.com^$~script").condition.excludedResourceTypes).toEqual(["script"]);
    for (const t of ["stylesheet", "font", "media", "websocket", "ping", "object", "other"]) {
      expect(rule(`||a.com^$${t}`).condition.resourceTypes).toEqual([t]);
    }
  });
  it("defaults to no main_frame", () => {
    const c = rule("||a.com^").condition;
    expect(c.resourceTypes).toBeUndefined();
    expect(c.excludedResourceTypes).toBeUndefined();
  });
  it("sets priorities", () => {
    expect(rule("||a.com^").priority).toBe(1);
    expect(rule("@@||a.com^").priority).toBe(2);
    expect(rule("||a.com^$important").priority).toBe(3);
  });
  it("actions", () => {
    expect(rule("||a.com^").action.type).toBe("block");
    expect(rule("@@||a.com^").action.type).toBe("allow");
    const d = rule("@@||a.com^$document");
    expect(d.action.type).toBe("allowAllRequests");
    expect(d.condition.resourceTypes).toEqual(["main_frame", "sub_frame"]);
  });
  it("blocks main_frame only when $document is explicit", () => {
    expect(rule("||a.com^$document").condition.resourceTypes).toEqual(["main_frame"]);
  });
  it("flags $badfilter", () => {
    const r = parseLine("||a.com^$badfilter", "easylist");
    expect(r && r.ok && r.filter.badfilter).toBe(true);
  });
});

describe("skip reasons", () => {
  it.each([
    ["example.com##.ad", "cosmetic"],
    ["example.com#@#.ad", "cosmetic"],
    ["example.com#?#div:has(.ad)", "cosmetic"],
    ["example.com##+js(aopr, x)", "cosmetic"],
    ["||a.com^$redirect=noopjs", "option-redirect"],
    ["||a.com^$redirect-rule=noopjs", "option-redirect-rule"],
    ["||a.com^$removeparam=x", "option-removeparam"],
    ["||a.com^$csp=script-src 'none'", "option-csp"],
    ["||a.com^$popup", "option-popup"],
    ["||a.com^$rewrite=abp-resource:blank-js", "option-rewrite"],
    ["||a.com^$replace=/x/y/", "option-replace"],
    ["||a.com^$header=x", "option-header"],
    ["@@||a.com^$generichide", "option-generichide"],
    ["@@||a.com^$elemhide", "option-elemhide"],
    ["@@||a.com^$genericblock", "option-genericblock"],
    ["||a.com^$nonsense", "unknown-option"],
    ["/(?=x)y/", "regex-unsupported"],
    ["/(a)\\1/", "regex-unsupported"],
    ["/café/", "regex-unsupported"],
    ["/(unclosed/", "regex-unsupported"],
    ["/fooébar", "non-ascii"],
    ["||*foo", "invalid-pattern"],
    ["a|b", "invalid-pattern"],
    ["*", "empty-pattern"],
    ["$script", "empty-pattern"],
    ["||a.com^$domain=google.*", "domain-entity"],
    ["||a.com^$domain=bad_host!", "domain-invalid"],
    ["@@||a.com^$document,script", "document-mixed"],
  ])("%s -> %s", (line, why) => expect(reason(line)).toBe(why));
});
