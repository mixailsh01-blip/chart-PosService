import { cached, peekCache, invalidateByPrefix } from "../cache/requestCache.js";
import { unwrapPyrusData } from "../api/pyrusClient.js";

const DEFAULT_VACATIONS_TTL_MS = 3 * 60 * 60 * 1000; // 3h
// Реестр Pyrus обновляется с задержкой: созданные/удалённые с сайта отпуска
// держим поверх реестра, пока он не догонит (и после перезагрузки страницы тоже).
const RECENT_WRITES_TTL_MS = 30 * 60_000;
const RECENT_WRITES_STORAGE_KEY = "chart-posservice:vacations:recentWrites:v1";

function parseMonthKey(monthKey) {
  const [yearStr, monthStr] = String(monthKey).split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
    throw new Error(`Invalid monthKey: ${monthKey}`);
  }
  return { year, monthIndex };
}

export function createVacationsService({
  pyrusClient,
  formId,
  fieldIds,
  timezoneOffsetMin,
  ttlMs = DEFAULT_VACATIONS_TTL_MS,
} = {}) {
  if (!pyrusClient || typeof pyrusClient.pyrusRequest !== "function") {
    throw new Error("pyrusClient is required for vacationsService");
  }

  const recentUpserts = new Map(); // task_id -> { task, at }
  const recentDeletes = new Map(); // task_id -> at

  function persistRecentWrites() {
    try {
      localStorage.setItem(
        RECENT_WRITES_STORAGE_KEY,
        JSON.stringify({ upserts: Object.fromEntries(recentUpserts), deletes: Object.fromEntries(recentDeletes) })
      );
    } catch (_) {
      // localStorage недоступен — просто без переживания перезагрузки
    }
  }

  function loadPersistedRecentWrites() {
    try {
      const raw = localStorage.getItem(RECENT_WRITES_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const border = Date.now() - RECENT_WRITES_TTL_MS;
      for (const [id, v] of Object.entries(parsed?.upserts || {})) {
        if (v && Number(v.at) >= border) recentUpserts.set(Number(id), v);
      }
      for (const [id, at] of Object.entries(parsed?.deletes || {})) {
        if (Number(at) >= border) recentDeletes.set(Number(id), Number(at));
      }
    } catch (_) {
      // повреждённые данные — игнорируем
    }
  }
  loadPersistedRecentWrites();

  function withRecentWrites(tasks) {
    const border = Date.now() - RECENT_WRITES_TTL_MS;
    let pruned = false;
    for (const [id, v] of recentUpserts) if (v.at < border) { recentUpserts.delete(id); pruned = true; }
    for (const [id, at] of recentDeletes) if (at < border) { recentDeletes.delete(id); pruned = true; }
    if (pruned) persistRecentWrites();
    if (!recentUpserts.size && !recentDeletes.size) return tasks;
    const byId = new Map(tasks.map((t) => [t.id, t]));
    for (const [id, { task }] of recentUpserts) if (!byId.has(id)) byId.set(id, task);
    for (const id of recentDeletes.keys()) byId.delete(id);
    return [...byId.values()];
  }

  function invalidateAll() {
    invalidateByPrefix("pyrus:vacations:");
  }

  // Результат создания/удаления отпуска — показываем сразу, не дожидаясь реестра
  function applyCreated(task) {
    if (!task || task.id == null) return;
    recentUpserts.set(task.id, { task, at: Date.now() });
    recentDeletes.delete(task.id);
    persistRecentWrites();
    invalidateAll();
  }

  function applyDeleted(taskId) {
    if (taskId == null) return;
    recentDeletes.set(taskId, Date.now());
    recentUpserts.delete(taskId);
    persistRecentWrites();
    invalidateAll();
  }

  async function getVacationsForMonth(monthKey, { force } = {}) {
    const { year, monthIndex } = parseMonthKey(monthKey);

    return cached(
      `pyrus:vacations:${monthKey}`,
      { ttlMs, force },
      async () => {
        // Реестр отпусков один на все месяцы — запрашиваем один раз (кеш 90 с), по месяцам только разбираем
        const raw = await cached("pyrus:vacations:register", { ttlMs: 90_000, force }, () =>
          pyrusClient.pyrusRequest(`/v4/forms/${formId}/register`, { method: "GET" })
        );
        const data = unwrapPyrusData(raw);
        const wrapper = Array.isArray(data) ? data[0] : data;
        const tasks = withRecentWrites((wrapper && wrapper.tasks) || []);

        const vacationsByEmployee = Object.create(null);
        const offsetMs = Number(timezoneOffsetMin || 0) * 60 * 1000;

        const monthStartShiftedMs = Date.UTC(year, monthIndex, 1, 0, 0, 0, 0);
        const monthEndShiftedMs = Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0);
        const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

        const fmt = (shiftedMs) => {
          const d = new Date(shiftedMs);
          const dd = String(d.getUTCDate()).padStart(2, "0");
          const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
          const yy = d.getUTCFullYear();
          return `${dd}.${mm}.${yy}`;
        };

        const isMidnight = (shiftedMs) => {
          const d = new Date(shiftedMs);
          return (
            d.getUTCHours() === 0 &&
            d.getUTCMinutes() === 0 &&
            d.getUTCSeconds() === 0 &&
            d.getUTCMilliseconds() === 0
          );
        };

        for (const task of tasks) {
          const fields = task.fields || [];
          const personField = fields.find(
            (f) => f && f.id === fieldIds?.person && f.type === "person"
          );
          const periodField = fields.find(
            (f) => f && f.id === fieldIds?.period && f.type === "due_date_time"
          );
          if (!personField || !periodField) continue;

          const empId = personField.value && personField.value.id;
          if (!empId) continue;

          const startIso = periodField.value;
          const durationMin = Number(periodField.duration || 0);
          if (!startIso || !durationMin) continue;

          const startUtcMs = new Date(startIso).getTime();
          if (Number.isNaN(startUtcMs)) continue;
          const endUtcMs = startUtcMs + durationMin * 60 * 1000;

          const startShiftedMs = startUtcMs + offsetMs;
          const endShiftedMs = endUtcMs + offsetMs;

          const segStart = Math.max(startShiftedMs, monthStartShiftedMs);
          const segEnd = Math.min(endShiftedMs, monthEndShiftedMs);
          if (segStart >= segEnd) continue;

          const startDay = new Date(segStart).getUTCDate();

          const endDate = new Date(segEnd);
          let endDayExclusive;
          if (endDate.getUTCMonth() !== monthIndex) {
            endDayExclusive = daysInMonth + 1;
          } else {
            endDayExclusive = endDate.getUTCDate();
            if (!isMidnight(segEnd)) endDayExclusive += 1;
          }

          endDayExclusive = Math.max(1, Math.min(daysInMonth + 1, endDayExclusive));

          let endLabelShiftedMs = endShiftedMs;
          if (isMidnight(endShiftedMs)) endLabelShiftedMs = endShiftedMs - 1;

          (vacationsByEmployee[empId] = vacationsByEmployee[empId] || []).push({
            taskId: task.id ?? null,
            startDay,
            endDayExclusive,
            startLabel: fmt(startShiftedMs),
            endLabel: fmt(endLabelShiftedMs),
          });
        }

        for (const empId of Object.keys(vacationsByEmployee)) {
          vacationsByEmployee[empId].sort(
            (a, b) => (a.startDay || 0) - (b.startDay || 0)
          );
        }

        return vacationsByEmployee;
      }
    );
  }

  function peekVacationsForMonth(monthKey) {
    const entry = peekCache(`pyrus:vacations:${monthKey}`);
    return entry && entry.value ? entry.value : null;
  }

  return { getVacationsForMonth, peekVacationsForMonth, applyCreated, applyDeleted };
}
