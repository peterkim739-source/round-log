# Initial verification

This is a record of checks performed for the initial implementation, not a claim about users or project adoption.

## Completed

- Node.js 24: 21 automated unit tests passed.
- All 21 tests also passed with `TZ=America/Los_Angeles` and `TZ=Asia/Seoul`.
- JavaScript syntax checks passed for the application modules and development server.
- Desktop Chromium UI review confirmed: create a fictional session, save it, reload it, edit rounds without duplication, search for a nonmatching technique, and download a JSON backup.
- Gi/no-gi UI review confirmed: an existing entry can be marked no-gi, its label appears in the log and notebook, and importing an older backup skips the existing ID while preserving the current edit.
- Confirmed deletion was exercised using the fictional test session. The log returned to empty; sample mode remained separate.
- A sample dashboard screenshot was visually inspected. Interface text was enlarged following that review.

## Included for further verification

`tests/browser_smoke.py` provides a broader, repeatable Playwright check. The coding environment did not have a local Chromium binary, and its browser download endpoint was unavailable, so this standalone script has not been executed here. The desktop checks above were performed in the available interactive browser.

The GitHub Actions workflow is configured to run core tests across Node 22/24 and Los Angeles/Seoul time zones, then exercise the standalone browser script. A workflow configuration is not evidence that CI has run; inspect the repository's Actions results after publication.

Mobile visual review, Firefox, Safari, and screen-reader review remain to be completed.
