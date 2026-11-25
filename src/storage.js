import { SCHEMA_VERSION, validateBackup } from "./domain.js";

export const STORAGE_KEY = "round-log:v1";

export function readLog(storage, today) {
  let raw = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
    return {
      ok: true,
      sessions: raw === null ? [] : validateBackup(JSON.parse(raw), today),
      raw,
    };
  } catch {
    return {
      ok: false,
      sessions: [],
      raw,
      error:
        "Your saved log could not be read. Download it before resetting. Your saved data has not been changed.",
    };
  }
}

export function writeLog(storage, sessions, today) {
  const payload = { version: SCHEMA_VERSION, sessions };
  validateBackup(payload, today);
  // One write makes an unsuccessful save leave the previous complete log intact.
  storage.setItem(STORAGE_KEY, JSON.stringify(payload));
}
