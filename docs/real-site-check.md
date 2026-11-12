# Real-site check

Headless Chromium 158.0.8127.18, unpacked `dist` build, Hush commit a2994d9, 2026-11-12. Each site: one fresh profile without the extension, one with Hush; load, then 5 s settle. Single run per condition: **timing and request counts are indicative only** (ads, A/B tests and CDN choice vary per load). Reproduce with `npm run test:real` (live network, local only, never CI).

"Selectors matched" = how many of the generic cosmetic selectors match at least one element on the settled page (Hush run). "Page OK" = HTTP status below 400, non-empty title, body text over 500 characters. "Errors" = uncaught page errors, plain -> Hush.

| Site | Requests | Blocked | Transferred | Load event | Selectors matched | Page OK | Errors |
|---|---|---|---|---|---|---|---|
| www.theguardian.com/international | 115 -> 116 | 12 | 1264 kB -> 1263 kB | 1821 -> 1710 ms | 12 | yes | 0 -> 11 |
| www.bbc.com/news | 384 -> 116 | 21 | 3175 kB -> 1789 kB | 4460 -> 2011 ms | 1 | yes | 1 -> 0 |
| www.straitstimes.com | unreachable without Hush (page.goto: Timeout 20000ms exceeded.) | | | | | | |
| www.channelnewsasia.com | 418 -> 165 | 30 | 7818 kB -> 3598 kB | 11089 -> 3887 ms | 3 | yes | 2 -> 2 |
| mothership.sg | 192 -> 67 | 11 | 32525 kB -> 28764 kB | 3537 -> 3136 ms | 0 | yes | 4 -> 0 |
| www.speedtest.net | 56 -> 39 | 6 | 2846 kB -> 2175 kB | 1760 -> 1706 ms | 4 | yes | 0 -> 0 |
| en.wikipedia.org/wiki/Ad_blocking | 38 -> 38 | 1 | 492 kB -> 491 kB | 567 -> 441 ms | 0 | yes | 0 -> 0 |

## Problems seen

"Requests" counts every request the page issued, blocked ones included, so a site can show equal totals while still blocking (Guardian: 12 blocked, but its blocked beacons are retried by page scripts).

No page failed to load and no main frame was blocked on any of the seven sites. Page text length stayed within the plain run on the Wikipedia control. Everything below is a consequence of the lists, not a Hush defect:

- **Guardian** and **Straits Times**: uncaught errors only with Hush (`Failed to fetch` from the blocked first-party `ophan.theguardian.com` analytics and `sourcepoint.theguardian.com` consent beacons; `Cannot read properties of undefined (reading 'push')` and `Failed to fetch (highway.cablecar.sph.com.sg)` on the Straits Times after Google Tag Manager and SPH tracking were blocked). Pages render; the failing code is analytics.
- **CNA**: first-party `google_tag/js/gtag.js`, `gtm.js`, `cnar_media_adobe_analytics.js` and `/static/mixpanel.json` are blocked; one extra `Failed to load script .../AppMeasurement.min.js` error appears only with Hush. Plain run already had two mixpanel errors.
- **Wikipedia** (control): one request blocked, `en.wikipedia.org/ins-502b/v2/events?hasty=true` (an EasyPrivacy rule on a telemetry beacon). Page unaffected.
- **BBC** and **mothership.sg**: fewer page errors with Hush than without (ad and embed scripts that failed or threw in the plain run never load).
- Visible leftovers: not checked visually (no screenshots in this check). Only the count of generic selectors that matched is recorded; sites with consent walls or ad slots that load after the 5 s settle are not covered.
- Unmatched by design: procedural (`:has-text`, `#?#`) and scriptlet filters are skipped (298 and 30 lines in the current lists), so ad slots those filters would catch can remain.
