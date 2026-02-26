
import { pyrusFetch } from "./pyrusAuth.js";

const DEFAULT_L1_DEPTS = ["Операторы"];
const DEFAULT_L2_DEPTS = ["Инженера 5/2", "Инженера 2/2", "Инженеры"];
const DEFAULT_L2_ORDER = ["Инженеры", "Инженера 5/2", "Инженера 2/2"];

let configCache = null;

async function loadAppConfig() {
  if (configCache) return configCache;

  try {
    const res = await fetch("/config.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    configCache = json && typeof json === "object" ? json : {};
  } catch (error) {
    console.warn("Не удалось загрузить config.json, используем значения по умолчанию.", error);
    configCache = {};
  }

  return configCache;
}

/**
 * Загружаем список сотрудников из Pyrus (/members) и раскладываем по линиям L1 / L2.
 * L1 = department_name: "Операторы"
 * L2 = department_name: "Инженера 5/2", "Инженера 2/2", "Инженеры"
 *
 * Возвращаем объект:
 * {
 *   all: [ { id, name, department_name, raw } ],
 *   byId: { [id]: employee },
 *   byLine: { L1: [...], L2: [...], extra: [...] }
 * }
 */
export async function loadEmployeesFromPyrus() {
  const config = await loadAppConfig();
  const departmentsConfig = config?.departments?.byName ?? {};
  const orderByNameConfig = config?.departments?.orderByName ?? {};

  const l1Departments = Array.isArray(departmentsConfig.L1)
    ? departmentsConfig.L1
    : DEFAULT_L1_DEPTS;
  const l2Departments = Array.isArray(departmentsConfig.L2)
    ? departmentsConfig.L2
    : DEFAULT_L2_DEPTS;
  const l2OrderList = Array.isArray(orderByNameConfig.L2)
    ? orderByNameConfig.L2
    : DEFAULT_L2_ORDER;

  const res = await pyrusFetch("/members", { method: "GET" });
  const json = await res.json();

  const wrapper = Array.isArray(json) ? json[0] : json;
  const members = wrapper && Array.isArray(wrapper.members) ? wrapper.members : [];

  const employees = [];
  const byId = {};
  const byLine = { L1: [], L2: [], extra: [] };

  const L1_DEPTS = new Set(l1Departments);
  const L2_DEPTS = new Set(l2Departments);

  for (const m of members) {
    if (m.type !== "user" || m.banned) continue;

    const emp = {
      id: m.id,
      name: `${m.first_name || ""} ${m.last_name || ""}`.trim(),
      department_name: m.department_name || "",
      raw: m
    };
    employees.push(emp);
    byId[emp.id] = emp;

    if (L1_DEPTS.has(emp.department_name)) {
      byLine.L1.push(emp);
    } else if (L2_DEPTS.has(emp.department_name)) {
      byLine.L2.push(emp);
    } else {
      byLine.extra.push(emp);
    }
  }

  // сортировка L2: по конфигу, затем по имени
  const orderL2 = l2OrderList.reduce((acc, name, index) => {
    acc[name] = index;
    return acc;
  }, {});
  byLine.L2.sort((a, b) => {
    const oa = orderL2[a.department_name] ?? 99;
    const ob = orderL2[b.department_name] ?? 99;
    if (oa !== ob) return oa - ob;
    return a.name.localeCompare(b.name, "ru");
  });

  // сортировка L1 и extra просто по имени
  byLine.L1.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  byLine.extra.sort((a, b) => a.name.localeCompare(b.name, "ru"));

  console.log("Сотрудники из Pyrus", { employees, byLine });

  return { all: employees, byId, byLine };
}
