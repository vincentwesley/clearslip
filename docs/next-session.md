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
- Scaffolded from the mv3-extension starter. Milestone 1 (network blocking, popup, per-site off) in progress.

## Known gaps
1. Items marked unverified in `docs/RESEARCH.md` need re-checking before they are relied on.
2. Owner steps (end only): OK to create the public repo and push; Chrome Web Store upload.
