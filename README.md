# Hush

Hush is a Chrome extension that blocks ads and trackers and shows you what it blocked. Click the toolbar icon to see how many requests were blocked on the current page, which tracker hosts they came from, and which list (EasyList or EasyPrivacy) blocked them. A "Pause on this site" switch pauses Hush (network blocking and element hiding) on the current site and its subdomains, for sites that refuse visitors with an ad blocker; the tab reloads so it applies at once.

## What it blocks, and what it does not
- Blocks network requests to ad and tracker hosts using the EasyList and EasyPrivacy filter lists, compiled at build time into Chrome's declarativeNetRequest rules.
- Counts shown are real, measured by Chrome. Nothing is estimated.
- Hides leftover ad boxes with CSS from the EasyList element-hiding rules (plain CSS selectors only; rules needing scripts or text matching are skipped). Hidden elements are not counted in the popup.
- Does not rewrite, redirect or strip URL parameters.
- **YouTube in-video ads are deliberately out of scope.**
- Filter features that declarativeNetRequest cannot express are skipped at build time; the build report lists every skip with a reason.

## Privacy
Hush collects nothing and makes no network calls: no analytics, no remote rules, no remote code. Filter lists are fetched only on the developer's machine when rules are rebuilt. Stored locally in `chrome.storage.local`: the list of sites you paused Hush on, and which ruleset mode is active. The theme choice is kept in the extension's `localStorage`.

## Permissions
- `declarativeNetRequest`: blocks ad and tracker requests with the bundled rules, and applies the per-site pause rules.
- `declarativeNetRequestFeedback`: lets the popup read which rules matched on the current tab so it can show what was blocked.
- `storage`: remembers the sites you paused Hush on and the active ruleset mode, on your device only.
- `sidePanel`: opens the credits and about page in Chrome's side panel.
- `scripting` and access to all sites: needed to hide leftover ad boxes by adding a stylesheet to the pages you visit. Hush reads no page content and sends nothing anywhere.
- `activeTab`: when you open the popup, Chrome lets Hush read the address of the current tab to show its hostname and pause Hush for that site. Gives no access to page content and shows no install warning.

The one content script only asks the extension to add the stylesheet; it never reads or changes the page itself.

## Load unpacked
```bash
npm ci --ignore-scripts
npm run build      # compiles the rulesets, bundles into dist/
```
Open `chrome://extensions`, enable Developer mode, choose "Load unpacked" and select `dist/`. Requires Chrome 121 or newer.

## Development
```bash
npm run check      # typecheck + lint + unit tests
npm run test:e2e   # builds, then headless Playwright against the unpacked extension (local only)
node scripts/render-icons.mjs   # re-render icon PNGs from static/icons/icon.svg
```

## Licences
- Code: MIT, Copyright (c) 2026 Vincent Wesley.
- Filter rules: EasyList and EasyPrivacy, CC BY-SA 3.0. Credit: The EasyList authors (https://easylist.to/). Compiled rulesets are derived data under the same licence.
- Fonts: OFL (see `src/fonts/OFL.txt`). Character art in the credits card is all rights reserved.

Provided as is, without warranty.
