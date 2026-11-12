import { describe, expect, it } from "vitest";
import type { Specific } from "../../src/compiler/cosmetic";
import { planCosmetic } from "../../src/lib/cosmetic";

const data: Specific = {
  hide: { "example.com": [".a"], "b.example.com": [".b"], "other.com": [".o"] },
  unhide: { "x.example.com": [".a", ".ad"] },
  notHide: { "n.example.com": [".b", ".ad"] },
  genericOff: { "x.example.com": [".ad"] },
  noGeneric: ["nog.com"],
  noCosmetic: ["off.com"],
};
const css = (s: string) => `${s}{display:none!important}`;

describe("planCosmetic", () => {
  it("uses the generic file plus specific selectors from the suffix walk", () => {
    expect(planCosmetic("a.b.example.com", "a.b.example.com", data)).toEqual({ file: true, genericOff: [], css: [css(".b"), css(".a")].join("\n") });
    expect(planCosmetic("z.com", "z.com", data)).toEqual({ file: true, genericOff: [], css: "" });
  });
  it("uses the frame host for selectors, the site host for flags", () => {
    expect(planCosmetic("z.com", "other.com", data)?.css).toBe(css(".o"));
  });
  it("generic exceptions turn off the file, report what to leave out and drop it from specific", () => {
    expect(planCosmetic("x.example.com", "x.example.com", data)).toEqual({ file: false, genericOff: [".ad"], css: "" }); // .a also unhidden
  });
  it("notHide only removes specific selectors, never generic ones", () => {
    expect(planCosmetic("n.example.com", "n.example.com", data)).toEqual({ file: true, genericOff: [], css: css(".a") });
  });
  it("an exception for a non-generic selector keeps the file", () => {
    const d: Specific = { ...data, unhide: { "q.com": [".nope"] } };
    expect(planCosmetic("q.com", "q.com", d)).toEqual({ file: true, genericOff: [], css: "" });
  });
  it("noGeneric drops the generic part, keeps specific", () => {
    expect(planCosmetic("nog.com", "nog.com", { ...data, hide: { "nog.com": [".s"] } })).toEqual({ file: false, genericOff: [], css: css(".s") });
    expect(planCosmetic("nog.com", "nog.com", data)).toBeNull();
  });
  it("prototype-key hosts do not hit Object.prototype", () => {
    expect(planCosmetic("constructor", "constructor", data)).toEqual({ file: true, genericOff: [], css: "" });
    expect(planCosmetic("a.tostring", "a.tostring", data)).toEqual({ file: true, genericOff: [], css: "" });
  });
  it("noCosmetic (also for subdomains) injects nothing", () => {
    expect(planCosmetic("off.com", "off.com", data)).toBeNull();
    expect(planCosmetic("www.off.com", "www.off.com", data)).toBeNull();
  });
});
