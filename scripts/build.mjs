import { build } from "esbuild";
import { cpSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
await build({
  entryPoints: ["src/background.ts", "src/sidepanel.ts", "src/sidepanel.css"],
  outdir: "dist",
  bundle: true,
  format: "esm",
  target: "chrome114",
  minify: true,
  loader: { ".woff2": "file", ".webp": "file" },
  assetNames: "assets/[name]-[hash]",
});
cpSync("static", "dist", { recursive: true });
console.log("built dist/");
