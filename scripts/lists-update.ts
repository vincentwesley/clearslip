// Refreshes the downloaded lists/*.txt (not hush-sg.txt, our own) and lists/SOURCES.json. Run by `npm run lists:update` on the developer machine only.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { LIST_IDS, LISTS } from "../src/compiler/types.ts";

const dir = new URL("../lists/", import.meta.url);
mkdirSync(dir, { recursive: true });

const sources = [];
for (const id of LIST_IDS) {
  const l = { id, url: LISTS[id].url };
  let body: string;
  if (l.url) {
    const res = await fetch(l.url, { headers: { "User-Agent": "list-updater/1.0" } });
    if (res.status !== 200) throw new Error(`${l.url}: HTTP ${res.status}`);
    body = await res.text();
    if (!body.startsWith("[Adblock")) throw new Error(`${l.url}: body does not start with [Adblock`);
    writeFileSync(new URL(`${l.id}.txt`, dir), body);
  } else {
    body = readFileSync(new URL(`${l.id}.txt`, dir), "utf8"); // own list: only recorded, never fetched
  }
  sources.push({
    id: l.id,
    url: l.url || `local: lists/${l.id}.txt (own list, not downloaded)`,
    fetchedAt: new Date().toISOString(),
    sha256: createHash("sha256").update(body).digest("hex"),
    lines: body.split("\n").length,
  });
  console.log(`${l.id}: ${sources.at(-1)?.lines} lines`);
}
writeFileSync(new URL("SOURCES.json", dir), JSON.stringify(sources, null, 2) + "\n");
