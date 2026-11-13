// Turns .bench/results.json (raw, gitignored) into docs/benchmark/results.json and docs/benchmark/README.md.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const raw = JSON.parse(readFileSync(new URL(".bench/results.json", root), "utf8"));
const CONDS: string[] = raw.meta.conditions;
const LABEL: Record<string, string> = { none: "None", clearslip: "Clearslip", ubol: "uBOL", adguard: "AdGuard" };

interface Run { loaded: boolean; ok: boolean; reason: string; requests: number; blocked: number; thirdPartyDone: number; bytes: number; loadMs: number; pageErrors: number }
const METRICS = ["requests", "blocked", "thirdPartyDone", "bytes", "loadMs", "pageErrors"] as const;

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const sites = raw.sites.map((s: { url: string; sg: boolean; excluded: string | null; runs: Record<string, Run[]> }) => {
  const cells: Record<string, unknown> = {};
  if (!s.excluded)
    for (const c of CONDS) {
      const runs = s.runs[c] ?? [];
      const good = runs.filter((r) => r.loaded);
      const cell: Record<string, unknown> = { runs: runs.length, loadedRuns: good.length, brokenRuns: runs.filter((r) => !r.ok).length };
      for (const m of METRICS) cell[m] = good.length ? { median: median(good.map((r) => r[m])), min: Math.min(...good.map((r) => r[m])), max: Math.max(...good.map((r) => r[m])) } : null;
      cells[c] = cell;
    }
  return { url: s.url, singapore: s.sg, excluded: s.excluded, conditions: cells };
});

mkdirSync(new URL("docs/benchmark/", root), { recursive: true });
writeFileSync(new URL("docs/benchmark/results.json", root), JSON.stringify({ meta: raw.meta, sites }, null, 1) + "\n");

type Cell = Record<string, { median: number } | null> & { brokenRuns: number; runs: number };
const used = sites.filter((s: { excluded: string | null }) => !s.excluded);
const med = (cell: Cell, m: string) => cell[m]?.median ?? 0;
const fmt = (c: Cell | undefined) =>
  c && c.runs ? `${med(c, "requests")} / ${med(c, "blocked")} / ${med(c, "thirdPartyDone")} / ${(med(c, "bytes") / 1048576).toFixed(2)} / ${(med(c, "loadMs") / 1000).toFixed(2)}` : "n/a";
const host = (u: string) => new URL(u).hostname + new URL(u).pathname.replace(/\/$/, "");

const rows = used.map((s: { url: string; conditions: Record<string, Cell> }) => `| ${host(s.url)} | ${CONDS.map((c) => fmt(s.conditions[c])).join(" | ")} |`);
const totals = CONDS.map((c) => {
  const sum = (m: string) => used.reduce((n: number, s: { conditions: Record<string, Cell> }) => n + med(s.conditions[c], m), 0);
  return `${sum("requests")} / ${sum("blocked")} / ${sum("thirdPartyDone")} / ${(sum("bytes") / 1048576).toFixed(2)} / ${(sum("loadMs") / 1000).toFixed(1)}`;
});
const broke = CONDS.map((c) => {
  const list = used.filter((s: { conditions: Record<string, Cell> }) => s.conditions[c].brokenRuns > 0).map((s: { url: string; conditions: Record<string, Cell> }) => `${host(s.url)} (${s.conditions[c].brokenRuns}/${s.conditions[c].runs})`);
  return `- ${LABEL[c]}: ${list.length ? list.join(", ") : "none"}`;
});
const excluded = sites.filter((s: { excluded: string | null }) => s.excluded).map((s: { url: string; excluded: string }) => `- ${host(s.url)}: ${s.excluded}`);

const v = raw.meta.versions as Record<string, { version?: string; error?: string; sha256?: string }>;
const mf = raw.meta.manifests as Record<string, { name?: string; version?: string }>;
const state = raw.meta.firstRunState as Record<string, { rulesets?: number; origins?: string[] }>;
const ext = (c: string) => (c in mf ? `${mf[c].name} ${mf[c].version}${v[c]?.version ? ` (release ${v[c].version})` : ""}` : v[c]?.error ? `not run: ${v[c].error}` : "not run");
const hostAccess = (c: string) => (state[c]?.origins?.length ? `granted host access: ${state[c].origins!.join(", ")}` : "no host access granted at launch");

const text = `# Benchmark: Clearslip vs uBlock Origin Lite vs AdGuard MV3

Date ${raw.meta.date}. Headless Chromium ${raw.meta.chromium}. Clearslip commit ${raw.meta.clearslipCommit}${raw.meta.clearslipDirty ? " (working tree had uncommitted changes under src, static or lists)" : ""}. Reproduce with \`npm run bench\` (live network, local only, never CI; competitor builds are downloaded into the gitignored \`.bench/\`).

## Extensions, all in their default configuration

| Condition | Extension | Setup observed |
|---|---|---|
${CONDS.map((c) => `| ${LABEL[c]} | ${c === "none" ? "no extension" : ext(c)} | ${c === "none" ? "n/a" : `${state[c]?.rulesets ?? "?"} static rulesets enabled at first load; ${hostAccess(c)}`} |`).join("\n")}

uBOL ships with its own default filtering mode; the host-access line above is what was observable on first run in a fresh unpacked profile (without granted host access uBOL can only run in its basic mode: network rules, no cosmetic or scriptlet injection). AdGuard and uBOL were not configured, signed in or given extra permissions.

## Method

- Four conditions, each load in a fresh persistent profile (launch, wait for the extension's service worker, up to 15 s for a competitor's first-run ruleset setup, close any onboarding tab, then load).
- ${raw.meta.runs} runs per site per condition, interleaved (${CONDS.map((c) => LABEL[c]).join(", ")}, then repeat) so network drift hits all conditions. Sequential, 25 s navigation timeout, wait for \`load\` then 5 s settle, one retry only if the main document was not OK.
- Main document OK = HTTP status below 400, non-empty title, body text over 500 characters.
- Third-party = request host's registrable domain differs from the page's. Simplification: last two labels, or last three when the last two are a hard-coded two-level suffix (\`com.sg\`, \`co.uk\`, \`com.au\` and a few more); it is not the Public Suffix List.
- Reported value is the median of the runs; min and max are in \`results.json\`. A site unreachable without a blocker is excluded.

## Per-site results

Each cell: requests / blocked (\`ERR_BLOCKED_BY_CLIENT\`) / third-party completed / MB transferred / load s. Medians.

| Site | ${CONDS.map((c) => LABEL[c]).join(" | ")} |
|---|${CONDS.map(() => "---").join("|")}|
${rows.join("\n")}
| **Total (sum of medians)** | ${totals.join(" | ")} |

## Pages that broke (runs failing the main-document check)

${broke.join("\n")}
${excluded.length ? `\nExcluded:\n${excluded.join("\n")}\n` : ""}
## What this does and does not show

- One machine, one network, one time of day, ${raw.meta.runs} runs: ad auctions, A/B tests and CDN choice vary, so small differences are noise.
- Default settings only. Another configuration (uBOL optimal/complete modes, AdGuard extra filters, Clearslip with a Singapore list) would give different numbers.
- Headless Chromium with unpacked builds, not the Web Store builds in a daily-driver profile.
- Counts are network effects. Cosmetic filtering (hidden ad slots, leftover empty boxes), scriptlets and visual quality are not measured. "Blocked" counts only requests failed by the extension; redirects to neutered resources and cosmetic hiding are invisible here.
- YouTube is not tested.
- Numbers are reported as measured, including where Clearslip is behind.
`;
writeFileSync(new URL("docs/benchmark/README.md", root), text);
