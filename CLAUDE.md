# Hush

Manifest V3 ad and tracker blocker for Chrome. Network blocking from EasyList + EasyPrivacy compiled at build time into declarativeNetRequest rulesets by our own TypeScript compiler; popup shows what was blocked; per-site off switch. Plan: `docs/PLAN.md`. Compiler contract: `docs/COMPILER-SPEC.md`. Research and sources: `docs/RESEARCH.md`.

## Rules
- Read `docs/next-session.md` first; update it when state changes.
- Node 24, npm only, commit `package-lock.json`, install with `npm ci --ignore-scripts`. No install-time scripts.
- Checks that must stay green: `npm run check && npm run build`. E2E (`npm run test:e2e`) is headless, local only, never in CI.
- House rules from the root CLAUDE.md apply (MIT code, no secrets or personal data in tracked files, one git identity).
- The owner wants no involvement: decide and carry on. Nothing is pushed, made public or uploaded without the owner's OK.

## Hard constraints
- **Zero network calls from the extension.** No remote code, no remote rules, no analytics. Lists are fetched only by `npm run lists:update` on the developer machine.
- **Permissions:** `declarativeNetRequest`, `declarativeNetRequestFeedback`, `storage`, `sidePanel` only until milestone 2. No host permissions in milestone 1. Every permission has a Web Store justification line in README.
- **Licences:** code is MIT. `lists/` and generated `rulesets/` are EasyList data under CC BY-SA 3.0, credit "The EasyList authors (https://easylist.to/)". Never copy code or test fixtures from uBlock Origin, AdGuard or eyeo (GPL). `@ghostery/adblocker` (MPL-2.0) is a test-only devDependency and must never be imported from `src/`.
- **Skip-review friendly:** the set of ruleset files in the manifest is fixed. A list refresh may change only their contents.
- YouTube in-video ads are out of scope (stated in README).
- Real data only: the UI shows measured counts, never estimates.
