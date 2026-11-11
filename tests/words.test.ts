import { describe, expect, it } from "vitest";
import { countWords } from "../src/words";
import manifest from "../static/manifest.json";

describe("countWords", () => {
  it("counts whitespace-separated words", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("  one  two\nthree ")).toBe(3);
  });
});

describe("manifest", () => {
  it("is MV3 with only the sidePanel permission and no host access", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(["sidePanel"]);
    expect(manifest).not.toHaveProperty("host_permissions");
    expect(manifest).not.toHaveProperty("content_scripts");
  });
});
