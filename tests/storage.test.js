import test from "node:test";
import assert from "node:assert/strict";
import { STORAGE_KEY, readLog, writeLog } from "../src/storage.js";

const today = "2026-11-24";
const entry = {
  id: "a",
  date: today,
  discipline: "MMA",
  format: "",
  minutes: 60,
  rounds: 5,
  effort: 7,
  focus: "",
  lesson: "",
  next: "",
};
const memoryStorage = () => {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
};

test("a new browser starts with a genuinely empty log", () => {
  assert.deepEqual(readLog(memoryStorage(), today), {
    ok: true,
    sessions: [],
    raw: null,
  });
});

test("session values survive a save/read round trip", () => {
  const storage = memoryStorage();
  writeLog(storage, [entry], today);
  assert.deepEqual(readLog(storage, today).sessions, [entry]);
});

test("malformed or unsupported saved data is preserved for recovery", () => {
  for (const raw of [
    "{broken",
    '{"version":999,"sessions":[]}',
    '{"version":1,"sessions":[{}]}',
  ]) {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, raw);
    const result = readLog(storage, today);
    assert.equal(result.ok, false);
    assert.equal(result.raw, raw);
    assert.equal(storage.getItem(STORAGE_KEY), raw);
  }
});

test("blocked storage is surfaced instead of pretending a log was saved", () => {
  const storage = {
    getItem() {
      throw new Error("SecurityError");
    },
    setItem() {
      throw new Error("QuotaExceededError");
    },
  };
  assert.equal(readLog(storage, today).ok, false);
  assert.throws(() => writeLog(storage, [entry], today));
});

test("invalid data cannot overwrite a valid saved log", () => {
  const storage = memoryStorage();
  writeLog(storage, [entry], today);
  const before = storage.getItem(STORAGE_KEY);
  assert.throws(() => writeLog(storage, [{ ...entry, minutes: -1 }], today));
  assert.equal(storage.getItem(STORAGE_KEY), before);
});
