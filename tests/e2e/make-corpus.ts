// Builds tests/e2e/corpus.json: request tuples derived from the pinned lists/ snapshots.
// Deterministic (fixed seed). Run: node tests/e2e/make-corpus.ts
import { readFileSync, writeFileSync } from "node:fs";
import { parseLine } from "../../src/compiler/parse.ts";
import type { Filter, ListId } from "../../src/compiler/types.ts";

export interface Tuple {
  url: string;
  type: string;
  initiator: string;
  kind: string;
}

const PER_BUCKET = 18; // filters per bucket, two tuples each
const BENIGN = 76;
const DEFAULT_TYPES = ["script", "image", "stylesheet", "xmlhttprequest", "sub_frame", "font", "media", "ping", "other"];
const THIRD = "https://example.com";

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261111);
const pick = <T>(a: T[]): T => a[Math.floor(rand() * a.length)];
function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function bucket(f: Filter): string {
  if (f.kind === "regex") return "regex";
  if (f.important) return "important";
  if (f.exception) return "exception";
  if (f.domains.length) return "domain";
  if (f.thirdParty !== null) return "third-party";
  if (f.types.length || f.notTypes.length) return "typed";
  if (/^\|\|[a-z0-9.-]+\^$/.test(f.pattern)) return "pure-host";
  if (f.pattern.startsWith("||")) return "host-path";
  return "substring";
}

/** Shortest-ish string matching a simple regex (first alternative, minimum repeats); null if too exotic. */
function fromRegex(src: string): string | null {
  let i = 0;
  const atom = (): string | null => {
    const c = src[i++];
    if (c === "\\") {
      const e = src[i++];
      return ({ w: "a", d: "1", s: " ", b: "", n: "\n" } as Record<string, string>)[e] ?? e;
    }
    if (c === "[") {
      const neg = src[i] === "^";
      if (neg) i++;
      const first = src[i] === "\\" ? ({ w: "a", d: "1" } as Record<string, string>)[src[i + 1]] ?? src[i + 1] : src[i];
      while (src[i] !== "]" || i === 0) {
        if (src[i] === "\\") i++;
        i++;
        if (i >= src.length) return null;
      }
      i++;
      return neg ? "~" : first;
    }
    if (c === "(") {
      if (src[i] === "?" && src[i + 1] === ":") i += 2;
      const inner = seq();
      let depth = 0;
      while (src[i] !== ")" || depth) { // skip remaining alternatives
        if (i >= src.length) return null;
        if (src[i] === "\\") i++;
        else if (src[i] === "(") depth++;
        else if (src[i] === ")") depth--;
        i++;
      }
      i++;
      return inner;
    }
    if (c === ".") return "x";
    if (c === "^" || c === "$") return "";
    return c;
  };
  const seq = (): string | null => {
    let out = "";
    while (i < src.length && src[i] !== ")" && src[i] !== "|") {
      const a = atom();
      if (a === null) return null;
      let n = 1;
      const q = src[i];
      if (q === "?") n = 0;
      else if (q === "*" || q === "+") n = 1;
      else if (q === "{") {
        const m = /^\{(\d+)/.exec(src.slice(i));
        if (!m) return null;
        n = Number(m[1]);
        i = src.indexOf("}", i);
      } else i--;
      i++;
      if (src[i] === "?") i++; // lazy
      out += a.repeat(n);
    }
    return out;
  };
  const r = seq();
  return r !== null && i >= src.length ? r : null;
}

/** A URL the filter's pattern should match, or null. */
function synth(f: Filter): string | null {
  let url: string;
  if (f.kind === "regex") {
    const s = fromRegex(f.pattern);
    if (s === null) return null;
    url = /^https?:\/\//.test(s) ? s : "https://cdn.example.net/" + s.replace(/^\/+/, "");
    if (!new RegExp(f.pattern, f.matchCase ? "" : "i").test(url)) return null;
  } else {
    let s = f.pattern.replace(/\|$/, "").replace(/\^/g, "/").replace(/\*/g, "x");
    if (s.startsWith("||")) {
      s = s.slice(2);
      url = "https://" + s + (s.includes("/") ? "" : "/");
    } else if (s.startsWith("|")) {
      url = s.slice(1);
      if (!/^[a-z]+:\/\//.test(url)) return null;
    } else url = "https://cdn.example.net/" + s.replace(/^\/+/, "");
  }
  try {
    return new URL(url).href;
  } catch {
    return null;
  }
}

function tuples(f: Filter, kind: string): Tuple[] | null {
  const url = synth(f);
  if (!url) return null;
  const allowed = DEFAULT_TYPES.filter((t) => !f.notTypes.includes(t));
  const type = f.types.find((t) => t !== "main_frame") ?? pick(allowed);
  if (f.types.includes("main_frame") && !f.types.some((t) => t !== "main_frame")) return null;
  const u = type === "websocket" ? url.replace(/^https?:/, "wss:") : url;
  const origin = new URL(u.replace(/^wss?:/, "https:")).origin;
  const hit = f.domains.length ? `https://${f.domains[0]}` : f.thirdParty === false ? origin : THIRD;
  const miss = f.notDomains.length ? `https://${f.notDomains[0]}` : f.domains.length || f.thirdParty === false ? THIRD : origin;
  return [
    { url: u, type, initiator: hit, kind },
    { url: u, type, initiator: miss, kind },
  ];
}

const filters: Filter[] = [];
for (const id of ["easylist", "easyprivacy"] as ListId[]) {
  const text = readFileSync(new URL(`../../lists/${id}.txt`, import.meta.url), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const r = parseLine(line, id);
    if (r?.ok && !r.filter.badfilter && !r.filter.document) filters.push(r.filter);
  }
}

const buckets = new Map<string, Filter[]>();
for (const f of filters) {
  const b = bucket(f);
  buckets.set(b, [...(buckets.get(b) ?? []), f]);
}

const out: Tuple[] = [
  // Reported oddity: doubleclick as third-party script/image.
  { url: "https://ad.doubleclick.net/ddm/ad/x", type: "script", initiator: THIRD, kind: "doubleclick" },
  { url: "https://ad.doubleclick.net/ddm/ad/x", type: "image", initiator: THIRD, kind: "doubleclick" },
  { url: "https://googleads.g.doubleclick.net/pagead/id", type: "script", initiator: THIRD, kind: "doubleclick" },
  { url: "https://googleads.g.doubleclick.net/pagead/id", type: "image", initiator: THIRD, kind: "doubleclick" },
];
for (const [name, list] of [...buckets].sort((a, b) => a[0].localeCompare(b[0]))) {
  let n = 0;
  for (const f of shuffle(list)) {
    const t = tuples(f, name);
    if (!t) continue;
    out.push(...t);
    if (++n >= PER_BUCKET) break;
  }
}

// Negated-type-only filters must not block top-level navigations (main_frame).
let nm = 0;
for (const f of shuffle(filters)) {
  if (f.exception || f.types.length || !f.notTypes.length || f.kind === "regex") continue;
  const url = synth(f);
  if (!url) continue;
  out.push({ url, type: "main_frame", initiator: THIRD, kind: "not-type-main-frame" });
  if (++nm >= 10) break;
}

const hosts = [
  "example.com", "en.wikipedia.org", "github.com", "developer.mozilla.org", "news.ycombinator.com", "www.bbc.co.uk",
  "cdn.jsdelivr.net", "fonts.gstatic.com", "stackoverflow.com", "www.python.org", "nodejs.org", "docs.rs",
  "www.nasa.gov", "archive.org", "unpkg.com", "static.example.org", "www.gnu.org", "api.example.com", "blog.example.net",
];
const files: [string, string][] = [
  ["/app.js", "script"], ["/static/style.css", "stylesheet"], ["/images/logo.png", "image"], ["/fonts/body.woff2", "font"],
  ["/api/v1/items?id=42", "xmlhttprequest"], ["/embed/video", "sub_frame"], ["/media/clip.mp4", "media"], ["/", "other"],
];
let b = 0;
while (b < BENIGN) {
  const h = hosts[b % hosts.length];
  const [p, type] = files[Math.floor(b / hosts.length) % files.length];
  const initiator = b % 3 === 0 ? `https://${h}` : THIRD;
  out.push({ url: new URL(`https://${h}${p}`).href, type, initiator, kind: "benign" });
  b++;
}

writeFileSync(new URL("corpus.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
const counts: Record<string, number> = {};
for (const t of out) counts[t.kind] = (counts[t.kind] ?? 0) + 1;
console.log(out.length, counts);
