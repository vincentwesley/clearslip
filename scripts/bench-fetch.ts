// Downloads the official Chromium MV3 builds of uBlock Origin Lite and AdGuard into .bench/ (gitignored) for `npm run bench`.
// The zips are untrusted data: they are only unzipped here (no path escapes) and later loaded as unpacked extensions in a throwaway
// browser profile. Nothing from them is executed by Node. `--if-missing` skips the download when .bench/versions.json exists.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { unzipSync } from "fflate";

const bench = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.bench");
const versionsFile = path.join(bench, "versions.json");
if (process.argv.includes("--if-missing") && existsSync(versionsFile)) process.exit(0);

const TARGETS = [
  { name: "ubol", repo: "uBlockOrigin/uBOL-home", asset: /\.chromium\.zip$/ },
  { name: "adguard", repo: "AdguardTeam/AdguardBrowserExtension", asset: /^chrome-mv3\.zip$/ },
];
const headers = { "User-Agent": "Mozilla/5.0 (compatible; extension-benchmark)", Accept: "application/vnd.github+json" };

interface Release {
  tag_name: string;
  assets: { name: string; browser_download_url: string }[];
}

const versions: Record<string, unknown> = {};
mkdirSync(bench, { recursive: true });
for (const t of TARGETS) {
  try {
    const rel = (await (await fetch(`https://api.github.com/repos/${t.repo}/releases/latest`, { headers })).json()) as Release;
    const asset = rel.assets?.find((a) => t.asset.test(a.name));
    if (!asset) throw new Error(`no asset matching ${t.asset} in ${rel.tag_name}`);
    const res = await fetch(asset.browser_download_url, { headers });
    if (!res.ok) throw new Error(`download ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const files = unzipSync(buf);
    // The folder holding manifest.json (zip root or a single top folder) becomes the extension root.
    const manifest = Object.keys(files)
      .filter((f) => f === "manifest.json" || f.endsWith("/manifest.json"))
      .sort((a, b) => a.length - b.length)[0];
    if (!manifest) throw new Error("no manifest.json in zip");
    const prefix = manifest.slice(0, manifest.length - "manifest.json".length);
    const dir = path.join(bench, t.name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (const [name, data] of Object.entries(files)) {
      if (!name.startsWith(prefix) || name.endsWith("/")) continue;
      const out = path.resolve(dir, name.slice(prefix.length));
      if (!out.startsWith(dir + path.sep)) throw new Error(`path escape in zip: ${name}`);
      mkdirSync(path.dirname(out), { recursive: true });
      writeFileSync(out, data);
    }
    versions[t.name] = {
      repo: t.repo,
      version: rel.tag_name,
      asset: asset.name,
      url: asset.browser_download_url,
      sha256: createHash("sha256").update(buf).digest("hex"),
    };
    console.log(t.name, rel.tag_name, asset.name);
  } catch (e) {
    versions[t.name] = { repo: t.repo, error: String((e as Error).message) };
    console.error(t.name, "FAILED:", (e as Error).message);
  }
}
writeFileSync(versionsFile, JSON.stringify(versions, null, 2) + "\n");
