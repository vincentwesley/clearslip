# Clearslip privacy policy

Date: 2026-11-14. Applies to the Clearslip Chrome extension, version 1.0.1.

## Summary
Clearslip collects no personal data. It sends nothing anywhere: it makes no network requests of its own, has no analytics, no accounts and no remote code or rules. Nothing is sold or shared.

## What Clearslip stores, and where
- **On this device, in `chrome.storage.local`:** the sites you paused Clearslip on, the "hide something" rules you created (a CSS selector per site), and which ruleset mode is active. It stays until you remove the rule or pause, or uninstall Clearslip.
- **In memory only, in `chrome.storage.session`:** the privacy receipt shown in the popup and side panel. Per open tab, it lists the hosts of requests Clearslip blocked, the request types, and up to five URL paths per host with the query string removed. Capped in size. It is never written to disk, is cleared when you close the tab or the browser, and is not recorded for sites you paused Clearslip on. If you allow Clearslip in incognito windows, the receipt is not recorded for incognito tabs either, and "hide something" rules cannot be created there. Pausing Clearslip on a site from an incognito window is your explicit choice and is remembered like any other pause, so that site's name is stored on this device until you turn Clearslip back on there.
- **In the extension's own `localStorage`:** your light or dark theme choice.

## What Clearslip reads
Clearslip sees the address of blocked requests so it can count them and show them to you. It reads the address of the current tab to show the site name and to apply per-site pause and hide rules. It does not read page content, browsing history, form data or cookies. The element picker runs on a page only after you click "Hide something on this page".

## Network
Clearslip makes no network requests. Its filter lists (EasyList, EasyPrivacy, a small Singapore list) are bundled into the extension at build time and updated only by publishing a new version.

## Sharing
Nothing is collected, so nothing is sold, shared, transferred or used for advertising, creditworthiness or any purpose unrelated to blocking ads and trackers.

## Your control
Uninstalling Clearslip deletes everything it stored. Individual hide rules can be removed in the side panel ("Hidden by you on this site").

## Contact
Open an issue: https://github.com/vincentwesley/clearslip/issues

Hosted at: https://github.com/vincentwesley/clearslip/blob/main/docs/PRIVACY.md
