# mv3-extension

Chrome Manifest V3 side-panel starter: esbuild + TypeScript, house styling (dark default, light toggle), credits card, Vitest.

```bash
npm install --ignore-scripts
npm run typecheck && npm run lint && npm test
npm run build   # dist/ (load unpacked at chrome://extensions)
npm run zip     # extension.zip for the Web Store
```

## Chrome Web Store permission justification
`sidePanel`: required to show the extension UI in Chrome's side panel when the toolbar icon is clicked. No host permissions, no content scripts, no remote code, no data collected.

Add icons (`icons` in `static/manifest.json`, 16/48/128 px) before publishing; none are included.

## Secrets and network
None. The extension makes no network calls and stores only the theme choice in the panel's `localStorage`.

## Credits card
`{{PROJECT}}` in `static/sidepanel.html` is left as a placeholder; replace it with the project name. The character art is all rights reserved (see root `NOTICE.md`).

Provided as is, without warranty.
