Agent Guidelines for LeaveTrack

Scope: This file applies to the entire repository.

Overview

- LeaveTrack is a static SPA (no backend). It uses Tailwind CSS (CLI v4) with a small custom stylesheet. The compiled CSS is committed for GitHub Pages deployment.
- Icon PNG assets are generated during the CI/CD pipeline; do not commit regenerated binaries.

Do

- Check for any minor or patch updates to npm libraries and apply them if they are found before making any further changes.
- For any new code developed, tests should be included, and before committing changes, all tests must pass.
- Keep `assets/js/app.js` in Jest coverage collection/reporting at all times; never remove it from `collectCoverageFrom` when adjusting test coverage settings.
- Changes to `jest.config.js` are strictly prohibited unless a human maintainer explicitly requests and approves them in the task instructions.
- Code should be linted using `npm run lint` before being committed.
- Before running Playwright E2E tests in a new environment, install browser binaries with `npx playwright install` (or `npx playwright install --with-deps` on fresh Linux machines) so test runs do not fail with missing executable errors.
- If Node warns that `NO_COLOR` is ignored because `FORCE_COLOR` is set, clear color forcing for the test command (for example `FORCE_COLOR=0 npm run test:e2e`) to avoid noisy output.
- Edit source styles in `src/styles.css` only.
- Rebuild CSS with:
  - `npm run build:css` (one-off) or `npm run watch:css` (during development).
- Keep the generated file `assets/styles.css` up to date and committed when changing styles.
- Ensure `tailwind.config.js` `content` globs cover any new HTML/JS files that use Tailwind classes (currently scans `index.html` and `assets/js/**/*.js`).
- Serve locally over HTTP for testing (service worker does not work with `file://`). Example: `python -m http.server 8080`.
- Preserve the project structure and naming; keep changes minimal and targeted.
- You MUST maintain the changelog: always add a concise summary for non-technical audiences of any change (not just user-facing ones) to both `CHANGELOG.md` and `assets/changelog.json`. Use the placeholders `[NEXT_VERSION]` and `[NEXT_DATE]` instead of hardcoding version numbers and dates in these files.
- The release pipeline automatically computes the next version, replaces the placeholders, bumps `assets/version.json` and `service-worker.js`, and commits these changes back to the repository on merge to main. Do not manually edit `assets/version.json` or bump versions in PRs, as this avoids conflicts when multiple PRs are open.
- Update detection no longer uses `VERSION_BASE`; keep relying on `assets/version.json` and the changelog data, and do not reintroduce the removed base file.
- To prevent merge conflicts in the changelog when multiple PRs are open, always check if any new changes have appeared in main immediately before creating a pull request. If they have, make sure to pull the latest changes from the main branch and rebase your changes.
- Pin actions to a commit SHA when creating or editing GitHub actions.

Don't

- Don't reintroduce Tailwind via the CDN in `index.html`. The app now relies on the compiled stylesheet `assets/styles.css`.
- Don't edit `assets/styles.css` manually. It is a build artifact.
- Don't add bundlers or frameworks unless explicitly requested.

Environment

- Requires Node.js 20+ and npm 10+.
- Tailwind CLI: v4 (configured via `tailwind.config.js`).

Deployment

- GitHub Pages workflow uploads the repository as-is and does not run a build step. Always commit the updated `assets/styles.css` when changing styles so Pages reflects the latest CSS.
