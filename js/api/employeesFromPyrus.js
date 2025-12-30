
import { pyrusFetch } from "./pyrusAuth.js";

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
  const res = await pyrusFetch("/members", { method: "GET" });
  const json = await res.json();

  const wrapper = Array.isArray(json) ? json[0] : json;
  const members = wrapper && Array.isArray(wrapper.members) ? wrapper.members : [];

  const employees = [];
  const byId = {};
  const byLine = { L1: [], L2: [], extra: [] };

  const L2_DEPTS = new Set(["Инженера 5/2", "Инженера 2/2", "Инженеры"]);

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

    if (emp.department_name === "Операторы") {
      byLine.L1.push(emp);
    } else if (L2_DEPTS.has(emp.department_name)) {
      byLine.L2.push(emp);
    } else {
      byLine.extra.push(emp);
    }
  }

  // сортировка L2: Инженеры, Инженера 5/2, Инженера 2/2
  const orderL2 = { "Инженеры": 0, "Инженера 5/2": 1, "Инженера 2/2": 2 };
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
