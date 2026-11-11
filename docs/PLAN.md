# Plan: mv3-extension

Goal: minimal MV3 side-panel extension with house styling and a Web Store ready build.

- Manifest: `static/manifest.json`, permission `sidePanel` only, service worker opens the panel on icon click.
- UI: `static/sidepanel.html` + `src/sidepanel.ts` (word counter, theme toggle), house tokens and credits card.
- Build: `scripts/build.mjs` (esbuild bundles TS and CSS, hashed font assets, copies `static/`) to `dist/`; `npm run zip` makes `extension.zip` with `fflate`.
- Tests: Vitest for logic plus a manifest guard (MV3, permissions stay minimal).

Skipped: Playwright extension e2e (needs a headed persistent context), icons (owner supplies), size-limit.
