# Chrome Web Store listing (paste-ready)

Version 1.0.1. Images in `docs/store/`: screenshots (1280x800) `1-popup.png`, `2-receipt.png` (Clearslip's own UI only; no screenshots of third-party sites, whose photos and logos are not ours to publish) and small promo tile (440x280) `promo-440x280.png`. Regenerate with `npm run build && npx playwright test -c tests/store/playwright.store.config.ts` (live network, local only; `--grep promo` for the tile alone).

## Name
Clearslip

## Short description (50 chars, limit 132)
Ad and tracker blocker that shows what it blocked.

## Detailed description
Clearslip blocks ads and trackers, and shows you exactly what it blocked.

Install it and it works: no account, no sign-in, no setup.

What it does
- Blocks requests to ad and tracker hosts using the EasyList and EasyPrivacy filter lists plus a small Singapore list, compiled into Chrome's built-in declarativeNetRequest rules.
- Privacy receipt: click the toolbar icon to see how many requests were blocked on this page and which hosts they came from. "Full receipt" opens the detail in Chrome's side panel. Counts are measured by Chrome, never estimated.
- Pause on this site: one switch for sites that refuse visitors with an ad blocker. Clearslip turns off on that site and its subdomains, and the tab reloads.
- Hide something: click "Hide something on this page", click the box you want gone, and Clearslip remembers it for that site. Undo any time from the side panel.
- Hides leftover empty ad boxes with the plain-CSS element-hiding rules from EasyList.

Privacy
Clearslip collects no data and makes no network requests of its own. No analytics, no remote rules, no remote code. Your paused sites and hide rules are stored on your device. The receipt lives in memory and is cleared when you close the browser.

Limits
- YouTube in-video ads are not handled.
- Filter features that Chrome's declarativeNetRequest cannot express are skipped.

Benchmark (measured 2026-11-13, headless Chromium 158, Clearslip 1.0.0, default settings for every extension, one machine, one network, 3 runs per site, 9 news and general sites): across the 9 sites, requests went from 2421 with no blocker to 903 with Clearslip, and summed page load time from 47.8 s to 23.1 s. Small differences between blockers are within noise. Method, per-site numbers and where Clearslip is behind: https://github.com/vincentwesley/clearslip/blob/main/docs/benchmark/README.md

Filter lists: The EasyList authors (https://easylist.to/), CC BY-SA 3.0. Clearslip's code is MIT licensed.

## Category
Privacy & Security (listed in https://developer.chrome.com/docs/webstore/best-practices, checked 2026-11-14).

## Single purpose
Block ads and trackers on web pages and show the user what was blocked.

## Permission justifications
- `declarativeNetRequest`: blocks ad and tracker requests with the bundled rules and applies the per-site pause.
- `declarativeNetRequestFeedback`: lets the popup read which rules matched on the current tab so it can show what was blocked.
- `storage`: remembers the sites you paused Clearslip on, your hide rules and the active ruleset mode, on your device only; keeps the in-memory privacy receipt.
- `sidePanel`: opens the privacy receipt and credits in Chrome's side panel.
- `activeTab`: when you open the popup, reads the current tab's address to show its hostname and to pause Clearslip for that site.
- `scripting`: injects the cosmetic stylesheet that hides leftover ad boxes and your hide rules, and the element picker, which runs only after you click "Hide something on this page".
- `webRequest`: observe-only; lists the requests Clearslip blocked on the page for the privacy receipt. Clearslip does not change, delay or send anything with it.
- Host access `<all_urls>`: ad boxes and trackers can be on any site, so Clearslip must add its hiding stylesheet and block requests on every site you visit; it reads no page content and sends nothing anywhere.

## Remote code
No. All code, filter rules and lists are bundled in the package; nothing is downloaded or evaluated at run time.

## Data usage disclosure
- Collects none of the listed categories: personally identifiable information, health, financial and payment, authentication, personal communications, location, web history, user activity, website content. (Blocked-request hosts and paths are processed only in memory on the device for the receipt and never leave it.)
- Certify: I do not sell or transfer user data to third parties outside the approved use cases; I do not use or transfer user data for purposes unrelated to the item's single purpose; I do not use or transfer user data to determine creditworthiness or for lending purposes.

## Privacy policy URL
https://github.com/vincentwesley/clearslip/blob/main/docs/PRIVACY.md
