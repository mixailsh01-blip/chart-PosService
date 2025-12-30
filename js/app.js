// app.js
// Главный модуль SPA для графика смен L1/L2
// Чистый vanilla JS.

/**
 * Основные сущности:
 * - Авторизация через n8n /graph (type: "auth")
 * - Pyrus API через n8n /graph (type: "pyrus_api")
 * - Кеширование данных смен в памяти
 * - UI: таблица, ховер строки, анимация ячеек, компактный поповер смены
 * - Система прав доступа: edit/view для L1 и L2
 */

let GRAPH_HOOK_URL = "https://jolikcisout.beget.app/webhook/pyrus/graph";
const MAX_DAYS_IN_MONTH = 31;
let LOCAL_TZ_OFFSET_MIN = 4 * 60; // GMT+4

// -----------------------------
// Конфиг вкладок (линий)
// -----------------------------
let LINE_KEYS_IN_UI_ORDER = ["ALL", "OP", "OV", "L1", "L2", "AI", "OU"];
let LINE_LABELS = { ALL: "ВСЕ", OP: "OP", OV: "OV", L1: "L1", L2: "L2", AI: "AI", OU: "OU" };

// Жёсткая привязка department_id -> вкладка
let LINE_DEPT_IDS = {
  L1: [108368027],
  L2: [108368026, 171248779, 171248780],
  OV: [80208117],
  OP: [108368021, 157753518, 157753516], // важно: порядок групп
  OU: [108368030],
  AI: [166353950],
};

// Руководители/учредители (всегда сверху во "ВСЕ")
let TOP_MANAGEMENT_IDS = [1167305, 314287]; // Лузин, Сухачев

// Pyrus: значение каталога "Линия/Отдел" (field id=1) в форме явок
let PYRUS_LINE_ITEM_ID = {
  L2: 157816613,
  L1: 165474029,
  OV: 157816614,
  OU: 157816622,
  AI: 168065907,
  OP: 157816621,
};

function resolvePyrusLineItemIdByDepartmentId(deptId) {
  if (deptId == null) return null;
  if (LINE_DEPT_IDS.L2.includes(deptId)) return PYRUS_LINE_ITEM_ID.L2;
  if (LINE_DEPT_IDS.L1.includes(deptId)) return PYRUS_LINE_ITEM_ID.L1;
  if (LINE_DEPT_IDS.OV.includes(deptId)) return PYRUS_LINE_ITEM_ID.OV;
  if (LINE_DEPT_IDS.OU.includes(deptId)) return PYRUS_LINE_ITEM_ID.OU;
  if (LINE_DEPT_IDS.AI.includes(deptId)) return PYRUS_LINE_ITEM_ID.AI;
  if (LINE_DEPT_IDS.OP.includes(deptId)) return PYRUS_LINE_ITEM_ID.OP;
  return null;
}

// Порядок групп (department_id) для сортировки внутри вкладок
let DEPT_ORDER_BY_LINE = {
  L2: LINE_DEPT_IDS.L2.slice(),
  OP: LINE_DEPT_IDS.OP.slice(),
};


// Универсальный helper для n8n-обёртки Pyrus { success, data }
function unwrapPyrusData(raw) {
  if (
    raw &&
    typeof raw === "object" &&
    Object.prototype.hasOwnProperty.call(raw, "data") &&
    Object.prototype.hasOwnProperty.call(raw, "success")
  ) {
    return raw.data;
  }
  return raw;
}

// -----------------------------
// Глобальное состояние
// -----------------------------

const state = {
  auth: {
    user: null,
    permissions: {
      ALL: "view",
      OP: "view",
      OV: "view",
      OU: "view",
      AI: "view",
      L1: "view",
      L2: "view",
    },
  },
  ui: {
    currentLine: "ALL",
    theme: "dark",
    isScheduleCached: false,
  },
  quickMode: {
    enabled: false,
    templateId: null,
    timeFrom: "",
    timeTo: "",
    amount: "",
  },
  employeesByLine: {
    ALL: [],
    OP: [],
    OV: [],
    L1: [],
    L2: [],
    AI: [],
    OU: [],
  },
  shiftTemplatesByLine: {
    ALL: [],
    OP: [],
    OV: [],
    L1: [],
    L2: [],
    AI: [],
    OU: [],
  },
  scheduleByLine: {
    ALL: { monthKey: null, days: [], rows: [] },
    OP: { monthKey: null, days: [], rows: [] },
    OV: { monthKey: null, days: [], rows: [] },
    L1: { monthKey: null, days: [], rows: [] },
    L2: { monthKey: null, days: [], rows: [] },
    AI: { monthKey: null, days: [], rows: [] },
    OU: { monthKey: null, days: [], rows: [] },
  },
  originalScheduleByLine: {
    L1: { monthKey: null, days: [], rows: [] },
    L2: { monthKey: null, days: [], rows: [] },
  },
  localChanges: {},
  changeHistory: [],
  monthMeta: {
    year: null,
    monthIndex: null,
  },
  vacationsByEmployee: {},
  employeeFiltersByLine: {
    ALL: [],
    OP: [],
    OV: [],
    L1: [],
    L2: [],
    AI: [],
    OU: [],
  },
};

const scheduleCacheByLine = {
  L1: Object.create(null),
  L2: Object.create(null),
};

let STORAGE_KEYS = {
  localChanges: "sm1_local_changes",
  changeHistory: "sm1_change_history",
  theme: "sm1_theme_preference",
  currentLine: "sm1_current_line",
  employeeFilters: "sm1_employee_filters",
  cachedEmployees: "sm1_cached_employees",
  cachedShiftTemplates: "sm1_cached_shift_templates",
  cachedSchedulePrefix: "sm1_cached_schedule_",
};

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// -----------------------------
// Проверка прав доступа
// -----------------------------

function canEditLine(line) {
  if (state.ui.isScheduleCached) return false;
  const permission = state.auth.permissions[line] || state.auth.permissions.ALL;
  return permission === "edit";
}

function canViewLine(line) {
  const permission = state.auth.permissions[line] || state.auth.permissions.ALL;
  return permission === "view" || permission === "edit";
}


// -----------------------------
// Персистентная авторизация (localStorage + cookie)
// -----------------------------

let AUTH_STORAGE_KEY = "sm_graph_auth_v1";
let AUTH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней

function setCookie(name, value, days) {
  try {
    const expires = new Date(Date.now() + days * 86400000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  } catch (_) {}
}

function getCookie(name) {
  try {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()\[\]\\\/\+^]/g, '\\$&') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  } catch (_) {
    return null;
  }
}

function clearCookie(name) {
  try {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
  } catch (_) {}
}

function saveAuthCache(login) {
  // пароль не сохраняем
  const payload = {
    savedAt: Date.now(),
    login: login || "",
    user: state.auth.user || null,
    permissions: state.auth.permissions || null,
  };
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {}
  // Дублируем в cookie (минимальный объём) — на случай очистки localStorage
  setCookie(AUTH_STORAGE_KEY, JSON.stringify(payload), 7);
}

function loadAuthCache() {
  let raw = null;
  try {
    raw = localStorage.getItem(AUTH_STORAGE_KEY);
  } catch (_) {}
  if (!raw) raw = getCookie(AUTH_STORAGE_KEY);
  if (!raw) return null;

  try {
    const data = JSON.parse(raw);
    if (!data || !data.savedAt) return null;
    if (Date.now() - data.savedAt > AUTH_TTL_MS) return null;
    return data;
  } catch (_) {
    return null;
  }
}

function clearAuthCache() {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch (_) {}
  clearCookie(AUTH_STORAGE_KEY);
}

function applyAuthCache(data) {
  if (!data) return false;
  state.auth.user = data.user || null;
  state.auth.permissions = data.permissions || state.auth.permissions;
  // гарантируем ключи вкладок
  for (const k of ["ALL","OP","OV","OU","AI","L1","L2"]) {
    if (!Object.prototype.hasOwnProperty.call(state.auth.permissions, k)) {
      state.auth.permissions[k] = state.auth.permissions.ALL || "view";
    }
  }
  const login = (data.login || state.auth.user?.login || "").trim();
  if (currentUserLabelEl) {
    currentUserLabelEl.textContent = `${state.auth.user?.name || ""}${login ? " (" + login + ")" : ""}`;
  }
  // сохраняем сессию независимо от наличия UI-элементов
  if (login || state.auth.user?.login) saveAuthCache(login);

  return true;
}

function getCurrentLinePermission() {
  return state.auth.permissions[state.ui.currentLine];
}

// -----------------------------
// Утилиты времени
// -----------------------------

// Нормализация времени к формату HH:MM.
// Принимает также "2:00", "2", "02", "14.30" и т.п.
function normalizeTimeHHMM(raw) {
  if (raw == null) return "";
  const s = String(raw).trim().replace(".", ":");
  if (!s) return "";

  const m = s.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return s;

  const hh = String(parseInt(m[1], 10)).padStart(2, "0");
  const mm = String(parseInt(m[2] || "0", 10)).padStart(2, "0");
  return `${hh}:${mm}`;
}

function parseShiftTimeRangeString(raw) {
  if (!raw || typeof raw !== "string") return null;
  const cleaned = raw.trim().replace(/\s+/g, "");
  const [startRaw, endRaw] = cleaned.split("-");
  if (!startRaw || !endRaw) return null;

  const norm = (part) => {
    const withColon = part.replace(".", ":");
    const [hStr, mStr = "00"] = withColon.split(":");
    const h = String(parseInt(hStr, 10)).padStart(2, "0");
    const m = String(parseInt(mStr, 10)).padStart(2, "0");
    return `${h}:${m}`;
  };

  return { start: norm(startRaw), end: norm(endRaw) };
}

function addMinutesLocal(baseMinutes, delta) {
  let total = baseMinutes + delta;
  let dayShift = 0;
  while (total < 0) {
    total += 24 * 60;
    dayShift -= 1;
  }
  while (total >= 24 * 60) {
    total -= 24 * 60;
    dayShift += 1;
  }
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return { time: `${hh}:${mm}`, dayShift };
}

function convertUtcStartToLocalRange(utcIsoString, durationMinutes) {
  if (!utcIsoString || typeof utcIsoString !== "string") return null;
  const startUtc = new Date(utcIsoString);
  if (Number.isNaN(startUtc.getTime())) return null;

  const startLocalMs =
    startUtc.getTime() + LOCAL_TZ_OFFSET_MIN * 60 * 1000;
  const startLocalDate = new Date(startLocalMs);

  const startHH = String(startLocalDate.getUTCHours()).padStart(2, "0");
  const startMM = String(startLocalDate.getUTCMinutes()).padStart(2, "0");
  const startLocal = `${startHH}:${startMM}`;

  const startMinutes =
    startLocalDate.getUTCHours() * 60 + startLocalDate.getUTCMinutes();
  const { time: endLocal } = addMinutesLocal(
    startMinutes,
    durationMinutes || 0
  );

  const y = startLocalDate.getUTCFullYear();
  const m = String(startLocalDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(startLocalDate.getUTCDate()).padStart(2, "0");

  return {
    localDateKey: `${y}-${m}-${d}`,
    startLocal,
    endLocal,
  };
}

function formatShiftTimeForCell(startLocal, endLocal) {
  return { start: startLocal, end: endLocal };
}

function parseTimeToMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== "string") return null;
  const [hh, mm] = hhmm.split(":").map((p) => Number(p));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

function computeDurationMinutes(startLocal, endLocal) {
  const start = parseTimeToMinutes(startLocal);
  const end = parseTimeToMinutes(endLocal);
  if (start == null || end == null) return null;
  let diff = end - start;
  if (diff <= 0) diff += 24 * 60;
  return diff;
}

function convertLocalRangeToUtcWithMeta(year, monthIndex, day, startLocal, endLocal) {
  try {
    const durationMinutes = computeDurationMinutes(startLocal, endLocal);
    if (durationMinutes == null) return null;

    const y = Number(year);
    const m = Number(monthIndex);
    const d = Number(day);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;

    // Стартовое локальное время (HH:MM)
    const startMin = parseTimeToMinutes(startLocal);
    if (startMin == null) return null;
    const hhNum = Math.floor(startMin / 60);
    const mmNum = startMin % 60;

    const offsetMs = LOCAL_TZ_OFFSET_MIN * 60 * 1000;
    const baseUtcMs = Date.UTC(y, m, d, hhNum, mmNum);
    if (!Number.isFinite(baseUtcMs)) return null;

    const startUtcMs = baseUtcMs - offsetMs;
    const endUtcMs = startUtcMs + durationMinutes * 60 * 1000;

    const startDate = new Date(startUtcMs);
    const endDate = new Date(endUtcMs);
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
      return null;
    }

    return {
      durationMinutes,
      startUtcIso: startDate.toISOString(),
      endUtcIso: endDate.toISOString(),
    };
  } catch (e) {
    console.warn("convertLocalRangeToUtcWithMeta: invalid time value", {
      year,
      monthIndex,
      day,
      startLocal,
      endLocal,
      error: String(e && e.message ? e.message : e),
    });
    return null;
  }
}

// Backwards-compatible wrapper.
function convertLocalRangeToUtc(day, startLocal, endLocal) {
  let { year, monthIndex } = state.monthMeta || {};
  if (!Number.isFinite(Number(year)) || !Number.isFinite(Number(monthIndex))) {
    const now = new Date();
    year = now.getFullYear();
    monthIndex = now.getMonth();
  }
  return convertLocalRangeToUtcWithMeta(year, monthIndex, day, startLocal, endLocal);
}

// -----------------------------
// API-слой
// -----------------------------

async function callGraphApi(type, payload) {
  if (!type) {
    throw new Error("callGraphApi: не указан тип хука");
  }

  const res = await fetch(GRAPH_HOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, ...payload }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Ошибка HTTP ${res.status}: ${res.statusText || ""}\n${text}`
    );
  }

  return res.json();
}

async function auth(login, password) {
  const result = await callGraphApi("auth", { login, password });

  if (!result || result.status !== "ACCESS_GRANTED") {
    throw new Error("Доступ запрещён (status != ACCESS_GRANTED)");
  }

  state.auth.user = result.user || null;
  state.auth.permissions = result.permissions || { ALL: "view", OP: "view", OV: "view", OU: "view", AI: "view", L1: "view", L2: "view" };
  // гарантируем ключи вкладок
  for (const k of ["ALL","OP","OV","OU","AI","L1","L2"]) {
    if (!Object.prototype.hasOwnProperty.call(state.auth.permissions, k)) {
      state.auth.permissions[k] = state.auth.permissions.ALL || "view";
    }
  }
  return result;
}

async function pyrusApi(path, method = "GET", body = null) {
  const payload = { path, method };
  if (body) payload.body = body;
  return callGraphApi("pyrus_api", payload);
}

// -----------------------------
// Производственный календарь РФ (isdayoff.ru) — помесячно, с кэшем и фолбеком на СБ/ВС
// -----------------------------
let PROD_CAL_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней


// -----------------------------
// Конфигурация (multi-org)
// -----------------------------

// Дефолты = текущие "зашитые" значения (проект работает даже без config.json)
const DEFAULT_APP_CONFIG = {
  graphHookUrl: GRAPH_HOOK_URL,
  timezone: { localOffsetMin: LOCAL_TZ_OFFSET_MIN },
  ui: {
    lines: {
      order: LINE_KEYS_IN_UI_ORDER,
      labels: LINE_LABELS,
    },
  },
  departments: {
    lineDeptIds: LINE_DEPT_IDS,
    orderByLine: DEPT_ORDER_BY_LINE,
  },
  management: { topManagementIds: TOP_MANAGEMENT_IDS },
  pyrusLineItemIdByLine: PYRUS_LINE_ITEM_ID,
  storage: {
    keys: STORAGE_KEYS,
    auth: { key: AUTH_STORAGE_KEY, ttlMs: AUTH_TTL_MS },
  },
  calendar: {
    prodCal: { ttlMs: PROD_CAL_TTL_MS },
  },
};

let APP_CONFIG = DEFAULT_APP_CONFIG;

function deepMerge(target, src) {
  if (!src || typeof src !== "object") return target;
  for (const key of Object.keys(src)) {
    const v = src[key];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      if (!target[key] || typeof target[key] !== "object") target[key] = {};
      deepMerge(target[key], v);
    } else {
      target[key] = v;
    }
  }
  return target;
}

async function loadAppConfig() {
  try {
    const res = await fetch("config.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`config.json HTTP ${res.status}`);
    const cfg = await res.json();
    APP_CONFIG = deepMerge(JSON.parse(JSON.stringify(DEFAULT_APP_CONFIG)), cfg);
  } catch (e) {
    console.warn("Не удалось загрузить config.json, используем дефолты.", e);
    APP_CONFIG = DEFAULT_APP_CONFIG;
  }
  window.APP_CONFIG = APP_CONFIG;
  applyAppConfig(APP_CONFIG);
  return APP_CONFIG;
}

// Применяем конфиг к переменным/маппингам, используемым в коде
function applyAppConfig(cfg) {
  GRAPH_HOOK_URL = cfg.graphHookUrl || GRAPH_HOOK_URL;
  LOCAL_TZ_OFFSET_MIN = (cfg.timezone && typeof cfg.timezone.localOffsetMin === "number")
    ? cfg.timezone.localOffsetMin
    : LOCAL_TZ_OFFSET_MIN;

  // UI: порядок вкладок/лейблы
  if (cfg.ui && cfg.ui.lines) {
    if (Array.isArray(cfg.ui.lines.order) && cfg.ui.lines.order.length) {
      LINE_KEYS_IN_UI_ORDER = cfg.ui.lines.order;
    }
    if (cfg.ui.lines.labels && typeof cfg.ui.lines.labels === "object") {
      LINE_LABELS = cfg.ui.lines.labels;
    }
  }

  // Departments / линии
  if (cfg.departments) {
    if (cfg.departments.lineDeptIds) LINE_DEPT_IDS = cfg.departments.lineDeptIds;
    if (cfg.departments.orderByLine) DEPT_ORDER_BY_LINE = cfg.departments.orderByLine;
  }

  // Management
  if (cfg.management && Array.isArray(cfg.management.topManagementIds)) {
    TOP_MANAGEMENT_IDS = cfg.management.topManagementIds;
  }

  // Pyrus line item ids
  if (cfg.pyrusLineItemIdByLine && typeof cfg.pyrusLineItemIdByLine === "object") {
    PYRUS_LINE_ITEM_ID = cfg.pyrusLineItemIdByLine;
  }

  // Storage
  if (cfg.storage) {
    if (cfg.storage.keys) STORAGE_KEYS = cfg.storage.keys;
    if (cfg.storage.auth) {
      if (typeof cfg.storage.auth.key === "string") AUTH_STORAGE_KEY = cfg.storage.auth.key;
      if (typeof cfg.storage.auth.ttlMs === "number") AUTH_TTL_MS = cfg.storage.auth.ttlMs;
    }
  }

  // Calendar
  if (cfg.calendar && cfg.calendar.prodCal) {
    if (typeof cfg.calendar.prodCal.ttlMs === "number") PROD_CAL_TTL_MS = cfg.calendar.prodCal.ttlMs;
  }
}


function prodCalCacheKey(year, monthIndex) {
  const mm = String(monthIndex + 1).padStart(2, "0");
  return `prodcal_ru_${year}-${mm}_pre1`;
}

function formatYmdForKey(year, monthIndex, day) {
  const mm = String(monthIndex + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function formatYmdCompact(year, monthIndex, day) {
  const mm = String(monthIndex + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}${mm}${dd}`;
}

async function loadProdCalendarForMonth(year, monthIndex) {
  const cacheKey = prodCalCacheKey(year, monthIndex);
  try {
    const cachedRaw = localStorage.getItem(cacheKey);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (cached && cached.fetchedAt && (Date.now() - cached.fetchedAt) < PROD_CAL_TTL_MS && cached.dayTypeByDay) {
        return cached;
      }
    }
  } catch (_) {
    // ignore cache errors
  }

  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const date1 = formatYmdCompact(year, monthIndex, 1);
  const date2 = formatYmdCompact(year, monthIndex, lastDay);

  const url = `https://isdayoff.ru/api/getdata?date1=${date1}&date2=${date2}&cc=ru&pre=1`;

  const resp = await fetch(url, { method: "GET" });
  const text = (await resp.text()).trim();

  // Возможные ошибки: 100/101/199
  if (!resp.ok || /^(100|101|199)$/.test(text) || text.length < lastDay) {
    throw new Error(`ProdCal error: ${resp.status} ${text}`);
  }

  const dayTypeByDay = Object.create(null);
  for (let d = 1; d <= lastDay; d++) {
    const ch = text[d - 1];
    const code = ch === "0" ? 0 : ch === "1" ? 1 : ch === "2" ? 2 : null;
    if (code !== null) dayTypeByDay[d] = code;
  }

  const payload = {
    monthKey: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
    fetchedAt: Date.now(),
    dayTypeByDay,
  };

  try {
    localStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch (_) {
    // ignore storage quota / privacy mode
  }

  return payload;
}

// -----------------------------
// DOM-ссылки
// -----------------------------

const $ = (sel) => document.querySelector(sel);

const loginScreenEl = $("#login-screen");
const mainScreenEl = $("#main-screen");

const loginFormEl = $("#login-form");
const loginInputEl = $("#login-input");
const passwordInputEl = $("#password-input");
const loginErrorEl = $("#login-error");
const loginButtonEl = $("#login-button");

const currentUserLabelEl = $("#current-user-label");
const currentMonthLabelEl = $("#current-month-label");

const lineTabsEl = $("#line-tabs");
const btnPrevMonthEl = $("#btn-prev-month");
const btnNextMonthEl = $("#btn-next-month");
const btnThemeToggleEl = $("#btn-theme-toggle");
const btnLogoutEl = $("#btn-logout");
const btnSavePyrusEl = $("#btn-save-pyrus");
const btnMobileToolbarEl = $("#btn-mobile-toolbar");
const btnMobileToolbarCloseEl = $("#btn-mobile-toolbar-close");

const scheduleRootEl = $("#schedule-root");
const quickTemplateSelectEl = $("#quick-template-select");
const quickTimeFromInputEl = $("#quick-time-from");
const quickTimeToInputEl = $("#quick-time-to");
const quickAmountInputEl = $("#quick-amount");
const quickModeToggleEl = $("#quick-mode-toggle");
const changeLogListEl = $("#change-log-list");
const btnClearHistoryEl = $("#btn-clear-history");

// поповер смены
let shiftPopoverEl = null;
let shiftPopoverBackdropEl = null;
let shiftPopoverKeydownHandler = null;
let employeeFilterPopoverEl = null;
let employeeFilterPopoverBackdropEl = null;
let employeeFilterPopoverKeydownHandler = null;
let employeeFilterPopoverTitleEl = null;
let employeeFilterPopoverMetaEl = null;
let employeeFilterPopoverListEl = null;
let employeeFilterPopoverControlsEl = null;

// -----------------------------
// Инициализация
// -----------------------------

function init() {
  resetLocalEditingState();
  initTheme();
  loadCurrentLinePreference();
  loadEmployeeFilters();
  initMonthMetaToToday();
  bindLoginForm();

  // Автовосстановление сессии (без повторного ввода пароля)
  const cachedAuth = loadAuthCache();
  if (cachedAuth && applyAuthCache(cachedAuth)) {
    loginScreenEl?.classList.add("hidden");
    mainScreenEl?.classList.remove("hidden");
  }

  bindTopBarButtons();
  bindHistoryControls();
  createShiftPopover();
  createEmployeeFilterPopover();
  renderChangeLog();

  // Если восстановили сессию — загружаем данные как после логина
  if (state.auth.user && mainScreenEl && !mainScreenEl.classList.contains("hidden")) {
    loadInitialData().catch((err) => {
      console.error("Auto-login loadInitialData error:", err);
      clearAuthCache();
      mainScreenEl.classList.add("hidden");
      loginScreenEl?.classList.remove("hidden");
      if (loginErrorEl) loginErrorEl.textContent = "Сессия истекла — войдите снова";
    });
  }
}

function getCurrentLineTemplates() {
  return state.shiftTemplatesByLine[state.ui.currentLine] || [];
}

function initMonthMetaToToday() {
  const now = new Date();
  state.monthMeta.year = now.getFullYear();
  state.monthMeta.monthIndex = now.getMonth();
  updateMonthLabel();
}

function updateMonthLabel() {
  const { year, monthIndex } = state.monthMeta;
  const monthNames = [
    "Январь",
    "Февраль",
    "Март",
    "Апрель",
    "Май",
    "Июнь",
    "Июль",
    "Август",
    "Сентябрь",
    "Октябрь",
    "Ноябрь",
    "Декабрь",
  ];
  currentMonthLabelEl.textContent = `${monthNames[monthIndex]} ${year}`;
}

function resetLocalEditingState() {
  state.localChanges = {};
  state.changeHistory = [];

  try {
    localStorage.removeItem(STORAGE_KEYS.localChanges);
    localStorage.removeItem(STORAGE_KEYS.changeHistory);
  } catch (err) {
    console.warn("Не удалось сбросить локальные данные", err);
  }
}

function persistLocalChanges() {
  try {
    localStorage.setItem(STORAGE_KEYS.localChanges, JSON.stringify(state.localChanges));
  } catch (err) {
    console.warn("Не удалось сохранить локальные смены", err);
  }
}

function persistChangeHistory() {
  try {
    localStorage.setItem(
      STORAGE_KEYS.changeHistory,
      JSON.stringify(state.changeHistory.slice(0, 300))
    );
  } catch (err) {
    console.warn("Не удалось сохранить историю", err);
  }
}

function initTheme() {
  const storedTheme = localStorage.getItem(STORAGE_KEYS.theme);
  const preferredTheme = storedTheme === "light" ? "light" : "dark";
  applyTheme(preferredTheme);

  if (btnThemeToggleEl) {
    btnThemeToggleEl.addEventListener("click", () => {
      const next = state.ui.theme === "dark" ? "light" : "dark";
      applyTheme(next);
    });
  }
}

function applyTheme(theme) {
  state.ui.theme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(STORAGE_KEYS.theme, theme);
  updateThemeToggleUI();

  // Обновление цветов при смене темы
  if (typeof ShiftColors !== 'undefined' && ShiftColors.applyTheme) {
    ShiftColors.applyTheme(theme);
  }
}

function updateThemeToggleUI() {
  if (!btnThemeToggleEl) return;
  const isDark = state.ui.theme === "dark";
  btnThemeToggleEl.textContent = isDark ? "🌙 Тема" : "☀️ Тема";
  btnThemeToggleEl.setAttribute(
    "aria-label",
    isDark ? "Включена тёмная тема" : "Включена светлая тема"
  );
}

function loadCurrentLinePreference() {
  try {
    const storedLine = localStorage.getItem(STORAGE_KEYS.currentLine);
    if (storedLine && LINE_KEYS_IN_UI_ORDER.includes(storedLine)) {
      state.ui.currentLine = storedLine;
    }
  } catch (_) {
    // ignore storage quota / privacy mode
  }
}

function persistCurrentLinePreference() {
  try {
    localStorage.setItem(STORAGE_KEYS.currentLine, state.ui.currentLine);
  } catch (_) {
    // ignore storage quota / privacy mode
  }
}

function getMonthKey(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function loadCachedEmployees() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.cachedEmployees);
    if (!raw) return false;
    const cached = JSON.parse(raw);
    if (!cached || typeof cached !== "object") return false;

    const employeesByLine = cached.employeesByLine;
    if (!employeesByLine || typeof employeesByLine !== "object") return false;

    for (const key of Object.keys(state.employeesByLine)) {
      const list = employeesByLine[key];
      state.employeesByLine[key] = Array.isArray(list) ? list : [];
    }
    return true;
  } catch (err) {
    console.warn("Не удалось загрузить кэш сотрудников", err);
    return false;
  }
}

function persistCachedEmployees() {
  try {
    localStorage.setItem(
      STORAGE_KEYS.cachedEmployees,
      JSON.stringify({
        fetchedAt: Date.now(),
        employeesByLine: state.employeesByLine,
      })
    );
  } catch (err) {
    console.warn("Не удалось сохранить кэш сотрудников", err);
  }
}

function loadCachedShiftTemplates() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.cachedShiftTemplates);
    if (!raw) return false;
    const cached = JSON.parse(raw);
    if (!cached || typeof cached !== "object") return false;

    const templatesByLine = cached.shiftTemplatesByLine;
    if (!templatesByLine || typeof templatesByLine !== "object") return false;

    for (const key of Object.keys(state.shiftTemplatesByLine)) {
      const list = templatesByLine[key];
      state.shiftTemplatesByLine[key] = Array.isArray(list) ? list : [];
    }

    if (typeof ShiftColors !== "undefined" && ShiftColors.initialize) {
      ShiftColors.initialize(state.shiftTemplatesByLine, state.ui.theme);
    }
    return true;
  } catch (err) {
    console.warn("Не удалось загрузить кэш шаблонов смен", err);
    return false;
  }
}

function persistCachedShiftTemplates() {
  try {
    localStorage.setItem(
      STORAGE_KEYS.cachedShiftTemplates,
      JSON.stringify({
        fetchedAt: Date.now(),
        shiftTemplatesByLine: state.shiftTemplatesByLine,
      })
    );
  } catch (err) {
    console.warn("Не удалось сохранить кэш шаблонов смен", err);
  }
}

function loadCachedScheduleForMonth(year, monthIndex) {
  try {
    const monthKey = getMonthKey(year, monthIndex);
    const raw = localStorage.getItem(`${STORAGE_KEYS.cachedSchedulePrefix}${monthKey}`);
    if (!raw) return false;
    const cached = JSON.parse(raw);
    if (!cached || typeof cached !== "object") return false;
    if (!cached.scheduleByLine || typeof cached.scheduleByLine !== "object") return false;

    state.scheduleByLine = cached.scheduleByLine;
    state.originalScheduleByLine = deepClone(cached.scheduleByLine);
    state.vacationsByEmployee = cached.vacationsByEmployee || {};
    state.ui.isScheduleCached = true;

    applyLocalChangesToSchedule();
    renderScheduleCurrentLine();
    return true;
  } catch (err) {
    console.warn("Не удалось загрузить кэш графика", err);
    return false;
  }
}

function persistCachedScheduleForMonth(year, monthIndex) {
  try {
    const monthKey = getMonthKey(year, monthIndex);
    localStorage.setItem(
      `${STORAGE_KEYS.cachedSchedulePrefix}${monthKey}`,
      JSON.stringify({
        fetchedAt: Date.now(),
        scheduleByLine: state.scheduleByLine,
        vacationsByEmployee: state.vacationsByEmployee,
      })
    );
  } catch (err) {
    console.warn("Не удалось сохранить кэш графика", err);
  }
}

function loadEmployeeFilters() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.employeeFilters);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;

    for (const key of Object.keys(state.employeeFiltersByLine)) {
      const list = parsed[key];
      if (Array.isArray(list)) {
        state.employeeFiltersByLine[key] = list
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id));
      }
    }
  } catch (err) {
    console.warn("Не удалось загрузить фильтры сотрудников", err);
  }
}

function persistEmployeeFilters() {
  try {
    localStorage.setItem(
      STORAGE_KEYS.employeeFilters,
      JSON.stringify(state.employeeFiltersByLine)
    );
  } catch (err) {
    console.warn("Не удалось сохранить фильтры сотрудников", err);
  }
}

function normalizeHiddenEmployeeIds(line, rows) {
  const validIds = new Set(rows.map((row) => row.employeeId));
  const current = state.employeeFiltersByLine[line] || [];
  const next = current.filter((id) => validIds.has(id));
  if (next.length !== current.length) {
    state.employeeFiltersByLine[line] = next;
    persistEmployeeFilters();
  }
  return new Set(next);
}

function setHiddenEmployeeIds(line, ids) {
  state.employeeFiltersByLine[line] = Array.from(ids);
  persistEmployeeFilters();
}

function createEmployeeFilterPopover() {
  if (employeeFilterPopoverEl) return;

  employeeFilterPopoverBackdropEl = document.createElement("div");
  employeeFilterPopoverBackdropEl.className = "employee-filter-popover-backdrop hidden";

  employeeFilterPopoverEl = document.createElement("div");
  employeeFilterPopoverEl.className = "employee-filter-popover hidden";

  const header = document.createElement("div");
  header.className = "employee-filter-popover-header";

  employeeFilterPopoverTitleEl = document.createElement("div");
  employeeFilterPopoverTitleEl.className = "employee-filter-header";
  employeeFilterPopoverTitleEl.textContent = "Фильтр сотрудников";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "employee-filter-close";
  closeBtn.textContent = "✕";
  closeBtn.setAttribute("aria-label", "Закрыть фильтр сотрудников");

  header.appendChild(employeeFilterPopoverTitleEl);
  header.appendChild(closeBtn);

  employeeFilterPopoverMetaEl = document.createElement("div");
  employeeFilterPopoverMetaEl.className = "employee-filter-meta";

  employeeFilterPopoverListEl = document.createElement("div");
  employeeFilterPopoverListEl.className = "employee-filter-list";

  employeeFilterPopoverControlsEl = document.createElement("div");
  employeeFilterPopoverControlsEl.className = "employee-filter-controls";

  employeeFilterPopoverEl.appendChild(header);
  employeeFilterPopoverEl.appendChild(employeeFilterPopoverMetaEl);
  employeeFilterPopoverEl.appendChild(employeeFilterPopoverListEl);
  employeeFilterPopoverEl.appendChild(employeeFilterPopoverControlsEl);

  employeeFilterPopoverBackdropEl.appendChild(employeeFilterPopoverEl);
  document.body.appendChild(employeeFilterPopoverBackdropEl);

  const closeHandler = () => closeEmployeeFilterPopover();
  employeeFilterPopoverBackdropEl.addEventListener("click", (event) => {
    if (event.target === employeeFilterPopoverBackdropEl) {
      closeHandler();
    }
  });
  closeBtn.addEventListener("click", closeHandler);
}

function closeEmployeeFilterPopover() {
  if (!employeeFilterPopoverEl || !employeeFilterPopoverBackdropEl) return;
  employeeFilterPopoverBackdropEl.classList.add("hidden");
  employeeFilterPopoverEl.classList.add("hidden");
  if (employeeFilterPopoverKeydownHandler) {
    document.removeEventListener("keydown", employeeFilterPopoverKeydownHandler);
    employeeFilterPopoverKeydownHandler = null;
  }
}

function openEmployeeFilterPopover({
  line,
  rows,
  hiddenEmployeeIds,
  table,
  emptyRow,
  onUpdateButton,
}) {
  if (!employeeFilterPopoverEl || !employeeFilterPopoverBackdropEl) return;

  employeeFilterPopoverListEl.innerHTML = "";
  employeeFilterPopoverControlsEl.innerHTML = "";

  const masterLabel = document.createElement("label");
  masterLabel.className = "employee-filter-item employee-filter-master";
  const masterCheckbox = document.createElement("input");
  masterCheckbox.type = "checkbox";
  const masterText = document.createElement("span");
  masterText.textContent = "Все сотрудники";
  masterLabel.appendChild(masterCheckbox);
  masterLabel.appendChild(masterText);
  employeeFilterPopoverListEl.appendChild(masterLabel);

  const itemCheckboxes = [];

  for (const row of rows) {
    const itemLabel = document.createElement("label");
    itemLabel.className = "employee-filter-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !hiddenEmployeeIds.has(row.employeeId);
    checkbox.dataset.employeeId = String(row.employeeId);

    const name = document.createElement("span");
    name.textContent = row.employeeName;

    itemLabel.appendChild(checkbox);
    itemLabel.appendChild(name);
    employeeFilterPopoverListEl.appendChild(itemLabel);
    itemCheckboxes.push(checkbox);
  }

  const updateFilterUI = () => {
    const total = rows.length;
    const hiddenCount = hiddenEmployeeIds.size;
    const visibleCount = total - hiddenCount;
    masterCheckbox.checked = hiddenCount === 0;
    masterCheckbox.indeterminate = hiddenCount > 0 && hiddenCount < total;
    employeeFilterPopoverMetaEl.textContent = `Показано: ${visibleCount} из ${total}`;
    if (onUpdateButton) onUpdateButton();
  };

  masterCheckbox.addEventListener("change", () => {
    if (masterCheckbox.checked) {
      hiddenEmployeeIds.clear();
    } else {
      for (const row of rows) {
        hiddenEmployeeIds.add(row.employeeId);
      }
    }
    for (const checkbox of itemCheckboxes) {
      const id = Number(checkbox.dataset.employeeId);
      checkbox.checked = !hiddenEmployeeIds.has(id);
    }
    setHiddenEmployeeIds(line, hiddenEmployeeIds);
    updateFilterUI();
    applyEmployeeFilterToTable(table, hiddenEmployeeIds, emptyRow);
  });

  for (const checkbox of itemCheckboxes) {
    checkbox.addEventListener("change", () => {
      const id = Number(checkbox.dataset.employeeId);
      if (checkbox.checked) {
        hiddenEmployeeIds.delete(id);
      } else {
        hiddenEmployeeIds.add(id);
      }
      setHiddenEmployeeIds(line, hiddenEmployeeIds);
      updateFilterUI();
      applyEmployeeFilterToTable(table, hiddenEmployeeIds, emptyRow);
    });
  }

  const closeControl = document.createElement("button");
  closeControl.type = "button";
  closeControl.className = "employee-filter-close-action";
  closeControl.textContent = "Закрыть";
  closeControl.addEventListener("click", closeEmployeeFilterPopover);
  employeeFilterPopoverControlsEl.appendChild(closeControl);

  updateFilterUI();

  employeeFilterPopoverBackdropEl.classList.remove("hidden");
  employeeFilterPopoverEl.classList.remove("hidden");
  employeeFilterPopoverKeydownHandler = (event) => {
    if (event.key === "Escape") {
      closeEmployeeFilterPopover();
    }
  };
  document.addEventListener("keydown", employeeFilterPopoverKeydownHandler);
}

// -----------------------------
// События
// -----------------------------

function bindLoginForm() {
  const handleLogin = async (e) => {
    e.preventDefault();
    loginErrorEl.textContent = "";

    if (!loginFormEl) return;
    const btn = loginFormEl.querySelector("button[type=submit]") || loginButtonEl;
    if (btn) btn.disabled = true;

    const login = loginInputEl.value.trim();
    const password = passwordInputEl.value;

    try {
      const authResult = await auth(login, password);
      currentUserLabelEl.textContent = `${
        authResult.user?.name || ""
      } (${login})`;

      // кэшируем авторизацию, чтобы не логиниться после обновления страницы
      saveAuthCache(login);


      renderLineTabs();
      updateLineToggleUI();
      // если текущая вкладка недоступна — переключимся на первую доступную
      if (!canViewLine(state.ui.currentLine)) {
        const first = LINE_KEYS_IN_UI_ORDER.find((k) => canViewLine(k));
        if (first) state.ui.currentLine = first;
      }
      persistCurrentLinePreference();
      loginScreenEl.classList.add("hidden");
      mainScreenEl.classList.remove("hidden");

      await loadInitialData();
    } catch (err) {
      console.error("Auth error:", err);
      loginErrorEl.textContent = err.message || "Ошибка авторизации";
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  loginFormEl?.addEventListener("submit", handleLogin);
  loginButtonEl?.addEventListener("click", handleLogin);
}

function setCurrentLine(lineKey) {
  if (!canViewLine(lineKey)) return;
  state.ui.currentLine = lineKey;
  persistCurrentLinePreference();
  updateLineToggleUI();
  updateSaveButtonState();
  updateQuickModeForLine();
  renderQuickTemplateOptions();
  renderScheduleCurrentLine();
  if (typeof ShiftColors !== 'undefined' && ShiftColors.renderColorLegend) {
    ShiftColors.renderColorLegend(state.ui.currentLine);
  }
}

function renderLineTabs() {
  if (!lineTabsEl) return;
  lineTabsEl.innerHTML = "";
  for (const key of LINE_KEYS_IN_UI_ORDER) {
    if (!canViewLine(key)) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn toggle";
    btn.dataset.line = key;
    btn.textContent = LINE_LABELS[key] || key;
    btn.addEventListener("click", () => { document.body.classList.remove("mobile-toolbar-open"); setCurrentLine(key); });
    lineTabsEl.appendChild(btn);
  }
  updateLineToggleUI();
}

function bindTopBarButtons() {
  renderLineTabs();

  // Mobile bottom-sheet controls
  btnMobileToolbarEl?.addEventListener("click", () => {
    document.body.classList.toggle("mobile-toolbar-open");
  });
  btnMobileToolbarCloseEl?.addEventListener("click", () => {
    document.body.classList.remove("mobile-toolbar-open");
  });

  btnLogoutEl?.addEventListener("click", () => {
    clearAuthCache();
    state.auth.user = null;
    state.auth.permissions = { ALL: "view", OP: "view", OV: "view", OU: "view", AI: "view", L1: "view", L2: "view" };
    mainScreenEl?.classList.add("hidden");
    loginScreenEl?.classList.remove("hidden");
    if (loginErrorEl) loginErrorEl.textContent = "";
    updateLineToggleUI();
  });
btnPrevMonthEl.addEventListener("click", () => {
    const { year, monthIndex } = state.monthMeta;
    const date = new Date(Date.UTC(year, monthIndex, 1));
    date.setMonth(monthIndex - 1);
    state.monthMeta.year = date.getUTCFullYear();
    state.monthMeta.monthIndex = date.getUTCMonth();
    updateMonthLabel();
    reloadScheduleForCurrentMonth();
  });

  btnNextMonthEl.addEventListener("click", () => {
    const { year, monthIndex } = state.monthMeta;
    const date = new Date(Date.UTC(year, monthIndex, 1));
    date.setMonth(monthIndex + 1);
    state.monthMeta.year = date.getUTCFullYear();
    state.monthMeta.monthIndex = date.getUTCMonth();
    updateMonthLabel();
    reloadScheduleForCurrentMonth();
  });

  updateLineToggleUI();

  // Отображение легенды цветов при переключении линии
  if (typeof ShiftColors !== 'undefined' && ShiftColors.renderColorLegend) {
    ShiftColors.renderColorLegend(state.ui.currentLine);
  }

}

function updateLineToggleUI() {
  const line = state.ui.currentLine;
  if (!lineTabsEl) return;
  const buttons = lineTabsEl.querySelectorAll('button[data-line]');
  buttons.forEach((b) => {
    if (b.dataset.line === line) b.classList.add("active");
    else b.classList.remove("active");
  });
}


function bindHistoryControls() {
  if (btnClearHistoryEl) {
    btnClearHistoryEl.addEventListener("click", () => {
      state.changeHistory = [];
      persistChangeHistory();
      renderChangeLog();
    });
  }

  if (btnSavePyrusEl) {
    btnSavePyrusEl.addEventListener("click", handleSaveToPyrus);
  }
}

function initQuickAssignPanel() {
  renderQuickTemplateOptions();
  syncQuickPanelInputs();
  updateQuickModeToggleUI();

  quickTemplateSelectEl?.addEventListener("change", () => {
    const val = quickTemplateSelectEl.value;
    state.quickMode.templateId = val ? Number(val) : null;

    const tmpl = getCurrentLineTemplates().find(
      (t) => t.id === state.quickMode.templateId
    );
    if (tmpl?.timeRange) {
      state.quickMode.timeFrom = tmpl.timeRange.start;
      state.quickMode.timeTo = tmpl.timeRange.end;
      syncQuickPanelInputs();
    }
    if (tmpl && typeof tmpl.amount === "number") {
      state.quickMode.amount = tmpl.amount;
      syncQuickPanelInputs();
    }
  });

  quickTimeFromInputEl?.addEventListener("input", (e) => {
    state.quickMode.timeFrom = e.target.value;
  });

  quickTimeToInputEl?.addEventListener("input", (e) => {
    state.quickMode.timeTo = e.target.value;
  });

  quickAmountInputEl?.addEventListener("input", (e) => {
    state.quickMode.amount = e.target.value;
  });

  quickModeToggleEl?.addEventListener("click", () => {
    const currentLine = state.ui.currentLine;
    
    if (state.ui.isScheduleCached) {
      alert("Данные загружаются, редактирование временно недоступно.");
      return;
    }

    if (!canEditLine(currentLine)) {
      alert(`У вас нет прав на редактирование линии ${currentLine}`);
      return;
    }
    
    state.quickMode.enabled = !state.quickMode.enabled;
    updateQuickModeToggleUI();
  });
}

function renderQuickTemplateOptions() {
  if (!quickTemplateSelectEl) return;

  const currentLineTemplates = getCurrentLineTemplates();
  const prevSelected = state.quickMode.templateId;

  quickTemplateSelectEl.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Шаблон не выбран";
  quickTemplateSelectEl.appendChild(placeholder);

  currentLineTemplates.forEach((tmpl) => {
    const option = document.createElement("option");
    option.value = String(tmpl.id);
    const timeLabel = tmpl.timeRange
      ? ` (${tmpl.timeRange.start}–${tmpl.timeRange.end})`
      : "";
    option.textContent = `${tmpl.name}${timeLabel}`;
    quickTemplateSelectEl.appendChild(option);
  });

  const hasPrev = currentLineTemplates.some((t) => t.id === prevSelected);
  quickTemplateSelectEl.value = hasPrev ? String(prevSelected) : "";
  state.quickMode.templateId = hasPrev ? prevSelected : null;
}

function syncQuickPanelInputs() {
  if (quickTimeFromInputEl) {
    quickTimeFromInputEl.value = state.quickMode.timeFrom || "";
  }
  if (quickTimeToInputEl) {
    quickTimeToInputEl.value = state.quickMode.timeTo || "";
  }
  if (quickAmountInputEl) {
    quickAmountInputEl.value =
      state.quickMode.amount !== undefined && state.quickMode.amount !== null
        ? state.quickMode.amount
        : "";
  }
}

function updateQuickModeToggleUI() {
  if (!quickModeToggleEl) return;
  quickModeToggleEl.classList.toggle("active", state.quickMode.enabled);
  quickModeToggleEl.textContent = state.quickMode.enabled
    ? "Быстрое назначение: Вкл"
    : "Быстрое назначение";
}

function updateQuickModeForLine() {
  const currentLine = state.ui.currentLine;
  const canEdit = canEditLine(currentLine);
  const isCached = state.ui.isScheduleCached;
  
  if (!canEdit && state.quickMode.enabled) {
    state.quickMode.enabled = false;
    updateQuickModeToggleUI();
  }
  
  if (quickModeToggleEl) {
    quickModeToggleEl.disabled = !canEdit;
    quickModeToggleEl.title = canEdit 
      ? "Включить быстрое назначение смен"
      : isCached
      ? "Данные загружаются, редактирование временно недоступно"
      : `Нет прав на редактирование ${currentLine}`;
  }
  
  if (quickTemplateSelectEl) {
    quickTemplateSelectEl.disabled = !canEdit;
  }
  
  if (quickTimeFromInputEl) {
    quickTimeFromInputEl.disabled = !canEdit;
  }
  
  if (quickTimeToInputEl) {
    quickTimeToInputEl.disabled = !canEdit;
  }
  
  if (quickAmountInputEl) {
    quickAmountInputEl.disabled = !canEdit;
  }
}

function countChangesForLine(line) {
  const { year, monthIndex } = state.monthMeta;
  let count = 0;
  
  const prefix = `${line}-${year}-${monthIndex + 1}-`;
  for (const key in state.localChanges) {
    if (key.startsWith(prefix)) {
      count++;
    }
  }
  
  return count;
}

function updateSaveButtonState() {
  if (!btnSavePyrusEl) return;
  
  const currentLine = state.ui.currentLine;
  const canEdit = canEditLine(currentLine);
  const changesCount = countChangesForLine(currentLine);
  const isCached = state.ui.isScheduleCached;
  
  if (!canEdit) {
    btnSavePyrusEl.textContent = isCached
      ? `Данные загружаются (${currentLine})`
      : `Нет прав на ${currentLine}`;
    btnSavePyrusEl.disabled = true;
    btnSavePyrusEl.title = isCached
      ? "Сейчас отображается кэш, редактирование временно отключено."
      : `У вас только просмотр для линии ${currentLine}`;
  } else if (changesCount === 0) {
    btnSavePyrusEl.textContent = `Нет изменений (${currentLine})`;
    btnSavePyrusEl.disabled = true;
    btnSavePyrusEl.title = `Нет несохранённых изменений для линии ${currentLine}`;
  } else {
    btnSavePyrusEl.textContent = `Сохранить ${currentLine} (${changesCount})`;
    btnSavePyrusEl.disabled = false;
    btnSavePyrusEl.title = `Сохранить ${changesCount} изменений для линии ${currentLine}`;
  }
}

function getQuickModeShift(line) {
  const templates = state.shiftTemplatesByLine[line] || [];
  const tmpl = templates.find((t) => t.id === state.quickMode.templateId);

  let startLocal = state.quickMode.timeFrom;
  let endLocal = state.quickMode.timeTo;

  if ((!startLocal || !endLocal) && tmpl?.timeRange) {
    startLocal = tmpl.timeRange.start;
    endLocal = tmpl.timeRange.end;
  }

  let amount = state.quickMode.amount;
  if (amount === "" || amount === undefined || amount === null) {
    amount = tmpl?.amount ?? 0;
  }

  return {
    startLocal,
    endLocal,
    amount: Number(amount || 0),
    templateId: tmpl?.id ?? null,
    specialShortLabel: tmpl?.specialShortLabel || null,
  };
}

function resolveSpecialShortLabel(line, templateId) {
  if (!line || templateId == null) return null;
  const templates = state.shiftTemplatesByLine[line] || [];
  const tmpl = templates.find((t) => t.id === templateId);
  return tmpl?.specialShortLabel || null;
}

function logChange({
  action,
  line,
  employeeId,
  employeeName,
  day,
  previousShift,
  nextShift,
}) {
  const { year, monthIndex } = state.monthMeta;
  const date = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}`;
  const entry = {
    id: `${Date.now()}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    action,
    line,
    employeeId,
    employeeName,
    date,
    previousShift: previousShift
      ? {
          startLocal: previousShift.startLocal || "",
          endLocal: previousShift.endLocal || "",
          amount: Number(previousShift.amount || 0),
        }
      : null,
    nextShift: nextShift
      ? {
          startLocal: nextShift.startLocal || "",
          endLocal: nextShift.endLocal || "",
          amount: Number(nextShift.amount || 0),
        }
      : null,
  };

  state.changeHistory.unshift(entry);
  if (state.changeHistory.length > 300) {
    state.changeHistory.length = 300;
  }

  persistChangeHistory();
  renderChangeLog();
  updateSaveButtonState();
}

function shiftsEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const normalizeAmount = (val) => Number(val || 0);
  const normalizeTemplate = (val) => (val != null ? Number(val) : null);
  const normalizeIso = (iso) => {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? null : t;
  };

  const normDuration = (shift) => {
    if (shift?.durationMinutes != null) return Number(shift.durationMinutes);
    const duration = computeDurationMinutes(
      shift?.startLocal,
      shift?.endLocal
    );
    return duration == null ? null : duration;
  };

  return (
    (a.startLocal || "") === (b.startLocal || "") &&
    (a.endLocal || "") === (b.endLocal || "") &&
    normalizeAmount(a.amount) === normalizeAmount(b.amount) &&
    normalizeTemplate(a.templateId) === normalizeTemplate(b.templateId) &&
    normalizeIso(a.startUtcIso) === normalizeIso(b.startUtcIso) &&
    normalizeIso(a.endUtcIso) === normalizeIso(b.endUtcIso) &&
    normDuration(a) === normDuration(b)
  );
}

function buildPyrusChangesPayload(lineToSave = null) {
  const result = {
    create: { task: [] },
    deleted: { task: [] },
    edit: { task: [] },
  };

  const linesToProcess = lineToSave ? [lineToSave] : ["OP", "OV", "L1", "L2", "AI", "OU"];

  for (const line of linesToProcess) {
    const baseSched = state.originalScheduleByLine[line];
    const currentSched = state.scheduleByLine[line];
    if (!currentSched || !currentSched.days || !currentSched.rows) continue;

    const baseRowByEmployee = Object.create(null);
    if (baseSched && Array.isArray(baseSched.rows)) {
      for (const row of baseSched.rows) {
        baseRowByEmployee[row.employeeId] = row;
      }
    }

    currentSched.rows.forEach((row) => {
      const baseRow = baseRowByEmployee[row.employeeId];

      const employee = state.employeesByLine.ALL.find((e) => e.id === row.employeeId) || null;
      const departmentItemId = employee ? resolvePyrusLineItemIdByDepartmentId(employee.departmentId) : null;

      currentSched.days.forEach((day, idx) => {
        const baseShift = baseRow ? baseRow.shiftsByDay[idx] || null : null;
        const currentShift = row.shiftsByDay[idx] || null;

        if (!baseShift && !currentShift) return;

        if (!baseShift && currentShift) {
          const conversion =
            currentShift.startUtcIso && currentShift.durationMinutes != null
              ? {
                  startUtcIso: currentShift.startUtcIso,
                  durationMinutes: Number(currentShift.durationMinutes),
                }
              : convertLocalRangeToUtc(
                  day,
                  currentShift.startLocal,
                  currentShift.endLocal
                );
          if (!conversion) return;

          result.create.task.push({
            employee_id: row.employeeId,
            item_id: currentShift.templateId ?? null,
            start: conversion.startUtcIso,
            duration: conversion.durationMinutes,
            amount: Number(currentShift.amount || 0),
            department_item_id: departmentItemId,
          });
          return;
        }

        if (baseShift && !currentShift) {
          if (baseShift.taskId) {
            result.deleted.task.push({ task_id: baseShift.taskId });
          }
          return;
        }

        if (baseShift && currentShift && !shiftsEqual(baseShift, currentShift)) {
          const conversion =
            currentShift.startUtcIso && currentShift.durationMinutes != null
              ? {
                  startUtcIso: currentShift.startUtcIso,
                  durationMinutes: Number(currentShift.durationMinutes),
                }
              : convertLocalRangeToUtc(
                  day,
                  currentShift.startLocal,
                  currentShift.endLocal
                );
          if (!conversion) return;

          result.edit.task.push({
            task_id: baseShift.taskId,
            employee_id: row.employeeId,
            item_id: currentShift.templateId ?? baseShift.templateId ?? null,
            start: conversion.startUtcIso,
            duration: conversion.durationMinutes,
            amount: Number(currentShift.amount || 0),
            department_item_id: departmentItemId,
          });
        }
      });
    });
  }

  return result;
}

async function handleSaveToPyrus() {
  if (!btnSavePyrusEl) return;

  const currentLine = state.ui.currentLine;
  
  if (!canEditLine(currentLine)) {
    alert(`У вас нет прав на сохранение изменений для линии ${currentLine}`);
    return;
  }

  const payload = buildPyrusChangesPayload(currentLine);
  
  const hasChanges = 
    payload.create.task.length > 0 ||
    payload.deleted.task.length > 0 ||
    payload.edit.task.length > 0;
  
  if (!hasChanges) {
    alert(`Нет изменений для сохранения в линии ${currentLine}`);
    return;
  }
  
  btnSavePyrusEl.disabled = true;
  btnSavePyrusEl.textContent = "Сохранение...";

  try {
    const meta = {
      line: currentLine,
      month: state.monthMeta.monthIndex + 1,
      year: state.monthMeta.year,
    };
    
    await callGraphApi("pyrus_save", { changes: payload, meta });
    
    alert(`Изменения для линии ${currentLine} успешно отправлены в Pyrus.\n` +
          `Создано: ${payload.create.task.length}\n` +
          `Изменено: ${payload.edit.task.length}\n` +
          `Удалено: ${payload.deleted.task.length}`);
    
    state.originalScheduleByLine[currentLine] = deepClone(state.scheduleByLine[currentLine]);
    
    const { year, monthIndex } = state.monthMeta;
    const prefix = `${currentLine}-${year}-${monthIndex + 1}-`;
    for (const key in state.localChanges) {
      if (key.startsWith(prefix)) {
        delete state.localChanges[key];
      }
    }
    persistLocalChanges();
    
    updateSaveButtonState();
    
  } catch (err) {
    console.error("handleSaveToPyrus error", err);
    alert(`Не удалось отправить в Pyrus: ${err.message || err}`);
  } finally {
    btnSavePyrusEl.disabled = false;
    btnSavePyrusEl.textContent = "Сохранить в Pyrus";
  }
}

function renderChangeLog() {
  if (!changeLogListEl) return;

  changeLogListEl.innerHTML = "";

  if (!state.changeHistory.length) {
    changeLogListEl.textContent = "Пока нет локальных изменений";
    changeLogListEl.classList.add("change-log-empty");
    return;
  }

  changeLogListEl.classList.remove("change-log-empty");
  const actionLabels = {
    create: "Добавлена смена",
    update: "Изменена смена",
    delete: "Удалена смена",
  };

  const formatShift = (shift) => {
    if (!shift) return "—";
    const amountLabel = shift.amount ? `${shift.amount.toLocaleString("ru-RU")} ₽` : "";
    return `${shift.startLocal}–${shift.endLocal}${amountLabel ? ` · ${amountLabel}` : ""}`;
  };

  state.changeHistory.forEach((entry) => {
    const wrapper = document.createElement("div");
    wrapper.className = "change-log-entry";

    const title = document.createElement("div");
    const actionLabel = actionLabels[entry.action] || "Изменение";
    const time = new Date(entry.timestamp).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
    title.textContent = `${actionLabel} • ${entry.date} • ${time}`;

    const details = document.createElement("div");
    details.textContent = `${entry.employeeName} (${entry.line})`;

    const shiftLine = document.createElement("div");
    shiftLine.textContent = `Было: ${formatShift(entry.previousShift)} → Стало: ${formatShift(
      entry.nextShift
    )}`;

    wrapper.appendChild(title);
    wrapper.appendChild(details);
    wrapper.appendChild(shiftLine);
    changeLogListEl.appendChild(wrapper);
  });
}

function handleShiftCellClick({ line, row, day, dayIndex, shift, cellEl }) {
  if (!canEditLine(line)) {
    openShiftPopoverReadOnly(
      {
        line,
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        day,
        shift: shift || null,
      },
      cellEl
    );
    return;
  }

  if (state.quickMode.enabled) {
    const { startLocal, endLocal, amount, templateId, specialShortLabel } =
      getQuickModeShift(line);

    // input[type=time] принимает только HH:MM, поэтому нормализуем,
    // иначе браузер может вернуть пустое значение и дальше сломается конвертация.
    const normStartLocal = normalizeTimeHHMM(startLocal);
    const normEndLocal = normalizeTimeHHMM(endLocal);

    if (!normStartLocal || !normEndLocal) {
      alert(
        "Укажите время начала и конца смены в панели быстрого назначения."
      );
      return;
    }

    const { year, monthIndex } = state.monthMeta;
    const sched = state.scheduleByLine[line];
    const resolvedDayIndex =
      typeof dayIndex === "number" && dayIndex >= 0
        ? dayIndex
        : sched?.days?.indexOf(day);
    const previousShift =
      resolvedDayIndex != null && resolvedDayIndex >= 0
        ? row.shiftsByDay[resolvedDayIndex]
        : null;

    const key = `${line}-${year}-${monthIndex + 1}-${row.employeeId}-${day}`;
	    // Важно: в быстрых кликах используем year/monthIndex из текущего выбранного месяца,
	    // иначе state.monthMeta может быть неинициализирован/рассинхронизирован.
    const conversion = convertLocalRangeToUtcWithMeta(
      year,
      monthIndex,
      day,
      normStartLocal,
      normEndLocal
    );
	    if (!conversion) {
	      alert("Некорректное время смены. Проверьте формат (например 08:00–20:00)." );
	      return;
	    }
    state.localChanges[key] = {
      startLocal: normStartLocal,
      endLocal: normEndLocal,
      amount,
      templateId,
      specialShortLabel,
	      startUtcIso: conversion.startUtcIso,
	      endUtcIso: conversion.endUtcIso,
	      durationMinutes: conversion.durationMinutes,
    };
    persistLocalChanges();

    applyLocalChangesToSchedule();
    renderScheduleCurrentLine();
    logChange({
      action: previousShift ? "update" : "create",
      line,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      day,
      previousShift: previousShift || null,
      nextShift: {
        startLocal: normStartLocal,
        endLocal: normEndLocal,
        amount,
        specialShortLabel,
      },
    });
    return;
  }

  openShiftPopover(
    {
      line,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      day,
      shift: shift || null,
    },
    cellEl
  );
}

// -----------------------------
// Загрузка данных
// -----------------------------

async function loadInitialData() {
  try {
    const { year, monthIndex } = state.monthMeta;
    const hadCachedEmployees = loadCachedEmployees();
    const hadCachedTemplates = loadCachedShiftTemplates();
    const hadCachedSchedule = loadCachedScheduleForMonth(year, monthIndex);

    if (hadCachedTemplates) {
      initQuickAssignPanel();
    }

    if (hadCachedSchedule) {
      updateSaveButtonState();
      updateQuickModeForLine();
      if (typeof ShiftColors !== "undefined" && ShiftColors.renderColorLegend) {
        ShiftColors.renderColorLegend(state.ui.currentLine);
      }
    }

    await loadEmployees();
    await loadShiftsCatalog();
    initQuickAssignPanel();
    await reloadScheduleForCurrentMonth();
    updateSaveButtonState();
    updateQuickModeForLine();

    // Отображение легенды цветов после загрузки данных
    if (typeof ShiftColors !== 'undefined' && ShiftColors.renderColorLegend) {
      ShiftColors.renderColorLegend(state.ui.currentLine);
    }
  } catch (err) {
    console.error("loadInitialData error:", err);
    alert(`Ошибка загрузки данных: ${err.message || err}`);
  }
}

async function loadEmployees() {
  const raw = await pyrusApi("/v4/members", "GET");
  const data = unwrapPyrusData(raw);

  if (data.employeesByLine) {
    state.employeesByLine.L1 = data.employeesByLine.L1 || [];
    state.employeesByLine.L2 = data.employeesByLine.L2 || [];
    return;
  }

  const members = data.members || [];
  const employeesByLine = { ALL: [], OP: [], OV: [], L1: [], L2: [], AI: [], OU: [] };

// Жёсткая маршрутизация по department_id (и отдельный TOP для вкладки "ВСЕ")
for (const m of members) {
  if (m.banned) continue;

  const deptIdRaw = m.department_id;
  const deptId = deptIdRaw != null ? Number(deptIdRaw) : null;

  const employee = {
    id: m.id,
    fullName: `${m.last_name || ""} ${m.first_name || ""}`.trim(),
    email: m.email || "",
    departmentName: m.department_name || "",
    departmentId: deptId,
    avatarId: m.avatar_id || null,
    phone: m.phone || "",
    position: m.position || "",
    birthDay:
      m.birth_date && typeof m.birth_date.day === "number"
        ? m.birth_date.day
        : m.birth_date && m.birth_date.day
        ? Number(m.birth_date.day)
        : null,
    birthMonth:
      m.birth_date && typeof m.birth_date.month === "number"
        ? m.birth_date.month
        : m.birth_date && m.birth_date.month
        ? Number(m.birth_date.month)
        : null,
  };

  // ALL: добавляем всех
  employeesByLine.ALL.push(employee);

  // Остальные вкладки: по deptId
  if (deptId != null) {
    if (LINE_DEPT_IDS.L1.includes(deptId)) employeesByLine.L1.push(employee);
    if (LINE_DEPT_IDS.L2.includes(deptId)) employeesByLine.L2.push(employee);
    if (LINE_DEPT_IDS.OV.includes(deptId)) employeesByLine.OV.push(employee);
    if (LINE_DEPT_IDS.OP.includes(deptId)) employeesByLine.OP.push(employee);
    if (LINE_DEPT_IDS.OU.includes(deptId)) employeesByLine.OU.push(employee);
    if (LINE_DEPT_IDS.AI.includes(deptId)) employeesByLine.AI.push(employee);
  }
}

const sortEmployeesByName = (arr) =>
  arr.sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"));

const sortEmployeesByDeptOrder = (arr, deptOrder) => {
  const orderIndex = new Map(deptOrder.map((id, idx) => [Number(id), idx]));
  return arr.sort((a, b) => {
    const ai = orderIndex.has(a.departmentId)
      ? orderIndex.get(a.departmentId)
      : Number.MAX_SAFE_INTEGER;
    const bi = orderIndex.has(b.departmentId)
      ? orderIndex.get(b.departmentId)
      : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.fullName.localeCompare(b.fullName, "ru");
  });
};

// "ВСЕ": сначала TOP_MANAGEMENT_IDS, затем отделы в заданном порядке
const ALL_DEPT_ORDER = [
  ...LINE_DEPT_IDS.OP,
  ...LINE_DEPT_IDS.OV,
  ...LINE_DEPT_IDS.L1,
  ...LINE_DEPT_IDS.L2,
  ...LINE_DEPT_IDS.AI,
  ...LINE_DEPT_IDS.OU,
];

const topIndex = new Map(TOP_MANAGEMENT_IDS.map((id, idx) => [Number(id), idx]));
const allDeptIndex = new Map(ALL_DEPT_ORDER.map((id, idx) => [Number(id), idx]));

employeesByLine.ALL.sort((a, b) => {
  const at = topIndex.has(a.id) ? topIndex.get(a.id) : null;
  const bt = topIndex.has(b.id) ? topIndex.get(b.id) : null;
  if (at != null || bt != null) {
    if (at == null) return 1;
    if (bt == null) return -1;
    return at - bt;
  }

  const ai = a.departmentId != null && allDeptIndex.has(a.departmentId) ? allDeptIndex.get(a.departmentId) : Number.MAX_SAFE_INTEGER;
  const bi = b.departmentId != null && allDeptIndex.has(b.departmentId) ? allDeptIndex.get(b.departmentId) : Number.MAX_SAFE_INTEGER;
  if (ai !== bi) return ai - bi;

  // неизвестные dept -> внизу, по имени
  return a.fullName.localeCompare(b.fullName, "ru");
});

state.employeesByLine.ALL = employeesByLine.ALL;
state.employeesByLine.OP = sortEmployeesByDeptOrder(employeesByLine.OP, DEPT_ORDER_BY_LINE.OP);
state.employeesByLine.OV = sortEmployeesByName(employeesByLine.OV);
state.employeesByLine.L1 = sortEmployeesByName(employeesByLine.L1);
state.employeesByLine.L2 = sortEmployeesByDeptOrder(employeesByLine.L2, DEPT_ORDER_BY_LINE.L2);
state.employeesByLine.AI = sortEmployeesByName(employeesByLine.AI);
state.employeesByLine.OU = sortEmployeesByName(employeesByLine.OU);

persistCachedEmployees();
}

async function loadShiftsCatalog() {
  const raw = await pyrusApi("/v4/catalogs/281369", "GET");
  const data = unwrapPyrusData(raw);

  const catalog = Array.isArray(data) ? data[0] : data;
  if (!catalog) return;

  const headers = catalog.catalog_headers || [];
  const items = catalog.items || [];

  const colIndexByName = {};
  headers.forEach((h, idx) => {
    colIndexByName[h.name] = idx;
  });

  const idxName = colIndexByName["Название смены"];
  const idxTime = colIndexByName["время смены"];
  const idxAmount = colIndexByName["Сумма за смену"];
  const idxDept = colIndexByName["Отдел"];

  const templatesByLine = { ALL: [], OP: [], OV: [], L1: [], L2: [], AI: [], OU: [] };

  // "Отдел" в справочнике смен может быть списком: "L1, L2, OP, OV".
  // Поддерживаем также старые форматы (через "/") и русские сокращения (ОВ/ОП/ОУ/ВСЕ).
  function parseDeptTokens(raw) {
    if (!raw) return [];
    return String(raw)
      .split(/[,/]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const u = s.toUpperCase();
        if (u === "ОВ") return "OV";
        if (u === "ОП") return "OP";
        if (u === "ОУ") return "OU";
        if (u === "ВСЕ") return "ALL";
        return u;
      });
  }

  for (const item of items) {
    const values = item.values || [];
    const name = idxName != null ? values[idxName] : "";
    const timeRaw = idxTime != null ? values[idxTime] : "";
    const amount = idxAmount != null ? Number(values[idxAmount] || 0) : 0;
    const dept = idxDept != null ? String(values[idxDept] || "") : "";

    const timeRange = parseShiftTimeRangeString(timeRaw);

    const normalizedName = String(name || "").trim().toUpperCase();
    const specialShortLabel = ["ВЫХ", "ОТП", "ДР"].includes(normalizedName)
      ? normalizedName
      : null;

    const template = {
      id: item.item_id,
      name,
      timeRaw,
      amount,
      dept,
      timeRange,
      specialShortLabel,
    };

    const tokens = parseDeptTokens(dept);

    const pushTo = (key) => {
      if (templatesByLine[key]) templatesByLine[key].push(template);
    };

    // ALL = показывать смену во всех вкладках/линиях
    const hasAll = tokens.includes("ALL");
    if (hasAll) {
      for (const key of ["ALL", "OP", "OV", "L1", "L2", "AI", "OU"]) pushTo(key);
      continue;
    }

    // Точный матч токенов (без includes), чтобы избежать ложных совпадений.
    if (tokens.includes("L1")) pushTo("L1");
    if (tokens.includes("L2")) pushTo("L2");
    if (tokens.includes("OV")) pushTo("OV");
    if (tokens.includes("OP")) pushTo("OP");
    if (tokens.includes("OU")) pushTo("OU");
    if (tokens.includes("AI")) pushTo("AI");
    // Если по каким-то причинам в справочнике остался токен ALL только для вкладки ВСЕ
    // (без распределения по линиям), его можно явно указать как "ALL".
    if (tokens.includes("ALL")) pushTo("ALL");
  }

  // записываем в state все линии
  for (const key of ["ALL","OP","OV","L1","L2","AI","OU"]) {
    state.shiftTemplatesByLine[key] = templatesByLine[key] || [];
  }

  // Инициализация цветов смен
  if (typeof ShiftColors !== 'undefined' && ShiftColors.initialize) {
    ShiftColors.initialize(state.shiftTemplatesByLine, state.ui.theme);
  }

  persistCachedShiftTemplates();
}



async function loadVacationsForMonth(year, monthIndex) {
  const raw = await pyrusApi("/v4/forms/2348174/register", "GET");
  const data = unwrapPyrusData(raw);
  const wrapper = Array.isArray(data) ? data[0] : data;
  const tasks = (wrapper && wrapper.tasks) || [];

  const vacationsByEmployee = Object.create(null);
  const offsetMs = LOCAL_TZ_OFFSET_MIN * 60 * 1000;

  const monthStartShiftedMs = Date.UTC(year, monthIndex, 1, 0, 0, 0, 0);
  const monthEndShiftedMs = Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const fmt = (shiftedMs) => {
    const d = new Date(shiftedMs);
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const yy = d.getUTCFullYear();
    return dd + "." + mm + "." + yy;
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
    const personField = fields.find((f) => f && f.id === 1 && f.type === "person");
    const periodField = fields.find((f) => f && f.id === 2 && f.type === "due_date_time");
    if (!personField || !periodField) continue;

    const empId = personField.value && personField.value.id;
    if (!empId) continue;

    const startIso = periodField.value;
    const durationMin = Number(periodField.duration || 0);
    if (!startIso || !durationMin) continue;

    const startUtcMs = new Date(startIso).getTime();
    if (Number.isNaN(startUtcMs)) continue;
    const endUtcMs = startUtcMs + durationMin * 60 * 1000;

    // Работаем в "смещённом" пространстве (utcMs + offset)
    const startShiftedMs = startUtcMs + offsetMs;
    const endShiftedMs = endUtcMs + offsetMs;

    // Клип по текущему месяцу
    const segStart = Math.max(startShiftedMs, monthStartShiftedMs);
    const segEnd = Math.min(endShiftedMs, monthEndShiftedMs);
    if (segStart >= segEnd) continue;

    const startDay = new Date(segStart).getUTCDate();

    // Диапазон [start, end)
    const endDate = new Date(segEnd);
    let endDayExclusive;
    if (endDate.getUTCMonth() !== monthIndex) {
      endDayExclusive = daysInMonth + 1;
    } else {
      endDayExclusive = endDate.getUTCDate();
      if (!isMidnight(segEnd)) endDayExclusive += 1;
    }

    endDayExclusive = Math.max(1, Math.min(daysInMonth + 1, endDayExclusive));

    // Для отображения: конец включительно
    let endLabelShiftedMs = endShiftedMs;
    if (isMidnight(endShiftedMs)) endLabelShiftedMs = endShiftedMs - 1;

    (vacationsByEmployee[empId] = vacationsByEmployee[empId] || []).push({
      startDay,
      endDayExclusive,
      startLabel: fmt(startShiftedMs),
      endLabel: fmt(endLabelShiftedMs),
    });
  }

  // Сортируем отпуска каждого сотрудника по началу
  for (const empId of Object.keys(vacationsByEmployee)) {
    vacationsByEmployee[empId].sort((a, b) => (a.startDay || 0) - (b.startDay || 0));
  }

  return vacationsByEmployee;
}
async function reloadScheduleForCurrentMonth() {
  const { year, monthIndex } = state.monthMeta;

  const raw = await pyrusApi("/v4/forms/2375272/register", "GET");
  const data = unwrapPyrusData(raw);

  // Отпуска: внешняя система, только отображение
  try {
    state.vacationsByEmployee = await loadVacationsForMonth(year, monthIndex);
  } catch (e) {
    console.warn('Не удалось загрузить отпуска', e);
    state.vacationsByEmployee = {};
  }

  // Производственный календарь РФ: помесячно (isdayoff.ru), с кэшем и фолбеком на СБ/ВС
  try {
    state.prodCalendar = await loadProdCalendarForMonth(year, monthIndex);
  } catch (e) {
    console.warn('Не удалось загрузить производственный календарь РФ, используем фолбек СБ/ВС', e);
    state.prodCalendar = null;
  }

  const wrapper = Array.isArray(data) ? data[0] : data;
  const tasks = (wrapper && wrapper.tasks) || [];

  const scheduleByLine = {
    ALL: { days: [], rows: [], monthKey: null },
    OP: { days: [], rows: [], monthKey: null },
    OV: { days: [], rows: [], monthKey: null },
    L1: { days: [], rows: [], monthKey: null },
    L2: { days: [], rows: [], monthKey: null },
    AI: { days: [], rows: [], monthKey: null },
    OU: { days: [], rows: [], monthKey: null },
  };
  const monthKey = getMonthKey(year, monthIndex);

  const shiftMapByLine = { ALL: Object.create(null), OP: Object.create(null), OV: Object.create(null), L1: Object.create(null), L2: Object.create(null), AI: Object.create(null), OU: Object.create(null) };

  // "Отдел" в значении смены из справочника может быть списком токенов
  // (например: "L1, L2, OP" или "L1/L2/OP").
  // Нормализуем токены в ключи вкладок.
  const parseDeptTokens = (raw) => {
    if (!raw) return [];
    return String(raw)
      .split(/[,/]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const u = s.toUpperCase();
        if (u === "ОВ") return "OV";
        if (u === "ОП") return "OP";
        if (u === "ОУ") return "OU";
        if (u === "ВСЕ") return "ALL";
        return u;
      });
  };

  const inferLineFromEmployee = (empId) => {
    for (const k of ["OP","OV","L1","L2","AI","OU"]) {
      const list = state.employeesByLine[k] || [];
      if (list.some((e) => e.id === empId)) return k;
    }
    return null;
  };

  const findField = (fields, id) => fields.find((f) => f.id === id);

  for (const task of tasks) {
    const fields = task.fields || [];
    const dueField = findField(fields, 4);
    const moneyField = findField(fields, 5);
    const personField = findField(fields, 8);
    const shiftField = findField(fields, 10);

    if (!dueField || !personField || !shiftField) continue;

    const rawDuration = Number(dueField.duration || 0);
    const startUtcMs = new Date(dueField.value).getTime();
    if (Number.isNaN(startUtcMs)) continue;

    const startUtcIso = new Date(startUtcMs).toISOString();
    const endUtcMs = startUtcMs + rawDuration * 60 * 1000;
    const endUtcIso = new Date(endUtcMs).toISOString();

    const range = convertUtcStartToLocalRange(startUtcIso, rawDuration);
    if (!range) continue;

    const { localDateKey, startLocal, endLocal } = range;
    const [yStr, mStr, dStr] = localDateKey.split("-");
    const y = Number(yStr);
    const m = Number(mStr) - 1;
    const d = Number(dStr);

    if (y !== year || m !== monthIndex) continue;

    const emp = personField.value || {};
    const empId = emp.id;
    if (!empId) continue;

    const shiftCatalog = shiftField.value || {};
    const deptRaw = (shiftCatalog.values && shiftCatalog.values[4]) || "";
    const tokens = parseDeptTokens(deptRaw);

    // Определяем, в какие вкладки раскладывать смену.
    // - ALL => во все вкладки
    // - список токенов => во все соответствующие вкладки
    // - если токены не распознаны => пытаемся вывести по департаменту сотрудника
    let targetLines = [];
    if (tokens.includes("ALL")) {
      targetLines = ["OP","OV","L1","L2","AI","OU"];
    } else {
      targetLines = tokens.filter((t) => shiftMapByLine[t]);
    }
    if (!targetLines.length) {
      const inferred = inferLineFromEmployee(empId);
      if (inferred) targetLines = [inferred];
    }

    const shiftItemId =
      shiftCatalog.item_id != null ? shiftCatalog.item_id : shiftCatalog.id;

    // specialShortLabel может зависеть от вкладки (шаблонов),
    // но для отображения достаточно любого совпадения.
    let matchingTemplate = null;
    for (const l of targetLines) {
      matchingTemplate =
        shiftItemId != null
          ? (state.shiftTemplatesByLine[l] || []).find((t) => t.id === shiftItemId)
          : null;
      if (matchingTemplate) break;
    }
    const specialShortLabel =
      (matchingTemplate && matchingTemplate.specialShortLabel) || null;

    const amount =
      typeof moneyField.value === "number"
        ? moneyField.value
        : Number(moneyField.value || 0);

    const entry = {
      startLocal,
      endLocal,
      amount,
      templateId: shiftItemId,
      taskId: task.id,
      rawDueValue: dueField.value,
      rawDuration,
      durationMinutes: rawDuration,
      startUtcIso,
      endUtcIso,
      rawShift: shiftCatalog,
      specialShortLabel,
    };

    const putToMap = (key) => {
      const map = shiftMapByLine[key];
      if (!map) return;
      if (!map[empId]) map[empId] = {};
      map[empId][d] = entry;
    };

    for (const l of targetLines) {
      if (l && shiftMapByLine[l]) putToMap(l);
    }
    // "ВСЕ" всегда содержит весь график
    putToMap("ALL");
  }

  const days = [];
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  for (let d = 1; d <= Math.min(daysInMonth, MAX_DAYS_IN_MONTH); d++) {
    days.push(d);
  }

  for (const line of ["ALL","OP","OV","L1","L2","AI","OU"]) {
    const empList = state.employeesByLine[line] || [];
    const map = shiftMapByLine[line];

    const rows = empList.map((emp) => {
      const shiftsByDay = days.map((d) => {
        const shift = map && map[emp.id] && map[emp.id][d];
        return shift || null;
      });
      return {
        employeeId: emp.id,
        employeeName: emp.fullName,
        birthDay: emp.birthDay ?? null,
        birthMonth: emp.birthMonth ?? null,
        shiftsByDay,
      };
    });

    scheduleByLine[line] = { monthKey, days, rows };
  }

  state.originalScheduleByLine = deepClone(scheduleByLine);
  state.scheduleByLine = scheduleByLine;
  state.ui.isScheduleCached = false;
  persistCachedScheduleForMonth(year, monthIndex);
  applyLocalChangesToSchedule();
  renderScheduleCurrentLine();
}

// -----------------------------
// Рендер таблицы
// -----------------------------

function applyEmployeeFilterToTable(table, hiddenIds, emptyRowEl) {
  const tbody = table.querySelector("tbody");
  if (!tbody) return;
  const dataRows = Array.from(tbody.querySelectorAll("tr")).filter(
    (row) => !row.classList.contains("employee-filter-empty")
  );
  let visibleCount = 0;
  for (const row of dataRows) {
    const id = Number(row.dataset.employeeId);
    const shouldHide = hiddenIds.has(id);
    row.classList.toggle("employee-row-hidden", shouldHide);
    if (!shouldHide) visibleCount += 1;
  }
  if (emptyRowEl) {
    emptyRowEl.classList.toggle("hidden", visibleCount > 0);
  }
}

function renderScheduleCurrentLine() {
  closeEmployeeFilterPopover();
  const line = state.ui.currentLine;
  const sched = state.scheduleByLine[line];

  if (!sched || !sched.days || sched.days.length === 0) {
    scheduleRootEl.innerHTML =
      '<div style="padding: 12px; font-size: 13px; color: var(--text-muted);">Нет данных по графику за выбранный месяц.</div>';
    return;
  }

  const canEdit = canEditLine(line);
  const { days, rows } = sched;
  const hiddenEmployeeIds = normalizeHiddenEmployeeIds(line, rows);

  const table = document.createElement("table");
  table.className = "schedule-table";
  
  if (!canEdit) {
    table.classList.add("read-only-mode");
  }

  const thead = document.createElement("thead");
  const headRow1 = document.createElement("tr");
  const headRow2 = document.createElement("tr");

  const thName = document.createElement("th");
  thName.className = "sticky-col employee-header-cell";

  const thNameWrap = document.createElement("div");
  thNameWrap.className = "employee-header";

  const thNameLabel = document.createElement("span");
  thNameLabel.textContent = "Сотрудник";

  const filterBtn = document.createElement("button");
  filterBtn.type = "button";
  filterBtn.className = "employee-filter-btn";
  filterBtn.setAttribute("aria-label", "Фильтр сотрудников");
  filterBtn.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18l-7 8v5l-4 2v-7z"></path></svg>';
  if (hiddenEmployeeIds.size > 0) filterBtn.classList.add("active");

  const updateFilterButtonState = () => {
    filterBtn.classList.toggle("active", hiddenEmployeeIds.size > 0);
  };

  let emptyRow = null;

  filterBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    openEmployeeFilterPopover({
      line,
      rows,
      hiddenEmployeeIds,
      table,
      emptyRow,
      onUpdateButton: updateFilterButtonState,
    });
  });

  thNameWrap.appendChild(thNameLabel);
  thNameWrap.appendChild(filterBtn);
  thName.appendChild(thNameWrap);
  headRow1.appendChild(thName);

  const thName2 = document.createElement("th");
  thName2.className = "sticky-col";
  thName2.textContent = "";
  headRow2.appendChild(thName2);

  const weekdayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const { year, monthIndex } = state.monthMeta;
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const weekendDays = new Set(); // фактически "выходные дни" (по производственному календарю или фолбек СБ/ВС)

  const prod = state.prodCalendar && state.prodCalendar.monthKey === monthKey ? state.prodCalendar : null;

  for (const day of days) {
    const date = new Date(year, monthIndex, day);
    const weekday = weekdayNames[(date.getDay() + 6) % 7];

    const dayType = prod && prod.dayTypeByDay ? prod.dayTypeByDay[day] : null;
    const isFallbackWeekend = weekday === "Сб" || weekday === "Вс";

    const isDayOff = dayType === 1 || (dayType == null && isFallbackWeekend);
    const isPreHoliday = dayType === 2;

    const th1 = document.createElement("th");
    th1.textContent = String(day);
    if (isDayOff) th1.classList.add("day-off");
    if (isPreHoliday) th1.classList.add("pre-holiday");
    headRow1.appendChild(th1);

    const th2 = document.createElement("th");
    th2.textContent = weekday;
    th2.className = "weekday-header";
    if (isDayOff) {
      th2.classList.add("day-off");
      weekendDays.add(day);
    }
    if (isPreHoliday) th2.classList.add("pre-holiday");
    headRow2.appendChild(th2);
  }

  const thSum1 = document.createElement("th");
  thSum1.textContent = "Сумма";
  thSum1.className = "summary-cell";
  headRow1.appendChild(thSum1);

  const thSum2 = document.createElement("th");
  thSum2.textContent = "";
  thSum2.className = "summary-cell";
  headRow2.appendChild(thSum2);

  thead.appendChild(headRow1);
  thead.appendChild(headRow2);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.dataset.employeeId = String(row.employeeId);

    const tdName = document.createElement("td");
    tdName.className = "sticky-col employee-name";
    tdName.textContent = row.employeeName;
    tr.appendChild(tdName);

    let totalAmount = 0;

    const vacations = state.vacationsByEmployee[row.employeeId] || [];
    const vacationStarts = Object.create(null);
    for (const v of vacations) {
      if (v && typeof v.startDay === "number") {
        vacationStarts[v.startDay] = v;
      }
    }

    // День рождения (ежегодно): показываем в текущем месяце, если есть day/month.
    const birthdayDayThisMonth =
      row.birthMonth && row.birthDay && row.birthMonth === monthIndex + 1
        ? row.birthDay
        : null;

    let dayIndex = 0;
    while (dayIndex < row.shiftsByDay.length) {
      const dayNumber = sched.days[dayIndex];
      const vac = vacationStarts[dayNumber];

      if (vac) {
        const len = Math.max(1, (vac.endDayExclusive || (vac.startDay + 1)) - vac.startDay);

        const td = document.createElement("td");
        td.className = "shift-cell vacation-cell";
        td.colSpan = len;

        const pill = document.createElement("div");
        pill.className = "vacation-pill";
        // Текст внутри полосы (оставляем как метку, но не мешаем бейджам поверх)
        const vacLabel = document.createElement("span");
        vacLabel.className = "vacation-label";
        vacLabel.textContent = "ОТП";
        pill.title = `Отпуск: с ${vac.startLabel} по ${vac.endLabel}`;

        pill.appendChild(vacLabel);

        // Если день рождения попадает внутрь отпуска (в текущем месяце) —
        // показываем маркер "ДР" поверх отпускной полосы.
        if (
          typeof birthdayDayThisMonth === "number" &&
          birthdayDayThisMonth >= vac.startDay &&
          birthdayDayThisMonth < (vac.endDayExclusive || vac.startDay + 1)
        ) {
          const b = document.createElement("div");
          b.className = "birthday-pill birthday-pill-in-vacation";
          b.textContent = "ДР";
          const leftPercent = ((birthdayDayThisMonth - vac.startDay) + 0.5) / len * 100;
          b.style.left = `${leftPercent}%`;
          b.title = `День рождения: ${formatBirthdayLabel(birthdayDayThisMonth, monthIndex + 1)}`;
          b.addEventListener("click", (ev) => {
            ev.stopPropagation();
            openBirthdayPopover(
              {
                employeeName: row.employeeName,
                dateLabel: formatBirthdayLabel(birthdayDayThisMonth, monthIndex + 1),
              },
              b
            );
          });
          pill.appendChild(b);
        }

        td.appendChild(pill);

        td.addEventListener("click", (ev) => {
          ev.stopPropagation();
          openVacationPopover(
            {
              employeeName: row.employeeName,
              startLabel: vac.startLabel,
              endLabel: vac.endLabel,
            },
            td
          );
        });

        td.addEventListener("mouseenter", () => {
          tr.classList.add("row-hover");
        });
        td.addEventListener("mouseleave", () => {
          tr.classList.remove("row-hover");
        });

        tr.appendChild(td);
        dayIndex += len;
        continue;
      }

      const shift = row.shiftsByDay[dayIndex];

      const td = document.createElement("td");
      td.className = "shift-cell";
      if (weekendDays.has(dayNumber)) {
        td.classList.add("day-off");
      }

      // Маркер дня рождения (один день). Показываем даже если в этот день есть смена.
      if (typeof birthdayDayThisMonth === "number" && birthdayDayThisMonth === dayNumber) {
        const b = document.createElement("div");
        b.className = "birthday-pill";
        b.textContent = "ДР";
        b.title = `День рождения: ${formatBirthdayLabel(dayNumber, monthIndex + 1)}`;
        b.addEventListener("click", (ev) => {
          ev.stopPropagation();
          openBirthdayPopover(
            {
              employeeName: row.employeeName,
              dateLabel: formatBirthdayLabel(dayNumber, monthIndex + 1),
            },
            b
          );
        });
        td.appendChild(b);
      }

      if (shift) {
        td.classList.add("has-shift");
        const pill = document.createElement("div");
        pill.className = "shift-pill";

        // Применение цвета к pill
        if (typeof ShiftColors !== 'undefined' && ShiftColors.applyColorToPill && shift.templateId) {
          ShiftColors.applyColorToPill(pill, shift.templateId, line);
        }

        if (shift.specialShortLabel) {
          pill.classList.add("special");
          const label = document.createElement("div");
          label.className = "shift-special-label";
          label.textContent = shift.specialShortLabel;
          pill.appendChild(label);
        } else {
          const line1 = document.createElement("div");
          line1.className = "shift-time-line start";
          line1.textContent = shift.startLocal;

          const line2 = document.createElement("div");
          line2.className = "shift-time-line end";
          line2.textContent = shift.endLocal;

          pill.appendChild(line1);
          pill.appendChild(line2);
        }
        td.appendChild(pill);

        totalAmount += shift.amount || 0;
      } else {
        td.classList.add("empty-shift");
      }

      const clickDay = dayNumber;
      const clickDayIndex = dayIndex;
      td.addEventListener("click", () => {
        handleShiftCellClick({
          line,
          row,
          day: clickDay,
          dayIndex: clickDayIndex,
          shift: shift || null,
          cellEl: td,
        });
      });

      td.addEventListener("mouseenter", () => {
        tr.classList.add("row-hover");
      });
      td.addEventListener("mouseleave", () => {
        tr.classList.remove("row-hover");
      });

      tr.appendChild(td);
      dayIndex += 1;
    }


    const tdSum = document.createElement("td");
    tdSum.className = "summary-cell";
    tdSum.textContent =
      totalAmount > 0 ? `${totalAmount.toLocaleString("ru-RU")} ₽` : "";
    tr.appendChild(tdSum);

    tbody.appendChild(tr);
  });

  emptyRow = document.createElement("tr");
  emptyRow.className = "employee-filter-empty hidden";
  const emptyCell = document.createElement("td");
  emptyCell.colSpan = days.length + 2;
  emptyCell.textContent = "Нет сотрудников для отображения по фильтру.";
  emptyRow.appendChild(emptyCell);
  tbody.appendChild(emptyRow);

  table.appendChild(tbody);
  scheduleRootEl.innerHTML = "";
  scheduleRootEl.appendChild(table);
  updateFilterButtonState();
  applyEmployeeFilterToTable(table, hiddenEmployeeIds, emptyRow);
}

// -----------------------------
// Поповер смены
// -----------------------------

function createShiftPopover() {
  shiftPopoverBackdropEl = document.createElement("div");
  shiftPopoverBackdropEl.className = "shift-popover-backdrop hidden";

  shiftPopoverEl = document.createElement("div");
  shiftPopoverEl.className = "shift-popover hidden";

  shiftPopoverBackdropEl.addEventListener("click", () => {
    closeShiftPopover();
  });

  document.body.appendChild(shiftPopoverBackdropEl);
  document.body.appendChild(shiftPopoverEl);
}

function resolveTemplateName(line, templateId) {
  if (!line || templateId == null) return null;
  const templates = state.shiftTemplatesByLine[line] || [];
  const template = templates.find((tmpl) => tmpl.id === templateId);
  return template ? template.name : null;
}

function resolveShiftDisplayName(line, templateId, specialShortLabel) {
  const templateName = resolveTemplateName(line, templateId);
  if (templateName) return templateName;
  if (specialShortLabel) return specialShortLabel;
  if (templateId != null) return `Шаблон #${templateId}`;
  return "Ручная смена";
}

function updateShiftPopoverName(line, templateId, specialShortLabel, showManual = false) {
  const nameEl = shiftPopoverEl?.querySelector("#shift-popover-shift-name");
  if (!nameEl) return;
  if (templateId == null && !specialShortLabel && !showManual) {
    nameEl.textContent = "";
    return;
  }
  nameEl.textContent = resolveShiftDisplayName(line, templateId, specialShortLabel);
}

function positionShiftPopover(anchorEl) {
  if (!shiftPopoverEl || !anchorEl) return;

  const rect = anchorEl.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  shiftPopoverEl.style.left = "0px";
  shiftPopoverEl.style.top = "0px";

  const popoverRect = shiftPopoverEl.getBoundingClientRect();
  const popoverWidth = popoverRect.width || 420;
  const popoverHeight = popoverRect.height || 260;

  let left = rect.left + 8;
  let top = rect.bottom + 8;

  if (left + popoverWidth > viewportWidth - 16) {
    left = viewportWidth - popoverWidth - 16;
  }

  const fitsBelow = top + popoverHeight <= viewportHeight - 16;
  const fitsAbove = rect.top - popoverHeight - 8 >= 16;

  if (!fitsBelow && fitsAbove) {
    top = rect.top - popoverHeight - 8;
  }

  left = Math.max(16, Math.min(left, viewportWidth - popoverWidth - 16));
  top = Math.max(16, Math.min(top, viewportHeight - popoverHeight - 16));

  shiftPopoverEl.style.left = `${left}px`;
  shiftPopoverEl.style.top = `${top}px`;
}

function closeShiftPopover() {
  if (!shiftPopoverEl) return;

  shiftPopoverEl.classList.remove("open");
  shiftPopoverBackdropEl.classList.add("hidden");

  if (shiftPopoverKeydownHandler) {
    document.removeEventListener("keydown", shiftPopoverKeydownHandler);
    shiftPopoverKeydownHandler = null;
  }

  setTimeout(() => {
    shiftPopoverEl.classList.add("hidden");
    shiftPopoverEl.innerHTML = "";
  }, 140);
}

function formatBirthdayLabel(day, month) {
  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  return `${dd}.${mm}`;
}

function openBirthdayPopover(context, anchorEl) {
  const { employeeName, dateLabel } = context;

  shiftPopoverEl.innerHTML = `
    <div class="shift-popover-header">
      <div>
        <div class="shift-popover-title">${employeeName}</div>
        <div class="shift-popover-subtitle">День рождения • только просмотр</div>
      </div>
      <button class="shift-popover-close" type="button">✕</button>
    </div>

    <div class="shift-popover-body">
      <div class="shift-popover-section">
        <div class="shift-popover-section-title">Дата</div>
        <div class="field-row"><label>день:</label><div>${dateLabel}</div></div>
      </div>
      <div class="shift-popover-note">Данные дня рождения загружаются из списка сотрудников и не редактируются здесь.</div>
    </div>

    <div class="shift-popover-footer">
      <button class="btn" type="button" id="shift-btn-close-birthday">Закрыть</button>
    </div>
  `;

  shiftPopoverBackdropEl.classList.remove("hidden");
  shiftPopoverEl.classList.remove("hidden");
  positionShiftPopover(anchorEl);

  const closeBtn = shiftPopoverEl.querySelector(".shift-popover-close");
  const closeBtn2 = shiftPopoverEl.querySelector("#shift-btn-close-birthday");
  const doClose = () => closeShiftPopover();
  if (closeBtn) closeBtn.addEventListener("click", doClose);
  if (closeBtn2) closeBtn2.addEventListener("click", doClose);

  shiftPopoverKeydownHandler = (ev) => {
    if (ev.key === "Escape") doClose();
  };
  document.addEventListener("keydown", shiftPopoverKeydownHandler);

  requestAnimationFrame(() => {
    shiftPopoverEl.classList.add("open");
  });
}



function openVacationPopover(context, anchorEl) {
  const { employeeName, startLabel, endLabel } = context;

  shiftPopoverEl.innerHTML = `
    <div class="shift-popover-header">
      <div>
        <div class="shift-popover-title">${employeeName}</div>
        <div class="shift-popover-subtitle">Отпуск • только просмотр</div>
      </div>
      <button class="shift-popover-close" type="button">✕</button>
    </div>

    <div class="shift-popover-body">
      <div class="shift-popover-section">
        <div class="shift-popover-section-title">Период</div>
        <div class="field-row"><label>с:</label><div>${startLabel}</div></div>
        <div class="field-row"><label>по:</label><div>${endLabel}</div></div>
      </div>
      <div class="shift-popover-note">Отпуск загружается из внешней системы и не редактируется здесь.</div>
    </div>

    <div class="shift-popover-footer">
      <button class="btn" type="button" id="shift-btn-close-vacation">Закрыть</button>
    </div>
  `;

  shiftPopoverBackdropEl.classList.remove("hidden");
  shiftPopoverEl.classList.remove("hidden");
  positionShiftPopover(anchorEl);

  const closeBtn = shiftPopoverEl.querySelector(".shift-popover-close");
  const closeBtn2 = shiftPopoverEl.querySelector("#shift-btn-close-vacation");

  const doClose = () => closeShiftPopover();
  if (closeBtn) closeBtn.addEventListener("click", doClose);
  if (closeBtn2) closeBtn2.addEventListener("click", doClose);

  shiftPopoverKeydownHandler = (ev) => {
    if (ev.key === "Escape") doClose();
  };
  document.addEventListener("keydown", shiftPopoverKeydownHandler);

  requestAnimationFrame(() => {
    shiftPopoverEl.classList.add("open");
  });
}
function openShiftPopoverReadOnly(context, anchorEl) {
  const { line, employeeName, day, shift } = context;
  const { year, monthIndex } = state.monthMeta;
  
  const dateLabel = `${String(day).padStart(2, "0")}.${String(
    monthIndex + 1
  ).padStart(2, "0")}.${year}`;

  shiftPopoverEl.innerHTML = `
    <div class="shift-popover-header">
      <div>
        <div class="shift-popover-title">${employeeName}</div>
        <div class="shift-popover-subtitle">${dateLabel} • Линия ${line} (только просмотр)</div>
        <div class="shift-popover-shift-name" id="shift-popover-shift-name"></div>
      </div>
      <button class="shift-popover-close" type="button">✕</button>
    </div>

    <div class="shift-popover-body">
      ${shift ? `
        <div class="shift-popover-section">
          <div class="shift-popover-section-title">Информация о смене</div>
          
          <div class="field-row">
            <label>Начало:</label>
            <div>${shift.startLocal || "—"}</div>
          </div>

          <div class="field-row">
            <label>Окончание:</label>
            <div>${shift.endLocal || "—"}</div>
          </div>

          <div class="field-row">
            <label>Сумма:</label>
            <div>${shift.amount ? shift.amount.toLocaleString('ru-RU') + ' ₽' : "—"}</div>
          </div>
        </div>
      ` : `
        <div class="shift-popover-note">
          Смена не назначена. У вас нет прав на редактирование.
        </div>
      `}
    </div>

    <div class="shift-popover-footer">
      <button class="btn" type="button" id="shift-btn-close-readonly">Закрыть</button>
    </div>
  `;

  shiftPopoverBackdropEl.classList.remove("hidden");
  shiftPopoverEl.classList.remove("hidden");
  updateShiftPopoverName(
    line,
    shift?.templateId ?? null,
    shift?.specialShortLabel,
    Boolean(shift)
  );
  positionShiftPopover(anchorEl);

  requestAnimationFrame(() => {
    shiftPopoverEl.classList.add("open");
  });

  shiftPopoverEl
    .querySelector(".shift-popover-close")
    .addEventListener("click", closeShiftPopover);
  shiftPopoverEl
    .querySelector("#shift-btn-close-readonly")
    .addEventListener("click", closeShiftPopover);

  shiftPopoverKeydownHandler = (e) => {
    if (e.key === "Escape") closeShiftPopover();
  };
  document.addEventListener("keydown", shiftPopoverKeydownHandler);
}

function openShiftPopover(context, anchorEl) {
  const { line, employeeId, employeeName, day, shift } = context;
  const { year, monthIndex } = state.monthMeta;
  const date = new Date(year, monthIndex, day);
  const hasShift = Boolean(shift);
  let selectedTemplateId = shift?.templateId ?? null;

  const dateLabel = `${String(day).padStart(2, "0")}.${String(
    monthIndex + 1
  ).padStart(2, "0")}.${year}`;

  const templates = state.shiftTemplatesByLine[line] || [];

  shiftPopoverEl.innerHTML = `
    <div class="shift-popover-header">
      <div>
        <div class="shift-popover-title">${employeeName}</div>
        <div class="shift-popover-subtitle">${dateLabel} • Линия ${line}</div>
        <div class="shift-popover-shift-name" id="shift-popover-shift-name"></div>
      </div>
      <button class="shift-popover-close" type="button">✕</button>
    </div>

    <div class="shift-popover-body">
      <div class="shift-popover-section">
        <div class="shift-popover-section-title">Шаблоны смен</div>
        <div class="shift-template-list">
          ${templates
            .map(
              (t) => `
            <button class="shift-template-pill" data-template-id="${t.id}">
              <div class="name">${t.name}</div>
              ${
                t.timeRange
                  ? `<div class="time">${t.timeRange.start}–${t.timeRange.end}</div>`
                  : ""
              }
            </button>
          `
            )
            .join("")}
        </div>
      </div>

      <div class="shift-popover-section">
        <div class="shift-popover-section-title">Ручное редактирование</div>

        <div class="field-row">
          <label>Начало</label>
          <input type="time" id="shift-start-input" value="${
            shift?.startLocal || ""
          }">
        </div>

        <div class="field-row">
          <label>Окончание</label>
          <input type="time" id="shift-end-input" value="${
            shift?.endLocal || ""
          }">
        </div>

        <div class="field-row">
          <label>Сумма</label>
          <input type="number" id="shift-amount-input" value="${
            shift?.amount || ""
          }">
        </div>

        <div class="shift-popover-note">
          Изменения сохраняются в локальном кэше в браузере и не отправляются в Pyrus.
        </div>
      </div>
    </div>

    <div class="shift-popover-footer">
      <button class="btn danger" type="button" id="shift-btn-delete" ${
        hasShift ? "" : "disabled"
      }>Удалить</button>
      <button class="btn" type="button" id="shift-btn-cancel">Отмена</button>
      <button class="btn primary" type="button" id="shift-btn-save">Сохранить локально</button>
    </div>
  `;

  shiftPopoverBackdropEl.classList.remove("hidden");
  shiftPopoverEl.classList.remove("hidden");
  updateShiftPopoverName(
    line,
    selectedTemplateId ?? shift?.templateId,
    shift?.specialShortLabel,
    hasShift
  );
  positionShiftPopover(anchorEl);

  requestAnimationFrame(() => {
    shiftPopoverEl.classList.add("open");
  });

  shiftPopoverEl
    .querySelector(".shift-popover-close")
    .addEventListener("click", closeShiftPopover);
  shiftPopoverEl
    .querySelector("#shift-btn-cancel")
    .addEventListener("click", closeShiftPopover);

  const deleteBtn = shiftPopoverEl.querySelector("#shift-btn-delete");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => {
      const key = `${line}-${year}-${monthIndex + 1}-${employeeId}-${day}`;
      state.localChanges[key] = { deleted: true };
      persistLocalChanges();

      applyLocalChangesToSchedule();
      renderScheduleCurrentLine();
      logChange({
        action: "delete",
        line,
        employeeId,
        employeeName,
        day,
        previousShift: shift || null,
        nextShift: null,
      });
      closeShiftPopover();
    });
  }

  shiftPopoverEl
    .querySelectorAll(".shift-template-pill")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.getAttribute("data-template-id"));
        const tmpl = templates.find((t) => t.id === id);
        if (!tmpl) return;

        selectedTemplateId = id;
        updateShiftPopoverName(line, id, tmpl.specialShortLabel);

        if (tmpl.timeRange) {
          const startInput = document.getElementById("shift-start-input");
          const endInput = document.getElementById("shift-end-input");
          if (startInput && endInput) {
	        startInput.value = normalizeTimeHHMM(tmpl.timeRange.start);
	        endInput.value = normalizeTimeHHMM(tmpl.timeRange.end);
          }
        }

        const amountInput = document.getElementById("shift-amount-input");
        if (amountInput && tmpl.amount) {
          amountInput.value = tmpl.amount;
        }
      });
    });

  shiftPopoverEl
    .querySelector("#shift-btn-save")
    .addEventListener("click", () => {
      const startInput = document.getElementById("shift-start-input");
      const endInput = document.getElementById("shift-end-input");
      const amountInput = document.getElementById("shift-amount-input");

	    const start = normalizeTimeHHMM(startInput.value);
	    const end = normalizeTimeHHMM(endInput.value);
      const amount = Number(amountInput.value || 0);

      const key = `${line}-${year}-${monthIndex + 1}-${employeeId}-${day}`;
      const templateId =
        selectedTemplateId != null ? selectedTemplateId : shift?.templateId;
      const specialShortLabel = resolveSpecialShortLabel(line, templateId);
	      // В поповере всегда есть year/monthIndex выбранного месяца — используем их,
	      // чтобы не ловить RangeError на невалидном state.monthMeta.
	      const conversion = convertLocalRangeToUtcWithMeta(year, monthIndex, day, start, end);
	      if (!conversion) {
	        alert("Некорректное время смены. Проверьте формат (например 08:00–20:00)." );
	        return;
	      }
      state.localChanges[key] = {
        startLocal: start,
        endLocal: end,
        amount,
        templateId,
        specialShortLabel,
	        startUtcIso: conversion.startUtcIso,
	        endUtcIso: conversion.endUtcIso,
	        durationMinutes: conversion.durationMinutes,
      };
      persistLocalChanges();

      applyLocalChangesToSchedule();
      renderScheduleCurrentLine();
      logChange({
        action: shift ? "update" : "create",
        line,
        employeeId,
        employeeName,
        day,
        previousShift: shift || null,
        nextShift: { startLocal: start, endLocal: end, amount, specialShortLabel },
      });
      closeShiftPopover();
    });

  shiftPopoverKeydownHandler = (e) => {
    if (e.key === "Escape") closeShiftPopover();
  };
  document.addEventListener("keydown", shiftPopoverKeydownHandler);
}

function applyLocalChangesToSchedule() {
  for (const line of ["ALL","OP","OV","L1","L2","AI","OU"]) {
    const sched = state.scheduleByLine[line];
    if (!sched || !sched.rows) continue;

    const { year, monthIndex } = state.monthMeta;

    for (const row of sched.rows) {
      sched.days.forEach((day, idx) => {
        const key = `${line}-${year}-${
          monthIndex + 1
        }-${row.employeeId}-${day}`;
        const change = state.localChanges[key];
        if (!change || typeof change !== "object") return;

        if (change.deleted) {
          row.shiftsByDay[idx] = null;
          return;
        }

        const enriched = change.startUtcIso
          ? change
          : convertLocalRangeToUtc(day, change.startLocal, change.endLocal) ||
            change;

        const specialShortLabel =
          change.specialShortLabel ??
          resolveSpecialShortLabel(line, change.templateId ?? row.shiftsByDay[idx]?.templateId);

        if (!row.shiftsByDay[idx]) {
          row.shiftsByDay[idx] = {
            startLocal: change.startLocal,
            endLocal: change.endLocal,
            amount: Number(change.amount || 0),
            templateId: change.templateId ?? null,
            specialShortLabel,
            startUtcIso: enriched.startUtcIso || null,
            endUtcIso: enriched.endUtcIso || null,
            durationMinutes: enriched.durationMinutes ?? null,
          };
        } else {
          row.shiftsByDay[idx].startLocal = change.startLocal;
          row.shiftsByDay[idx].endLocal = change.endLocal;
          row.shiftsByDay[idx].amount = Number(change.amount || 0);
          if (change.templateId != null) {
            row.shiftsByDay[idx].templateId = change.templateId;
          }
          row.shiftsByDay[idx].specialShortLabel = specialShortLabel;
          row.shiftsByDay[idx].startUtcIso = enriched.startUtcIso || null;
          row.shiftsByDay[idx].endUtcIso = enriched.endUtcIso || null;
          row.shiftsByDay[idx].durationMinutes =
            enriched.durationMinutes ?? row.shiftsByDay[idx].durationMinutes;
        }
      });
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadAppConfig().finally(init);
});