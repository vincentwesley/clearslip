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
- `map-<rulesetId>.json`: JSON array, index = rule id (index 0 is `null`). Entry: `{ "l": "easylist" | "easyprivacy", "f": ["<original filter text>", ...] }`. `detail-*` entries have exactly one filter; `compact` entries list every merged filter.
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
