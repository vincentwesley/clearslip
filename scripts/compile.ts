// Compiles lists/ into dist/rulesets/. Run by `npm run compile`.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { toCss } from "../src/compiler/cosmetic.ts";
import { compile } from "../src/compiler/emit.ts";
import { LIST_IDS, RULESET_IDS, type SourceInfo } from "../src/compiler/types.ts";

const lists = new URL("../lists/", import.meta.url);
const out = new URL("../dist/rulesets/", import.meta.url);
mkdirSync(out, { recursive: true });

const sources: SourceInfo[] = JSON.parse(readFileSync(new URL("SOURCES.json", lists), "utf8"));
const inputs = LIST_IDS.map((id) => ({
  id,
  text: readFileSync(new URL(`${id}.txt`, lists), "utf8"),
}));
const r = compile(inputs, { generatedAt: new Date().toISOString(), sources });

for (const id of RULESET_IDS) {
  writeFileSync(new URL(`${id}.json`, out), JSON.stringify(r.rulesets[id]));
  writeFileSync(new URL(`map-${id}.json`, out), JSON.stringify(r.maps[id]));
}
const css = toCss(r.cosmetic.generic);
writeFileSync(new URL("cosmetic-generic.css", out), css);
writeFileSync(new URL("cosmetic-generic.json", out), JSON.stringify(r.cosmetic.generic));
writeFileSync(new URL("cosmetic-specific.json", out), JSON.stringify(r.cosmetic.specific));
writeFileSync(new URL("report.json", out), JSON.stringify(r.report, null, 2));
copyFileSync(new URL("LICENSE", lists), new URL("LICENSE", out));

for (const [id, p] of Object.entries(r.report.perList)) {
  console.log(`${id}: parsed ${p.parsed}, converted ${p.converted}, skipped`, p.skipped);
}
console.table(r.report.rulesets);
console.log(`compact cut: ${r.report.compactCut}`);
console.log("cosmetic:", r.report.cosmetic, `generic css ${css.length} bytes`);
