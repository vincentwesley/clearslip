import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { RULESET_IDS } from "../src/compiler/types.ts";

rmSync("dist", { recursive: true, force: true });
await build({
  entryPoints: ["src/background.ts", "src/content.ts", "src/sidepanel.ts", "src/sidepanel.css", "src/popup.ts", "src/popup.css"],
  outdir: "dist",
  bundle: true,
  format: "esm",
  target: "chrome121",
  minify: true,
  loader: { ".woff2": "file", ".webp": "file" },
  assetNames: "assets/[name]-[hash]",
});
cpSync("static", "dist", { recursive: true }); // static/ has no rulesets/, so compile output is untouched

if (existsSync("scripts/compile.ts")) {
  const r = spawnSync(process.execPath, ["scripts/compile.ts"], { stdio: "inherit" });
  if (r.status !== 0) {
    console.error("build failed: scripts/compile.ts exited with", r.status);
    process.exit(1);
  }
} else {
  console.warn("WARNING: scripts/compile.ts not found; writing EMPTY rulesets. The build loads but blocks nothing.");
  mkdirSync("dist/rulesets", { recursive: true });
  const rulesets = {};
  for (const id of RULESET_IDS) {
    writeFileSync(`dist/rulesets/${id}.json`, "[]");
    writeFileSync(`dist/rulesets/map-${id}.json`, "[null]");
    rulesets[id] = { rules: 0, regexRules: 0 };
  }
  writeFileSync("dist/rulesets/cosmetic-generic.css", "");
  writeFileSync("dist/rulesets/cosmetic-generic.json", "[]");
  writeFileSync("dist/rulesets/cosmetic-specific.json", JSON.stringify({ hide: {}, unhide: {}, notHide: {}, noGeneric: [], noCosmetic: [] }));
  writeFileSync(
    "dist/rulesets/report.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), sources: [], perList: {}, rulesets, compactCut: 0 }),
  );
}
console.log("built dist/");
