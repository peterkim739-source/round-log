# Testing Round Log

## Core checks

```sh
npm test
npm run check
```

Node's built-in test runner needs no dependency install. Tests use fixed dates and in-memory storage. To exercise calendar arithmetic in different time zones:

```sh
TZ=America/Los_Angeles npm test
TZ=Asia/Seoul npm test
```

## Browser checks

Browser checks use Python Playwright as an optional development tool. It is not shipped with the application.

```sh
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
npm start
```

In another terminal:

```sh
python tests/browser_smoke.py
```

To use an existing Chromium installation, set `CHROMIUM_EXECUTABLE` to its executable path. To test another local server, set `ROUND_LOG_URL`.

The browser script checks creating and reloading entries, editing without duplication, search, displaying HTML-like notes as text, JSON backup download and repeated import, rejecting invalid backups, CSV downloads, demo separation, mobile overflow, cross-tab synchronization, confirmed deletion, and recovery from unreadable storage. It writes a labeled demo dashboard image to `assets/dashboard.jpg` and a mobile inspection image to ignored `test-results/mobile.png`.

## Manual review

- Navigate with Tab, Shift+Tab, Enter, and Escape. Focus should remain visible; dialogs should close with Escape and return focus to their trigger.
- Try 390px and 1440px viewport widths. There should be no horizontal page scrolling, clipped controls, or overlapping content.
- Add several disciplines on the same date and confirm that daily minutes add correctly.
- Search and filter together; clear the filters and confirm the original records return.
- Turn off site storage or simulate quota exhaustion. A failed save should show an error and keep the previous log intact.
- Recover an exported JSON file in a new browser profile, where the personal log starts empty.

Desktop and mobile Chromium are the initial automated targets. Safari, Firefox, and assistive-technology review are additional work; passing a browser test is not a claim of complete accessibility coverage.
