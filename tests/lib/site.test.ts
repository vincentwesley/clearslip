import { describe, expect, it } from "vitest";
import { hostFromUrl, hostSuffixes, isValidHost, siteIsOff, siteRule, siteRules, withSite } from "../../src/lib/site";

describe("hostSuffixes / siteIsOff", () => {
  it("walks suffixes without the bare TLD", () => {
    expect(hostSuffixes("a.b.example.com")).toEqual(["a.b.example.com", "b.example.com", "example.com"]);
    expect(hostSuffixes("localhost")).toEqual(["localhost"]);
  });
  it("off matches subdomains", () => {
    expect(siteIsOff(["example.com"], "www.example.com")).toBe(true);
    expect(siteIsOff(["example.com"], "notexample.com")).toBe(false);
  });
});

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
    expect(withSite(["b.com", "bad host"], "a.com", true).off).toEqual(["a.com", "b.com"]);
    expect(withSite(["a.com"], "a.com", true).off).toEqual(["a.com"]);
    expect(withSite(["a.com", "b.com"], "a.com", false).off).toEqual(["b.com"]);
  });
  it("withSite refuses a new host at the cap but still allows re-adds and removals", () => {
    const full = Array.from({ length: 1000 }, (_, i) => `h${String(i).padStart(4, "0")}.com`);
    expect(withSite(full, "a.com", true)).toEqual({ off: full, limit: true });
    expect(withSite(full, full[5], true).limit).toBe(false);
    expect(withSite(full, full[5], false).off).toHaveLength(999);
  });
});

