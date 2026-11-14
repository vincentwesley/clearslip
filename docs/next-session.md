> Update at the end of any session that changed state. Keep it lean.

Continue work on **Clearslip** (folder `C:\Coding Projects\clearslip`; public repo github.com/vincentwesley/clearslip; v1.0.1 tagged and released on GitHub 2026-11-14; not yet in the Chrome Web Store).

## Before anything
1. Read `CLAUDE.md`, `docs/PLAN.md`, `docs/COMPILER-SPEC.md`.
2. `npm ci --ignore-scripts`, then `npm run check && npm run build`.

## How to work here
- Orchestrate; builders (`vin-workflow:builder`) implement, the main model reviews diffs.
- Identity: `vincentwesley` noreply. No push, release or store upload without the owner's OK.
- Owner wants no check-ins and an install-and-use blocker: no sign-in, no setup, safe, proven to work.
- Builder prompts must say: PowerShell + `fnm env --use-on-cd | Out-String | Invoke-Expression; fnm use 24`; `git -C`; never write files with `Set-Content`/`Out-File`/`>` (adds a BOM); headless only.
- Do not rebuild `dist/` while a benchmark or real-site run is in progress. Any Playwright run wipes `test-results/` (copy screenshots out first).

## Current state (2026-11-14): v1.0.1 ready, waiting on the owner's store upload
- Green: 126 unit, 24 e2e, `test:real` 7/7. Code review and security review of 1.0.1 done; findings fixed.
- 1.0.1 over 1.0.0: back/forward-cache restore resets the receipt (content script `pageshow`, trusted events only); receipt's unmatched section says it may include another blocker's blocks.
- `extension.zip` itself tested headless on CNA/BBC/AsiaOne (receipt 29/24/41 blocked) and alongside uBOL (no errors, pages load).
- Benchmark at 03f01ce (`docs/benchmark/`, measured on 1.0.0): requests none 2421 / Clearslip 903 / uBOL 969 / AdGuard 1232.
- Release package: `extension.zip` (rebuild with `npm run zip`, also attached to the GitHub release), `docs/STORE-LISTING.md`, `docs/PRIVACY.md`, `docs/store/` (2 screenshots + 440x280 promo tile).

## Known gaps
1. `webRequest` receipt not yet seen in the store-signed build: check once it is live.
2. Empty right-hand ad columns on CNA and Mothership stay as white space: hiding them does not reclaim space (CNA) or would hide real content and reflow the page (Mothership). Checked 2026-11-14.

## Owner steps
1. Upload `extension.zip` at https://chrome.google.com/webstore/devconsole, paste `docs/STORE-LISTING.md`, add `docs/store/*.png`.
