# Releasing a new version

Every release ends with the same owner step: in the Chrome Web Store dashboard, open **Package**, choose **Upload new package**, pick `extension.zip`, then **Submit for review**.

## 1. Filter list refresh (the common release: monthly, or when ads slip through)
1. Run `npm run lists:update` and review the printed diff.
2. Bump the patch version (for example 1.0.1 to 1.0.2) in `static/manifest.json` and `package.json`. For `package.json`, run `npm version <x.y.z> --no-git-tag-version --ignore-scripts`.
3. Run `npm run check`, `npm run test:e2e` and `npm run test:real`, then `npm run zip`.
4. Check `dist/rulesets/report.json`. The compact ruleset must stay under Chrome's 30,000 guaranteed rules; `capCompact` in `src/compiler/optimise.ts` cuts the rest and reports what it dropped.
5. Commit, tag (`git tag -a vX.Y.Z`), push, and create a GitHub release with `extension.zip` attached.
6. Upload. This qualifies for **skip review**, so it goes live in minutes, if all of these hold (https://developer.chrome.com/docs/webstore/skip-review):
   - only files inside `rulesets/` changed;
   - no ruleset was added or removed (the set in the manifest is fixed on purpose);
   - `declarativeNetRequest` is still a required permission;
   - the store listing is not edited in the same submission.

## 2. Code or UI change
- Bump the minor version (for example 1.1.0).
- Run the full checks, then a code review, plus a security review if messaging, storage or permissions changed.
- Retake the store screenshots if the UI changed. Run them with `tests/store/`.
- The store reviews these normally, which usually takes hours to a few days.

## Microsoft Edge
The same `extension.zip` runs unchanged in Edge (tested on Edge 158: `npm run test:e2e:edge`, and `E2E_CHANNEL=msedge npm run test:real`; both need Edge installed). Edge users can install from the Chrome Web Store after allowing extensions from other stores. To list Clearslip in Edge Add-ons as well: in Microsoft Partner Center (https://partner.microsoft.com/dashboard/microsoftedge/overview), create a new extension, upload `extension.zip`, and reuse `docs/STORE-LISTING.md`, the screenshots and the privacy policy URL. Each later release is uploaded to both stores.

## Rules that keep updates safe
- **The version always goes up.** The store rejects an upload whose version is equal to or lower than the one already published.
- **No new permission or host access without the owner's explicit OK.** Chrome disables the extension for existing users until each user approves the new permission.
- **User data is a contract.** Never rename the `off` (paused sites) and `zaps` (hidden items) keys in `chrome.storage.local`. Keep their readers (`cleanOff` and `cleanZaps`) tolerant of older shapes. If a format must change, migrate it in `init()` in `src/background.ts`, which runs on every install and update through `runtime.onInstalled`.
- **Rollback:** the store has no revert button. Rebuild the previous version's code with a higher version number and upload that. Every tagged GitHub release keeps its zip.
- **Dependabot PRs** touch dev tools only. Merge them in batches. They need no store upload unless the built zip changes.
- **Not now:** automated publishing through the Chrome Web Store API from CI. It costs Actions minutes and needs a stored OAuth secret. Revisit if releases become frequent.
