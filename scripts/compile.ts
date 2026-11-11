// Compiles lists/ into dist/rulesets/. Run by `npm run compile`.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { compile } from "../src/compiler/emit.ts";
import type { SourceInfo } from "../src/compiler/types.ts";

const lists = new URL("../lists/", import.meta.url);
const out = new URL("../dist/rulesets/", import.meta.url);
mkdirSync(out, { recursive: true });

const sources: SourceInfo[] = JSON.parse(readFileSync(new URL("SOURCES.json", lists), "utf8"));
const inputs = (["easylist", "easyprivacy"] as const).map((id) => ({
  id,
  text: readFileSync(new URL(`${id}.txt`, lists), "utf8"),
}));
const r = compile(inputs, { generatedAt: new Date().toISOString(), sources });

for (const id of ["compact", "detail-easylist", "detail-easyprivacy"] as const) {
  writeFileSync(new URL(`${id}.json`, out), JSON.stringify(r.rulesets[id]));
  writeFileSync(new URL(`map-${id}.json`, out), JSON.stringify(r.maps[id]));
}
writeFileSync(new URL("report.json", out), JSON.stringify(r.report, null, 2));
copyFileSync(new URL("LICENSE", lists), new URL("LICENSE", out));

for (const [id, p] of Object.entries(r.report.perList)) {
  console.log(`${id}: parsed ${p.parsed}, converted ${p.converted}, skipped`, p.skipped);
}
console.table(r.report.rulesets);
console.log(`compact cut: ${r.report.compactCut}`);
