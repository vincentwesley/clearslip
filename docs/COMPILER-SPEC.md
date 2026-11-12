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
