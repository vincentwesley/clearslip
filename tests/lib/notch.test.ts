import { describe, expect, it } from "vitest";
import { toX, X } from "../../src/brand/notch";

// Pointer travel (px) maps to --logo-x, with a notch at each form where the logo holds while the pointer moves on.
describe("toX notch mapping", () => {
  it("holds the short form, then the middle one, then reaches long", () => {
    expect(toX(0)).toBe(X.short);
    expect(toX(12)).toBe(X.short);
    expect(toX(26)).toBe(X.middle);
    expect(toX(66)).toBe(X.middle);
    expect(toX(106)).toBe(X.long);
  });
  it("moves monotonically between the notches", () => {
    expect(toX(19)).toBeGreaterThan(X.short);
    expect(toX(19)).toBeLessThan(X.middle);
    expect(toX(86)).toBeGreaterThan(X.middle);
    expect(toX(86)).toBeLessThan(X.long);
  });
});
