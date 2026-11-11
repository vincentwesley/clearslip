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

- HEAD `6dba6ec` (2026-11-11). Green: `npm run check` (91 unit), build, `npx playwright test` (11 e2e, incl. differential vs `@ghostery/adblocker`: 357/368 agree, rest in `tests/e2e/known-differences.json`).

## Known gaps
0. Milestone 2 has had no `simplify` / `code-review` / `security-review` pass yet (new content script, `scripting`, all-sites access). Do these first next session, before milestone 3.
0. Popup failure paths (worker not answering) are fixed but have no automated test.
0. Not yet tried by hand on real sites; tests use a local server only.
1. Items marked unverified in `docs/RESEARCH.md` need re-checking before they are relied on.
2. Owner steps (end only): OK to create the public repo and push; Chrome Web Store upload.
