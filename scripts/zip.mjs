import { zipSync } from "fflate";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = {};
for (const p of walk("dist")) files[relative("dist", p).split("\\").join("/")] = readFileSync(p);
writeFileSync("extension.zip", zipSync(files));
console.log(`extension.zip (${Object.keys(files).length} files)`);
