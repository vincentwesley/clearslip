# Chrome Web Store listing (paste-ready)

Version 1.1.0. Images in `docs/store/`: screenshots (1280x800) `1-popup.png`, `2-receipt.png` (Clearslip's own UI only; no screenshots of third-party sites, whose photos and logos are not ours to publish) and small promo tile (440x280) `promo-440x280.png`. Regenerate with `npm run build && npx playwright test -c tests/store/playwright.store.config.ts` (live network, local only; `--grep promo` for the tile alone).

## Name
Clearslip

## Short description (50 chars, limit 132)
Ad and tracker blocker that shows what it blocked.

## Detailed description
Clearslip is an ad blocker and tracker blocker for Chrome. It stops ads and tracking scripts from loading on the websites you visit, so pages are cleaner, load faster and fewer companies can follow you around the web. It also shows you exactly what it blocked on each page.

It works as soon as you install it. There is no account, no sign-in and nothing to set up.

HOW TO USE IT
1. Install Clearslip. Ads and trackers are blocked on every website straight away.
2. Click the Clearslip icon in the toolbar to see how many requests were blocked on the page you are on, and which ad and tracker companies' servers they came from.
3. Click "Full receipt" to open a detailed list in Chrome's side panel.
4. If a website refuses to work with an ad blocker, use the "Pause on this site" switch. Clearslip turns off for that site only and the page reloads.
5. To remove an annoying box that is still showing, click "Hide something on this page" and then click the box. Clearslip remembers it for that site. You can undo it in the side panel.

WHAT IT BLOCKS
- Ads: requests to advertising servers, using the EasyList filter list.
- Trackers: analytics and tracking scripts, using the EasyPrivacy filter list.
- A small extra list for Singapore websites.
- Empty ad boxes left behind on the page are hidden.
- YouTube's own ads are removed: video ads before and during videos, ads in the feed, search, sidebar and Shorts, and the YouTube Premium pop-ups and banners.

PRIVACY
Clearslip does not collect, send or sell any data. It makes no network requests of its own and has no analytics. Your paused sites and hidden boxes are saved only on your own device. The list of blocked requests is kept in memory and cleared when you close the browser.

LIMITS
- Sponsor segments that creators record into their YouTube videos are not removed. YouTube changes its ads often, so some may get through until Clearslip is updated.

Filter lists by The EasyList authors (https://easylist.to/), CC BY-SA 3.0. Clearslip is open source (MIT): https://github.com/vincentwesley/clearslip

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
- `scripting`: injects the cosmetic stylesheet that hides leftover ad boxes and your hide rules, the element picker, which runs only after you click "Hide something on this page", and, on YouTube only, a script that removes ads from YouTube's page and player data before they are shown.
- `webRequest`: observe-only; lists the requests Clearslip blocked on the page for the privacy receipt. Clearslip does not change, delay or send anything with it.
- Host access `<all_urls>`: ad boxes and trackers can be on any site, so Clearslip must add its hiding stylesheet and block requests on every site you visit; it sends nothing anywhere.

## Remote code
No. All code, filter rules and lists are bundled in the package; nothing is downloaded or evaluated at run time.

## Data usage disclosure
- Collects none of the listed categories: personally identifiable information, health, financial and payment, authentication, personal communications, location, web history, user activity, website content. (Blocked-request hosts and paths are processed only in memory on the device for the receipt and never leave it.)
- Certify: I do not sell or transfer user data to third parties outside the approved use cases; I do not use or transfer user data for purposes unrelated to the item's single purpose; I do not use or transfer user data to determine creditworthiness or for lending purposes.

## Privacy policy URL
https://github.com/vincentwesley/clearslip/blob/main/docs/PRIVACY.md
