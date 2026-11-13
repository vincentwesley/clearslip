# Hush privacy policy

Date: 2026-11-13. Applies to the Hush Chrome extension, version 1.0.0.

## Summary
Hush collects no personal data. It sends nothing anywhere: it makes no network requests of its own, has no analytics, no accounts and no remote code or rules. Nothing is sold or shared.

## What Hush stores, and where
- **On this device, in `chrome.storage.local`:** the sites you paused Hush on, the "hide something" rules you created (a CSS selector per site), and which ruleset mode is active. It stays until you remove the rule or pause, or uninstall Hush.
- **In memory only, in `chrome.storage.session`:** the privacy receipt shown in the popup and side panel. Per open tab, it lists the hosts of requests Hush blocked, the request types, and up to five URL paths per host with the query string removed. Capped in size. It is never written to disk, is cleared when you close the tab or the browser, and is not recorded for sites you paused Hush on. If you allow Hush in incognito windows, the receipt is not recorded for incognito tabs either, and "hide something" rules cannot be created there. Pausing Hush on a site from an incognito window is your explicit choice and is remembered like any other pause, so that site's name is stored on this device until you turn Hush back on there.
- **In the extension's own `localStorage`:** your light or dark theme choice.

## What Hush reads
Hush sees the address of blocked requests so it can count them and show them to you. It reads the address of the current tab to show the site name and to apply per-site pause and hide rules. It does not read page content, browsing history, form data or cookies. The element picker runs on a page only after you click "Hide something on this page".

## Network
Hush makes no network requests. Its filter lists (EasyList, EasyPrivacy, a small Singapore list) are bundled into the extension at build time and updated only by publishing a new version.

## Sharing
Nothing is collected, so nothing is sold, shared, transferred or used for advertising, creditworthiness or any purpose unrelated to blocking ads and trackers.

## Your control
Uninstalling Hush deletes everything it stored. Individual hide rules can be removed in the side panel ("Hidden by you on this site").

## Contact
Open an issue: https://github.com/vincentwesley/hush/issues

Hosted at: https://github.com/vincentwesley/hush/blob/main/docs/PRIVACY.md
