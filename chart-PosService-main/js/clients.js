import { getConfigValue } from "./config.js";

const CLIENTS_WEBHOOK_URL = getConfigValue("clients.webhookUrl", { defaultValue: "" });
const CLIENTS_SAVE_URL = "";
const CLIENTS_PAYTO_URL =
  getConfigValue("clients.payToUrl", { defaultValue: "" }) ||
  "https://quumahienot.beget.app/webhook/PayTO";
const CLIENTS_SUMTO_URL =
  getConfigValue("clients.sumToUrl", { defaultValue: "" }) ||
  "https://quumahienot.beget.app/webhook/SumPayPyrus";
const CLIENTS_PAYTO2_URL =
  getConfigValue("clients.payTo2Url", { defaultValue: "" }) ||
  "https://quumahienot.beget.app/webhook/PayTO2";
const CLIENTS_ORG_URL =
  getConfigValue("clients.orgUrl", { defaultValue: "" }) ||
  "https://quumahienot.beget.app/webhook/ORG";
const CLIENTS_INN_URL =
  getConfigValue("clients.innUrl", { defaultValue: "" }) ||
  "https://quumahienot.beget.app/webhook/INN";
const CLIENTS_KPP_URL =
  getConfigValue("clients.kppUrl", { defaultValue: "" }) ||
  "https://quumahienot.beget.app/webhook/KPP";
const CLIENTS_OGRN_URL =
  getConfigValue("clients.ogrnUrl", { defaultValue: "" }) ||
  "https://quumahienot.beget.app/webhook/OGRN";
const CLIENTS_BIK_URL =
  getConfigValue("clients.bikUrl", { defaultValue: "" }) ||
  "https://quumahienot.beget.app/webhook/BIK";
const CLIENTS_KOR_URL =
  getConfigValue("clients.korUrl", { defaultValue: "" }) ||
  "https://quumahienot.beget.app/webhook/KOR";
const CLIENTS_RC_URL =
  getConfigValue("clients.rcUrl", { defaultValue: "" }) ||
  "https://quumahienot.beget.app/webhook/RC";
const CLIENTS_FIRSTNAME_URL =
  getConfigValue("clients.firstNameUrl", { defaultValue: "" }) ||
  "https://quumahienot.beget.app/webhook/FirstName";
const CLIENTS_NUMBER_URL =
  getConfigValue("clients.numberUrl", { defaultValue: "" }) ||
  "https://quumahienot.beget.app/webhook/NumberClient";
const CLIENTS_EMAIL_URL =
  getConfigValue("clients.emailUrl", { defaultValue: "" }) ||
  "https://quumahienot.beget.app/webhook/EmailClient";
const CLIENTS_NEW_URL =
  getConfigValue("clients.newUrl", { defaultValue: "" }) ||
  "https://quumahienot.beget.app/webhook/new";
const CLIENTS_CACHE_KEY = "clients_cache_v1";
const CLIENTS_CACHE_TTL_MS = 5 * 60 * 1000;
const CLIENTS_ORDER_KEY = "clients_order_v1";
const CLIENTS_GROUP_KEY = "clients_group_collapsed_v1";

const $ = (sel) => document.querySelector(sel);
const mainScreenEl = $("#main-screen");
const mainTitleEl = $("#main-title");
const scheduleViewEl = $("#schedule-view");
const clientsViewEl = $("#clients-view");
const clientsTableWrapEl = $("#clients-table-wrap");
const clientsStateEl = $("#clients-state");
const clientsRefreshEl = $("#clients-refresh");
const clientsSaveEl = $("#clients-save");
const topNavButtons = document.querySelectorAll(".top-nav [data-section]");
const ACTIVE_SECTION_STORAGE_KEY = "posservice_active_section";
const scheduleOnlyEls = document.querySelectorAll(".schedule-only");
const clientsOnlyEls = document.querySelectorAll(".clients-only");
const AUTH_STORAGE_KEY = getConfigValue("storage.auth.key", {
  defaultValue: "sm_graph_auth_v1",
});
const CLIENTS_PERMISSION_KEY = "OP";

let clientsLoading = false;
let clientsLastData = null;
let clientsManagerFilter = "all";
let clientsClientFilter = "all";
let clientsManagerSelected = null;
let clientsManagerFilterButton = null;
let clientsManagerFilterBackdropEl = null;
let clientsManagerFilterPopoverEl = null;
let clientsManagerFilterKeydownHandler = null;

const CLIENTS_MANAGER_FILTER_KEY = "clients_manager_filter_v1";
let clientsSearchQuery = "";
let clientsSearchButton = null;
let clientsSearchBackdropEl = null;
let clientsSearchPopoverEl = null;
let clientsSearchKeydownHandler = null;
let clientsSearchMouseDownInside = false;

let clientsPopoverEl = null;
let clientsPopoverBackdropEl = null;
let clientsPopoverKeydownHandler = null;
let clientsDirtyKeys = new Set();
let clientsSaveDefaultLabel = "";
let clientsToastTimer = null;
let activeSection = "schedule";

function getCookie(name) {
  if (!name) return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function readAuthPayload() {
  let raw = null;
  try {
    raw = localStorage.getItem(AUTH_STORAGE_KEY);
  } catch (_) {
    raw = null;
  }
  if (!raw) raw = getCookie(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function hasClientsAccess() {
  const data = readAuthPayload();
  if (!data) return false;
  const permissions = data?.permissions || {};
  const value = permissions[CLIENTS_PERMISSION_KEY];
  return value === "edit" || value === "view";
}

async function parseWebhookResponseMessage(response) {
  if (!response) return "";
  try {
    const buffer = await response.arrayBuffer();
    const utf8Text = new TextDecoder("utf-8").decode(buffer);
    const hasReplacement = utf8Text.includes("\uFFFD");
    const text = hasReplacement
      ? new TextDecoder("windows-1251").decode(buffer)
      : utf8Text;
    try {
      const data = JSON.parse(text);
      return data?.message || data?.status || data?.result || "";
    } catch {
      return text.trim();
    }
  } catch {
    return "";
  }
}

async function sendContactWebhook(
  url,
  externalId,
  fieldName,
  value,
  successLabel,
  showToast = true
) {
  if (!url || !externalId) return;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        {
          externalId,
          [fieldName]: value,
        },
      ]),
    });
    if (!response.ok) return;
    const responseText = await parseWebhookResponseMessage(response);
    const hasCyrillic = /[А-Яа-яЁё]/.test(responseText || "");
    const hasQuestionMarks = (responseText || "").includes("?");
    const safeText = hasCyrillic && !hasQuestionMarks ? responseText : "";
    if (showToast) {
      showClientsToast(safeText || successLabel || "Сохранено.");
    }
  } catch (error) {
    console.error("Contact webhook failed:", error);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getClientKey(row) {
  const externalId = pickValue(row, "ID");
  if (externalId) return `id:${externalId}`;
  const recordId = pickValue(row, "id");
  if (recordId != null && recordId !== "") return `rec:${recordId}`;
  const uid = pickValue(row, "UID", "uid");
  if (uid) return `uid:${uid}`;
  const clientName = pickValue(row, "Client", "client", "??????");
  const orgName = pickValue(row, "Org", "org", "???");
  return `name:${clientName}::${orgName}`;
}

function normalizeExternalId(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  return digits || raw;
}

function getExternalIdValue(row) {
  const direct = pickValue(row, "ID", "Id", "id", "external_id", "externalId", "ExternalId");
  if (direct) return normalizeExternalId(direct);
  const keys = Object.keys(row || {});
  const fallbackKey = keys.find(
    (key) =>
      /id/i.test(key) &&
      !/uid/i.test(key) &&
      !/numberco/i.test(key)
  );
  return normalizeExternalId(fallbackKey ? row[fallbackKey] : "");
}

function isCoChecked(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  return (
    raw === "checked" ||
    raw === "cheked" ||
    raw === "true" ||
    raw === "1" ||
    raw === "yes" ||
    raw === "y"
  );
}

function loadCollapsedGroups() {
  try {
    const raw = localStorage.getItem(CLIENTS_GROUP_KEY);
    const parsed = JSON.parse(raw || "[]");
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch (_) {
    return new Set();
  }
}

function saveCollapsedGroups(set) {
  try {
    localStorage.setItem(CLIENTS_GROUP_KEY, JSON.stringify([...set]));
  } catch (_) {}
}

async function sendNewWebhook(externalId, status) {
  if (!externalId) return;
  try {
    const response = await fetch(CLIENTS_NEW_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        {
          externalId,
          status,
        },
      ]),
    });
    if (!response.ok) {
      throw new Error(`NEW webhook failed: ${response.status}`);
    }
  } catch (error) {
    console.error("NEW webhook failed:", error);
    try {
      await fetch(CLIENTS_NEW_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify([
          {
            externalId,
            status,
          },
        ]),
      });
    } catch (fallbackError) {
      console.error("NEW webhook fallback failed:", fallbackError);
    }
  }
}

function loadClientsOrder() {
  try {
    const raw = localStorage.getItem(CLIENTS_ORDER_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  } catch (_) {
    return [];
  }
}

function saveClientsOrder(order) {
  try {
    localStorage.setItem(CLIENTS_ORDER_KEY, JSON.stringify(order));
  } catch (_) {}
}

function buildClientOrder(rows, storedOrder) {
  const keys = rows.map((row) => getClientKey(row.__source || row)).filter(Boolean);
  const keySet = new Set(keys);
  const result = [];
  (storedOrder || []).forEach((key) => {
    if (keySet.has(key)) {
      result.push(key);
      keySet.delete(key);
    }
  });
  keys.forEach((key) => {
    if (keySet.has(key)) {
      result.push(key);
      keySet.delete(key);
    }
  });
  return result;
}

function markClientDirty(row) {
  const key = getClientKey(row);
  if (!key) return;
  clientsDirtyKeys.add(key);
  updateClientsSaveButton();
}

function updateClientsSaveButton() {
  if (!clientsSaveEl) return;
  const count = clientsDirtyKeys.size;
  if (!clientsSaveDefaultLabel) {
    clientsSaveDefaultLabel = clientsSaveEl.textContent.trim();
  }
  if (!count) {
    clientsSaveEl.disabled = true;
    clientsSaveEl.textContent = "Нет изменений (0)";
  } else {
    clientsSaveEl.disabled = false;
    clientsSaveEl.textContent = `Сохранить (${count})`;
  }
}

function pickValue(row, ...keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value != null && value !== "") return value;
  }
  const rowObj = row && typeof row === "object" ? row : null;
  if (!rowObj) return "";
  const normalizedKeys = keys
    .map((key) => String(key || "").toLowerCase().replace(/\s+/g, "").trim())
    .filter(Boolean);
  if (!normalizedKeys.length) return "";
  for (const rowKey of Object.keys(rowObj)) {
    const normalizedRowKey = String(rowKey || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .trim();
    if (!normalizedRowKey) continue;
    if (normalizedKeys.includes(normalizedRowKey)) {
      const value = rowObj[rowKey];
      if (value != null && value !== "") return value;
    }
  }
  return "";
}

function normalizeName(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " " )
    .replace(/\s+/g, " " )
    .trim();
}

function normalizeSearchValue(value) {
  return normalizeName(value).toLowerCase();
}

function showClientsToast(message) {
  const raw = String(message || "").trim();
  const hasCyrillic = /[А-Яа-яЁё]/.test(raw);
  const hasQuestionMarks = raw.includes("?");
  const text = hasCyrillic && !hasQuestionMarks ? raw : "Сохранено.";
  let toast = document.getElementById("clients-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "clients-toast";
    toast.className = "clients-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.add("show");
  if (clientsToastTimer) clearTimeout(clientsToastTimer);
  clientsToastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}


function matchesSearch(value, query) {
  if (!query) return true;
  const normalizedValue = normalizeSearchValue(value);
  return normalizedValue.includes(query);
}

function rowMatchesUnifiedSearch(row, query) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return true;
  if (!row || typeof row !== "object") return false;
  const source = row.__source || row;
  const flat = flattenClientRow(source);
  const values = [];
  Object.entries(flat).forEach(([key, value]) => {
    if (String(key).startsWith("__")) return;
    if (value == null) return;
    if (typeof value === "object") {
      try {
        values.push(JSON.stringify(value));
      } catch (_) {}
      return;
    }
    values.push(String(value));
  });
  const normalizedRow = normalizeSearchValue(values.join(" "));
  if (normalizedRow.includes(normalizedQuery)) return true;
  const compactRow = normalizedRow.replace(/[^a-z0-9\u0430-\u044fё]/gi, "");
  const compactQuery = normalizedQuery.replace(/[^a-z0-9\u0430-\u044fё]/gi, "");
  if (!compactQuery) return true;
  return compactRow.includes(compactQuery);
}

function setRowFieldValue(row, keys, value) {
  if (!row || typeof row !== "object") return;
  let updated = false;
  keys.forEach((key) => {
    if (key in row) {
      row[key] = value;
      updated = true;
    }
  });
  if (!updated && keys.length) {
    row[keys[0]] = value;
  }
}

function getSumToValue(row) {
  return pickValue(row, "SumTO", "Сумма ТО", "СуммаТО");
}

function ensureSumToSnapshot(rows) {
  if (!Array.isArray(rows)) return;
  rows.forEach((row) => {
    if (!row || typeof row !== "object") return;
    if (row.__sumToSnapshotInitialized) return;
    row.__sumToSnapshot = getSumToValue(row);
    row.__sumToSnapshotInitialized = true;
  });
}

function getSumStatusMap(row) {
  if (!row || typeof row !== "object") return {};
  if (!row.__sumToStatus || typeof row.__sumToStatus !== "object") {
    row.__sumToStatus = {};
  }
  return row.__sumToStatus;
}

function getSumAmountMap(row) {
  if (!row || typeof row !== "object") return {};
  if (!row.__sumToByMonth || typeof row.__sumToByMonth !== "object") {
    row.__sumToByMonth = {};
  }
  return row.__sumToByMonth;
}

function ensureSumStatusSnapshot(rows) {
  if (!Array.isArray(rows)) return;
  rows.forEach((row) => {
    if (!row || typeof row !== "object") return;
    if (row.__sumStatusSnapshotInitialized) return;
    const map = getSumStatusMap(row);
    row.__sumStatusSnapshot = JSON.stringify(map || {});
    row.__sumStatusSnapshotInitialized = true;
  });
}

function formatYearMonth(year, monthIndex) {
  const month = String(monthIndex + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getMonthOptions() {
  return [
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
}

function getMonthShortOptions() {
  return [
    "янв",
    "фев",
    "мар",
    "апр",
    "май",
    "июн",
    "июл",
    "авг",
    "сен",
    "окт",
    "ноя",
    "дек",
  ];
}

function buildClientPayload(row) {
  if (!row || typeof row !== "object") return {};
  const usedKeys = new Set();
  const addKeys = (...keys) => {
    keys.forEach((key) => {
      if (key) usedKeys.add(key);
    });
  };

  const clientName = pickValue(row, "Client", "client", "Клиент");
  const uid = pickValue(row, "UID", "uid");
  const manager = pickValue(row, "Manager", "Менеджер");
  const orgName = pickValue(row, "Org", "org", "Орг");
  const inn = pickValue(row, "INN", "ИНН");
  const kpp = pickValue(row, "KPP", "КПП");
  const ogrn = pickValue(row, "OGRN", "ОГРН");
  const bik = pickValue(row, "BIK", "БИК");
  const cor = pickValue(row, "COR", "Кор. счет", "Кор счет");
  const rs = pickValue(row, "RS", "Р/С", "Р/C", "РС");
  const firstClient = pickValue(row, "FirstClient", "Контактное лицо");
  const email = pickValue(row, "Email", "Эл. почта", "Эл почта");
  const number = pickValue(row, "Number", "Контактный номер");
  const rateTo = pickValue(row, "RateTO", "Тип обслуживания");
  const sumTo = pickValue(row, "SumTO", "Сумма ТО", "СуммаТО");
  const dolg = pickValue(row, "DOLG", "Должник", "Должник?");
  const lkPartner = pickValue(row, "LKPartner");
  const lkPyrus = pickValue(row, "LKPyrus");
  const rateIiko = pickValue(row, "RateIIKO");
  const externalId = pickValue(row, "ID");
  const recordId = pickValue(row, "id");
  const createdAt = pickValue(row, "createdAt");
  const updatedAt = pickValue(row, "updatedAt");

  addKeys(
    "Client",
    "client",
    "Клиент",
    "UID",
    "uid",
    "Manager",
    "Менеджер",
    "Org",
    "org",
    "Орг",
    "INN",
    "ИНН",
    "KPP",
    "КПП",
    "OGRN",
    "ОГРН",
    "BIK",
    "БИК",
    "COR",
    "Кор. счет",
    "Кор счет",
    "RS",
    "Р/С",
    "Р/C",
    "РС",
    "FirstClient",
    "Контактное лицо",
    "Email",
    "Эл. почта",
    "Эл почта",
    "Number",
    "Контактный номер",
    "RateTO",
    "Тип обслуживания",
    "SumTO",
    "Сумма ТО",
    "СуммаТО",
    "DOLG",
    "Должник",
    "Должник?",
    "LKPartner",
    "LKPyrus",
    "RateIIKO",
    "ID",
    "id",
    "createdAt",
    "updatedAt"
  );

  const other = {};
  Object.keys(row).forEach((key) => {
    if (String(key).startsWith("__")) return;
    if (usedKeys.has(key)) return;
    other[key] = row[key];
  });

  const sumStatusMap = getSumStatusMap(row);
  const hasSumStatus = Object.keys(sumStatusMap || {}).length > 0;

  return {
    client: {
      name: clientName,
      uid,
      lkPartner,
      lkPyrus,
      rateIiko,
    },
    responsible: {
      manager,
    },
    org: {
      name: orgName,
      inn,
      kpp,
      ogrn,
      bik,
      cor,
      rs,
    },
    contacts: {
      firstClient,
      email,
      number,
    },
    service: {
      rateTo,
      sumTo,
      dolg,
    },
    links: {
      lkPartner,
      lkPyrus,
    },
    meta: {
      externalId,
      recordId,
      createdAt,
      updatedAt,
    },
    sumStatus: hasSumStatus ? sumStatusMap : {},
    other,
  };
}

function buildPayToPayload(row) {
  if (!row || typeof row !== "object") return null;
  const sumStatusMap = getSumStatusMap(row);
  const hasSumStatus = Object.keys(sumStatusMap || {}).length > 0;
  if (!hasSumStatus) return null;
  let snapshotMap = {};
  if (row.__sumStatusSnapshotInitialized) {
    try {
      snapshotMap = JSON.parse(String(row.__sumStatusSnapshot || "")) || {};
    } catch (_) {
      snapshotMap = {};
    }
  }
  const changedEntries = Object.entries(sumStatusMap).filter(([month, status]) => {
    const prev = snapshotMap ? snapshotMap[month] : undefined;
    return String(prev ?? "") !== String(status ?? "");
  });
  if (!changedEntries.length) return null;
  const externalId = pickValue(row, "ID");
  const sumTo = getSumToValue(row);
  return changedEntries.map(([month, status]) => ({
    externalId,
    sumTo,
    month: String(month).replace("-", ""),
    status,
  }));
}

function buildSumToPayload(row) {
  if (!row || typeof row !== "object") return null;
  const externalId = pickValue(row, "ID");
  const sumTo = getSumToValue(row);
  if (!externalId) return null;
  if (row.__sumToSnapshotInitialized && String(sumTo ?? "") === String(row.__sumToSnapshot ?? "")) {
    return null;
  }
  return { externalId, sumTo };
}

function getManagerValue(row) {
  return pickValue(row, "Manager", "Менеджер");
}

function getClientNameValue(row) {
  return pickValue(row, "Client", "client", "Клиент");
}

function getManagersList(rows) {
  const managers = new Set();
  rows.forEach((row) => {
    const value = normalizeName(getManagerValue(row));
    if (value) managers.add(value);
  });
  return Array.from(managers).sort((a, b) => a.localeCompare(b, "ru"));
}

function ensureManagerSelection(rows) {
  const managers = getManagersList(rows);
  if (clientsManagerSelected === null) {
    try {
      const raw = localStorage.getItem(CLIENTS_MANAGER_FILTER_KEY);
      if (raw) {
        const stored = JSON.parse(raw);
        if (Array.isArray(stored)) {
          const normalized = stored.map((value) => normalizeName(value)).filter(Boolean);
          const filtered = normalized.filter((value) => managers.includes(value));
          clientsManagerSelected = new Set(filtered);
        }
      }
    } catch (_) {}
    if (clientsManagerSelected === null || !clientsManagerSelected.size) {
      clientsManagerSelected = new Set(managers);
    }
  } else {
    clientsManagerSelected = new Set(
      Array.from(clientsManagerSelected).filter((value) => managers.includes(value))
    );
  }
  return managers;
}

function saveManagerSelection() {
  try {
    const list = clientsManagerSelected ? Array.from(clientsManagerSelected) : [];
    const normalized = list.map((value) => normalizeName(value)).filter(Boolean);
    localStorage.setItem(CLIENTS_MANAGER_FILTER_KEY, JSON.stringify(normalized));
  } catch (_) {}
}

function isManagerFilterActive(managers) {
  if (!clientsManagerSelected || !managers.length) return false;
  return clientsManagerSelected.size < managers.length;
}

function updateManagerFilterButtonState(managers) {
  if (!clientsManagerFilterButton) return;
  clientsManagerFilterButton.classList.toggle("active", isManagerFilterActive(managers));
}

function closeManagerFilterPopover() {
  if (!clientsManagerFilterPopoverEl) return;
  clientsManagerFilterPopoverEl.remove();
  clientsManagerFilterPopoverEl = null;
  if (clientsManagerFilterBackdropEl) {
    clientsManagerFilterBackdropEl.classList.add("hidden");
    clientsManagerFilterBackdropEl.innerHTML = "";
  }
  if (clientsManagerFilterKeydownHandler) {
    document.removeEventListener("keydown", clientsManagerFilterKeydownHandler);
    clientsManagerFilterKeydownHandler = null;
  }
}

function closeClientsSearchPopover() {
  if (!clientsSearchPopoverEl) return;
  clientsSearchPopoverEl.remove();
  clientsSearchPopoverEl = null;
  if (clientsSearchBackdropEl) {
    clientsSearchBackdropEl.classList.add("hidden");
    clientsSearchBackdropEl.innerHTML = "";
  }
  if (clientsSearchKeydownHandler) {
    document.removeEventListener("keydown", clientsSearchKeydownHandler);
    clientsSearchKeydownHandler = null;
  }
}

function openClientsSearchPopover({ title, value, onChange }) {
  if (!clientsSearchBackdropEl) {
    clientsSearchBackdropEl = document.createElement("div");
    clientsSearchBackdropEl.className = "clients-search-backdrop";
    clientsSearchBackdropEl.addEventListener("click", (event) => {
      if (clientsSearchMouseDownInside) {
        clientsSearchMouseDownInside = false;
        return;
      }
      if (event.target !== clientsSearchBackdropEl) return;
      closeClientsSearchPopover();
    });
    document.body.appendChild(clientsSearchBackdropEl);
  }

  clientsSearchBackdropEl.innerHTML = "";
  clientsSearchBackdropEl.classList.remove("hidden");

  const popover = document.createElement("div");
  popover.className = "clients-search-popover";
  popover.innerHTML = `
    <div class="clients-search-header">
      <div>
        <div class="clients-search-title">${escapeHtml(title)}</div>
        <div class="clients-search-subtitle">Введите текст для поиска</div>
      </div>
      <button class="clients-search-close" type="button">✕</button>
    </div>
    <div class="clients-search-body">
      <input class="clients-search-input" type="text" value="${escapeHtml(value)}" placeholder="Поиск...">
    </div>
    <div class="clients-search-footer">
      <button class="btn clients-search-clear" type="button">Очистить</button>
      <button class="btn primary clients-search-apply" type="button">Применить</button>
    </div>
  `;

  popover.addEventListener("click", (event) => event.stopPropagation());
  popover.addEventListener("pointerdown", (event) => {
    clientsSearchMouseDownInside = true;
    event.stopPropagation();
  });
  popover.querySelector(".clients-search-close")?.addEventListener("click", closeClientsSearchPopover);
  const input = popover.querySelector(".clients-search-input");
  const applyBtn = popover.querySelector(".clients-search-apply");
  const clearBtn = popover.querySelector(".clients-search-clear");

  const applyValue = () => {
    const nextValue = normalizeSearchValue(input?.value || "");
    onChange(nextValue);
    if (clientsLastData) renderClientsTable(clientsLastData);
  };

  input?.addEventListener("pointerdown", (event) => {
    clientsSearchMouseDownInside = true;
    event.stopPropagation();
  });
  input?.addEventListener("focus", () => {
    const len = input.value.length;
    try {
      input.setSelectionRange(len, len);
    } catch (_) {}
  });
  input?.addEventListener("input", () => {
    applyValue();
  });

  applyBtn?.addEventListener("click", () => {
    applyValue();
    closeClientsSearchPopover();
  });

  clearBtn?.addEventListener("click", () => {
    if (input) input.value = "";
    onChange("");
    if (clientsLastData) renderClientsTable(clientsLastData);
  });

  clientsSearchPopoverEl = popover;
  clientsSearchBackdropEl.appendChild(popover);

  clientsSearchKeydownHandler = (event) => {
    if (event.key === "Escape") closeClientsSearchPopover();
  };
  document.addEventListener("keydown", clientsSearchKeydownHandler);
  setTimeout(() => {
    if (!input) return;
    input.focus();
    const len = input.value.length;
    try {
      input.setSelectionRange(len, len);
    } catch (_) {}
  }, 0);
}

function openManagerFilterPopover(anchorEl, rows) {
  const managers = ensureManagerSelection(rows);
  updateManagerFilterButtonState(managers);

  if (!clientsManagerFilterBackdropEl) {
    clientsManagerFilterBackdropEl = document.createElement("div");
    clientsManagerFilterBackdropEl.className = "employee-filter-popover-backdrop";
    clientsManagerFilterBackdropEl.addEventListener("click", closeManagerFilterPopover);
    document.body.appendChild(clientsManagerFilterBackdropEl);
  }

  clientsManagerFilterBackdropEl.innerHTML = "";
  clientsManagerFilterBackdropEl.classList.remove("hidden");

  const popover = document.createElement("div");
  popover.className = "employee-filter-popover";
  const listItems = managers
    .map((manager) => {
      const checked = clientsManagerSelected?.has(manager) ? "checked" : "";
      return `
        <label class="employee-filter-item">
          <input type="checkbox" data-manager="${escapeHtml(manager)}" ${checked}>
          <span>${escapeHtml(manager)}</span>
        </label>
      `;
    })
    .join("");

  const allChecked = !isManagerFilterActive(managers) ? "checked" : "";
  popover.innerHTML = `
    <div class="employee-filter-popover-header">
      <div>
        <div class="employee-filter-header">Менеджеры</div>
        <div class="employee-filter-meta">Выберите менеджеров</div>
      </div>
      <button class="employee-filter-close" type="button">✕</button>
    </div>
    <div class="employee-filter-list">
      <label class="employee-filter-item employee-filter-master">
        <input type="checkbox" data-manager="__all__" ${allChecked}>
        <span>Все</span>
      </label>
      ${listItems || '<div class="employee-filter-empty">Нет менеджеров</div>'}
    </div>
    <div class="employee-filter-controls">
      <button class="btn toggle employee-filter-close-action" type="button">Закрыть</button>
    </div>
  `;

  popover.querySelector(".employee-filter-close")?.addEventListener("click", closeManagerFilterPopover);
  popover
    .querySelector(".employee-filter-close-action")
    ?.addEventListener("click", closeManagerFilterPopover);
  popover.addEventListener("click", (event) => event.stopPropagation());

  popover.querySelectorAll("input[type=\"checkbox\"]").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.manager;
      if (key === "__all__") {
      if (input.checked) {
        clientsManagerSelected = new Set(managers);
      } else {
        clientsManagerSelected = new Set();
      }
        popover.querySelectorAll("input[data-manager]").forEach((item) => {
          if (item.dataset.manager !== "__all__") item.checked = input.checked;
        });
      } else {
        if (!clientsManagerSelected) clientsManagerSelected = new Set(managers);
        if (input.checked) clientsManagerSelected.add(key);
        else clientsManagerSelected.delete(key);
        const master = popover.querySelector("input[data-manager=\"__all__\"]");
        if (master) master.checked = !isManagerFilterActive(managers);
      }
      updateManagerFilterButtonState(managers);
      saveManagerSelection();
      if (clientsLastData) renderClientsTable(clientsLastData);
    });
  });

  clientsManagerFilterPopoverEl = popover;
  clientsManagerFilterBackdropEl.appendChild(popover);

  clientsManagerFilterKeydownHandler = (event) => {
    if (event.key === "Escape") closeManagerFilterPopover();
  };
  document.addEventListener("keydown", clientsManagerFilterKeydownHandler);
}

function removeClientsFilters() {
  const bar = clientsViewEl?.querySelector(".clients-filters");
  if (bar) bar.remove();
  clientsManagerFilter = "all";
  clientsClientFilter = "all";
}

function normalizeClientsPayload(raw) {
  if (typeof raw === "string") {
    try {
      return normalizeClientsPayload(JSON.parse(raw));
    } catch (_) {
      return { rows: [], columns: null };
    }
  }
  if (Array.isArray(raw)) {
    if (raw.length === 1 && raw[0] && typeof raw[0] === "object") {
      const keys = Object.keys(raw[0]);
      if (keys.length === 1 && Array.isArray(raw[0][keys[0]])) {
        return { rows: raw[0][keys[0]], columns: raw[0].columns || null };
      }
    }
    return { rows: raw, columns: null };
  }
  if (raw && typeof raw === "object") {
    if (raw.body != null) return normalizeClientsPayload(raw.body);
    if (raw.data?.body != null) return normalizeClientsPayload(raw.data.body);
    if (raw.result != null) return normalizeClientsPayload(raw.result);
    if (raw.response != null) return normalizeClientsPayload(raw.response);
    if (Array.isArray(raw.rows)) return { rows: raw.rows, columns: raw.columns || null };
    if (Array.isArray(raw.items)) return { rows: raw.items, columns: raw.columns || null };
    if (Array.isArray(raw.data)) return { rows: raw.data, columns: raw.columns || null };
    if (Array.isArray(raw.clients)) return { rows: raw.clients, columns: raw.columns || null };
    const keys = Object.keys(raw);
    if (keys.length === 1 && Array.isArray(raw[keys[0]])) {
      return { rows: raw[keys[0]], columns: raw.columns || null };
    }
    return { rows: [raw], columns: raw.columns || null };
  }
  return { rows: [], columns: null };
}

function formatClientCell(value) {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function normalizeNestedKey(parent, child) {
  const parentKey = String(parent || "").trim();
  const childKey = String(child || "").trim();
  return [parentKey, childKey].filter(Boolean).join(" ");
}

function flattenClientRow(row) {
  if (!row || typeof row !== "object") return { value: formatClientCell(row) };
  const flat = {};
  Object.keys(row).forEach((key) => {
    if (String(key).startsWith("__")) return;
    const value = row[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.keys(value).forEach((childKey) => {
        const nestedKey = normalizeNestedKey(key, childKey);
        flat[nestedKey] = formatClientCell(value[childKey]);
      });
    } else {
      flat[key] = formatClientCell(value);
    }
  });
  return flat;
}

function normalizeClientRows(rows) {
  return rows.map((row) => {
    const flat = flattenClientRow(row);
    Object.defineProperty(flat, "__source", { value: row, enumerable: false });
    return flat;
  });
}

function getClientValue(row, col) {
  if (!row || typeof row !== "object") return "";
  if (col === "Клиент" || col === "Client") return row["Клиент"] ?? row.Client ?? row.client ?? "";
  if (col === "UID") return row.UID ?? row.uid ?? "";
  if (col === "Должник" || col === "Должник?" || col === "DOLG") {
    return row["Должник"] ?? row["Должник?"] ?? row.DOLG ?? row.debtor ?? "";
  }
  return row[col] ?? "";
}

function createClientsPopover() {
  if (clientsPopoverBackdropEl) return;
  clientsPopoverBackdropEl = document.createElement("div");
  clientsPopoverBackdropEl.className = "shift-popover-backdrop hidden";
  clientsPopoverEl = document.createElement("div");
  clientsPopoverEl.className = "shift-popover hidden";
  clientsPopoverBackdropEl.addEventListener("click", closeClientsPopover);
  document.body.appendChild(clientsPopoverBackdropEl);
  document.body.appendChild(clientsPopoverEl);
}

function positionClientsPopover(anchorEl) {
  if (!clientsPopoverEl || !anchorEl) return;
  const rect = anchorEl.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  clientsPopoverEl.style.left = "0px";
  clientsPopoverEl.style.top = "0px";

  const popoverRect = clientsPopoverEl.getBoundingClientRect();
  const popoverWidth = popoverRect.width || 420;
  let popoverHeight = popoverRect.height || 260;
  const maxHeight = Math.max(200, viewportHeight - 32);
  if (popoverHeight > maxHeight) {
    clientsPopoverEl.style.maxHeight = `${maxHeight}px`;
    clientsPopoverEl.style.overflowY = "auto";
    popoverHeight = maxHeight;
  } else {
    clientsPopoverEl.style.maxHeight = "";
    clientsPopoverEl.style.overflowY = "";
  }

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

  clientsPopoverEl.style.left = `${left}px`;
  clientsPopoverEl.style.top = `${top}px`;
}

function closeClientsPopover() {
  if (!clientsPopoverEl) return;
  clientsPopoverEl.classList.remove("open");
  clientsPopoverBackdropEl.classList.add("hidden");
  if (clientsPopoverKeydownHandler) {
    document.removeEventListener("keydown", clientsPopoverKeydownHandler);
    clientsPopoverKeydownHandler = null;
  }
  setTimeout(() => {
    clientsPopoverEl.classList.add("hidden");
    clientsPopoverEl.innerHTML = "";
  }, 140);
}

function openClientsPopover(contentHtml, anchorEl, options = {}) {
  if (!clientsPopoverEl) return;
  clientsPopoverEl.innerHTML = contentHtml;
  clientsPopoverEl.classList.remove("clients-popover-wide", "clients-popover-readonly");
  if (options.className) {
    String(options.className)
      .split(/\s+/)
      .filter(Boolean)
      .forEach((name) => clientsPopoverEl.classList.add(name));
  }
  clientsPopoverBackdropEl.classList.remove("hidden");
  clientsPopoverEl.classList.remove("hidden");
  positionClientsPopover(anchorEl || clientsPopoverEl);
  requestAnimationFrame(() => {
    clientsPopoverEl.classList.add("open");
  });
  clientsPopoverEl
    .querySelector(".shift-popover-close")
    .addEventListener("click", closeClientsPopover);
  const cancelButton = clientsPopoverEl.querySelector(".clients-popover-cancel");
  if (cancelButton) cancelButton.addEventListener("click", closeClientsPopover);
  const saveButton = clientsPopoverEl.querySelector(".clients-popover-save");
  if (saveButton) {
    if (typeof options.onSave === "function") {
      saveButton.addEventListener("click", () => {
        const shouldClose = options.onSave() !== false;
        if (shouldClose) closeClientsPopover();
      });
    } else {
      saveButton.addEventListener("click", closeClientsPopover);
    }
  }
  if (typeof options.onReady === "function") {
    options.onReady(clientsPopoverEl);
  }
  clientsPopoverKeydownHandler = (e) => {
    if (e.key === "Escape") closeClientsPopover();
  };
  document.addEventListener("keydown", clientsPopoverKeydownHandler);
}

function openClientsOrgPopover(sourceRow, anchorEl, rawRow = null) {
  const baseRow = sourceRow?.__source || sourceRow;
  const getValue = (...keys) =>
    pickValue(baseRow, ...keys) || (rawRow ? pickValue(rawRow, ...keys) : "");
  const orgName = getValue("ORG", "Org", "org", "Орг", "Организация");
  const clientName = getValue("Client", "client", "Клиент");
  const innValue = getValue("INN", "inn", "ИНН");
  const kppValue = getValue("KPP", "kpp", "КПП");
  const ogrnValue = getValue("OGRN", "ogrn", "ОГРН");
  const bikValue = getValue("BIK", "bik", "БИК");
  const corValue = getValue("COR", "cor", "Кор счет", "Кор. счет", "Корр счет", "Корр. счет", "Кор");
  const rsValue = getValue("RS", "rs", "Р/С", "РС", "Р/с");
  const title = orgName || clientName || "Организация";
  const subtitle = clientName ? `${clientName} • ${orgName || "Без организации"}` : orgName || "Редактирование";

  openClientsPopover(
    `
      <div class="shift-popover-header">
        <div>
          <div class="shift-popover-title">${escapeHtml(title)}</div>
          <div class="shift-popover-subtitle">${escapeHtml(subtitle)}</div>
        </div>
        <button class="shift-popover-close" type="button">✕</button>
      </div>

      <div class="shift-popover-body">
        <div class="shift-popover-section">
          <div class="shift-popover-section-title">Редактирование организации</div>

          <div class="field-row">
            <label>Организация</label>
            <input type="text" value="${escapeHtml(orgName)}" readonly class="clients-readonly-input">
          </div>

          <div class="field-row">
            <label>ИНН</label>
            <input type="text" value="${escapeHtml(innValue)}">
          </div>

          <div class="field-row">
            <label>КПП</label>
            <input type="text" value="${escapeHtml(kppValue)}">
          </div>

          <div class="field-row">
            <label>ОГРН</label>
            <input type="text" value="${escapeHtml(ogrnValue)}">
          </div>

          <div class="field-row">
            <label>БИК</label>
            <input type="text" value="${escapeHtml(bikValue)}">
          </div>

          <div class="field-row">
            <label>Кор. счет</label>
            <input type="text" value="${escapeHtml(corValue)}">
          </div>

          <div class="field-row">
            <label>Р/С</label>
            <input type="text" value="${escapeHtml(rsValue)}">
          </div>
        </div>
      </div>

      <div class="shift-popover-footer">
        <button class="btn clients-popover-cancel" type="button">Отмена</button>
        <button class="btn primary clients-popover-save" type="button">Сохранить локально</button>
      </div>
    `,
    anchorEl,
    {
      onSave: () => {
        sourceRow.__nonSumDirty = true;
        const inputs = clientsPopoverEl?.querySelectorAll(".shift-popover-section input");
        const orgInput = inputs?.[0];
        const innInput = inputs?.[1];
        const kppInput = inputs?.[2];
        const ogrnInput = inputs?.[3];
        const bikInput = inputs?.[4];
        const corInput = inputs?.[5];
        const rsInput = inputs?.[6];
        const nextOrg = orgInput?.value?.trim() ?? orgName;
        const nextInn = innInput?.value?.trim() ?? innValue;
        const nextKpp = kppInput?.value?.trim() ?? kppValue;
        const nextOgrn = ogrnInput?.value?.trim() ?? ogrnValue;
        const nextBik = bikInput?.value?.trim() ?? bikValue;
        const nextCor = corInput?.value?.trim() ?? corValue;
        const nextRs = rsInput?.value?.trim() ?? rsValue;

        setRowFieldValue(sourceRow, ["ORG", "Org", "org", "Орг", "Организация"], nextOrg);
        setRowFieldValue(sourceRow, ["INN", "ИНН"], nextInn);
        setRowFieldValue(sourceRow, ["KPP", "КПП"], nextKpp);
        setRowFieldValue(sourceRow, ["OGRN", "ОГРН"], nextOgrn);
        setRowFieldValue(sourceRow, ["BIK", "БИК"], nextBik);
        setRowFieldValue(sourceRow, ["COR", "Кор счет", "Кор. счет", "Корр счет", "Корр. счет", "Кор"], nextCor);
        setRowFieldValue(sourceRow, ["RS", "Р/С", "РС", "Р/с"], nextRs);

        const externalId = String(pickValue(sourceRow, "ID") ?? "").trim();
        if (externalId) {
          if (nextOrg !== String(orgName ?? "").trim()) {
            sendContactWebhook(CLIENTS_ORG_URL, externalId, "org", nextOrg, "Организация сохранена.", false);
          }
          if (nextInn !== String(innValue ?? "").trim()) {
            sendContactWebhook(CLIENTS_INN_URL, externalId, "inn", nextInn, "ИНН сохранен.", false);
          }
          if (nextKpp !== String(kppValue ?? "").trim()) {
            sendContactWebhook(CLIENTS_KPP_URL, externalId, "kpp", nextKpp, "КПП сохранен.", false);
          }
          if (nextOgrn !== String(ogrnValue ?? "").trim()) {
            sendContactWebhook(CLIENTS_OGRN_URL, externalId, "ogrn", nextOgrn, "ОГРН сохранен.", false);
          }
          if (nextBik !== String(bikValue ?? "").trim()) {
            sendContactWebhook(CLIENTS_BIK_URL, externalId, "bik", nextBik, "БИК сохранен.", false);
          }
          if (nextCor !== String(corValue ?? "").trim()) {
            sendContactWebhook(CLIENTS_KOR_URL, externalId, "kor", nextCor, "Кор. счет сохранен.", false);
          }
          if (nextRs !== String(rsValue ?? "").trim()) {
            sendContactWebhook(CLIENTS_RC_URL, externalId, "rc", nextRs, "Р/С сохранен.", false);
          }
        }
        if (clientsLastData) {
          markClientDirty(sourceRow);
          writeClientsCache(clientsLastData);
          renderClientsTable(clientsLastData);
        }
      },
    }
  );
}

function openClientsClientPopover(sourceRow, anchorEl) {
  const clientName = pickValue(sourceRow, "Client", "client", "Клиент");
  const uidValue = pickValue(sourceRow, "UID", "uid");
  const lkPartner = pickValue(sourceRow, "LKPartner", "ЛК клиента", "ЛК партнера", "ЛК партнёр");
  const lkPyrus = pickValue(sourceRow, "LKPyrus", "ЛК Pyrus");
  const rateIiko = pickValue(sourceRow, "RateIIKO", "Тариф iiko");
  const title = clientName || "Клиент";
  const subtitle = clientName ? `${clientName} • данные клиента` : "Данные клиента";

  openClientsPopover(
    `
      <div class="shift-popover-header">
        <div>
          <div class="shift-popover-title">${escapeHtml(title)}</div>
          <div class="shift-popover-subtitle">${escapeHtml(subtitle)}</div>
        </div>
        <button class="shift-popover-close" type="button">✕</button>
      </div>

      <div class="shift-popover-body">
        <div class="shift-popover-section">
          <div class="shift-popover-section-title">Данные клиента</div>

          <div class="field-row">
            <label>Клиент</label>
            <input type="text" value="${escapeHtml(clientName)}">
          </div>

          <div class="field-row">
            <label>UID</label>
            <input type="text" value="${escapeHtml(uidValue)}">
          </div>

          <div class="field-row">
            <label>ЛК партнера</label>
            <input type="text" value="${escapeHtml(lkPartner)}">
          </div>

          <div class="field-row">
            <label>ЛК Pyrus</label>
            <input type="text" value="${escapeHtml(lkPyrus)}">
          </div>

          <div class="field-row">
            <label>Тариф iiko</label>
            <input type="text" value="${escapeHtml(rateIiko)}">
          </div>
        </div>

        <div class="shift-popover-note">
          Дубликат окна графика. Дальше настроим поля и сохранение.
        </div>
      </div>

      <div class="shift-popover-footer">
        <button class="btn secondary clients-popover-new" type="button">NEW</button>
        <button class="btn clients-popover-cancel" type="button">Отмена</button>
        <button class="btn primary clients-popover-save" type="button">Сохранить локально</button>
      </div>
    `,
    anchorEl,
    {
      className: "clients-popover-wide",
      onSave: () => {
        const newButton = clientsPopoverEl?.querySelector(".clients-popover-new");
        sourceRow.__nonSumDirty = true;
        const newActive = !!newButton?.classList.contains("active");
        const originalValue = pickValue(sourceRow, "NEW", "New", "new", "Новый", "новый");
        const originalActive = isCoChecked(originalValue);
        setRowFieldValue(
          sourceRow,
          ["NEW", "New", "new", "Новый", "новый"],
          newActive ? "checked" : "unchecked"
        );
        const externalId = String(
          pickValue(sourceRow, "ID", "external_id", "externalId", "id") ?? ""
        ).trim();
        if (externalId && newActive !== originalActive) {
          sendNewWebhook(externalId, newActive ? "checked" : "unchecked");
        }
        if (clientsLastData) {
          markClientDirty(sourceRow);
          writeClientsCache(clientsLastData);
          renderClientsTable(clientsLastData);
        }
      },
    }
  );

  const section = clientsPopoverEl?.querySelector(".shift-popover-section");
  if (section) {
    const inputs = Array.from(section.querySelectorAll("input"));
    inputs.forEach((input) => {
      input.readOnly = true;
      input.classList.add("clients-readonly-input");
    });

    const replaceWithLink = (input) => {
      if (!input) return;
      const value = String(input.value || "").trim();
      const linkEl = document.createElement(value ? "a" : "span");
      linkEl.className = `clients-link-field${value ? "" : " is-empty"}`;
      linkEl.textContent = value || "—";
      if (value) {
        linkEl.href = value;
        linkEl.target = "_blank";
        linkEl.rel = "noopener noreferrer";
      }
      input.replaceWith(linkEl);
    };

    replaceWithLink(inputs[2]);
    replaceWithLink(inputs[3]);
  }

  const newButton = clientsPopoverEl?.querySelector(".clients-popover-new");
  if (newButton) {
    const newValue = pickValue(sourceRow, "NEW", "New", "new", "Новый", "новый");
    newButton.classList.toggle("active", isCoChecked(newValue));
    newButton.addEventListener("click", () => {
      newButton.classList.toggle("active");
    });
  }

}

function openClientsFirstClientPopover(sourceRow, anchorEl) {
  const firstClient = pickValue(sourceRow, "FirstClient", "Контактное лицо");
  const numberValue = pickValue(sourceRow, "Number", "Контактный номер");
  const emailValue = pickValue(sourceRow, "Email", "email", "Эл. почта", "Эл почта");
  const title = firstClient || "Имя";
  const subtitle = firstClient ? `${firstClient} • контакты` : "Контакты клиента";

  openClientsPopover(
    `
      <div class="shift-popover-header">
        <div>
          <div class="shift-popover-title">${escapeHtml(title)}</div>
          <div class="shift-popover-subtitle">${escapeHtml(subtitle)}</div>
        </div>
        <button class="shift-popover-close" type="button">✕</button>
      </div>

      <div class="shift-popover-body">
        <div class="shift-popover-section">
          <div class="shift-popover-section-title">Контактное лицо</div>

          <div class="field-row">
            <label>Имя</label>
            <input type="text" value="${escapeHtml(firstClient)}">
          </div>

          <div class="field-row">
            <label>Номер</label>
            <input type="text" inputmode="numeric" placeholder="+7XXXXXXXXXX" value="${escapeHtml(numberValue)}">
            <div class="field-error">Номер должен быть в формате +7XXXXXXXXXX</div>
          </div>

          <div class="field-row">
            <label>Email</label>
            <input type="text" value="${escapeHtml(emailValue)}">
          </div>
        </div>

        <div class="shift-popover-note">
          Дубликат окна графика. Дальше настроим поля и сохранение.
        </div>
      </div>

      <div class="shift-popover-footer">
        <button class="btn clients-popover-cancel" type="button">Отмена</button>
        <button class="btn primary clients-popover-save" type="button">Сохранить локально</button>
      </div>
    `,
    anchorEl,
    {
      onReady: (popoverEl) => {
        const inputs = popoverEl?.querySelectorAll(".shift-popover-section input");
        const firstInput = inputs?.[0];
        const numberInput = inputs?.[1];
        const emailInput = inputs?.[2];
        const saveButton = popoverEl?.querySelector(".clients-popover-save");
        const originalFirst = (firstInput?.value || "").trim();
        const originalNumberDigits = (numberValue || "").replace(/\D/g, "");
        const originalEmail = (emailInput?.value || "").trim();

        const normalizeDigits = (value) =>
          String(value || "").replace(/\D/g, "").slice(0, 11);

        const applyNumberFormat = () => {
          if (!numberInput) return { digits: "", valid: true };
          let digits = normalizeDigits(numberInput.value);
          numberInput.value = digits ? `+${digits}` : "";
          const valid = !digits || (digits.length === 11 && digits.startsWith("7"));
          numberInput.classList.toggle("input-error", !valid);
          numberInput.parentElement?.classList.toggle("has-error", !valid);
          return { digits, valid };
        };

        const updateSaveState = () => {
          if (!saveButton) return;
          const firstValue = (firstInput?.value || "").trim();
          const emailValue = (emailInput?.value || "").trim();
          const { digits, valid } = applyNumberFormat();
          const hasChanges =
            firstValue !== originalFirst ||
            emailValue !== originalEmail ||
            digits !== originalNumberDigits;
          saveButton.disabled = !hasChanges || !valid;
        };

        if (saveButton) saveButton.disabled = true;
        firstInput?.addEventListener("input", updateSaveState);
        numberInput?.addEventListener("input", updateSaveState);
        emailInput?.addEventListener("input", updateSaveState);
        updateSaveState();
      },
      onSave: () => {
        sourceRow.__nonSumDirty = true;
        const inputs = clientsPopoverEl?.querySelectorAll(".shift-popover-section input");
        const firstInput = inputs?.[0];
        const numberInput = inputs?.[1];
        const emailInput = inputs?.[2];
        const nextFirst = firstInput?.value?.trim() ?? firstClient;
        const numberRaw = (numberInput?.value || "").trim();
        const numberDigits = numberRaw.replace(/\D/g, "").slice(0, 11);
        const normalizedNumber = numberDigits ? `+${numberDigits}` : "";
        if (numberInput) {
          const isValid = !numberDigits || (numberDigits.length === 11 && numberDigits.startsWith("7"));
          numberInput.classList.toggle("input-error", !isValid);
          numberInput.parentElement?.classList.toggle("has-error", !isValid);
          if (!isValid) {
            numberInput.focus();
            return false;
          }
        }
        const nextEmail = emailInput?.value?.trim() ?? emailValue;
        setRowFieldValue(sourceRow, ["FirstClient", "Контактное лицо"], nextFirst);
        setRowFieldValue(sourceRow, ["Number", "Контактный номер"], normalizedNumber || numberValue);
        setRowFieldValue(sourceRow, ["Email", "email", "Эл. почта", "Эл почта"], nextEmail);

        const externalId = String(pickValue(sourceRow, "ID") ?? "").trim();
        const originalFirst = String(firstClient ?? "").trim();
        const originalNumberDigits = String(numberValue ?? "").replace(/\D/g, "");
        const originalEmail = String(emailValue ?? "").trim();
        if (externalId) {
          if (nextFirst !== originalFirst) {
            sendContactWebhook(
              CLIENTS_FIRSTNAME_URL,
              externalId,
              "firstName",
              nextFirst,
              "Имя сохранено.",
              false
            );
          }
          if (numberDigits !== originalNumberDigits) {
            sendContactWebhook(
              CLIENTS_NUMBER_URL,
              externalId,
              "number",
              normalizedNumber,
              "Номер сохранен.",
              false
            );
          }
          if (nextEmail !== originalEmail) {
            sendContactWebhook(
              CLIENTS_EMAIL_URL,
              externalId,
              "email",
              nextEmail,
              "Email сохранен.",
              false
            );
          }
        }
        if (clientsLastData) {
          markClientDirty(sourceRow);
          writeClientsCache(clientsLastData);
          renderClientsTable(clientsLastData);
        }
      },
    }
  );
}

function openClientsManagerPopover(sourceRow, anchorEl, managers) {
  const currentManager = pickValue(sourceRow, "Manager", "Менеджер");
  const clientName = pickValue(sourceRow, "Client", "client", "Клиент");
  const title = currentManager || "Менеджер";
  const subtitle = clientName ? `${clientName} • менеджер` : "Выбор менеджера";

  const optionsHtml = (managers || [])
    .map((name) => {
      const selected = name === currentManager ? "selected" : "";
      return `<option value="${escapeHtml(name)}" ${selected}>${escapeHtml(name)}</option>`;
    })
    .join("");

  openClientsPopover(
    `
      <div class="shift-popover-header">
        <div>
          <div class="shift-popover-title">${escapeHtml(title)}</div>
          <div class="shift-popover-subtitle">${escapeHtml(subtitle)}</div>
        </div>
        <button class="shift-popover-close" type="button">✕</button>
      </div>

      <div class="shift-popover-body">
        <div class="shift-popover-section">
          <div class="shift-popover-section-title">Менеджер</div>

          <div class="field-row">
            <label>Менеджер</label>
            <select data-field="manager">
              ${optionsHtml}
            </select>
          </div>
        </div>

        <div class="shift-popover-note">
          Изменения сохраняются локально в браузере.
        </div>
      </div>

      <div class="shift-popover-footer">
        <button class="btn clients-popover-cancel" type="button">Отмена</button>
        <button class="btn primary clients-popover-save" type="button">Сохранить локально</button>
      </div>
    `,
    anchorEl,
    {
      onSave: () => {
        sourceRow.__nonSumDirty = true;
        const select = clientsPopoverEl?.querySelector('select[data-field="manager"]');
        const nextValue = select ? select.value : currentManager;
        setRowFieldValue(sourceRow, ["Manager", "Менеджер"], nextValue);
        if (clientsLastData) {
          markClientDirty(sourceRow);
          writeClientsCache(clientsLastData);
          renderClientsTable(clientsLastData);
        }
      },
    }
  );
}

function openClientsSumPopover(sourceRow, anchorEl) {
  const clientName = pickValue(sourceRow, "Client", "client", "Клиент");
  const orgName = pickValue(sourceRow, "Org", "org", "Орг");
  const sumValue = getSumToValue(sourceRow);
  const title = clientName || orgName || "Сумма ТО";
  const subtitle = clientName ? `${clientName} • сумма` : "Сумма ТО";
  const now = new Date();
  const monthNames = getMonthShortOptions();
  const year = now.getFullYear();
  const initialMonthKey = formatYearMonth(year, now.getMonth());
  const statusMap = getSumStatusMap(sourceRow);
  const statusOptions = ["Не оплачено", "Счет отправлен", "Оплачено"];

  let activeMonthKey = initialMonthKey;

  openClientsPopover(
    `
      <div class="shift-popover-header">
        <div>
          <div class="shift-popover-title">${escapeHtml(title)}</div>
          <div class="shift-popover-subtitle">${escapeHtml(subtitle)}</div>
        </div>
        <button class="shift-popover-close" type="button">✕</button>
      </div>

      <div class="shift-popover-body">
        <div class="shift-popover-section">
          <div class="shift-popover-section-title">Сумма ТО</div>

          <div class="field-row">
            <label>Сумма</label>
            <input type="text" data-field="sumto" value="${escapeHtml(sumValue)}">
          </div>

          <div class="field-row">
            <label>Год</label>
            <div class="clients-sum-period">
              <button class="btn clients-sum-year-btn" type="button" data-field="sumto-year-prev">‹</button>
              <div class="clients-sum-year" data-field="sumto-year-label">${year}</div>
              <button class="btn clients-sum-year-btn" type="button" data-field="sumto-year-next">›</button>
            </div>
          </div>

          <div class="clients-sum-calendar" data-field="sumto-calendar"></div>
          <div class="clients-sum-legend">
            <span class="clients-legend-item status-unpaid">Не оплачено</span>
            <span class="clients-legend-item status-sent">Счет отправлен</span>
            <span class="clients-legend-item status-paid">Оплачено</span>
          </div>
        </div>

        <div class="shift-popover-note">
          Изменения сохраняются локально в браузере.
        </div>
      </div>

      <div class="shift-popover-footer">
        <button class="btn clients-popover-cancel" type="button">Отмена</button>
        <button class="btn primary clients-popover-save" type="button">Сохранить локально</button>
      </div>
    `,
    anchorEl,
    {
      onSave: () => {
        const input = clientsPopoverEl?.querySelector('input[data-field="sumto"]');
        const nextValue = input ? input.value.trim() : "";
        setRowFieldValue(sourceRow, ["SumTO", "Сумма ТО", "СуммаТО"], nextValue);
        sourceRow.__sumToDirty = true;
        const amountMap = getSumAmountMap(sourceRow);
        if (activeMonthKey) {
          if (nextValue) amountMap[activeMonthKey] = nextValue;
          else delete amountMap[activeMonthKey];
        }
        if (typeof renderCalendar === "function") {
          renderCalendar(activeYear);
        }
        if (clientsLastData) {
          markClientDirty(sourceRow);
          writeClientsCache(clientsLastData);
          renderClientsTable(clientsLastData);
        }
        return false;
      },
    }
  );

  const calendarEl = clientsPopoverEl?.querySelector('[data-field="sumto-calendar"]');
  const yearLabelEl = clientsPopoverEl?.querySelector('[data-field="sumto-year-label"]');
  const yearPrevBtn = clientsPopoverEl?.querySelector('[data-field="sumto-year-prev"]');
  const yearNextBtn = clientsPopoverEl?.querySelector('[data-field="sumto-year-next"]');
  let activeYear = year;

  const getStatusClass = (status) => {
    if (status === "Оплачено") return "status-paid";
    if (status === "Счет отправлен") return "status-sent";
    return "status-unpaid";
  };

  const cycleStatus = (status) => {
    const index = statusOptions.indexOf(status);
    const nextIndex = index === -1 ? 0 : (index + 1) % statusOptions.length;
    return statusOptions[nextIndex];
  };

  const renderCalendar = (targetYear) => {
    if (!calendarEl) return;
    calendarEl.innerHTML = "";
    monthNames.forEach((name, idx) => {
      const monthKey = formatYearMonth(targetYear, idx);
      const status = statusMap[monthKey] || "Не оплачено";
      const amountMap = getSumAmountMap(sourceRow);
      const monthAmount = amountMap ? amountMap[monthKey] : "";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `clients-month-cell ${getStatusClass(status)}`;
      btn.dataset.month = String(idx);
      btn.dataset.year = String(targetYear);
      btn.dataset.status = status;
      btn.dataset.index = String(idx);
      if (idx % 4 === 3) btn.classList.add("month-cell-last-col");
      if (idx >= 8) btn.classList.add("month-cell-last-row");
      btn.title = `${name.toUpperCase()} • ${status}`;
      btn.innerHTML = `
        <span class="clients-month-name">${escapeHtml(name)}</span>
        ${monthAmount ? `<span class="clients-month-amount">${escapeHtml(monthAmount)}</span>` : ""}
      `;
      btn.addEventListener("click", () => {
        const nextStatus = cycleStatus(btn.dataset.status || "Не оплачено");
        btn.dataset.status = nextStatus;
        const nextKey = formatYearMonth(targetYear, idx);
        activeMonthKey = nextKey;
        statusMap[nextKey] = nextStatus;
        btn.classList.remove("status-unpaid", "status-sent", "status-paid");
        btn.classList.add(getStatusClass(nextStatus));
        sourceRow.__sumStatusDirty = true;
        markClientDirty(sourceRow);
      });
      calendarEl.appendChild(btn);
    });
  };

  const setYear = (value) => {
    activeYear = value;
    if (yearLabelEl) yearLabelEl.textContent = String(activeYear);
    renderCalendar(activeYear);
    positionClientsPopover(anchorEl || clientsPopoverEl);
  };

  renderCalendar(activeYear);
  positionClientsPopover(anchorEl || clientsPopoverEl);
  yearPrevBtn?.addEventListener("click", () => setYear(activeYear - 1));
  yearNextBtn?.addEventListener("click", () => setYear(activeYear + 1));
}

function renderClientsTable(raw) {
  if (!clientsTableWrapEl || !clientsStateEl) return;
  const { rows, columns } = normalizeClientsPayload(raw);
  ensureSumToSnapshot(rows);
  ensureSumStatusSnapshot(rows);
  removeClientsFilters();
  const managers = ensureManagerSelection(rows);
  updateManagerFilterButtonState(managers);
  const hasActiveManagerFilter = isManagerFilterActive(managers);
  const filteredRows = hasActiveManagerFilter
    ? rows.filter((row) => {
        if (clientsManagerSelected === null) return true;
        if (!clientsManagerSelected.size) return false;
        const managerValue = normalizeName(getManagerValue(row));
        if (!managerValue) return false;
        return clientsManagerSelected.has(managerValue);
      })
    : rows.slice();
  const searchedRows = filteredRows.filter((row) => rowMatchesUnifiedSearch(row, clientsSearchQuery));
  const fullSortedRows = [...rows].sort((a, b) => {
    const nameA = normalizeName(getClientNameValue(a));
    const nameB = normalizeName(getClientNameValue(b));
    return nameA.localeCompare(nameB, "ru", { sensitivity: "base" });
  });
  const sortedRows = [...searchedRows].sort((a, b) => {
    const nameA = normalizeName(getClientNameValue(a));
    const nameB = normalizeName(getClientNameValue(b));
    return nameA.localeCompare(nameB, "ru", { sensitivity: "base" });
  });
  const storedOrder = loadClientsOrder();
  const fullOrderKeys = buildClientOrder(fullSortedRows, storedOrder);
  const fullRowMap = new Map(
    fullSortedRows.map((row) => [getClientKey(row.__source || row), row])
  );
  const filteredKeySet = new Set(
    sortedRows.map((row) => getClientKey(row.__source || row)).filter(Boolean)
  );
  const orderedRows = fullOrderKeys
    .filter((key) => filteredKeySet.has(key))
    .map((key) => fullRowMap.get(key))
    .filter(Boolean);
  const normalizedRows = normalizeClientRows(orderedRows);
  const collapsedGroups = loadCollapsedGroups();
  const childrenByParent = new Map();
  const childKeys = new Set();
  const parentOrder = orderedRows.map((row) => getExternalIdValue(row.__source || row));
  const parentIdSet = new Set(parentOrder.filter((id) => id != null && id !== ""));
  orderedRows.forEach((row) => {
    const source = row.__source || row;
    const coValue = pickValue(source, "CO", "co");
    const numberCoRaw = pickValue(source, "NumberCO", "numberco", "numberCo");
    const numberCo = normalizeExternalId(numberCoRaw);
    if (!isCoChecked(coValue) || !numberCo) return;
    childrenByParent.set(numberCo, childrenByParent.get(numberCo) || []);
    childrenByParent.get(numberCo).push(row);
    childKeys.add(getExternalIdValue(source));
  });
  const hasGroups = childrenByParent.size > 0;
  const groupedRows = [];
  orderedRows.forEach((row) => {
    const source = row.__source || row;
    const extId = getExternalIdValue(source);
    const coValue = pickValue(source, "CO", "co");
    const numberCoRaw = pickValue(source, "NumberCO", "numberco", "numberCo");
    const numberCo = normalizeExternalId(numberCoRaw);
    const isChildRow = isCoChecked(coValue) && Boolean(numberCo) && childKeys.has(extId);
    const hasRealParent = Boolean(numberCo) && parentIdSet.has(numberCo);
    if (isChildRow && hasRealParent) return;
    groupedRows.push(row);
    const kids = childrenByParent.get(extId);
    if (kids && kids.length && !collapsedGroups.has(extId)) {
      groupedRows.push(...kids);
    }
  });
  const finalRows = normalizeClientRows(groupedRows.length ? groupedRows : orderedRows);
  const allNormalizedRows = normalizeClientRows(rows);
  const preferredCols = ["Клиент", "Client", "UID", "Должник", "Должник?", "DOLG"];
  const colLabelMap = new Map([
    ["Client", "Клиент"],
    ["DOLG", "Должник"],
    ["Org", "Юр. лицо"],
    ["ORG", "Юр. лицо"],
    ["FirstClient", "Контактное лицо"],
    ["RateTO", "Тип обслуживания"],
    ["SumTO", "Сумма ТО"],
    ["Manager", "Менеджер"],
  ]);
  const hiddenCols = new Set([
    "createdAt",
    "updatedAt",
    "id",
    "ID",
    "INN",
    "inn",
    "KPP",
    "ИНН",
    "КПП",
    "OGRN",
    "BIK",
    "COR",
    "RS",
    "UID",
    "uid",
    "LKPartner",
    "LKPyrus",
    "RateIIKO",
    "ОГРН",
    "БИК",
    "Кор",
    "Кор счет",
    "Р/С",
    "РС",
    "ЛК клиента",
    "ЛК Pyrus",
    "Тариф iiko",
    "Email",
    "email",
    "Number",
    "CO",
    "NumberCO",
    "NumberManager",
    "NumberManger",
    "ManagerNumber",
    "Номер менеджера",
    "НомерМенеджера",
    "NEW",
    "New",
    "new",
    "Новый",
    "новый",
  ]);

  const cols =
    Array.isArray(columns) && columns.length
      ? columns.map((c) => String(c)).filter((c) => !hiddenCols.has(c))
      : allNormalizedRows.length
        ? (() => {
            const order = [];
            const seen = new Set();
            const primary = Object.keys(allNormalizedRows[0] || {});
            primary.forEach((key) => {
              if (!seen.has(key)) {
                seen.add(key);
                order.push(key);
              }
            });
            allNormalizedRows.forEach((row) => {
              Object.keys(row || {}).forEach((key) => {
                if (!seen.has(key)) {
                  seen.add(key);
                  order.push(key);
                }
              });
            });
            preferredCols.forEach((key) => {
              if (seen.has(key)) {
                order.splice(order.indexOf(key), 1);
              }
            });
            const baseCols = [...preferredCols.filter((k) => seen.has(k)), ...order].filter(
              (key) => !hiddenCols.has(key)
            );
            const sumIndex = baseCols.indexOf("SumTO");
            if (sumIndex >= 0) {
              baseCols.splice(sumIndex, 1);
              baseCols.push("SumTO");
            }
            return baseCols;
          })()
        : preferredCols;

  clientsTableWrapEl.innerHTML = "";

  const fallbackMessage =
    typeof raw === "string" && raw
      ? `No data. Response: ${raw.slice(0, 300)}`
      : isManagerFilterActive(managers)
        ? "No data: manager filter"
        : "No data: empty";
  const emptyRowMessage = "";
  if (!cols.length) {
    clientsStateEl.textContent = fallbackMessage;
    clientsTableWrapEl.appendChild(clientsStateEl);
    return;
  }

  const table = document.createElement("table");
  table.className = "clients-table";
  const dragEnabled = true;
  let dragKey = null;

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  if (hasGroups) {
    const th = document.createElement("th");
    th.className = "clients-col-header clients-col-group";
    headerRow.appendChild(th);
  }
  if (dragEnabled) {
    const th = document.createElement("th");
    th.className = "clients-col-header clients-col-handle";
    headerRow.appendChild(th);
  }
  cols.forEach((col) => {
    const th = document.createElement("th");
    th.className = "clients-col-header";
    const colKey = String(col || "")
      .toLowerCase()
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, "")
      .trim();
    const displayLabel = colLabelMap.get(col) || col;
    if (colKey === "manager" || colKey === "менеджер") {
      const headerWrap = document.createElement("div");
      headerWrap.className = "employee-header";

      const name = document.createElement("span");
      name.className = "header-text";
      name.textContent = displayLabel;

      const filterBtn = document.createElement("button");
      filterBtn.type = "button";
      filterBtn.className = "employee-filter-btn";
      filterBtn.setAttribute("aria-label", "Фильтр менеджера");
      filterBtn.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18l-7 8v5l-4 2v-7z"></path></svg>';
      clientsManagerFilterButton = filterBtn;
      updateManagerFilterButtonState(ensureManagerSelection(rows));
      filterBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        openManagerFilterPopover(filterBtn, rows);
      });

      headerWrap.append(name, filterBtn);
      th.append(headerWrap);
    } else if (colKey === "client" || colKey === "клиент") {
      const headerWrap = document.createElement("div");
      headerWrap.className = "clients-search-header";

      const name = document.createElement("span");
      name.className = "header-text";
      name.textContent = displayLabel;

      const searchBtn = document.createElement("button");
      searchBtn.type = "button";
      searchBtn.className = "clients-search-btn";
      searchBtn.setAttribute("aria-label", "Поиск по клиенту");
      searchBtn.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 14h-.8l-.3-.3a6 6 0 1 0-.9.9l.3.3v.8l5 5 1.5-1.5-5-5zm-5.5 0a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"></path></svg>';
      clientsSearchButton = searchBtn;
      searchBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        openClientsSearchPopover({
          title: "Поиск по клиенту",
          value: clientsSearchQuery,
          onChange: (nextValue) => {
            clientsSearchQuery = nextValue;
          },
        });
      });

      headerWrap.append(name, searchBtn);
      th.append(headerWrap);
    } else if (colKey === "org" || colKey === "орг") {
      const name = document.createElement("div");
      name.className = "clients-col-name";
      name.textContent = displayLabel;
      th.append(name);
    } else {
      const name = document.createElement("div");
      name.className = "clients-col-name";
      name.textContent = displayLabel;
      th.append(name);
    }
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const clearDragIndicators = () => {
    table
      .querySelectorAll(".clients-drag-over-top, .clients-drag-over-bottom")
      .forEach((rowEl) => {
        rowEl.classList.remove("clients-drag-over-top", "clients-drag-over-bottom");
      });
  };
  if (!finalRows.length) {
    const emptyRow = document.createElement("tr");
    const emptyCell = document.createElement("td");
    emptyCell.colSpan = cols.length + (dragEnabled ? 1 : 0) + (hasGroups ? 1 : 0);
    emptyCell.className = "clients-empty-cell";
    emptyCell.textContent = emptyRowMessage;
    emptyRow.appendChild(emptyCell);
    tbody.appendChild(emptyRow);
  } else {
    finalRows.forEach((row) => {
    const tr = document.createElement("tr");
    const sourceRow = row.__source || row;
    const rowKey = getClientKey(sourceRow);
    const externalId = getExternalIdValue(sourceRow);
    const isChild = childKeys.has(externalId);
    const hasChildren = childrenByParent.has(externalId);
    if (hasChildren) tr.classList.add("clients-group-parent");
    if (isChild) tr.classList.add("clients-group-child");
    if (rowKey) tr.dataset.key = rowKey;
    if (hasGroups) {
      const groupTd = document.createElement("td");
      groupTd.className = "clients-group-cell";
      if (hasChildren) {
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "clients-group-toggle";
        toggle.textContent = collapsedGroups.has(externalId) ? "+" : "−";
        toggle.addEventListener("click", (event) => {
          event.stopPropagation();
          if (collapsedGroups.has(externalId)) collapsedGroups.delete(externalId);
          else collapsedGroups.add(externalId);
          saveCollapsedGroups(collapsedGroups);
          if (clientsLastData) renderClientsTable(clientsLastData);
        });
        groupTd.appendChild(toggle);
      } else if (isChild) {
        const line = document.createElement("span");
        line.className = "clients-group-line";
        groupTd.appendChild(line);
      }
      tr.appendChild(groupTd);
    }
    if (dragEnabled) {
      const handleTd = document.createElement("td");
      handleTd.className = "clients-drag-cell";
      const handleBtn = document.createElement("button");
      handleBtn.type = "button";
      handleBtn.className = "clients-drag-handle";
      handleBtn.setAttribute("aria-label", "Переместить клиента");
      handleBtn.innerHTML =
        '<span class="dot"></span><span class="dot"></span><span class="dot"></span>' +
        '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
      handleBtn.draggable = true;
      handleTd.appendChild(handleBtn);
      tr.appendChild(handleTd);
      tr.draggable = true;
      handleBtn.addEventListener("dragstart", (event) => {
        dragKey = rowKey;
        tr.classList.add("clients-dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", rowKey || "");
      });
      tr.addEventListener("dragend", () => {
        dragKey = null;
        tr.classList.remove("clients-dragging");
        clearDragIndicators();
      });
      let dropMode = null;
      let lastDropMode = null;
      tr.addEventListener("dragover", (event) => {
        if (!dragKey || dragKey === rowKey) return;
        event.preventDefault();
        const rect = tr.getBoundingClientRect();
        const ratio = (event.clientY - rect.top) / rect.height;
        const before = ratio < 0.35;
        const after = ratio > 0.65;
        clearDragIndicators();
        if (before) {
          dropMode = "before";
          lastDropMode = dropMode;
          tr.classList.add("clients-drag-over-top");
        } else if (after) {
          dropMode = "after";
          lastDropMode = dropMode;
          tr.classList.add("clients-drag-over-bottom");
        } else {
          dropMode = null;
        }
      });
      tr.addEventListener("dragleave", () => {
        dropMode = null;
        tr.classList.remove("clients-drag-over-top", "clients-drag-over-bottom");
      });
      tr.addEventListener("drop", (event) => {
        if (!dragKey || dragKey === rowKey) return;
        event.preventDefault();
        const mode = dropMode || lastDropMode;
        const before = mode === "before";
        const after = mode === "after";
        if (!before && !after) return;
        const fromKey = dragKey;
        const toKey = rowKey;
        const nextOrder = [...fullOrderKeys];
        const fromIndex = nextOrder.indexOf(fromKey);
        const toIndex = nextOrder.indexOf(toKey);
        if (fromIndex === -1 || toIndex === -1) return;
        nextOrder.splice(fromIndex, 1);
        const insertIndex = before ? toIndex : toIndex + 1;
        nextOrder.splice(insertIndex > fromIndex ? insertIndex - 1 : insertIndex, 0, fromKey);
        saveClientsOrder(nextOrder);
        if (clientsLastData) renderClientsTable(clientsLastData);
      });
    }
    cols.forEach((col) => {
      const td = document.createElement("td");
      const colKey = String(col || "")
        .toLowerCase()
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, "")
        .trim();
      if (col === "Клиент" || col === "Client" || colKey === "клиент" || colKey === "client") {
        td.classList.add("clients-edit-cell");
        td.addEventListener("click", (event) => {
          event.stopPropagation();
          openClientsClientPopover(sourceRow, td);
        });
        const name = document.createElement("span");
        const rateToValue = String(
          pickValue(sourceRow, "RateTO", "Тип обслуживания", "Rate To", "RateTO") ?? ""
        ).trim().toLowerCase();
        const isNotActive = rateToValue === "not active";
        if (isNotActive) name.classList.add("clients-client-inactive");
        name.textContent = formatClientCell(getClientValue(row, col));
        const wrap = document.createElement("div");
        wrap.className = "clients-client-cell";
        wrap.appendChild(name);
    const newValue =
      pickValue(sourceRow, "NEW", "New", "new", "Новый", "новый") ||
      pickValue(row, "NEW", "New", "new", "Новый", "новый");
    if (isCoChecked(newValue)) {
      const badge = document.createElement("span");
      badge.className = "clients-new-badge";
      badge.textContent = "NEW";
      wrap.appendChild(badge);
    }
        td.appendChild(wrap);
        tr.appendChild(td);
        return;
      }
      if (col === "FirstClient" || col === "Контактное лицо") {
        td.classList.add("clients-edit-cell");
        td.addEventListener("click", (event) => {
          event.stopPropagation();
          openClientsFirstClientPopover(sourceRow, td);
        });
        td.textContent = formatClientCell(getClientValue(row, col));
        tr.appendChild(td);
        return;
      }
      if (colKey === "manager" || colKey === "менеджер") {
        td.classList.add("clients-readonly-cell");
        td.textContent = formatClientCell(getClientValue(row, col));
        tr.appendChild(td);
        return;
      }
      const colKeyClean = colKey.replace(/[^a-z0-9]/g, "");
      const colKeyRu = colKey.replace(/[^Ѐ-ӿ0-9]/g, "");
      const sumToRu = "суммато";
      if (colKey === "sumto" || colKeyClean === "sumto" || colKeyRu === sumToRu) {
        td.classList.add("clients-edit-cell");
        td.addEventListener("click", (event) => {
          event.stopPropagation();
          openClientsSumPopover(sourceRow, td);
        });
        td.textContent = formatClientCell(getClientValue(row, col));
        tr.appendChild(td);
        return;
      }
      if (col === "Орг" || col === "Org" || col === "ORG" || colKey === "орг" || colKey === "org") {
        td.classList.add("clients-edit-cell");
        td.addEventListener("click", (event) => {
          event.stopPropagation();
          openClientsOrgPopover(sourceRow, td, row);
        });
        td.textContent = formatClientCell(getClientValue(row, col));
        tr.appendChild(td);
        return;
      }
      if (colKey === "dolg" || colKey.includes("должник")) {
        const currentRaw = formatClientCell(getClientValue(row, col)) || "Нет";
        const normalized = currentRaw.trim().toLowerCase();
        const isYes = normalized === "да" || normalized === "yes" || normalized === "y";
        td.classList.add("clients-debtor-cell");
        td.classList.toggle("debtor-yes", isYes);
        td.classList.toggle("debtor-no", !isYes);
        td.style.background = isYes
          ? "repeating-linear-gradient(135deg, rgba(150, 40, 40, 0.28), rgba(150, 40, 40, 0.28) 6px, rgba(120, 22, 22, 0.28) 6px, rgba(120, 22, 22, 0.28) 12px)"
          : "rgba(22, 120, 48, 0.18)";
        td.style.color = "#ffffff";
        td.textContent = isYes ? "Да" : "Нет";
      } else {
        td.textContent = formatClientCell(getClientValue(row, col));
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  }
  table.appendChild(tbody);
  clientsTableWrapEl.appendChild(table);
  updateClientsSaveButton();
}

function readClientsCache() {
  try {
    const raw = localStorage.getItem(CLIENTS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.savedAt || !parsed.data) return null;
    if (Date.now() - parsed.savedAt > CLIENTS_CACHE_TTL_MS) return null;
    return parsed.data;
  } catch (_) {
    return null;
  }
}

function writeClientsCache(data) {
  try {
    const payload = { savedAt: Date.now(), data };
    localStorage.setItem(CLIENTS_CACHE_KEY, JSON.stringify(payload));
  } catch (_) {}
}

async function loadClients({ force = false } = {}) {
  if (!clientsTableWrapEl || !clientsStateEl) return;
  if (!CLIENTS_WEBHOOK_URL) {
    clientsStateEl.textContent = "Не задан вебхук клиентов в config.json";
    clientsTableWrapEl.innerHTML = "";
    clientsTableWrapEl.appendChild(clientsStateEl);
    return;
  }

  if (!force) {
    const cached = readClientsCache();
    if (cached) {
      clientsLastData = cached;
      renderClientsTable(cached);
      return;
    }
  }

  if (clientsLoading) return;
  clientsLoading = true;
  clientsStateEl.textContent = "Загрузка...";
  clientsTableWrapEl.innerHTML = "";
  clientsTableWrapEl.appendChild(clientsStateEl);
  try {
    const response = await fetch(CLIENTS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Webhook ${response.status}: ${errorText.slice(0, 300)}`);
    }
    const rawText = await response.text();
    let parsed = rawText;
    try {
      parsed = JSON.parse(rawText);
    } catch (_) {}
    clientsLastData = parsed;
    clientsDirtyKeys.clear();
    await loadPayTo2AndMerge(parsed);
    writeClientsCache(parsed);
    renderClientsTable(parsed);
  } catch (error) {
    clientsStateEl.textContent = `Не удалось загрузить клиентов: ${error?.message || "ошибка"}`;
    clientsTableWrapEl.innerHTML = "";
    clientsTableWrapEl.appendChild(clientsStateEl);
    console.error("Clients load failed:", error);
  } finally {
    clientsLoading = false;
  }
}

async function loadPayTo2AndMerge(raw) {
  if (!CLIENTS_PAYTO2_URL) return;
  const { rows } = normalizeClientsPayload(raw || []);
  if (!rows.length) return;
  try {
    const response = await fetch(CLIENTS_PAYTO2_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      throw new Error(`PayTO2 ${response.status}`);
    }
    let data = null;
    const rawText = await response.text();
    try {
      data = JSON.parse(rawText);
    } catch (_) {
      data = rawText;
    }
    const unwrap = (value) => {
      if (Array.isArray(value)) return value;
      if (value && typeof value === "object") {
        if (Array.isArray(value.body)) return value.body;
        if (Array.isArray(value.data)) return value.data;
        if (Array.isArray(value.result)) return value.result;
        if (Array.isArray(value.items)) return value.items;
        return [value];
      }
      return null;
    };
    const list = unwrap(data);
    if (!Array.isArray(list)) return;
    const sampleExternal = list
      .map((item) => String(item?.external_id ?? item?.externalId ?? item?.id ?? "").trim())
      .filter(Boolean)
      .slice(0, 3);
    const byExternalId = new Map();
    list.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const externalId = String(item.external_id ?? item.externalId ?? item.id ?? "").trim();
      if (!externalId) return;
      const date = String(item.Date ?? "").trim();
      const status = String(item.Status ?? "").trim();
      const sum = String(item.Sum ?? "").trim();
      if (!/^\d{6}$/.test(date)) return;
      const year = date.slice(0, 4);
      const month = date.slice(4, 6);
      const key = `${year}-${month}`;
      if (!byExternalId.has(externalId)) byExternalId.set(externalId, new Map());
      byExternalId.get(externalId).set(key, { status, sum });
    });
    if (!byExternalId.size) return;
    const sampleClientIds = rows
      .map((row) => String(pickValue(row, "ID") ?? "").trim())
      .filter(Boolean)
      .slice(0, 3);
    rows.forEach((row) => {
      const externalId = String(pickValue(row, "ID") ?? "").trim();
      if (!externalId) return;
      const map = byExternalId.get(externalId);
      if (!map) return;
      const statusMap = getSumStatusMap(row);
      const sumMap = getSumAmountMap(row);
      map.forEach((value, key) => {
        if (value.status) statusMap[key] = value.status;
        if (value.sum) sumMap[key] = value.sum;
      });
    });
    console.info(`PayTO2 merged: ${byExternalId.size} clients`);
    console.info("PayTO2 sample external_id:", sampleExternal);
    console.info("Clients sample ID:", sampleClientIds);
  } catch (error) {
    console.error("PayTO2 load failed:", error);
  }
}

async function saveClientsToWebhook() {
  if (!clientsSaveEl) return;
  const hasClientsSaveUrl = false;
  const hasPayToUrl = !!CLIENTS_PAYTO_URL;
  const hasSumToUrl = !!CLIENTS_SUMTO_URL;
  if (!hasClientsSaveUrl && !hasPayToUrl && !hasSumToUrl) {
    console.warn("Clients save URLs are empty.");
    return;
  }
  if (!clientsLastData) {
    await loadClients({ force: false });
  }
  const { rows } = normalizeClientsPayload(clientsLastData || []);
  ensureSumToSnapshot(rows);
  ensureSumStatusSnapshot(rows);
  const dirtyRows = rows.filter((row) => clientsDirtyKeys.has(getClientKey(row)));
  const mainRows = dirtyRows.filter((row) => row.__nonSumDirty);
  const payload = mainRows.map((row) => {
      const item = buildClientPayload(row);
      if (item && item.sumStatus) delete item.sumStatus;
      return item;
    });
  const payPayload = [];
  const payRows = [];
  dirtyRows.forEach((row) => {
    const items = buildPayToPayload(row);
    if (items && items.length) {
      payPayload.push(...items);
      payRows.push(row);
    }
  });
  const sumPayload = [];
  const sumRows = [];
  dirtyRows.forEach((row) => {
    const item = buildSumToPayload(row);
    if (item) {
      sumPayload.push(item);
      sumRows.push(row);
    }
  });

  if (!payload.length && !payPayload.length && !sumPayload.length) {
    updateClientsSaveButton();
    return;
  }

  const originalLabel = clientsSaveEl.textContent;
  clientsSaveEl.disabled = true;
  clientsSaveEl.textContent = "💾 Сохранение...";
  let hasError = false;
  let clientsSentOk = false;
  try {
    try {
      if (payload.length && hasClientsSaveUrl) {
        const response = await fetch(CLIENTS_SAVE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clients: payload }),
        });
        if (!response.ok) {
          throw new Error(`Clients save failed: ${response.status}`);
        }
        const responseText = await parseWebhookResponseMessage(response);
        const hasCyrillic = /[А-Яа-яЁё]/.test(responseText || "");
        const hasQuestionMarks = (responseText || "").includes("?");
        showClientsToast(
          hasCyrillic && !hasQuestionMarks
            ? responseText
            : "Данные клиента сохранены."
        );
        clientsSentOk = true;
      }
    } catch (error) {
      console.error("Clients save failed:", error);
      hasError = true;
      try {
        if (payload.length && hasClientsSaveUrl) {
          await fetch(CLIENTS_SAVE_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain;charset=UTF-8" },
            body: JSON.stringify({ clients: payload }),
          });
        }
      } catch (fallbackError) {
        console.error("Clients save fallback failed:", fallbackError);
      }
    }

    let paySentOk = false;
    try {
      if (payPayload.length && hasPayToUrl) {
        const response = await fetch(CLIENTS_PAYTO_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payPayload),
        });
        if (!response.ok) {
          throw new Error(`PayTO save failed: ${response.status}`);
        }
        paySentOk = true;
      }
    } catch (error) {
      console.error("PayTO save failed:", error);
      hasError = true;
      try {
        if (payPayload.length && hasPayToUrl) {
          await fetch(CLIENTS_PAYTO_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain;charset=UTF-8" },
            body: JSON.stringify(payPayload),
          });
        }
      } catch (fallbackError) {
        console.error("PayTO save fallback failed:", fallbackError);
      }
    }
    if (paySentOk) {
      payRows.forEach((row) => {
        row.__sumStatusSnapshot = JSON.stringify(getSumStatusMap(row) || {});
        row.__sumStatusSnapshotInitialized = true;
        row.__sumStatusDirty = false;
      });
      if (payPayload.length) {
        showClientsToast("Оплаты успешно сохранены.");
      }
    }

    let sumSentOk = false;
    try {
      if (sumPayload.length && hasSumToUrl) {
        const response = await fetch(CLIENTS_SUMTO_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sumPayload),
        });
        if (!response.ok) {
          throw new Error(`SumTO save failed: ${response.status}`);
        }
        const responseText = await parseWebhookResponseMessage(response);
        const hasCyrillic = /[А-Яа-яЁё]/.test(responseText || "");
        const hasQuestionMarks = (responseText || "").includes("?");
        showClientsToast(
          hasCyrillic && !hasQuestionMarks
            ? responseText
            : "Сумма ТО сохранена."
        );
        sumSentOk = true;
      }
    } catch (error) {
      console.error("SumTO save failed:", error);
      hasError = true;
      try {
        if (sumPayload.length && hasSumToUrl) {
          await fetch(CLIENTS_SUMTO_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain;charset=UTF-8" },
            body: JSON.stringify(sumPayload),
          });
        }
      } catch (fallbackError) {
        console.error("SumTO save fallback failed:", fallbackError);
      }
    }
    if (sumSentOk) {
      sumRows.forEach((row) => {
        row.__sumToSnapshot = getSumToValue(row);
        row.__sumToSnapshotInitialized = true;
        row.__sumToDirty = false;
      });
    }
    if (clientsSentOk) {
      mainRows.forEach((row) => {
        row.__nonSumDirty = false;
      });
    }
    if ((sumSentOk || paySentOk || clientsSentOk) && clientsLastData) {
      writeClientsCache(clientsLastData);
    }
    if (!hasError) {
      clientsDirtyKeys.clear();
      updateClientsSaveButton();
    } else {
      clientsSaveEl.textContent = "Ошибка отправки";
      setTimeout(() => {
        updateClientsSaveButton();
      }, 1500);
    }
  } catch (error) {
    console.error("Clients save failed:", error);
  } finally {
    clientsSaveEl.disabled = false;
    if (clientsSaveEl.textContent === "💾 Сохранение...") {
      clientsSaveEl.textContent = originalLabel;
    }
  }
}

function setActiveSection(section) {
  if (!section) return;
  activeSection = section;
  try {
    localStorage.setItem(ACTIVE_SECTION_STORAGE_KEY, section);
  } catch (e) {
    // ignore storage errors
  }
  topNavButtons.forEach((btn) => {
    const isActive = btn.dataset.section === section;
    btn.classList.toggle("active", isActive);
  });
  scheduleViewEl?.classList.toggle("hidden", section !== "schedule");
  clientsViewEl?.classList.toggle("hidden", section !== "clients");
  if (clientsViewEl) {
    clientsViewEl.style.display = section === "clients" ? "flex" : "";
    clientsViewEl.style.pointerEvents = section === "clients" ? "auto" : "none";
  }
  if (scheduleViewEl) {
    scheduleViewEl.style.display = section === "schedule" ? "flex" : "";
    scheduleViewEl.style.pointerEvents = section === "schedule" ? "auto" : "none";
  }
  scheduleOnlyEls.forEach((el) => {
    el.classList.toggle("hidden", section !== "schedule");
  });
  clientsOnlyEls.forEach((el) => {
    el.classList.toggle("hidden", section !== "clients");
  });
  mainScreenEl?.classList.toggle("clients-active", section === "clients");
  if (mainTitleEl) {
    mainTitleEl.textContent = section === "clients" ? "Клиенты" : "График смен";
  }
  if (section === "clients") {
    loadClients({ force: false });
  }
}

function bindTopNav() {
  topNavButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveSection(btn.dataset.section);
    });
    btn.addEventListener("pointerup", (event) => {
      if (event.pointerType !== "touch") return;
      event.preventDefault();
      setActiveSection(btn.dataset.section);
    });
    btn.addEventListener("touchend", (event) => {
      event.preventDefault();
      setActiveSection(btn.dataset.section);
    });
  });
}


createClientsPopover();
bindTopNav();
const clientsTabBtn = document.querySelector('.top-nav [data-section="clients"]');
if (!hasClientsAccess()) {
  clientsTabBtn?.classList.add("hidden");
  clientsViewEl?.classList.add("hidden");
}
const savedSection =
  (() => {
    try {
      return localStorage.getItem(ACTIVE_SECTION_STORAGE_KEY);
    } catch (e) {
      return null;
    }
  })() || "";
if (savedSection) {
  setActiveSection(savedSection);
} else {
  setActiveSection("schedule");
}
clientsRefreshEl?.addEventListener("click", () => loadClients({ force: true }));
clientsSaveEl?.addEventListener("click", saveClientsToWebhook);

