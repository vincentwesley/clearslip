import { describe, expect, it } from "vitest";
import type { Specific } from "../../src/compiler/cosmetic";
import { hostSuffixes, planCosmetic, siteIsOff } from "../../src/lib/cosmetic";

const generic = [".ad", ".banner"];
const data: Specific = {
  hide: { "example.com": [".a"], "b.example.com": [".b"], "other.com": [".o"] },
  unhide: { "x.example.com": [".a", ".ad"] },
  notHide: { "n.example.com": [".b"] },
  noGeneric: ["nog.com"],
  noCosmetic: ["off.com"],
};
const css = (s: string) => `${s}{display:none!important}`;

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

describe("planCosmetic", () => {
  it("uses the generic file plus specific selectors from the suffix walk", () => {
    expect(planCosmetic("a.b.example.com", "a.b.example.com", data, generic)).toEqual({ file: true, css: [css(".b"), css(".a")].join("\n") });
    expect(planCosmetic("z.com", "z.com", data, generic)).toEqual({ file: true, css: "" });
  });
  it("uses the frame host for selectors, the site host for flags", () => {
    expect(planCosmetic("z.com", "other.com", data, generic)?.css).toBe(css(".o"));
  });
  it("generic exceptions force a string without the excluded selectors", () => {
    expect(planCosmetic("x.example.com", "x.example.com", data, generic)).toEqual({ file: false, css: css(".banner") }); // .a also unhidden
  });
  it("negations exclude specific selectors on the negated host", () => {
    expect(planCosmetic("n.example.com", "n.example.com", data, generic)?.css).toBe(css(".a"));
  });
  it("an exception for a non-generic selector keeps the file", () => {
    const d: Specific = { ...data, unhide: { "q.com": [".nope"] } };
    expect(planCosmetic("q.com", "q.com", d, generic)).toEqual({ file: true, css: "" });
  });
  it("noGeneric drops the generic part, keeps specific", () => {
    expect(planCosmetic("nog.com", "nog.com", { ...data, hide: { "nog.com": [".s"] } }, generic)).toEqual({ file: false, css: css(".s") });
    expect(planCosmetic("nog.com", "nog.com", data, generic)).toBeNull();
  });
  it("noCosmetic (also for subdomains) injects nothing", () => {
    expect(planCosmetic("off.com", "off.com", data, generic)).toBeNull();
    expect(planCosmetic("www.off.com", "www.off.com", data, generic)).toBeNull();
  });
});