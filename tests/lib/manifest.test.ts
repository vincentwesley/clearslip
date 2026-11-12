import { describe, expect, it } from "vitest";
import manifest from "../../static/manifest.json";

describe("manifest", () => {
  it("is MV3 with fixed permissions, all-sites access and one content script", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.minimum_chrome_version).toBe("121");
    expect(manifest.permissions).toEqual(["declarativeNetRequest", "declarativeNetRequestFeedback", "storage", "sidePanel", "activeTab", "scripting", "webRequest"]);
    expect(manifest.host_permissions).toEqual(["<all_urls>"]);
    expect(manifest.content_scripts).toEqual([
      { matches: ["<all_urls>"], js: ["content.js"], run_at: "document_start", all_frames: true, match_about_blank: true },
    ]);
    expect(manifest).not.toHaveProperty("web_accessible_resources");
  });
  it("declares exactly the three rulesets in order", () => {
    expect(manifest.declarative_net_request.rule_resources.map((r) => [r.id, r.enabled, r.path])).toEqual([
      ["compact", true, "rulesets/compact.json"],
      ["detail-easylist", false, "rulesets/detail-easylist.json"],
      ["detail-easyprivacy", false, "rulesets/detail-easyprivacy.json"],
    ]);
  });
});
