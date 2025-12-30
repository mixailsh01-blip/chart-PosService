// js/state/shiftDraftCache.js

function getStorageKey(){
  return (window.APP_CONFIG && window.APP_CONFIG.storage && window.APP_CONFIG.storage.keys && window.APP_CONFIG.storage.keys.localChanges) || "sm1_local_changes";
}

/**
 * key = `${employeeId}:${year}-${monthIndex}-${dayNumber}`
 */
export function makeDraftKey(employeeId, year, monthIndex, dayNumber) {
  return `${employeeId}:${year}-${monthIndex}-${dayNumber}`;
}

export function loadDrafts() {
  try {
    const raw = localStorage.getItem(getStorageKey());
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
    localStorage.setItem(getStorageKey(), JSON.stringify(drafts));
  } catch (e) {
    console.warn("Не удалось сохранить драфты смен в localStorage", e);
  }
}
