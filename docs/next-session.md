> Update at the end of any session that changed state. Keep it lean.

Continue work on **Hush** (folder `C:\Coding Projects\hush`, local repo only, no remote yet, not published).

## Before anything
1. Read `CLAUDE.md`, `docs/PLAN.md`, `docs/COMPILER-SPEC.md`.
2. `npm ci --ignore-scripts`, then `npm run check && npm run build`.

## How to work here
- Orchestrate; builders (Sonnet) implement, Fable reviews compiler diffs.
- Local commits only. Identity: `vincentwesley` noreply. No push, no repo creation, no store upload without the owner's OK.
- The owner wants no check-ins: work through the milestones in `docs/PLAN.md`.

## Current state
- Milestones 1 (network blocking, popup, per-site off) and 2 (cosmetic filtering, see COMPILER-SPEC "Cosmetic filtering") are built locally, not pushed. Next: milestone 3 (privacy receipt).

- Milestone 2 reviewed and fixed (selector safety, unhide/notHide/genericOff tables, lazy generic fetch, popup load split). The popup switch is now "Pause on this site" and reloads the tab.
- Real-site check done on 7 live sites (`npm run test:real`, local only; results and problems in `docs/real-site-check.md`): no page broke, no main frame blocked.
- Green: `npm run check`, build, `npx playwright test` (12 e2e, incl. differential vs `@ghostery/adblocker`: 357/368 agree, rest in `tests/e2e/known-differences.json`).

## Known gaps
0. Run `security-review` on milestone 2 (content script, `scripting`, all-sites access) before milestone 3.
0. Popup failure paths (worker not answering, matched rules failing) have no automated test.
1. Items marked unverified in `docs/RESEARCH.md` need re-checking before they are relied on.
2. Owner steps (end only): OK to create the public repo and push; Chrome Web Store upload.
