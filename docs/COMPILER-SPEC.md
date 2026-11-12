# Compiler spec (filter lists -> declarativeNetRequest)

Contract between the compiler (`src/compiler/`, `scripts/compile.ts`) and the runtime (`src/background.ts`, `src/popup.ts`). Change this file first, then the code.

## Inputs
- `lists/easylist.txt`, `lists/easyprivacy.txt`: pinned snapshots. `lists/SOURCES.json`: `[{ id, url, fetchedAt, sha256, lines }]`. Refreshed only by `npm run lists:update`.
- `lists/LICENSE`: CC BY-SA 3.0 notice + credit.

## Filter support (network filters only in milestone 1)
Each line parses to a typed filter or a skip with a reason code. Nothing is dropped silently.

| Syntax | DNR |
|---|---|
| `||host^`, `||host/path`, `|https://...`, plain substrings, `*`, `^`, trailing `|` | `urlFilter` (same anchors; DNR's `urlFilter` uses the same `||`, `|`, `^`, `*` semantics) |
| `/regex/` | `regexFilter` if RE2-safe (no lookaround, no backreferences, ASCII) and within the regex budget; else skip `regex-unsupported` / `regex-budget` |
| `$domain=a.com|~b.com` | `initiatorDomains` / `excludedInitiatorDomains` |
| `$third-party`, `$~third-party` | `domainType` |
| `$script`, `$image`, `$stylesheet`, `$xmlhttprequest`, `$subdocument`, `$font`, `$media`, `$websocket`, `$ping`, `$object`, `$other`, and `~type` | `resourceTypes` / `excludedResourceTypes`. No type given: all types except `main_frame` |
| `$match-case` | `isUrlFilterCaseSensitive: true` (default false) |
| `@@...` | action `allow` |
| `@@...$document` | action `allowAllRequests`, `resourceTypes: ["main_frame","sub_frame"]` |
| `$important` | higher priority (below) |
| `$badfilter` | removes the matching filter at compile time |

Skipped with a reason: cosmetic (`##`, `#@#`, `#?#`), `$redirect`, `$redirect-rule`, `$removeparam`, `$csp`, `$popup`, `$rewrite`, `$replace`, `$header`, `$generichide`, `$elemhide`, `$genericblock`, scriptlets, unknown options, non-ASCII patterns that cannot be punycoded, and exception filters whose only purpose is one of the above.

## Priorities
| Rule | Priority |
|---|---|
| block | 1 |
| allow / allowAllRequests from the lists | 2 |
| `$important` block | 3 |
| per-site off (dynamic `allowAllRequests`, runtime) | 100 |

## Outputs (written to `dist/rulesets/`, never committed)
The manifest always declares exactly these three rulesets, in this order:

| Ruleset id | File | Enabled by default | Content |
|---|---|---|---|
| `compact` | `compact.json` | yes | Same-option filters merged (pure-host block filters become one rule with a `requestDomains` array; otherwise identical rules deduped). Must be <= 30,000 rules. If it does not fit: keep every allow rule, then block rules in list order EasyPrivacy-host, EasyList-host, then pattern rules; report what was cut. |
| `detail-easylist` | `detail-easylist.json` | no | One rule per filter, no merging. |
| `detail-easyprivacy` | `detail-easyprivacy.json` | no | One rule per filter, no merging. |

- Rule ids start at 1 and are dense within each ruleset.
- Regex budget: at most 1,000 regex rules across `detail-*` combined, and the same selection in `compact`.
- `map-<rulesetId>.json`: JSON array, index = rule id (index 0 is `null`), kept slim because the popup loads it on open. `detail-*`: each entry is the original filter text (a string); the list is implied by the ruleset id. `compact`: each entry is `[listIndex, count, firstFilter]` where `listIndex` indexes `LIST_IDS` and `count` is the number of merged filters.
- `report.json`: `{ generatedAt, sources, perList: { parsed, converted, skipped: { <reason>: n } }, rulesets: { <id>: { rules, regexRules } }, compactCut: n }`.
- `LICENSE`: copy of `lists/LICENSE`.

## Runtime behaviour
- On install and browser start: if `getAvailableStaticRuleCount()` allows both `detail-*` rulesets, enable them and disable `compact`; otherwise keep `compact`. If enabling fails, fall back to `compact`. Record the active mode in `chrome.storage.local` as `mode: "detail" | "compact"`.
- Per-site off: `chrome.storage.local` key `off: string[]` (hostnames). Each host has one dynamic rule: `allowAllRequests`, priority 100, `requestDomains: [host]`, `resourceTypes: ["main_frame","sub_frame"]`. Dynamic rule ids are allocated from 1 upward and stored alongside.
- Popup: `getMatchedRules({ tabId })` when opened, look each `{ rulesetId, ruleId }` up in the matching `map-*.json`, group by tracker host (the host of the filter pattern when it has one), show counts. In compact mode a merged rule is shown as its list plus the number of hosts it covers.
- Badge: `setExtensionActionOptions({ displayActionCountAsBadgeText: true })`.

## Checks
- Unit (Vitest): parser, converter, optimiser, emitter invariants (ids dense, compact <= 30,000, regex budget, every map entry present).
- Differential (Playwright, unpacked build): for a fixed corpus of real request tuples (`tests/e2e/corpus.json`: url, type, initiator), Chrome's own `declarativeNetRequest.testMatchOutcome` on the detail rulesets must agree with `@ghostery/adblocker` loaded with the same supported filters. Disagreements are listed; each one is either fixed or recorded with a reason in `tests/e2e/known-differences.json`.

## Cosmetic filtering (milestone 2)
Code: `src/compiler/cosmetic.ts` (parser, tables), `src/lib/cosmetic.ts` (per-frame selection), `src/content.ts`, `src/background.ts` (`injectCosmetic`).

### Compile
Supported: `##sel` (generic), `a.com,~b.com##sel` (specific, with negations), `#@#` (exception: `host#@#sel` specific or generic-on-site; `#@#sel` with no host removes `sel` from the generic list and from every `hide` entry; an exception with only negated domains, `~a.com#@#sel`, is skipped as `exception-negated-only`), pure-host network flags `@@||host^$generichide` and `@@||host^$elemhide`. Top-level commas in a selector split it into one selector each. Plain `:has()` and `:not()` are standard CSS and pass. Other `$generichide`/`$elemhide` forms keep their network skip reason (`option-generichide`, ...).

Skipped, counted in `report.json` `cosmetic.skipped`: `procedural` (`#?#`, `:has-text(`, `:-abp-`, `:xpath(`, `:matches-*`, `:upward(`, `:remove(`, `:style(`, `:contains(`, `:if(`, `:if-not(`, `:nth-ancestor(`, `:min-text-length(`, `:watch-attr(`, `:others(`, `:-js-*`), `scriptlet` (`##+js`, `#$#`, `#%#`), `html-filter` (`##^`), `entity-domain` (`google.*`), `domain-invalid`, and `unsafe-selector`: any selector with a trailing backslash, `{`, `}`, `/*`, `*/`, `@`, `<`, control characters, backslash-newline, or unbalanced quotes/brackets/parentheses. List text is third-party data turned into CSS; nothing may leave the selector position or swallow the next rule.

Outputs in `dist/rulesets/` (CC BY-SA data, with the other rulesets):
- `cosmetic-generic.css`: one rule per line, `selector{display:none!important}`, one selector per rule so one invalid selector cannot disable others.
- `cosmetic-generic.json`: the same selectors as an array, same order (deduped, global exceptions removed).
- `cosmetic-specific.json`: `{ hide, unhide, notHide, genericOff, noGeneric, noCosmetic }`. `hide`/`unhide`/`notHide`/`genericOff` map a host to a selector array. `unhide[h]` = selectors not hidden at all on `h` (generic or specific): from `h#@#sel` and from `~h##sel` on a rule with no positive domain. `notHide[h]` = `sel` from `a,~h##sel` (rule has positive domains): removed from the collected specific `hide` selectors only, never from the generic list. `genericOff[h]` = the subset of `unhide[h]` that is in the final generic list (so the runtime never scans the generic array). `noGeneric`/`noCosmetic` are host arrays from the two network flags.
- `report.json` `cosmetic`: `{ generic (after global exceptions), specificHosts, specificRules, exceptions, noGeneric, noCosmetic, skipped }`; printed in the compile summary.

### Runtime
- `content.ts` (`<all_urls>`, `document_start`, `all_frames`, `match_about_blank`) sends `{ type: "cosmetic" }` and does nothing else; it never touches the DOM.
- The handler accepts it only when `sender.tab` is set and `sender.id` is ours; it ignores the message body. Site host = `sender.tab.url`, frame host = `sender.url` (falls back to the site host for `about:blank`/`srcdoc`), frame = `sender.frameId`. Other message types keep the extension-page-only check.
- Nothing happens if the site host or a parent domain is in `off`, or the site (or a parent) is in `noCosmetic`.
- `planCosmetic(site, frame, specific)`: walk the frame host's suffixes (`a.b.example.com`, `b.example.com`, `example.com`; never the bare TLD); `hide` = `hide` for those suffixes minus `unhide` and `notHide`. Generic part: none if the site (or a parent) is in `noGeneric`; the packaged file if no `genericOff` entry applies (nearly always); otherwise `genericOff` lists the selectors to leave out and the worker builds generic-minus-those (fetching `cosmetic-generic.json` lazily, cached per frame host). Plus a CSS string of the specific `hide` selectors.
- Injection: `chrome.scripting.insertCSS({ target: { tabId, frameIds: [frameId] }, origin: "USER", files | css })` (Chrome allows exactly one of `files`/`css` per call, so up to two calls, run in parallel). USER origin means an author `!important` rule cannot undo the hiding. No `web_accessible_resources`.
- The JSON is fetched from the package lazily and cached for the worker's lifetime. Flash of an ad box before the first message round trip is possible; accepted for this milestone.
- Needs `scripting` and `host_permissions: ["<all_urls>"]`.


## Receipt (milestone 3)
- Source: `webRequest.onErrorOccurred` (permission `webRequest`, with the existing `<all_urls>`), only `error === "net::ERR_BLOCKED_BY_CLIENT"`, `tabId >= 0`, not `main_frame`. Observe-only: no blocking listener, no `extraInfoSpec`.
- Limit: Chrome reports the same error for requests blocked by any extension, so blocks by other extensions are indistinguishable and are counted too.
- Reset ("Receipt reset"): the receipt starts over only when the visible document really changes. `webRequest.onBeforeRequest` (`main_frame`) only records the URL as pending for the tab, and only when `documentLifecycle === "active"` and `frameType === "outermost_frame"` (not prerenders or fenced frames). `tabs.onUpdated` with `changeInfo.status === "loading"` then commits it when `tab.url` (readable through `<all_urls>`, no new permission) equals the pending URL (fragment ignored): `commitsPage` in `src/lib/receipt.ts`. Measured in Chrome (headless Playwright): a 204 response and a download fire `onBeforeRequest` and `onResponseStarted` but no `tabs.onUpdated`, so they never commit; a reload fires `loading` without `url`, which is why `tab.url` is compared instead of `changeInfo.url`; `pushState` and `#fragment` changes fire `loading` with a new `url` but no request, so nothing is pending and they do not reset. Neither signal alone works (requests fire for non-commits, `onUpdated` fires for same-document changes); together they do. Fallback for a page swapped in without a request (prerender activation): the tab has no receipt yet, or the host of `tab.url` differs from the receipt's site. Known limitation: a same-host back/forward-cache navigation has no request, so it keeps the previous page's receipt. A non-http(s) page deletes the receipt. If the worker wakes mid-page, the first blocked event adopts the tab's current page via `tabs.get`.
- Page-controlled names: request hosts must pass `isValidHost` (else the request is not recorded), and every lookup keyed by one uses `Object.hasOwn`, because `constructor` is a valid host name.
- Store (`src/lib/receipt.ts`, pure): `chrome.storage.session` key `receipts`, `{ [tabId]: { site, loadedAt, touched, blocked, hosts: { [host]: { count, types, paths } } } }`. Memory only, cleared when the browser closes, never `storage.local`. Default access level (extension pages only). Writes are debounced (150 ms). Deleted on `tabs.onRemoved`.
- Caps: 200 hosts per tab (first-seen host dropped), 50 tabs (least recently touched dropped), 5 distinct paths per host, path 200 chars. Only the pathname is stored: query strings and fragments are removed before storing.
- Not recorded: paused sites (site or parent in `off`), incognito tabs (`tab.incognito`; the extension is not incognito-enabled by default, the check is defence in depth).
- List attribution: not available from webRequest. The side panel joins hosts to filters through `getMatchedRules` + the build-time maps (`listIndex`): host of a non-merged block filter, matched by host suffix. EasyList = "Ads", EasyPrivacy = "Trackers", unknown (compact mode merged rules, regex or path filters) = "Other". `getMatchedRules` calls are throttled to one per 30 s per page.
- UI: counts are real (requests blocked, distinct hosts listed); no bytes or time estimates. "Copy receipt" writes plain text (site, ISO time, counts, hosts) via `navigator.clipboard.writeText` on click. All page-derived text is set with `textContent`.

## Zapper (milestone 4)
Code: `src/picker.ts` (injected UI), `src/lib/selector.ts` (generator), `src/lib/zaps.ts` (store), `src/background.ts`, popup button, side panel section. No new permission: `scripting` and `<all_urls>` already cover `executeScript`, which needs no user gesture and no `activeTab`.
- Start: the popup button sends `{ type: "startPicker", tabId }` (extension pages only). The worker refuses unsupported or paused pages, then runs `chrome.scripting.executeScript({ target: { tabId }, files: ["picker.js"] })` (top frame only). `picker.js` is a separate esbuild IIFE (a classic script), not a content script in the manifest.
- Picker: idempotent through an isolated-world flag (a second injection does nothing); the flag is cleared on cleanup. One host element on `documentElement` with a closed shadow root holds the highlight box and the toolbar (constructed stylesheet, so page CSP cannot break it; text via `textContent`). Window-level capture listeners: `pointermove` highlights; `click` selects and the whole press sequence (`pointerdown/up`, `mousedown/up`, `click`, `auxclick`, `dblclick`, `contextmenu`) gets `preventDefault` + `stopImmediatePropagation` unless it starts in the toolbar. ArrowUp widens to the parent, ArrowDown narrows back, Escape or Cancel removes every listener and node. `html`, `body` and the picker's own nodes are never selectable. Limitation: a page handler registered earlier on `window` in the capture phase still runs; picking needs a pointer (arrows and the buttons are keyboard-operable, focus moves to "Hide" after a pick).
- Selector (`buildSelector`): `#id` when the id is unique and stable (no 4+ digit run, no 16+ hex chars, no CSS-in-JS prefix with digits, at most 40 chars); else `tag.class...` with at most 3 stable classes plus `:nth-of-type(n)` only when a sibling has the same tag and classes; climbs at most 4 ancestors joined by ` > ` until `querySelectorAll` returns exactly the element, stopping at an ancestor with a stable id. Ids and classes go through `CSS.escape`. Result must be at most 300 characters and pass `safeSelectors` as exactly one selector, else the toolbar says it cannot build a safe rule.
- Save: picker sends `{ type: "zap", selector }`. The worker accepts only `sender.tab` set, `sender.frameId === 0`, `sender.id` ours; site = `hostFromUrl(sender.tab.url)`; re-validates with `validSelector`; `addZap` stores `chrome.storage.local.zaps = { [host]: string[] }` (de-duplicated, 100 per host, 500 hosts; at a cap it refuses with `limit-selectors` / `limit-hosts` and the toolbar says so), then `insertCSS({ target: { tabId, allFrames: true }, origin: "USER" })`.
- Apply: `injectCosmetic` adds `zapCss(zaps, site)` for every frame on later loads. Exact host only, no inheritance from parent domains. Applies even where a list says `noCosmetic` (it is the user's own rule); a paused site (site or parent in `off`) gets nothing.
- Manage (extension pages only, fields validated): `getZaps { host }`, `removeZap { host, selector }`, `clearZaps { host }`. The side panel lists them under "Hidden by you on this site" and reloads the tab after a change. Stored data is re-cleaned by `cleanZaps` on every read; lookups use `Object.hasOwn`.
