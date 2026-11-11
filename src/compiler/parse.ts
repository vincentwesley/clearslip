import type { Filter, ListId, ParseResult } from "./types.ts";

const TYPE_MAP: Record<string, string> = {
  script: "script",
  image: "image",
  stylesheet: "stylesheet",
  css: "stylesheet",
  xmlhttprequest: "xmlhttprequest",
  xhr: "xmlhttprequest",
  subdocument: "sub_frame",
  frame: "sub_frame",
  font: "font",
  media: "media",
  websocket: "websocket",
  ping: "ping",
  object: "object",
  "object-subrequest": "object",
  other: "other",
  document: "main_frame",
  doc: "main_frame",
};

const UNSUPPORTED = new Set([
  "redirect", "redirect-rule", "removeparam", "queryprune", "csp", "popup", "popunder", "rewrite",
  "replace", "header", "generichide", "ghide", "elemhide", "ehide", "genericblock", "denyallow",
  "inline-script", "inline-font", "empty", "mp4", "all", "to", "method", "permissions", "urltransform",
]);

const OPTIONS_RE = /^[~a-z0-9_-]+(=[^,]*)?(,[~a-z0-9_-]+(=[^,]*)?)*$/i;
const HOST_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;
const NON_ASCII = /[\u0080-￿]/;
const COSMETIC_RE = /#[@?$%]*#/;

const fail = (reason: string): ParseResult => ({ ok: false, reason });

/** Lowercase + punycode a hostname; null if it is not a plain ASCII hostname afterwards. */
export function asciiHost(h: string): string | null {
  let host = h.toLowerCase();
  if (NON_ASCII.test(host)) {
    try {
      host = new URL(`http://${host}/`).hostname;
    } catch {
      return null;
    }
  }
  return HOST_RE.test(host) ? host : null;
}

const ESC_WEIGHT: Record<string, number> = { w: 4, W: 4, s: 2, S: 2, D: 4, d: 1 };
const escWeight = (a: string): number => ESC_WEIGHT[a[1]] ?? 1;
const atomWeight = (a: string): number => {
  if (a.startsWith("\\")) return escWeight(a);
  if (!a.startsWith("[")) return 1;
  const items = a.slice(1, -1).replace(/^\^/, "").match(/\\.|[^\\]-[^\\]|[^\\]/g) ?? [];
  return items.reduce((s, t) => s + (t.startsWith("\\") ? escWeight(t) : 1), 0);
};

/**
 * Rough size of the compiled program: counted repetitions multiply the atom's weight, long alternations
 * add up. Chrome rejects a regex rule over its ~2 KB RE2 memory limit (`memoryLimitExceeded`), which
 * silently drops the rule. Calibrated against Chrome's isRegexSupported (see tests/e2e/differential.spec.ts).
 */
export function re2Cost(src: string): number {
  let worst = 0;
  for (const m of src.matchAll(/(\\.|\[(?:\\.|[^\]\\])*\]|[^\\])\{(\d+)(?:,(\d*))?\}/g)) {
    worst = Math.max(worst, atomWeight(m[1]) * Number(m[3] || m[2]));
  }
  for (const m of src.matchAll(/\(([^()]*\|[^()]*)\)/g)) worst = Math.max(worst, m[1].length);
  return worst;
}
export const RE2_COST_MAX = 60;

// RE2 has no lookaround or backreferences; Chrome also caps regex size.
function re2Safe(src: string): boolean {
  if (re2Cost(src) >= RE2_COST_MAX) return false;
  if (src.length > 1024 || /[^\x20-\x7e]/.test(src)) return false;
  if (/\(\?<?[=!]/.test(src) || /\\[1-9]|\\k</.test(src)) return false;
  if (/\{\d{4,}|,\d{4,}\}/.test(src)) return false;
  try {
    new RegExp(src);
  } catch {
    return false;
  }
  return true;
}

function fixPattern(p: string): string | null {
  if (!NON_ASCII.test(p)) return p;
  const m = /^(\|\|)([^/^*:?|]+)(.*)$/.exec(p);
  if (!m) return null;
  const host = asciiHost(m[2]);
  const rest = m[3];
  return host && !NON_ASCII.test(rest) ? m[1] + host + rest : null;
}

export function parseLine(rawLine: string, list: ListId): ParseResult | null {
  const raw = rawLine.trim();
  if (raw === "" || raw.startsWith("!") || /^\[adblock/i.test(raw)) return null; // not a filter line
  if (COSMETIC_RE.test(raw) && !raw.startsWith("/")) return fail("cosmetic");

  let body = raw;
  const exception = body.startsWith("@@");
  if (exception) body = body.slice(2);

  let opts = "";
  const di = body.lastIndexOf("$");
  if (di >= 0 && OPTIONS_RE.test(body.slice(di + 1))) {
    opts = body.slice(di + 1);
    body = body.slice(0, di);
  }

  const f: Filter = {
    raw, list, exception, kind: "url", pattern: "", types: [], notTypes: [], thirdParty: null,
    domains: [], notDomains: [], matchCase: false, important: false, badfilter: false, document: false,
  };

  for (const o of opts ? opts.split(",") : []) {
    const eq = o.indexOf("=");
    const name = (eq < 0 ? o : o.slice(0, eq)).toLowerCase();
    const value = eq < 0 ? "" : o.slice(eq + 1);
    const neg = name.startsWith("~");
    const key = neg ? name.slice(1) : name;
    if (key === "third-party" || key === "3p") f.thirdParty = !neg;
    else if (key === "first-party" || key === "1p") f.thirdParty = neg;
    else if (key === "match-case") f.matchCase = !neg;
    else if (key === "important") f.important = true;
    else if (key === "badfilter") f.badfilter = true;
    else if (key === "domain") {
      for (const d of value.split("|")) {
        if (d === "") continue;
        const n = d.startsWith("~");
        const bare = n ? d.slice(1) : d;
        if (bare.endsWith(".*")) return fail("domain-entity");
        const h = asciiHost(bare);
        if (!h) return fail("domain-invalid");
        (n ? f.notDomains : f.domains).push(h);
      }
    } else if (key in TYPE_MAP && !name.includes("=")) {
      (neg ? f.notTypes : f.types).push(TYPE_MAP[key]);
    } else if (UNSUPPORTED.has(key)) return fail(`option-${key}`);
    else return fail("unknown-option");
  }

  // $document: exceptions become allowAllRequests; ~document is already the default.
  f.notTypes = f.notTypes.filter((t) => t !== "main_frame");
  if (exception && f.types.includes("main_frame")) {
    if (f.types.length > 1) return fail("document-mixed");
    f.document = true;
    f.types = [];
  }

  if (body.length > 1 && body.startsWith("/") && body.endsWith("/")) {
    const src = body.slice(1, -1);
    if (!re2Safe(src)) return fail("regex-unsupported");
    f.kind = "regex";
    f.pattern = src;
  } else {
    const p = fixPattern(body);
    if (p === null) return fail("non-ascii");
    if (p.startsWith("||*") || /\s/.test(p) || p.replace(/^\|\|?/, "").replace(/\|$/, "").includes("|")) return fail("invalid-pattern");
    f.pattern = f.matchCase ? p : p.toLowerCase();
    if ((p === "" || /^\*+$/.test(p)) && f.domains.length === 0) return fail("empty-pattern");
    if (/^\*+$/.test(p)) f.pattern = "";
  }
  return { ok: true, filter: f };
}
