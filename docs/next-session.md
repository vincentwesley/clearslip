> Update at the end of any session that changed state. Keep it lean.

Continue work on **Hush** (folder `C:\Coding Projects\hush`, local repo only, no remote yet, not published).

## Before anything
1. Read `CLAUDE.md`, `docs/PLAN.md`, `docs/COMPILER-SPEC.md` (sections: Cosmetic filtering, Receipt, Zapper).
2. `npm ci --ignore-scripts`, then `npm run check && npm run build`.

## How to work here
- Orchestrate; builders (`vin-workflow:builder`, Sonnet) implement, Fable reviews diffs. Reviews: `code-review low <range>` after each milestone, plus a security read of new handlers.
- Local commits only. Identity: `vincentwesley` noreply. No push, no repo creation, no store upload without the owner's OK.
- Owner wants no check-ins (2026-11-11) and an install-and-use blocker: no sign-in, no setup, safe, proven to work (2026-11-12).
- Builder prompts must say: PowerShell + `fnm env --use-on-cd | Out-String | Invoke-Expression; fnm use 24`; `git -C`; never write files with `Set-Content`/`Out-File`/`>` (adds a BOM); headless only.
- Do not rebuild `dist/` while a benchmark or real-site run is in progress.

## Current state (2026-11-12)
- Milestones 1-4 built, committed, reviewed except as listed below. Last full green: 121 unit, 20 e2e (`npm run check`, `npm run build`, `npx playwright test`). Differential vs `@ghostery/adblocker`: 357/368 agree, rest in `tests/e2e/known-differences.json`.
- Permissions: `declarativeNetRequest`, `declarativeNetRequestFeedback`, `storage`, `sidePanel`, `activeTab`, `scripting`, `webRequest`, `host_permissions: <all_urls>`.
- Real-site check on 7 live sites: nothing broke (`docs/real-site-check.md`, `npm run test:real`).
- No tracker-to-company names: every usable dataset is CC BY-NC-SA (`docs/RESEARCH.md`).

## Do next, in this order
1. **Fix three milestone 4 review findings** (not started):
   - `src/background.ts` `zap` handler: `insertCSS` failing after `storage.local.set` makes the picker say "Could not save this rule" though it was saved. Report saved; treat injection failure separately.
   - `zap` handler does not check `siteIsOff` (only `startPicker` does): refuse on a paused site.
   - `src/lib/receipt.ts` `commitsPage`: same-host navigation with no request (back/forward cache, same-site prerender activation) keeps the old receipt; with no receipt yet the fallback never starts one.
2. **Finish milestone 6, the benchmark** (builder was interrupted mid-run): WIP is committed but unverified: `scripts/bench-fetch.ts`, `scripts/bench-report.ts`, `tests/real/bench.spec.ts`, `bench` script in `package.json`, `.gitignore` lines. `.bench/` (gitignored) holds downloaded uBOL + AdGuard MV3 and a partial `results.json`; delete `.bench/results.json` and rerun `npm run bench` in full. Still to do: `docs/benchmark/README.md` + `results.json`, typecheck/lint of the new files, and `.bench/sg-survivors.json` (third-party requests Hush lets through on Singapore sites that a competitor blocks). Spec for it is in git history of this file's session: 12 sites (7 from the real-site spec + todayonline, hardwarezone, propertyguru, sg.carousell, asiaone), 4 conditions (none, hush, ubol, adguard, defaults), 3 interleaved runs, medians, report honestly where Hush loses.
3. **Milestone 5, Singapore list**: a third list `lists/hush-sg.txt` (own filters, MIT) compiled like the others; every filter cites the site and evidence from `sg-survivors.json`; verify each site still loads (`npm run test:real`). Adding a list means a new entry in `LIST_IDS`/`RULESET_IDS` (`src/compiler/types.ts`) and the manifest; do it before the first store release so the ruleset set stays fixed afterwards.
4. **Wrap-up before asking the owner:** `knip.json` lacks `src/picker.ts`; popup failure paths have no automated test; no screenshots yet, so leftover empty ad boxes on real sites are unchecked; the Guardian barely improved (12 blocked of 104), worth a look; `simplify` + `security-review` over the whole repo; `vin-workflow:ship-batch` (pre-public gate), then `vin-workflow:release-extension` (zip, listing text, permission justifications, privacy answers, screenshots).

## Known gaps
1. `webRequest` receipt verified in the unpacked build only, not a store build.
2. Items marked unverified in `docs/RESEARCH.md`.

## Owner steps (end only)
1. OK to create the public GitHub repo `hush` and push.
2. Upload the zip in the Chrome Web Store dashboard and paste the prepared listing answers.
