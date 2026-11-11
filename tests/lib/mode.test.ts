import { describe, expect, it } from "vitest";
import { pickMode } from "../../src/lib/mode";

const counts = { compact: 100, "detail-easylist": 400, "detail-easyprivacy": 200 }; // detail needs 600

describe("pickMode", () => {
  it("picks detail when it fits", () => {
    expect(pickMode(counts, ["compact"], 500)).toBe("detail"); // 500 + 100 compact credited
    expect(pickMode(counts, ["compact"], 499)).toBe("compact");
  });
  it("keeps detail when it is already enabled and little is left", () => {
    expect(pickMode(counts, ["detail-easylist", "detail-easyprivacy"], 0)).toBe("detail");
    expect(pickMode(counts, ["detail-easylist", "detail-easyprivacy"], 5)).toBe("detail");
  });
  it("is stable across startups under a tight quota", () => {
    const total = 650; // pool: 650 rules
    const free = (en: string[]) => total - en.reduce((s, id) => s + counts[id as keyof typeof counts], 0);
    const a = pickMode(counts, ["compact"], free(["compact"]));
    const b = pickMode(counts, a === "detail" ? ["detail-easylist", "detail-easyprivacy"] : ["compact"], free(a === "detail" ? ["detail-easylist", "detail-easyprivacy"] : ["compact"]));
    expect(b).toBe(a);
  });
  it("is compact with no data", () => {
    expect(pickMode({}, [], 1e6)).toBe("compact");
  });
});
