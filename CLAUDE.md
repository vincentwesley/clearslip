# mv3-extension (starter)

Chrome MV3 side-panel extension (esbuild, house style, credits card). Part of the `starters` monorepo; copied into new projects by `new-project`.

## Rules
- Read `docs/next-session.md` first; update it when state changes.
- Node 24, npm only, commit `package-lock.json`, install with `npm ci --ignore-scripts`. No install-time scripts.
- Checks that must stay green: `npm run typecheck && npm run lint && npm test && npm run build`
- House rules from the root CLAUDE.md apply (MIT, no secrets or personal data in tracked files, one git identity).
- Keep permissions minimal (sidePanel only). Any new permission needs a Web Store justification line in README.
- No remote code, no network calls without disclosure.
