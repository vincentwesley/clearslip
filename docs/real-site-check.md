# Real-site check

Headless Chromium 153.0.8010.12, unpacked `dist` build, Clearslip commit bc34646, 2026-11-21. Each site: one fresh profile without the extension, one with Clearslip; load, then 5 s settle. Single run per condition: **timing and request counts are indicative only** (ads, A/B tests and CDN choice vary per load). Reproduce with `npm run test:real` (live network, local only, never CI).

"Selectors matched" = how many of the generic cosmetic selectors match at least one element on the settled page (Clearslip run). "Page OK" = HTTP status below 400, non-empty title, body text over 500 characters. "Errors" = uncaught page errors, plain -> Clearslip.

| Site | Requests | Blocked | Transferred | Load event | Selectors matched | Page OK | Errors |
|---|---|---|---|---|---|---|---|
| www.theguardian.com/international | 510 -> 154 | 26 | 2856 kB -> 1430 kB | 1216 -> 888 ms | 3 | yes | 0 -> 17 |
| www.bbc.com/news | 216 -> 151 | 30 | 2980 kB -> 2033 kB | 818 -> 811 ms | 1 | yes | 0 -> 0 |
| www.straitstimes.com | 854 -> 140 | 27 | 7066 kB -> 4236 kB | 11932 -> 1421 ms | 3 | yes | 0 -> 2 |
| www.channelnewsasia.com | 575 -> 342 | 57 | 7649 kB -> 4959 kB | 3912 -> 3261 ms | 4 | yes | 1 -> 3 |
| mothership.sg | 196 -> 67 | 11 | 24096 kB -> 21291 kB | 3294 -> 1701 ms | 0 | yes | 4 -> 0 |
| www.speedtest.net | 1046 -> 36 | 8 | 3265 kB -> 1706 kB | 1252 -> 1257 ms | 4 | yes | 0 -> 0 |
| en.wikipedia.org/wiki/Ad_blocking | 38 -> 38 | 1 | 498 kB -> 497 kB | 1069 -> 593 ms | 0 | yes | 0 -> 0 |

## Problems seen

"Requests" counts every request the page issued, blocked ones included, so a site can show equal totals while still blocking (Guardian: 12 blocked, but its blocked beacons are retried by page scripts).

No page failed to load and no main frame was blocked on any of the seven sites. Page text length stayed within the plain run on the Wikipedia control. Everything below is a consequence of the lists, not a Clearslip defect:

- **Guardian** and **Straits Times**: uncaught errors only with Clearslip (`Failed to fetch` from the blocked first-party `ophan.theguardian.com` analytics and `sourcepoint.theguardian.com` consent beacons; `Cannot read properties of undefined (reading 'push')` and `Failed to fetch (highway.cablecar.sph.com.sg)` on the Straits Times after Google Tag Manager and SPH tracking were blocked). Pages render; the failing code is analytics.
- **CNA**: first-party `google_tag/js/gtag.js`, `gtm.js`, `cnar_media_adobe_analytics.js` and `/static/mixpanel.json` are blocked; one extra `Failed to load script .../AppMeasurement.min.js` error appears only with Clearslip. Plain run already had two mixpanel errors.
- **Wikipedia** (control): one request blocked, `en.wikipedia.org/ins-502b/v2/events?hasty=true` (an EasyPrivacy rule on a telemetry beacon). Page unaffected.
- **BBC** and **mothership.sg**: fewer page errors with Clearslip than without (ad and embed scripts that failed or threw in the plain run never load).
- Visible leftovers: not checked visually (no screenshots in this check). Only the count of generic selectors that matched is recorded; sites with consent walls or ad slots that load after the 5 s settle are not covered.
- Unmatched by design: procedural (`:has-text`, `#?#`) and scriptlet filters are skipped (298 and 30 lines in the current lists), so ad slots those filters would catch can remain.
