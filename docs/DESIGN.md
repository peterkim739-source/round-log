# Design and data model

## Scope

The main workflow is: log a completed session, review recent volume, and find a lesson before the next session. An initial requirement is to support technique notes and training volume equally. The app runs as static files without collecting training entries on a server.

## Architecture

`domain.js` is independent of the DOM and browser storage. `storage.js` wraps the persistence boundary. `app.js` renders the dashboard and handles user actions. Keeping validation and calculations separate makes them testable without a browser.

Plain JavaScript and CSS keep the first version easy to inspect and run. No package manager install, framework runtime, build step, CDN, or remote font is needed. This trades framework tooling for a small, directly readable app.

## Version 1 backup

```json
{
  "version": 1,
  "sessions": [
    {
      "id": "example-session",
      "date": "2026-11-24",
      "discipline": "Jiu-jitsu",
      "format": "No-gi",
      "minutes": 90,
      "rounds": 6,
      "effort": 7,
      "focus": "Front headlock entries",
      "lesson": "A fictional example note.",
      "next": "Review the entry next time."
    }
  ]
}
```

| Field | Rule |
| --- | --- |
| `id` | Unique string, 1-100 letters, digits, underscores, or hyphens; new entries use a random UUID |
| `date` | Real local calendar date, `YYYY-MM-DD`, 1900 or later, through today |
| `discipline` | One of six supported disciplines |
| `format` | Optional `Gi` or `No-gi` for jiu-jitsu; an empty string for other disciplines or older records |
| `minutes` | Whole number, 1-720 |
| `rounds` | Whole number, 0-100; a strength session can have zero rounds |
| `effort` | Whole number, 1-10; an unweighted average of the user's session ratings |
| `focus` | Optional text, up to 120 characters |
| `lesson` | Optional text, up to 2,000 characters |
| `next` | Optional text, up to 1,000 characters |

All optional text is trimmed. Unknown properties are discarded. The schema version is required on imports; unsupported versions are rejected rather than guessed.

## Dates and the selected week

Dates are local calendar strings. Parsing and arithmetic use local noon, which avoids midnight daylight-saving transitions. Input dates never go through `toISOString()`, which could shift the displayed date to another day.

The dashboard displays seven consecutive dates ending at the selected date. Both boundaries are included. Navigation moves seven days at a time; it cannot advance past today. The session list defaults to all dates; selecting "Selected 7 days" applies the dashboard's date range to the list and notebook.

Total time and rounds are sums. Average effort is the arithmetic mean of selected sessions, not a minute-weighted score. Empty periods display no average. Discipline totals include only disciplines with training minutes in the selected period.

## Persistence and failure behavior

The single storage key is `round-log:v1`. One `setItem` operation replaces the serialized log after validation. If the write fails, the UI retains the previous saved state and shows a storage error. Corrupt or unrecognized stored data is never silently replaced with an empty log. The user can download the raw saved value before explicitly resetting it.

The `storage` event updates other open tabs. Concurrent edits to the same session follow last-save-wins behavior; there is no collaborative conflict resolution. A form left open while another tab changes that same entry can overwrite that entry when saved. Different device clocks, browser timezone changes, and clock rollback can affect future-date validation.

## Import, export, and untrusted input

JSON imports are additive. Every record must validate before any change is written. Duplicate IDs within an imported file cause the entire file to be rejected. IDs already present in the personal log are skipped, so an older backup cannot replace a newer local note. Sessions with distinct IDs are treated as distinct even if their contents match.

CSV exports contain the entire current log, regardless of search filters. Quoting preserves commas, quotes, and newlines. Text that starts with a spreadsheet formula trigger, including after leading whitespace, is prefixed with an apostrophe. CSV cannot be restored directly; JSON is the backup format.

User notes are escaped before insertion in HTML. Dynamic chart dimensions use numeric values. The content security policy permits local application files and disallows outbound connections, plugins, and form navigation. The app does not depend on those restrictions as its sole input defense.

## Demonstration mode

The sample week is generated in memory relative to today and has a visible sample-data banner. It never writes itself into the personal log. Sample entries are view-only. Creating a new session in demo mode saves to the personal log and exits demo mode. Downloaded demonstration files have a `sample-` filename prefix.

## Current limits

- No account, cloud sync, automatic backup, or encrypted storage.
- No offline service-worker cache; saving is local, but loading the application initially requires access to its static files.
- No medical, fatigue, injury-risk, or readiness scoring.
- Rendering and calculating totals are linear in the number of records; the log is capped at 10,000 entries.
- The local server is a development convenience, not a production application server.
