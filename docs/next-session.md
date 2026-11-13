> Update at the end of any session that changed state. Keep it lean.

Continue work on **Hush** (folder `C:\Coding Projects\hush`, local repo only, no remote yet, not published).

## Before anything
1. Read `CLAUDE.md`, `docs/PLAN.md`, `docs/COMPILER-SPEC.md`.
2. `npm ci --ignore-scripts`, then `npm run check && npm run build`.

## How to work here
- Orchestrate; builders (`vin-workflow:builder`) implement, the main model reviews diffs.
- Local commits only. Identity: `vincentwesley` noreply. No push, no repo creation, no store upload without the owner's OK.
- Owner wants no check-ins and an install-and-use blocker: no sign-in, no setup, safe, proven to work.
- Builder prompts must say: PowerShell + `fnm env --use-on-cd | Out-String | Invoke-Expression; fnm use 24`; `git -C`; never write files with `Set-Content`/`Out-File`/`>` (adds a BOM); headless only.
- Do not rebuild `dist/` while a benchmark or real-site run is in progress. Any Playwright run wipes `test-results/` (copy screenshots out first).

## Current state (2026-11-13): v1.0.0 ready, waiting on the owner
- All six milestones done. Green: 125 unit, 23 e2e, `test:real` 7/7. Code review and a whole-repo security review done; findings fixed.
- Benchmark at 03f01ce (`docs/benchmark/`): 9 sites, requests none 2421 / Hush 903 / uBOL 969 / AdGuard 1232; no breakage under any blocker.
- Release package: `extension.zip` (gitignored, rebuild with `npm run zip`), `docs/STORE-LISTING.md`, `docs/PRIVACY.md`, `docs/store/*.png` (1280x800, `tests/store/`).
- Pre-public gate: `check-identity.sh --public hush` flags two false positives in upstream `lists/easylist*.txt` (the EasyList maintainers' public contact address; a filter line matching a secret pattern). PII/local-path scan clean.

## Known gaps
1. `webRequest` receipt verified in the unpacked build only, not a store build.
2. Same-host back/forward-cache navigation keeps the previous page's receipt (documented).
3. Empty right-hand ad columns stay as white space on CNA and Mothership (no grey boxes or labels).
4. Items marked unverified in `docs/RESEARCH.md`; store category to confirm in the dashboard.

## Owner steps
1. OK to create the public GitHub repo `hush` and push (makes the privacy-policy URL live).
2. Upload `extension.zip` in the Chrome Web Store dashboard and paste `docs/STORE-LISTING.md`; add `docs/store/*.png`.
