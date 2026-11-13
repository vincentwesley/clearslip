import { test, expect, chromium, type BrowserContext, type Worker } from "@playwright/test";
import { FiltersEngine, Request } from "@ghostery/adblocker";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Differential test: Chrome's own DNR evaluation of our compiled rulesets vs @ghostery/adblocker
// (test-only oracle) loaded with exactly the filter lines the compiler converted.

interface Tuple {
  url: string;
  type: string;
  initiator: string;
  kind: string;
}
interface Rule {
  priority: number;
  action: { type: string };
}

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "../../dist");
const readJson = <T>(p: string, fallback: T): T => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return fallback;
  }
};
const rs = (id: string) => path.join(dist, "rulesets", id);
const corpus = readJson<Tuple[]>(path.join(here, "corpus.json"), []);
const known = readJson<{ key: string; reason: string }[]>(path.join(here, "known-differences.json"), []);
const IDS = ["compact", "detail-easylist", "detail-easyprivacy", "detail-clearslip-sg"] as const;
const rules = Object.fromEntries(IDS.map((id) => [id, readJson<Rule[]>(rs(`${id}.json`), [])]));
const maps = Object.fromEntries(IDS.map((id) => [id, readJson<(string | [number, number, string] | null)[]>(rs(`map-${id}.json`), [])]));
const skip = corpus.length === 0 || rules.compact.length === 0;

const key = (t: Tuple) => `${t.type} ${t.url} <- ${t.initiator}`;
const DETAIL = ["detail-easylist", "detail-easyprivacy", "detail-clearslip-sg"];
/** Filter text of a rule (compact: its first filter). */
const filterOf = (rulesetId: string, ruleId: number): string => {
  const e = maps[rulesetId][ruleId];
  return (Array.isArray(e) ? e[2] : e) ?? "-";
};

let ctx: BrowserContext;
let sw: Worker;
let dir: string;

test.beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "clearslip-diff-"));
  ctx = await chromium.launchPersistentContext(dir, {
    channel: "chromium", // new headless mode, required for extensions
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  await expect.poll(() => sw.evaluate(async () => (await chrome.storage.local.get("mode")).mode), { timeout: 60000 }).toBeTruthy();
});
test.afterAll(async () => {
  await ctx?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test.describe.configure({ mode: "serial" });

test("mode selection: stored mode matches the enabled rulesets", async () => {
  const mode = await sw.evaluate(async () => (await chrome.storage.local.get("mode")).mode);
  expect(["detail", "compact"]).toContain(mode);
  const enabled = (await sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets())).sort();
  expect(enabled).toEqual(mode === "detail" ? [...DETAIL].sort() : ["compact"]);
});

interface Result {
  blocked: boolean;
  ruleset?: string;
  ruleId?: number;
}

/** Enable exactly `enable` (others off) and evaluate every tuple with Chrome's testMatchOutcome. */
async function chrome_(enable: string[]): Promise<Result[]> {
  await sw.evaluate(
    ([on, off]) => chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: on, disableRulesetIds: off }),
    [enable, IDS.filter((i) => !enable.includes(i))] as [string[], string[]],
  );
  const matched = await sw.evaluate(
    (ts) =>
      Promise.all(
        ts.map(async (t) => {
          const r = await chrome.declarativeNetRequest.testMatchOutcome({
            url: t.url,
            type: t.type as chrome.declarativeNetRequest.ResourceType,
            initiator: t.initiator,
          });
          return r.matchedRules.map((m) => ({ rulesetId: m.rulesetId, ruleId: m.ruleId }));
        }),
      ),
    corpus,
  );
  return matched.map((ms) => {
    // Highest priority wins; at equal priority allow beats block.
    const rank = (m: { rulesetId: string; ruleId: number }) => {
      const r = rules[m.rulesetId][m.ruleId - 1];
      return r.priority * 10 + (r.action.type === "block" ? 0 : 1);
    };
    const top = [...ms].sort((a, b) => rank(b) - rank(a))[0];
    if (!top) return { blocked: false };
    return {
      blocked: rules[top.rulesetId][top.ruleId - 1].action.type === "block",
      ruleset: top.rulesetId,
      ruleId: top.ruleId,
    };
  });
}

function oracle(): FiltersEngine {
  const lines = new Set<string>();
  for (const id of DETAIL) for (const e of maps[id]) if (typeof e === "string") lines.add(e);
  return FiltersEngine.parse([...lines].join("\n"), { loadCosmeticFilters: false });
}

test.describe("differential", () => {
  test.skip(skip, "corpus or compiled rulesets missing");

  test("every regex rule is accepted by Chrome's RE2 (no silently dropped rules)", async () => {
    const regexes = [...new Set(IDS.flatMap((id) => rules[id]).map((r) => (r as Rule & { condition: { regexFilter?: string; isUrlFilterCaseSensitive?: boolean } }).condition))]
      .filter((c) => c.regexFilter)
      .map((c) => ({ regex: c.regexFilter!, isCaseSensitive: !!c.isUrlFilterCaseSensitive }));
    const rejected = await sw.evaluate(async (rx) => {
      const out: string[] = [];
      for (const r of rx) {
        const s = await chrome.declarativeNetRequest.isRegexSupported(r);
        if (!s.isSupported) out.push(`${s.reason}: ${r.regex.slice(0, 100)}`);
      }
      return out;
    }, regexes);
    expect(rejected).toEqual([]);
  });

  test("detail rulesets agree with the oracle", async () => {
    test.setTimeout(300000);
    const ours = await chrome_(DETAIL);
    const engine = oracle();
    const bad: string[] = [];
    let agree = 0;
    const unlisted: string[] = [];
    corpus.forEach((t, i) => {
      const theirs = engine.match(Request.fromRawDetails({ url: t.url, type: t.type as never, sourceUrl: t.initiator })).match;
      if (theirs === ours[i].blocked) return void agree++;
      const o = ours[i];
      const f = o.ruleset ? filterOf(o.ruleset, o.ruleId!) : "-";
      const line = `[${t.kind}] ${key(t).slice(0, 160)}\n    ours=${o.blocked} oracle=${theirs} our filter: ${f.slice(0, 160)}`;
      bad.push(line);
      if (!known.some((k) => k.key === key(t))) unlisted.push(line);
    });
    const blockedByOracle = corpus.filter((t) => engine.match(Request.fromRawDetails({ url: t.url, type: t.type as never, sourceUrl: t.initiator })).match).length;
    console.log(`oracle blocks ${blockedByOracle}/${corpus.length} tuples`);
    corpus.forEach((t, i) => t.kind === "doubleclick" && console.log(`doubleclick ${key(t)} ours=${ours[i].blocked} ${ours[i].ruleset ? filterOf(ours[i].ruleset!, ours[i].ruleId!) : "-"}`));
    console.log(`agreement ${agree}/${corpus.length} (${((100 * agree) / corpus.length).toFixed(1)}%), ${bad.length} disagreements, ${unlisted.length} unlisted`);
    if (bad.length) console.log(bad.join("\n"));
    expect(unlisted, "disagreements not in known-differences.json").toEqual([]);
  });

  test("compact gives the same blocked/not-blocked answer as detail for every tuple", async () => {
    test.setTimeout(300000);
    const detail = await chrome_(DETAIL);
    const compact = await chrome_(["compact"]);
    const diff = corpus.flatMap((t, i) => (detail[i].blocked === compact[i].blocked ? [] : [`${key(t)} detail=${detail[i].blocked} compact=${compact[i].blocked}`]));
    expect(diff).toEqual([]);
  });
});
