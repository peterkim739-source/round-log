import {
  DISCIPLINES,
  MAX_SESSIONS,
  SCHEMA_VERSION,
  createDemo,
  filterSessions,
  localDate,
  mergeSessions,
  shiftDate,
  toCsv,
  trainingSummary,
  validateBackup,
  validateSession,
} from "./domain.js";
import { readLog, STORAGE_KEY, writeLog } from "./storage.js";

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const today = () => localDate();
const formatDate = (value, options = { month: "short", day: "numeric" }) =>
  new Date(`${value}T12:00:00`).toLocaleDateString(undefined, options);
let storage;
let initial;
try {
  storage = window.localStorage;
  initial = readLog(storage, today());
} catch {
  initial = {
    ok: false,
    sessions: [],
    raw: null,
    error:
      "Browser storage is unavailable. Enable site storage to save your training log.",
  };
}
let sessions = initial.sessions;
let demo = false;
let end = today();
let storageBlocked = !initial.ok;
let pendingDelete = null;
let toastTimer;
const chartColors = ["clay", "forest", "mustard", "slate", "moss", "sand"];

function announce(message) {
  clearTimeout(toastTimer);
  $("#status").textContent = message;
  $("#status").hidden = false;
  toastTimer = setTimeout(() => {
    $("#status").hidden = true;
  }, 6000);
}

function storageError(message) {
  $("#storage-error").hidden = false;
  $("#storage-error-text").textContent = message;
  $("#download-raw").hidden = initial.raw === null;
  $("#reset-storage").hidden = !storageBlocked;
}

function save(next) {
  if (storageBlocked)
    throw new Error(
      "Resolve the saved-data error above before adding or importing sessions.",
    );
  if (next.length > MAX_SESSIONS)
    throw new Error(`A log can contain up to ${MAX_SESSIONS} sessions.`);
  try {
    writeLog(storage, next, today());
  } catch (error) {
    const message =
      error.name === "QuotaExceededError"
        ? "Browser storage is full. Export a backup before freeing space. This change was not saved."
        : "Could not save this change. Your previous log is intact. Check browser storage and try again.";
    storageError(message);
    throw new Error(message);
  }
  sessions = next;
  demo = false;
  $("#storage-error").hidden = true;
  render();
}

function currentSessions() {
  return demo ? createDemo(today()) : sessions;
}

function render() {
  const data = currentSessions();
  const summary = trainingSummary(data, end);
  $("#demo-banner").hidden = !demo;
  $("#next-week").disabled = end >= today();
  $("#date-range").textContent =
    `${formatDate(shiftDate(end, -6))} – ${formatDate(end, { month: "short", day: "numeric", year: "numeric" })}`;
  const metrics = [
    ["01", "SESSIONS", summary.sessions, "Times you showed up"],
    [
      "02",
      "TRAINING TIME",
      `${Math.floor(summary.minutes / 60)}<span>h</span> ${summary.minutes % 60}<span>m</span>`,
      "Every minute put to work",
    ],
    ["03", "ROUNDS", summary.rounds, "Rounds in the selected week"],
    [
      "04",
      "AVG. EFFORT",
      summary.averageEffort === null
        ? "—"
        : `${summary.averageEffort.toFixed(1)}<span>/10</span>`,
      "Your own session rating",
    ],
  ];
  $("#metrics").innerHTML = metrics
    .map(
      ([number, title, value, caption]) =>
        `<article class="metric"><div class="metric-label">${title}<span>${number}</span></div><div class="metric-value">${value}</div><p>${caption}</p></article>`,
    )
    .join("");
  $("#volume-chart").replaceChildren();
  const highest = Math.max(60, ...summary.days.map((day) => day.minutes));
  for (const day of summary.days) {
    const column = document.createElement("div");
    column.className = `chart-column${day.date === today() ? " is-today" : ""}`;
    const label = document.createElement("span");
    label.className = "bar-value";
    label.textContent = day.minutes || "—";
    const track = document.createElement("div");
    track.className = "bar-track";
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = `${(day.minutes / highest) * 100}%`;
    track.append(bar);
    const caption = document.createElement("span");
    caption.className = "bar-day";
    caption.textContent = formatDate(day.date, { weekday: "short" });
    const date = document.createElement("span");
    date.className = "bar-date";
    date.textContent = formatDate(day.date, { day: "numeric" });
    column.setAttribute(
      "aria-label",
      `${formatDate(day.date, { dateStyle: "full" })}: ${day.minutes} minutes`,
    );
    column.append(label, track, caption, date);
    $("#volume-chart").append(column);
  }
  $("#discipline-chart").innerHTML = summary.disciplines.length
    ? `<div class="mix-total"><strong>${summary.minutes}</strong><span>total minutes</span></div><div class="mix-stack" aria-hidden="true"></div><div class="mix-list">${summary.disciplines.map((item) => `<div class="mix-row"><span class="discipline-dot ${chartColors[DISCIPLINES.indexOf(item.name)]}" aria-hidden="true"></span><span>${escapeHtml(item.name)}</span><strong>${item.minutes}<span> min</span></strong></div>`).join("")}</div>`
    : '<div class="chart-empty"><span aria-hidden="true">◇</span><p>Your training mix will appear here.</p></div>';
  const stack = $(".mix-stack");
  if (stack)
    for (const item of summary.disciplines) {
      const segment = document.createElement("span");
      segment.className = chartColors[DISCIPLINES.indexOf(item.name)];
      segment.style.width = `${(item.minutes / summary.minutes) * 100}%`;
      stack.append(segment);
    }
  const filtered = filterSessions(data, {
    query: $("#search").value,
    discipline: $("#discipline-filter").value,
    end: $("#date-filter").value === "week" ? end : null,
  });
  $("#session-count").textContent =
    `${filtered.length} OF ${data.length} SESSIONS`;
  $("#session-list").innerHTML = filtered.length
    ? filtered
        .map(
          (item) =>
            `<article class="session-card"><div class="session-date"><strong>${formatDate(item.date, { day: "numeric" })}</strong><span>${formatDate(item.date, { month: "short" })}</span></div><div class="session-content"><div class="session-title"><span class="discipline-chip ${chartColors[DISCIPLINES.indexOf(item.discipline)]}">${escapeHtml(item.discipline)}${item.format ? ` · ${escapeHtml(item.format)}` : ""}</span><span class="session-meta">${item.minutes} min <span>·</span> ${item.rounds} rounds <span>·</span> Effort ${item.effort}/10</span></div><h3>${escapeHtml(item.focus || `${item.discipline} session`)}</h3>${item.lesson ? `<p class="session-lesson">${escapeHtml(item.lesson)}</p>` : ""}${item.next ? `<p class="next-note"><span>NEXT TIME</span> ${escapeHtml(item.next)}</p>` : ""}</div><button class="session-edit" data-edit="${escapeHtml(item.id)}" aria-label="${demo ? "View" : "Edit"} ${escapeHtml(item.discipline)} session on ${item.date}">${demo ? "View" : "Edit"}</button></article>`,
        )
        .join("")
    : `<div class="empty-state"><span class="empty-symbol" aria-hidden="true">↗</span><h3>${data.length ? "No sessions match this view." : "Your next round starts here."}</h3><p>${data.length ? "Try a different search, discipline, or date range." : "Log your first session, or explore a fictional training week."}</p>${data.length ? "" : '<div><button class="button primary" data-empty-add>Log my first session</button><button class="button" data-empty-demo>Try sample sessions</button></div>'}</div>`;
  const notes = filtered.filter(
    (item) => item.focus || item.lesson || item.next,
  );
  $("#technique-notes").innerHTML = notes.length
    ? notes
        .slice(0, 6)
        .map(
          (item) =>
            `<article class="note-card"><div class="note-meta">${escapeHtml(item.discipline)}${item.format ? ` · ${escapeHtml(item.format)}` : ""} <span>${formatDate(item.date)}</span></div><h3>${escapeHtml(item.focus || "Session takeaway")}</h3><p>${escapeHtml(item.lesson || "No lesson added yet.")}</p>${item.next ? `<div class="note-next"><span>BRING THIS TO THE NEXT SESSION</span><p>${escapeHtml(item.next)}</p></div>` : ""}</article>`,
        )
        .join("")
    : '<p class="notes-empty">Add a technique or takeaway to a session. Your six most recent notes will collect here.</p>';
  $("#export-csv").disabled = data.length === 0;
  $("#export-json").disabled = data.length === 0;
}

function openSession(id = null) {
  const item = id ? currentSessions().find((entry) => entry.id === id) : null;
  const form = $("#session-form");
  form.reset();
  const values = item || {
    id: "",
    date: today(),
    discipline: "Jiu-jitsu",
    format: "",
    minutes: 60,
    rounds: 0,
    effort: 6,
    focus: "",
    lesson: "",
    next: "",
  };
  for (const [key, value] of Object.entries(values))
    form.elements.namedItem(key).value = value;
  form.elements.namedItem("date").max = today();
  $("#dialog-title").textContent = item
    ? demo
      ? "Sample session."
      : "Review the work."
    : "Log the work.";
  $("#form-context").textContent = demo
    ? item
      ? "Fictional example. Edits here are not saved."
      : "Saving starts your personal log. Sample sessions will not be copied."
    : "Saved in this browser. Include whatever detail helps you remember.";
  $("#format-field").hidden = values.discipline !== "Jiu-jitsu";
  $("#delete-session").hidden = !item || demo;
  $('#session-form button[type="submit"]').hidden = Boolean(item && demo);
  $("#form-error").hidden = true;
  for (const field of form.querySelectorAll("input, select, textarea"))
    field.disabled = Boolean(item && demo);
  $("#session-dialog").showModal();
}

function download(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showDemo() {
  demo = true;
  end = today();
  $("#search").value = "";
  $("#discipline-filter").value = "";
  $("#date-filter").value = "all";
  render();
  announce("Sample sessions loaded. Your personal log has not changed.");
}
for (const name of DISCIPLINES) {
  for (const selector of ["#discipline-filter", 'select[name="discipline"]']) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    $(selector).append(option);
  }
}
$('select[name="discipline"]').addEventListener("change", (event) => {
  const isJiuJitsu = event.target.value === "Jiu-jitsu";
  $("#format-field").hidden = !isJiuJitsu;
  if (!isJiuJitsu) $('select[name="format"]').value = "";
});
$("#add-session").addEventListener("click", () => openSession());
for (const selector of ["#close-dialog", "#cancel-dialog"])
  $(selector).addEventListener("click", () => $("#session-dialog").close());
$("#session-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    if (demo && $("#session-form").elements.namedItem("id").value) return;
    const input = Object.fromEntries(new FormData(event.currentTarget));
    input.id ||= crypto.randomUUID();
    const item = validateSession(input, today());
    const next = sessions.filter((entry) => entry.id !== item.id);
    next.push(item);
    save(next);
    $("#session-dialog").close();
    announce("Session saved. Keep showing up.");
  } catch (error) {
    $("#form-error").textContent = error.message;
    $("#form-error").hidden = false;
  }
});
$("#session-list").addEventListener("click", (event) => {
  const edit = event.target.closest("[data-edit]");
  if (edit) openSession(edit.dataset.edit);
  if (event.target.closest("[data-empty-add]")) openSession();
  if (event.target.closest("[data-empty-demo]")) showDemo();
});
$("#delete-session").addEventListener("click", () => {
  pendingDelete = $("#session-form").elements.namedItem("id").value;
  $("#confirm-description").textContent =
    "This removes the entry from this browser. Export a backup first if you want to keep a copy.";
  $("#confirm-dialog").showModal();
});
$("#confirm-cancel").addEventListener("click", () => {
  pendingDelete = null;
  $("#confirm-dialog").close();
});
$("#confirm-delete").addEventListener("click", () => {
  try {
    save(sessions.filter((item) => item.id !== pendingDelete));
    pendingDelete = null;
    $("#confirm-dialog").close();
    $("#session-dialog").close();
    announce("Session deleted.");
  } catch (error) {
    $("#confirm-dialog").close();
    $("#form-error").textContent = error.message;
    $("#form-error").hidden = false;
  }
});
$("#previous-week").addEventListener("click", () => {
  end = shiftDate(end, -7);
  render();
});
$("#next-week").addEventListener("click", () => {
  if (end < today()) {
    end = shiftDate(end, 7);
    if (end > today()) end = today();
    render();
  }
});
$("#current-week").addEventListener("click", () => {
  end = today();
  render();
});
for (const selector of ["#search", "#discipline-filter", "#date-filter"])
  $(selector).addEventListener(
    selector === "#search" ? "input" : "change",
    render,
  );
$("#try-demo").addEventListener("click", showDemo);
$("#exit-demo").addEventListener("click", () => {
  demo = false;
  render();
});
$("#export-csv").addEventListener("click", () => {
  download(
    "\uFEFF" + toCsv(currentSessions()),
    `${demo ? "sample-" : ""}round-log-${today()}.csv`,
    "text/csv;charset=utf-8",
  );
  announce(`${demo ? "Sample sessions" : "All sessions"} exported as CSV.`);
});
$("#export-json").addEventListener("click", () =>
  download(
    JSON.stringify(
      { version: SCHEMA_VERSION, sessions: currentSessions() },
      null,
      2,
    ),
    `${demo ? "sample-" : ""}round-log-${today()}.json`,
    "application/json",
  ),
);
$("#import-json").addEventListener("click", () => $("#import-file").click());
$("#import-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024)
      throw new Error("Choose a JSON backup smaller than 5 MB.");
    const incoming = validateBackup(JSON.parse(await file.text()), today());
    const merged = mergeSessions(sessions, incoming);
    save(merged.sessions);
    announce(
      `Imported ${merged.added} sessions. Skipped ${merged.skipped} existing IDs.`,
    );
  } catch (error) {
    announce(
      error instanceof SyntaxError
        ? "This file is not valid JSON. Nothing was imported."
        : error.message,
    );
  }
  event.target.value = "";
});
$("#download-raw").addEventListener("click", () =>
  download(initial.raw ?? "", "round-log-recovery.txt", "text/plain"),
);
$("#reset-storage").addEventListener("click", () => {
  if (
    !window.confirm(
      "Reset this unreadable log? Download the saved data first. This removes it from this browser.",
    )
  )
    return;
  try {
    storage.removeItem(STORAGE_KEY);
    storageBlocked = false;
    sessions = [];
    initial = { ok: true, raw: null, sessions: [] };
    $("#storage-error").hidden = true;
    render();
    announce("Storage reset. You can start a new log.");
  } catch {
    announce(
      "Browser storage is still unavailable. Check this site’s storage permissions.",
    );
  }
});
window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  const updated = readLog(storage, today());
  if (updated.ok) {
    initial = updated;
    sessions = updated.sessions;
    storageBlocked = false;
    $("#storage-error").hidden = true;
    render();
    announce("Log updated from another tab.");
  } else {
    initial = updated;
    storageBlocked = true;
    storageError(updated.error);
  }
});
if (!initial.ok) storageError(initial.error);
render();
