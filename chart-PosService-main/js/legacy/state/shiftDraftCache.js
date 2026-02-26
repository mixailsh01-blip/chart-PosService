// js/state/shiftDraftCache.js
import { config } from "../config.js";

const STORAGE_KEY = config.storage.keys.shiftDrafts;


/**
 * key = `${employeeId}:${year}-${monthIndex}-${dayNumber}`
 */
export function makeDraftKey(employeeId, year, monthIndex, dayNumber) {
  return `${employeeId}:${year}-${monthIndex}-${dayNumber}`;
}

export function loadDrafts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || !parsed) return {};
    return parsed;
  } catch (e) {
    console.warn("Не удалось прочитать драфты смен из localStorage", e);
    return {};
  }
}

export function saveDrafts(drafts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  } catch (e) {
    console.warn("Не удалось сохранить драфты смен в localStorage", e);
  }
}
