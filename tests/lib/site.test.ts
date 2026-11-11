import { describe, expect, it } from "vitest";
import { hostFromUrl, isValidHost, siteRule, siteRules, withSite } from "../../src/lib/site";

describe("hostFromUrl", () => {
  it("keeps the exact lowercase hostname for http(s)", () => {
    expect(hostFromUrl("https://WWW.Example.com:8080/a?b#c")).toBe("www.example.com");
    expect(hostFromUrl("http://127.0.0.1:3000/")).toBe("127.0.0.1");
  });
  it("rejects other schemes, junk and non-strings", () => {
    for (const u of ["chrome://extensions", "about:blank", "file:///c:/x", "chrome-extension://abc/popup.html", "nope", "", "http://[::1]/", undefined, 5])
      expect(hostFromUrl(u)).toBeNull();
  });
});

describe("isValidHost", () => {
  it("accepts hostnames and rejects injection-ish input", () => {
    expect(isValidHost("a.b-c.com")).toBe(true);
    for (const h of ["", "-a.com", "a..com", "a b.com", "a.com/x", "*.com", "a.com:80", "A.com", "x".repeat(64) + ".com", 1, null])
      expect(isValidHost(h)).toBe(false);
  });
});

describe("rules", () => {
  it("builds the spec's allowAllRequests rule", () => {
    expect(siteRule(3, "a.com")).toEqual({
      id: 3,
      priority: 100,
      action: { type: "allowAllRequests" },
      condition: { requestDomains: ["a.com"], resourceTypes: ["main_frame", "sub_frame"] },
    });
  });
  it("numbers rules from 1 and is deterministic", () => {
    expect(siteRules(["a.com", "b.com"]).map((r) => r.id)).toEqual([1, 2]);
  });
  it("withSite adds, removes, dedupes, sorts and drops invalid entries", () => {
    expect(withSite(["b.com", "bad host"], "a.com", true)).toEqual(["a.com", "b.com"]);
    expect(withSite(["a.com"], "a.com", true)).toEqual(["a.com"]);
    expect(withSite(["a.com", "b.com"], "a.com", false)).toEqual(["b.com"]);
  });
});
