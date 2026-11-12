# Benchmark: Hush vs uBlock Origin Lite vs AdGuard MV3

Date 2026-11-12. Headless Chromium 158.0.0.0. Hush commit a2994d9. Reproduce with `npm run bench` (live network, local only, never CI; competitor builds are downloaded into the gitignored `.bench/`).

## Extensions, all in their default configuration

| Condition | Extension | Setup observed |
|---|---|---|
| None | no extension | n/a |
| Hush | Hush 0.1.0 | 1 static rulesets enabled at first load; granted host access: <all_urls> |
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
| www.theguardian.com/international | 115 / 0 / 92 / 1.23 / 1.33 | 116 / 12 / 93 / 1.23 / 1.43 | 115 / 12 / 92 / 1.22 / 1.62 | 115 / 0 / 92 / 1.23 / 1.47 |
| www.bbc.com/news | 384 / 0 / 358 / 3.10 / 3.67 | 116 / 21 / 89 / 1.75 / 1.86 | 124 / 17 / 93 / 1.76 / 2.95 | 122 / 8 / 105 / 2.07 / 3.29 |
| www.straitstimes.com | 488 / 0 / 415.5 / 6.58 / 12.47 | 140 / 27 / 51 / 3.38 / 2.50 | 142 / 17 / 53 / 3.22 / 2.83 | 208 / 19 / 121 / 5.70 / 6.03 |
| www.channelnewsasia.com | 407 / 0 / 353 / 7.30 / 6.85 | 165 / 30 / 91 / 3.52 / 2.75 | 171 / 27 / 93 / 3.52 / 3.40 | 268 / 22 / 197 / 5.34 / 6.41 |
| mothership.sg | 188 / 0 / 134 / 31.11 / 4.58 | 67 / 11 / 9 / 28.09 / 3.42 | 74 / 9 / 11 / 28.10 / 3.08 | 83 / 3 / 31 / 28.97 / 2.95 |
| www.speedtest.net | 56 / 0 / 52 / 2.78 / 1.88 | 35 / 6 / 25 / 1.62 / 1.84 | 44 / 5 / 27 / 2.13 / 1.85 | 40 / 7 / 29 / 2.12 / 1.78 |
| en.wikipedia.org/wiki/Ad_blocking | 38 / 0 / 5 / 0.48 / 0.52 | 38 / 1 / 5 / 0.48 / 0.50 | 38 / 1 / 5 / 0.48 / 0.61 | 38 / 0 / 5 / 0.48 / 0.88 |
| www.todayonline.com | 353 / 0 / 346 / 6.27 / 7.30 | 131 / 28 / 102 / 2.83 / 3.10 | 136 / 25 / 106 / 2.84 / 3.55 | 227 / 22 / 204 / 4.64 / 5.91 |
| www.hardwarezone.com.sg | 464 / 0 / 409 / 3.69 / 12.16 | 110 / 25 / 35 / 1.38 / 1.87 | 116 / 22 / 38 / 1.40 / 2.16 | 162 / 18 / 92 / 2.70 / 7.72 |
| www.asiaone.com | 556 / 0 / 479 / 6.51 / 8.63 | 162 / 38 / 53 / 2.53 / 1.74 | 172 / 41 / 56 / 2.34 / 1.88 | 184 / 19 / 114 / 3.29 / 4.12 |
| **Total (sum of medians)** | 3049 / 0 / 2643.5 / 69.05 / 59.4 | 1080 / 199 / 553 / 46.81 / 21.0 | 1132 / 176 / 574 / 47.01 / 23.9 | 1447 / 118 / 990 / 56.54 / 40.5 |

## Pages that broke (runs failing the main-document check)

- None: www.straitstimes.com (1/3), www.asiaone.com (1/3)
- Hush: none
- uBOL: none
- AdGuard: none

Excluded:
- www.propertyguru.com.sg: unreachable without a blocker (status 403, title "Just a moment...", body 271)
- sg.carousell.com: unreachable without a blocker (status 403, title "Just a moment...", body 264)

## What this does and does not show

- One machine, one network, one time of day, 3 runs: ad auctions, A/B tests and CDN choice vary, so small differences are noise.
- Default settings only. Another configuration (uBOL optimal/complete modes, AdGuard extra filters, Hush with a Singapore list) would give different numbers.
- Headless Chromium with unpacked builds, not the Web Store builds in a daily-driver profile.
- Counts are network effects. Cosmetic filtering (hidden ad slots, leftover empty boxes), scriptlets and visual quality are not measured. "Blocked" counts only requests failed by the extension; redirects to neutered resources and cosmetic hiding are invisible here.
- YouTube is not tested.
- Numbers are reported as measured, including where Hush is behind.
