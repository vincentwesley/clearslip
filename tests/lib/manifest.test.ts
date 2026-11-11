import { describe, expect, it } from "vitest";
import manifest from "../../static/manifest.json";

describe("manifest", () => {
  it("is MV3, fixed permissions, no host access or content scripts", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.minimum_chrome_version).toBe("121");
    expect(manifest.permissions).toEqual(["declarativeNetRequest", "declarativeNetRequestFeedback", "storage", "sidePanel", "activeTab"]);
    expect(manifest).not.toHaveProperty("host_permissions");
    expect(manifest).not.toHaveProperty("content_scripts");
  });
  it("declares exactly the three rulesets in order", () => {
    expect(manifest.declarative_net_request.rule_resources.map((r) => [r.id, r.enabled, r.path])).toEqual([
      ["compact", true, "rulesets/compact.json"],
      ["detail-easylist", false, "rulesets/detail-easylist.json"],
      ["detail-easyprivacy", false, "rulesets/detail-easyprivacy.json"],
    ]);
  });
});
