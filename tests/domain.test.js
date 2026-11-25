import test from "node:test";
import assert from "node:assert/strict";
import {
  createDemo,
  filterSessions,
  isDate,
  localDate,
  mergeSessions,
  shiftDate,
  toCsv,
  trainingSummary,
  validateBackup,
  validateSession,
  weekDates,
} from "../src/domain.js";

const today = "2026-11-24";
const session = (overrides = {}) => ({
  id: "test-1",
  date: today,
  discipline: "Jiu-jitsu",
  minutes: 90,
  rounds: 6,
  effort: 7,
  focus: "Front headlock",
  lesson: "Keep the grip connected.",
  next: "Drill the entry.",
  ...overrides,
});

test("local calendar dates survive month, year, and daylight-saving boundaries", () => {
  assert.equal(localDate(new Date(2026, 10, 24, 23, 59)), today);
  assert.equal(shiftDate("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftDate("2026-03-08", 1), "2026-03-09");
  assert.equal(shiftDate("2026-11-01", -1), "2026-10-31");
  assert.deepEqual(weekDates("2026-01-03"), [
    "2025-12-28",
    "2025-12-29",
    "2025-12-30",
    "2025-12-31",
    "2026-01-01",
    "2026-01-02",
    "2026-01-03",
  ]);
});

test("calendar validation distinguishes leap days from invalid dates", () => {
  assert.equal(isDate("2024-02-29"), true);
  for (const value of [
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-10",
    "26-11-24",
    "2026-11-24T00:00:00Z",
    null,
  ])
    assert.equal(isDate(value), false, String(value));
});

test("form values become validated, trimmed records without unknown properties", () => {
  const output = validateSession(
    session({
      minutes: "90",
      effort: "7",
      rounds: "0",
      focus: "  Guillotine  ",
      extra: "discard me",
    }),
    today,
  );
  assert.equal(output.minutes, 90);
  assert.equal(output.rounds, 0);
  assert.equal(output.focus, "Guillotine");
  assert.equal("extra" in output, false);
});

test("numeric bounds reject nonnumeric, missing, fractional, and unreasonable input", () => {
  for (const minutes of [
    "",
    " ",
    null,
    undefined,
    true,
    [],
    {},
    "2.5",
    1.5,
    0,
    721,
    Infinity,
    "1e2",
  ])
    assert.throws(
      () => validateSession(session({ minutes }), today),
      undefined,
      String(minutes),
    );
  for (const rounds of [-1, 101, "1.5"])
    assert.throws(() => validateSession(session({ rounds }), today));
  for (const effort of [0, 11, 5.5])
    assert.throws(() => validateSession(session({ effort }), today));
});

test("records require real nonfuture dates, supported disciplines, IDs, and bounded text", () => {
  for (const value of [
    session({ date: "2026-11-25" }),
    session({ date: "2026-02-30" }),
    session({ discipline: "Other" }),
    session({ id: "<script>" }),
    session({ focus: "x".repeat(121) }),
    session({ lesson: null }),
    [],
    null,
  ])
    assert.throws(() => validateSession(value, today));
});

test("summary uses both inclusive week boundaries and excludes adjacent days", () => {
  const data = [
    session({ id: "a", date: "2026-11-18", minutes: 60, rounds: 4, effort: 5 }),
    session({ id: "b", minutes: 90, effort: 9 }),
    session({ id: "c", date: "2026-11-17", minutes: 200 }),
    session({ id: "d", date: "2026-11-25", minutes: 200 }),
  ];
  const result = trainingSummary(data, today);
  assert.equal(result.sessions, 2);
  assert.equal(result.minutes, 150);
  assert.equal(result.rounds, 10);
  assert.equal(result.averageEffort, 7);
  assert.equal(result.days.length, 7);
  assert.equal(result.days[0].minutes, 60);
  assert.equal(result.days[6].minutes, 90);
  assert.deepEqual(result.disciplines, [{ name: "Jiu-jitsu", minutes: 150 }]);
});

test("empty weeks have no fabricated effort average", () => {
  const result = trainingSummary([], today);
  assert.equal(result.sessions, 0);
  assert.equal(result.averageEffort, null);
  assert.equal(
    result.days.every((item) => item.minutes === 0),
    true,
  );
});

test("multiple sessions on one day accumulate and mixed disciplines stay separate", () => {
  const result = trainingSummary(
    [
      session(),
      session({
        id: "second",
        discipline: "Strength",
        minutes: 45,
        rounds: 0,
        effort: 5,
      }),
    ],
    today,
  );
  assert.equal(result.days.at(-1).minutes, 135);
  assert.equal(result.averageEffort, 6);
  assert.equal(result.disciplines.length, 2);
});

test("search matches words across technique and lesson notes with discipline and date filters", () => {
  const data = [
    session({
      id: "a",
      focus: "Guillotine",
      lesson: "Connect grip",
      date: "2026-11-23",
    }),
    session({
      id: "b",
      discipline: "Strength",
      focus: "Guillotine",
      lesson: "Grip",
      date: "2026-11-20",
    }),
    session({
      id: "c",
      focus: "Guillotine",
      lesson: "Grip",
      date: "2026-11-01",
    }),
  ];
  assert.deepEqual(
    filterSessions(data, {
      query: "  GUILLOTINE grip ",
      discipline: "Jiu-jitsu",
      end: today,
    }).map((item) => item.id),
    ["a"],
  );
});

test("sorting does not mutate the original log", () => {
  const data = [
    session({ id: "older", date: "2026-11-20" }),
    session({ id: "newer" }),
  ];
  assert.deepEqual(
    filterSessions(data).map((item) => item.id),
    ["newer", "older"],
  );
  assert.equal(data[0].id, "older");
});

test("backups are versioned, validated in full, and reject duplicate IDs", () => {
  assert.equal(
    validateBackup({ version: 1, sessions: [session()] }, today).length,
    1,
  );
  for (const value of [
    { version: 2, sessions: [] },
    { version: 1, sessions: [session(), session()] },
    { version: 1, sessions: [session(), session({ id: "bad", rounds: -1 })] },
    null,
  ])
    assert.throws(() => validateBackup(value, today));
});

test("duplicate backup imports preserve existing edits instead of overwriting them", () => {
  const original = session({ lesson: "An updated lesson" });
  const result = mergeSessions(
    [original],
    [session({ lesson: "An older lesson" }), session({ id: "new-session" })],
  );
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.sessions[0].lesson, "An updated lesson");
  assert.equal(result.sessions.length, 2);
});

test("CSV escapes quotes, commas, and multiline technique notes", () => {
  const csv = toCsv([
    session({ focus: "Jab, cross", lesson: 'Coach said "angle"\nThen exit.' }),
  ]);
  assert.ok(csv.includes('"Jab, cross"'));
  assert.ok(csv.includes('"Coach said ""angle""\nThen exit."'));
  assert.equal(csv.split("\r\n").length, 2);
});

test("CSV neutralizes spreadsheet formulas in untrusted notes", () => {
  for (const focus of [
    '=HYPERLINK("https://example.test")',
    "+SUM(1,2)",
    "-1+2",
    "@SUM(1,2)",
    "  =1+1",
    "\t=1+1",
  ]) {
    const csv = toCsv([session({ focus })]);
    assert.ok(csv.includes("\"'"), focus);
  }
  assert.ok(toCsv([session()]).includes('"90","6","7"'));
});

test("demonstration data is valid and stays within the selected seven-day range", () => {
  const data = createDemo(today);
  assert.equal(data.length, 6);
  assert.equal(validateBackup({ version: 1, sessions: data }, today).length, 6);
  const result = trainingSummary(data, today);
  assert.equal(result.sessions, 6);
  assert.equal(result.minutes, 445);
  assert.equal(result.rounds, 27);
});

test("gi and no-gi notes remain searchable while totals aggregate jiu-jitsu", () => {
  const gi = validateSession(session({ id: "gi", format: "Gi" }), today);
  const noGi = validateSession(session({ id: "nogi", format: "No-gi" }), today);
  assert.equal(filterSessions([gi, noGi], { query: "no-gi" }).length, 1);
  assert.equal(trainingSummary([gi, noGi], today).disciplines[0].minutes, 180);
  assert.equal(validateSession(session(), today).format, "");
  assert.throws(() =>
    validateSession(session({ discipline: "Strength", format: "Gi" }), today),
  );
});
