# Clearslip (EXT-21): reviewed plan

## Context
Clearslip is your own Manifest V3 ad and tracker blocker for Chrome, built from first principles, with a per-site "privacy receipt" and a published benchmark. This plan is the result of checking your draft against current Chrome docs, prior art, list licensing and your local starter. The draft is sound; the changes below make it buildable within what Chrome actually allows, and safer to publish. `C:\Coding Projects\clearslip` does not exist yet, so nothing has been written.

## What changes from your draft
| Draft | Finding | Change |
|---|---|---|
| Popup shows "what was blocked" | A store-published extension cannot get blocked request URLs from the blocking API. `getMatchedRules` returns rule ID + tab only; `onRuleMatchedDebug` works only when unpacked. | Compiler emits a source map (rule ID -> original filter, list, tracker domain). The popup shows which filters and tracker domains fired and how often. URL-level detail is a spike in milestone 3 (`webRequest.onErrorOccurred`, unconfirmed in docs). |
| Receipt shows data and load time saved | An extension never sees a blocked response, so it cannot measure this. | Receipt shows real counts only. Data and load-time savings are measured by the benchmark harness (page with and without Clearslip) and published per site. No estimates in the UI (real-data-only rule). |
| "Needs access to all sites" | Block and allow rules need no host permission at all. | Milestone 1 ships with `declarativeNetRequest`, `declarativeNetRequestFeedback`, `storage` and nothing else. All-sites access arrives only with cosmetic filtering (milestone 2), with the justification written then. |
| 30,000 static rules | Still 30,000 guaranteed, plus up to 300,000 from a pool shared by all extensions; 100 rulesets, 50 enabled; 1,000 regex rules; 30,000 dynamic (5,000 may redirect or modify headers). | Compiler merges same-option domain filters into one rule (`requestDomains` arrays), splits output into a "guaranteed" ruleset under 30,000 and overflow rulesets, and the service worker checks `getAvailableStaticRuleCount()` before enabling overflow. Report lists what was dropped and why. |
| Licence to be decided | EasyList/EasyPrivacy: GPLv3 or CC BY-SA 3.0, your choice. CC BY-SA share-alike covers the adapted data, not separate code. | Code MIT (house rule). `rulesets/` and `lists/` carry their own `LICENSE` (CC BY-SA 3.0) crediting "The EasyList authors (https://easylist.to/)"; listed in `THIRD_PARTY_NOTICES.md`. Never copy code or test fixtures from uBlock Origin or AdGuard (GPL). Not legal advice. |
| List updates unspecified | Rules-only store updates can skip review and go live in minutes, if rulesets are not added or removed. | Fixed set of ruleset files from day one. `npm run lists:update` re-downloads, recompiles and prints the diff; run per release. No scheduled workflow, no network calls by the extension. |
| Starter: Cloudflare Pages, `_headers` | The `mv3-extension` starter has neither; it is side-panel only, Vitest only, no icons. | Nothing to host. Add a popup, Playwright (pattern from `tldr-panel/tests/e2e/panel.spec.js`), icons. Keep the side panel for the full receipt in milestone 3. |
| Singapore list | No Singapore list exists anywhere (confirmed gap). | Build it from evidence: the benchmark harness logs third-party requests that survive on a fixed set of Singapore sites; each filter added cites the site it was seen on. |

## Architecture
- `src/compiler/` (pure TypeScript, no Chrome APIs): `parse.ts` (one filter line -> typed filter or a skip reason), `to-dnr.ts` (filter -> rule), `optimise.ts` (dedupe, merge domains, apply `$badfilter`, priorities: block < allow < `$important` < per-site off), `emit.ts` (rulesets, source map, `report.json` with converted / merged / dropped counts by reason).
- Supported in v1: `||domain^` and path patterns, `$domain`, `$third-party`, resource types, `@@` exceptions, `$document` exceptions, `$important`, `$match-case`, `$badfilter`, RE2-safe regex up to the 1,000 cap. Skipped and reported: `$redirect`, `$removeparam`, `$csp`, `$popup`, scriptlets, procedural cosmetics.
- `lists/`: pinned snapshots of `easylist.txt` and `easyprivacy.txt` with download date and SHA-256 in `lists/SOURCES.json`.
- `scripts/build.mjs` (existing): add a compile step and a popup entry point. `scripts/zip.mjs` unchanged.
- `src/background.ts`: enable overflow rulesets when the pool allows; per-site off = one dynamic `allowAllRequests` rule per site at top priority; badge via `setExtensionActionOptions`.
- `src/popup.ts`: `getMatchedRules({tabId})` on open (user gesture, so no quota), grouped through the source map; per-site switch; link to the credits card page.
- Reuse: `src/tokens.css`, `src/theme.ts`, `src/credits/`, `src/fonts/` from the starter; house CI workflow already wired through `starters`.
- Minimum Chrome version: 121 (current rule limits).

## Milestones
1. **Network blocking + popup + per-site off** (store release 0.1). Compiler with unit tests and a differential test: for a fixed URL corpus, Clearslip's rules must agree with `@ghostery/adblocker` (devDependency only, never shipped; licence checked when added). One Playwright test loads the built extension headless and asserts a known ad host is blocked and that the per-site switch unblocks it.
2. **Cosmetic filtering**: generic and per-site hide rules as injected CSS; adds all-sites access.
3. **Privacy receipt** in the side panel, URL-level spike, tracker-to-company grouping (source data to be licence-checked).
4. **Element zapper**: picker plus saved per-site hide rules (`@medv/finder`, MIT, for selectors).
5. **Singapore list** from harness evidence.
6. **Benchmark** against uBlock Origin Lite and AdGuard MV3: same site set, cold profile, several runs, request count, bytes, load time; local only, never in CI; methodology and raw results in `docs/benchmark/`.

## Safety
- No remote code, no remote rules, no analytics, no network calls from the extension; README says so and names what is stored (per-site switches and your own filters, in `chrome.storage.local`).
- YouTube in-video ads excluded and stated in the README.
- Benchmark crawls are small, rate-limited and respect robots.txt.
- `security-review` before every push that touches permissions or content scripts; pre-public gate before the first push.

## Tooling
Nothing new to install. Already present and sufficient: `modern-web-guidance:chrome-extensions`, context7, Playwright MCP, typescript-lsp, `vin-workflow` (`new-project`, `release-extension`, `ship-batch`).

## Model choice
Yes, use Sonnet for the build, with one exception. Sonnet builders (your existing `vin-workflow:builder`) suit the popup, manifest, build script, tests, harness and docs, and the differential test makes compiler work self-checking. Keep Fable for three things: writing the filter-to-rule mapping spec and priority scheme before any builder starts, reviewing compiler diffs, and debugging disagreements with the oracle. Haiku scouts for lookups.

## After approval, in order
1. Scaffold `C:\Coding Projects\clearslip` locally with `vin-workflow:new-project` (mv3-extension starter).
2. Write `docs/RESEARCH.md` (findings with links, unverified items marked and re-checked), `docs/PLAN.md`, project `CLAUDE.md`, `docs/next-session.md`.
3. Write the compiler mapping spec, then dispatch milestone 1 to builders in parallel (parser, converter/optimiser, popup + background, e2e test).

## Verification
- `npm run check` and `npm run build`; compiler report shows rule counts under the limits.
- Differential test agrees with the oracle on the URL corpus.
- Headless Playwright test: ad host blocked, per-site switch works, popup lists the matching filter.

## How involved you are
You asked not to be involved, so I work through all six milestones locally without check-ins, committing to a local repo and deciding everything myself (icon: a simple code-drawn non-character mark in the house palette). Nothing is pushed, made public or uploaded until the end.

## Your steps (one batch, at the very end)
1. One OK to create the public GitHub repo `clearslip` and push, after the pre-public gate and security review pass.
2. Upload the finished zip in the Chrome Web Store dashboard and paste the listing text, permission justifications and privacy answers I prepare. Only you can do this; it needs your developer account.
