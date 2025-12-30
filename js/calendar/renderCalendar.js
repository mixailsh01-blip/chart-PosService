// js/calendar/renderCalendar.js
import { formatMinutesToTime } from "./calendarUtils.js";

/**
 * Рендер таблицы графика.
 *
 * options = {
 *   container,
 *   employees: [ {id, name, department_name} ],
 *   monthMeta,            // { year, monthIndex, days: [{day, weekday, isWeekend}] }
 *   lineKey,              // "L1" | "L2"
 *   shiftsByEmployee,     // Map<employeeId, Map<dateKey, Shift>>
 *   onShiftClick,         // (shift, meta) => void
 * }
 */

const WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/**
 * Рендерит всю таблицу
 */
export function renderScheduleTable(options) {
  const { container } = options;
  container.innerHTML = "";
  container.appendChild(createTable(options));
}

function createTable({ employees, monthMeta, lineKey, shiftsByEmployee, onShiftClick }) {
  const table = document.createElement("table");
  table.className = "schedule-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  // Левая колонка "Сотрудник"
  const nameTh = document.createElement("th");
  nameTh.textContent = "Сотрудник";
  nameTh.className = "sticky-col";
  headerRow.appendChild(nameTh);

  // Дни месяца
  for (const dayInfo of monthMeta.days) {
    const th = document.createElement("th");

    const dayDiv = document.createElement("div");
    dayDiv.textContent = dayInfo.day;
    const weekdayDiv = document.createElement("div");
    weekdayDiv.textContent = WEEKDAYS_SHORT[dayInfo.weekday];
    weekdayDiv.className = "weekday-header";

    th.appendChild(dayDiv);
    th.appendChild(weekdayDiv);

    if (dayInfo.isWeekend) {
      th.classList.add("day-off");
    }

    headerRow.appendChild(th);
  }

  // Итоговая колонка "Сумма"
  const totalTh = document.createElement("th");
  totalTh.textContent = "Сумма";
  totalTh.className = "summary-cell sticky-summary";
  headerRow.appendChild(totalTh);

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  // Строка по каждому сотруднику
  for (const emp of employees) {
    const tr = document.createElement("tr");
    tr.dataset.employeeId = String(emp.id);

    const nameTd = document.createElement("td");
    nameTd.className = "sticky-col employee-name";
    nameTd.textContent = emp.name || `${emp.first_name || ""} ${emp.last_name || ""}`.trim();
    tr.appendChild(nameTd);

    const empShiftsMap = shiftsByEmployee.get(emp.id) || new Map();

    let totalPay = 0;

    // Ячейки по дням
    for (const dayInfo of monthMeta.days) {
      const td = document.createElement("td");
      td.className = "shift-cell";
      if (dayInfo.isWeekend) td.classList.add("day-off");

      const dateKey = dayInfo.dateKey;
      const shift = empShiftsMap.get(dateKey);

      if (shift) {
        td.classList.add(shift.lineKey === "L2" ? "shift-l2" : "shift-l1");

        const pill = document.createElement("div");
        pill.className = "shift-pill";

        const nameRow = document.createElement("div");
        nameRow.className = "shift-pill-name";
        nameRow.textContent = shift.name || shift.templateName || "Смена";

        const timesRow = document.createElement("div");
        timesRow.className = "shift-pill-time";

        const startStr = formatMinutesToTime(shift.localStartMinutes ?? 0);
        const endStr = formatMinutesToTime(
          shift.localEndMinutes ?? (shift.localStartMinutes ?? 0) + (shift.durationMinutes ?? 0)
        );

        // две строки времени: начало сверху, конец снизу
        const startSpan = document.createElement("span");
        startSpan.textContent = startStr;
        const endSpan = document.createElement("span");
        endSpan.textContent = endStr;

        timesRow.appendChild(startSpan);
        timesRow.appendChild(document.createElement("br"));
        timesRow.appendChild(endSpan);

        pill.appendChild(nameRow);
        pill.appendChild(timesRow);

        pill.addEventListener("click", (ev) => {
          ev.stopPropagation();
          if (typeof onShiftClick === "function") {
            onShiftClick(shift, { employee: emp, dateKey, lineKey });
          }
        });

        td.appendChild(pill);

        if (typeof shift.pay === "number") {
          totalPay += shift.pay;
        }
      }

      tr.appendChild(td);
    }

    const totalTd = document.createElement("td");
    totalTd.className = "summary-cell";
    if (totalPay) totalTd.textContent = String(totalPay);
    tr.appendChild(totalTd);

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  return table;
}