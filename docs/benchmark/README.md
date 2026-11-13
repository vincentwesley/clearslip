# Benchmark: Hush vs uBlock Origin Lite vs AdGuard MV3

Date 2026-11-13. Headless Chromium 158.0.0.0. Hush commit 03f01ce. Reproduce with `npm run bench` (live network, local only, never CI; competitor builds are downloaded into the gitignored `.bench/`).

## Extensions, all in their default configuration

| Condition | Extension | Setup observed |
|---|---|---|
| None | no extension | n/a |
| Hush | Hush 1.0.0 | 1 static rulesets enabled at first load; granted host access: <all_urls> |
| uBOL | __MSG_extName__ 2026.1110.1816 (release 2026.1110.1816) | 6 static rulesets enabled at first load; granted host access: <all_urls> |
| AdGuard | __MSG_name__ 5.5.4.55 (release v5.5.4) | 1 static rulesets enabled at first load; granted host access: *://*.adguard.app/*/thankyou.html*, *://*.adguard.com/*/thankyou.html*, *://*.adguard.info/*/thankyou.html*, *://reports.adguard.app/*, *://reports.adguard.com/*, *://reports.adguard.info/*, <all_urls>, http://*/*, https://*/* |

uBOL ships with its own default filtering mode; the host-access line above is what was observable on first run in a fresh unpacked profile (without granted host access uBOL can only run in its basic mode: network rules, no cosmetic or scriptlet injection). AdGuard and uBOL were not configured, signed in or given extra permissions.

## Method

- Four conditions, each load in a fresh persistent profile (launch, wait for the extension's service worker, up to 15 s for a competitor's first-run ruleset setup, close any onboarding tab, then load).
- 3 runs per site per condition, interleaved (None, Hush, uBOL, AdGuard, then repeat) so network drift hits all conditions. Sequential, 25 s navigation timeout, wait for `load` then 5 s settle, one retry only if the main document was not OK.
- Main document OK = HTTP status below 400, non-empty title, body text over 500 characters.
- Third-party = request host's registrable domain differs from the page's. Simplification: last two labels, or last three when the last two are a hard-coded two-level suffix (`com.sg`, `co.uk`, `com.au` and a few more); it is not the Public Suffix List.
- Reported value is the median of the runs; min and max are in `results.json`. A site unreachable without a blocker is excluded.

## Per-site results

Each cell: requests / blocked (`ERR_BLOCKED_BY_CLIENT`) / third-party completed / MB transferred / load s. Medians.

| Site | None | Hush | uBOL | AdGuard |
|---|---|---|---|---|
| www.theguardian.com/international | 107 / 0 / 84 / 1.16 / 1.88 | 107 / 12 / 84 / 1.16 / 2.28 | 107 / 12 / 84 / 1.16 / 2.09 | 107 / 0 / 84 / 1.16 / 2.26 |
| www.bbc.com/news | 275 / 0 / 241 / 3.11 / 3.91 | 118 / 22 / 90 / 1.75 / 3.62 | 125 / 17 / 94 / 1.76 / 3.22 | 120 / 8 / 103 / 2.05 / 4.35 |
| www.channelnewsasia.com | 416 / 0 / 361 / 7.75 / 11.36 | 165 / 30 / 91 / 3.57 / 4.59 | 169 / 27 / 93 / 3.57 / 4.88 | 268 / 22 / 198 / 5.38 / 7.89 |
| mothership.sg | 191 / 0 / 137 / 31.51 / 3.20 | 67 / 11 / 9 / 28.39 / 2.12 | 71 / 9 / 11 / 28.40 / 2.41 | 83 / 3 / 31 / 29.27 / 3.71 |
| www.speedtest.net | 56 / 0 / 52 / 2.78 / 2.45 | 35 / 6 / 25 / 1.62 / 2.27 | 44 / 5 / 27 / 2.13 / 2.51 | 45 / 8 / 29 / 2.63 / 3.16 |
| en.wikipedia.org/wiki/Ad_blocking | 38 / 0 / 5 / 0.48 / 1.31 | 38 / 1 / 5 / 0.48 / 1.33 | 38 / 1 / 5 / 0.48 / 1.33 | 38 / 0 / 5 / 0.48 / 1.49 |
| www.todayonline.com | 351 / 0 / 346 / 6.25 / 7.16 | 131 / 28 / 102 / 2.84 / 2.49 | 135 / 25 / 105 / 2.85 / 2.62 | 227 / 22 / 204 / 4.62 / 5.87 |
| www.hardwarezone.com.sg | 445 / 0 / 392 / 3.58 / 8.65 | 111 / 26 / 34 / 1.27 / 2.25 | 116 / 22 / 38 / 1.29 / 2.44 | 160 / 18 / 92 / 2.60 / 5.74 |
| www.asiaone.com | 542 / 0 / 467 / 5.52 / 7.85 | 131 / 26 / 50 / 2.27 / 2.16 | 164 / 30 / 55 / 2.70 / 1.99 | 184 / 19 / 113 / 3.48 / 4.03 |
| **Total (sum of medians)** | 2421 / 0 / 2085 / 62.14 / 47.8 | 903 / 162 / 490 / 43.34 / 23.1 | 969 / 148 / 512 / 44.33 / 23.5 | 1232 / 100 / 859 / 51.66 / 38.5 |

## Pages that broke (runs failing the main-document check)

- None: none
- Hush: none
- uBOL: none
- AdGuard: none

Excluded:
- www.straitstimes.com: unreachable without a blocker (page.goto: Timeout 25000ms exceeded.)
- www.propertyguru.com.sg: unreachable without a blocker (status 403, title "Just a moment...", body 271)
- sg.carousell.com: unreachable without a blocker (status 403, title "Just a moment...", body 264)

## What this does and does not show

- One machine, one network, one time of day, 3 runs: ad auctions, A/B tests and CDN choice vary, so small differences are noise.
- Default settings only. Another configuration (uBOL optimal/complete modes, AdGuard extra filters, Hush with a Singapore list) would give different numbers.
- Headless Chromium with unpacked builds, not the Web Store builds in a daily-driver profile.
- Counts are network effects. Cosmetic filtering (hidden ad slots, leftover empty boxes), scriptlets and visual quality are not measured. "Blocked" counts only requests failed by the extension; redirects to neutered resources and cosmetic hiding are invisible here.
- YouTube is not tested.
- Numbers are reported as measured, including where Hush is behind.
