# Research (2026-11-11)

Items marked **unverified** came from prior knowledge, not a checked source. Re-check before relying on them.

## Chrome limits and APIs
Source unless noted: https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
- 30,000 static rules guaranteed per extension; extra enabled rules draw on a pool of 300,000 shared by all extensions (https://developer.chrome.com/docs/extensions/develop/concepts/content-filtering). Check `getAvailableStaticRuleCount()` at runtime.
- 100 static rulesets, 50 enabled (Chrome 120+).
- 30,000 dynamic rules (Chrome 121+), of which 5,000 may be redirect or modifyHeaders. 5,000 session rules.
- 1,000 regex rules (static and dynamic counted separately); each compiled regex under 2 KB; RE2 syntax, ASCII only.
- Block, allow and allowAllRequests rules need no host permission. Redirect does.
- `getMatchedRules`: needs `declarativeNetRequestFeedback` or `activeTab`; returns rule and tab, not the URL; 20 calls per 10 minutes unless called from a user gesture; matches without an active document expire after 5 minutes.
- `onRuleMatchedDebug` and `testMatchOutcome`: unpacked extensions only. Useful for tests and the benchmark, not for the shipped UI.
- Badge count: `setExtensionActionOptions({ displayActionCountAsBadgeText: true })`.
- Chrome 145 added `topDomains` / `excludedTopDomains` rule conditions.
- **Verified (2026-11-12, Chrome for Testing via Playwright, MV3, non-blocking listener, `webRequest` + `<all_urls>`):** a request blocked by our declarativeNetRequest rules fires `webRequest.onErrorOccurred` with `error: "net::ERR_BLOCKED_BY_CLIENT"` and carries `url` (full, including query and fragment), `type`, `tabId`, `initiator`, `frameId`, `method`. Used for the privacy receipt. Not tested in a Web Store build; the API is not restricted to unpacked extensions.
- No API exposes blocked responses, so bytes or time saved cannot be measured inside the extension.
- Side panel: `chrome.sidePanel` since Chrome 114 (https://developer.chrome.com/docs/extensions/reference/api/sidePanel).

## Chrome Web Store
- Remote code is banned; remote data without logic is allowed (https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements).
- Single purpose (https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines).
- Updates that change only files listed in `rule_resources`, without adding or removing rulesets, can skip review and go live in minutes (https://developer.chrome.com/docs/webstore/skip-review).
- **Unverified:** current wording of the broad-host-permission justification and privacy disclosure form. Check at release with `release-extension`.

## Filter lists
- https://easylist.to/easylist/easylist.txt and https://easylist.to/easylist/easyprivacy.txt
- Licence: GPLv3 or later, or CC BY-SA 3.0 or later, at the user's choice; credit "The EasyList authors (https://easylist.to/)" (https://easylist.to/pages/licence.html). We take CC BY-SA 3.0 for the list data and keep code MIT. Not legal advice.
- **Unverified:** list sizes and that roughly half of EasyList is cosmetic. The compiler report gives the real numbers.
- No Singapore-specific list was found (https://github.com/uBlockOrigin/uBlock-issues/wiki/Dashboard:-Filter-lists, https://www.petsymposium.org/popets/2025/popets-2025-0063.pdf).

## Prior art (**unverified** licences and details; study, do not copy)
- uBlock Origin Lite: https://github.com/uBlockOrigin/uBOL-home (GPLv3). Build-time conversion, no background filtering.
- AdGuard: https://github.com/AdguardTeam/AdGuardBrowserExtension, https://github.com/AdguardTeam/tsurlfilter (GPL-3.0). Converter keeps a source map from rules to filters, the idea behind our `map-*.json`.
- Ghostery adblocker: https://github.com/ghostery/adblocker (MPL-2.0, confirmed from npm). Used as the test oracle, devDependency only.
- Brave adblock-rust: https://github.com/brave/adblock-rust (MPL-2.0).
- eyeo abp2dnr: https://github.com/kzar/abp2dnr (GPL-3.0).
- Selector generation for the zapper: https://github.com/antonmedv/finder (MIT).

## Tracker-to-company data (checked 2026-11-12): not used
- DuckDuckGo Tracker Radar (https://github.com/duckduckgo/tracker-radar), Ghostery TrackerDB (https://github.com/ghostery/trackerdb) and Disconnect (https://github.com/disconnectme/disconnect-tracking-protection) are all CC BY-NC-SA 4.0: NonCommercial and ShareAlike, not bundled.
- whotracks.me (https://github.com/whotracksme/whotracks.me) content is CC BY 4.0, but its company metadata is maintained in TrackerDB (NC-SA); provenance of names in its data dump is unverified.
- Decision: the receipt groups by tracker host and by list (Ads = EasyList, Trackers = EasyPrivacy). No company names unless a cleanly licensed source appears.

## Testing and benchmark
- Playwright loads MV3 extensions headless with `launchPersistentContext`, `channel: 'chromium'`, `--disable-extensions-except` and `--load-extension`; branded Chrome no longer accepts side-loading flags (https://playwright.dev/docs/chrome-extensions).
- Ghostery's performance study as a methodology reference (**unverified**): https://whotracks.me/blog/adblockers_performance_study.html

## Tooling
Nothing new to install: `modern-web-guidance:chrome-extensions`, context7, Playwright MCP, typescript-lsp and the `vin-workflow` plugin cover it.
