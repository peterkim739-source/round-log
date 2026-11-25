/** Calendar dates use local YYYY-MM-DD values, never UTC conversions. */
export const DISCIPLINES = Object.freeze([
  "Jiu-jitsu",
  "MMA",
  "Striking",
  "Wrestling",
  "Strength",
  "Conditioning",
]);
export const MAX_SESSIONS = 10000;
export const SCHEMA_VERSION = 1;

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(2000, month - 1, day, 12);
  date.setFullYear(year);
  return year >= 1900 && year <= 9999 && localDate(date) === value;
}

export function shiftDate(value, days) {
  if (!isDate(value) || !Number.isInteger(days))
    throw new Error("Use a valid calendar date and whole number of days.");
  const [year, month, day] = value.split("-").map(Number);
  return localDate(new Date(year, month - 1, day + days, 12));
}

export function weekDates(end) {
  return Array.from({ length: 7 }, (_, index) => shiftDate(end, index - 6));
}

function integer(value, field, min, max) {
  if (
    value === "" ||
    value === null ||
    value === undefined ||
    typeof value === "boolean"
  )
    throw new Error(`${field} is required.`);
  if (typeof value !== "number" && typeof value !== "string")
    throw new Error(`${field} must be a number.`);
  if (typeof value === "string" && !/^\d+$/.test(value.trim()))
    throw new Error(`${field} must be a whole number.`);
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max)
    throw new Error(`${field} must be a whole number from ${min} to ${max}.`);
  return result;
}

function note(value, field, max) {
  if (value === undefined) return "";
  if (typeof value !== "string") throw new Error(`${field} must be text.`);
  const result = value.trim();
  if (result.length > max)
    throw new Error(`${field} must be ${max} characters or fewer.`);
  return result;
}

export function validateSession(input, today = localDate()) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Each session must be an object.");
  if (typeof input.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.id))
    throw new Error("A session has an invalid ID.");
  if (!isDate(input.date) || input.date > today)
    throw new Error("Choose a valid date on or before today.");
  if (!DISCIPLINES.includes(input.discipline))
    throw new Error("Choose a supported discipline.");
  const format = input.format ?? "";
  if (
    !["", "Gi", "No-gi"].includes(format) ||
    (input.discipline !== "Jiu-jitsu" && format !== "")
  )
    throw new Error("Gi and no-gi formats apply only to jiu-jitsu sessions.");
  return {
    id: input.id,
    date: input.date,
    discipline: input.discipline,
    format,
    minutes: integer(input.minutes, "Duration", 1, 720),
    rounds: integer(input.rounds, "Rounds", 0, 100),
    effort: integer(input.effort, "Effort", 1, 10),
    focus: note(input.focus, "Technique focus", 120),
    lesson: note(input.lesson, "Lesson", 2000),
    next: note(input.next, "Next-session goal", 1000),
  };
}

export function validateBackup(input, today = localDate()) {
  if (
    !input ||
    typeof input !== "object" ||
    input.version !== SCHEMA_VERSION ||
    !Array.isArray(input.sessions)
  )
    throw new Error("Use a Round Log JSON backup with version 1.");
  if (input.sessions.length > MAX_SESSIONS)
    throw new Error(`A log can contain up to ${MAX_SESSIONS} sessions.`);
  const sessions = input.sessions.map((item) => validateSession(item, today));
  if (new Set(sessions.map((item) => item.id)).size !== sessions.length)
    throw new Error(
      "The backup has duplicate session IDs. Nothing was imported.",
    );
  return sessions;
}

export function mergeSessions(existing, incoming) {
  const ids = new Set(existing.map((item) => item.id));
  const added = incoming.filter((item) => !ids.has(item.id));
  if (existing.length + added.length > MAX_SESSIONS)
    throw new Error(`A log can contain up to ${MAX_SESSIONS} sessions.`);
  return {
    sessions: [...existing, ...added],
    added: added.length,
    skipped: incoming.length - added.length,
  };
}

export function trainingSummary(sessions, end) {
  const days = weekDates(end);
  const selected = sessions.filter(
    (item) => item.date >= days[0] && item.date <= end,
  );
  const minutes = selected.reduce((sum, item) => sum + item.minutes, 0);
  const rounds = selected.reduce((sum, item) => sum + item.rounds, 0);
  const averageEffort = selected.length
    ? selected.reduce((sum, item) => sum + item.effort, 0) / selected.length
    : null;
  return {
    sessions: selected.length,
    minutes,
    rounds,
    averageEffort,
    days: days.map((date) => ({
      date,
      minutes: selected
        .filter((item) => item.date === date)
        .reduce((sum, item) => sum + item.minutes, 0),
    })),
    disciplines: DISCIPLINES.map((name) => ({
      name,
      minutes: selected
        .filter((item) => item.discipline === name)
        .reduce((sum, item) => sum + item.minutes, 0),
    })).filter((item) => item.minutes > 0),
  };
}

export function filterSessions(
  sessions,
  { query = "", discipline = "", end = null } = {},
) {
  const start = end ? shiftDate(end, -6) : null;
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return sessions
    .filter((item) => {
      if (discipline && item.discipline !== discipline) return false;
      if (end && (item.date < start || item.date > end)) return false;
      const text = [
        item.discipline,
        item.format,
        item.focus,
        item.lesson,
        item.next,
        item.date,
      ]
        .join(" ")
        .toLocaleLowerCase();
      return words.every((word) => text.includes(word));
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

function csvCell(value) {
  let text = String(value);
  // Spreadsheet applications can execute untrusted note text as formulas.
  if (typeof value === "string" && /^[\s]*[=+@\-\t\r]/.test(text))
    text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function toCsv(sessions) {
  const fields = [
    "date",
    "discipline",
    "format",
    "minutes",
    "rounds",
    "effort",
    "focus",
    "lesson",
    "next",
  ];
  return [
    fields.join(","),
    ...filterSessions(sessions).map((item) =>
      fields.map((key) => csvCell(item[key] ?? "")).join(","),
    ),
  ].join("\r\n");
}

export function createDemo(today = localDate()) {
  const samples = [
    [
      -6,
      "Jiu-jitsu",
      90,
      6,
      7,
      "Front headlock entries",
      "Connect the grip before trying to finish. Keep the head close.",
      "Drill the entry slowly before adding resistance.",
    ],
    [
      -5,
      "Strength",
      55,
      0,
      6,
      "Single-leg stability",
      "Slowing down the lowering phase made balance work harder.",
      "Keep the movement controlled.",
    ],
    [
      -4,
      "Striking",
      75,
      5,
      7,
      "Jab to outside angle",
      "Exit on an angle after the combination.",
      "Add a defensive exit to each combination.",
    ],
    [
      -2,
      "Wrestling",
      60,
      4,
      8,
      "Underhook to body lock",
      "A small change in head position helped the entry.",
      "Practice getting position before driving.",
    ],
    [
      -1,
      "Jiu-jitsu",
      90,
      7,
      7,
      "Guillotine transitions",
      "Write one useful detail after each round instead of trying to remember everything.",
      "Link the front headlock to two possible finishes.",
    ],
    [
      0,
      "MMA",
      75,
      5,
      8,
      "Wall work and exits",
      "Stay balanced during the transition back to striking.",
      "Review the exit with a training partner.",
    ],
  ];
  return samples.map(
    (
      [offset, discipline, minutes, rounds, effort, focus, lesson, next],
      index,
    ) => ({
      id: `demo-${index}`,
      date: shiftDate(today, offset),
      discipline,
      format: discipline === "Jiu-jitsu" ? (index === 0 ? "Gi" : "No-gi") : "",
      minutes,
      rounds,
      effort,
      focus,
      lesson,
      next,
    }),
  );
}
