// js/api/scheduleFromPyrus.js
import { pyrusFetch } from "./pyrusAuth.js";
import { getConfigValue } from "../config.js";

// Бизнес-часовой пояс (по умолчанию GMT+4)
const LOCAL_TZ_OFFSET_MIN = getConfigValue("timezone.localOffsetMin", {
  defaultValue: 4 * 60,
  required: true,
});

const LOCAL_TZ_OFFSET_MS = LOCAL_TZ_OFFSET_MIN * 60 * 1000;


const PYRUS_FORM_IDS = getConfigValue("pyrus.forms", {
  defaultValue: { smeni: 2375272 },
  required: true,
});

const PYRUS_FIELD_IDS = getConfigValue("pyrus.fields", {
  defaultValue: {
    smeni: { due: 4, amount: 5, person: 8, shift: 10 },
  },
  required: true,
});

/**
 * Загружаем реестр задач формы 2375272 и строим карту графика на месяц.
 *
 * @returns структуру:
 * {
 *   byEmployee: {
 *     [employeeId]: {
 *       [day]: {
 *         taskId,
 *         shiftItemId,
 *         // UTC-время (для отправки в API):
 *         startUtcMinutes,
 *         endUtcMinutes,
 *         // Локальное время — для отображения:
 *         startMinutes,
 *         endMinutes,
 *         amount,
 *         line // 'L1' | 'L2' | null
 *       }
 *     }
 *   }
 * }
 */
export async function loadScheduleForMonth(year, month0, employees, shifts) {
import { getConfigValue } from "../config.js";

const LOCAL_TZ_OFFSET_MIN = getConfigValue("timezone.localOffsetMin", {
  defaultValue: 4 * 60,
  required: true,
});
const LOCAL_TZ_OFFSET_MS = LOCAL_TZ_OFFSET_MIN * 60 * 1000;

const scheduleFormId = getConfigValue("pyrus.forms.smeni", {
  defaultValue: 2375272,
  required: true,
});

const res = await pyrusFetch(`/forms/${scheduleFormId}/register`, {
  method: "GET",
});

  const json = await res.json();

  const wrapper = Array.isArray(json) ? json[0] : json;
  const tasks = wrapper && Array.isArray(wrapper.tasks) ? wrapper.tasks : [];

  const byEmployee = {};

  for (const task of tasks) {
    const fields = task.fields || [];

import { getConfigValue } from "../config.js";

const dueFieldId = getConfigValue("pyrus.fields.smeni.due", {
  defaultValue: 4,
  required: true,
});

const moneyFieldId = getConfigValue("pyrus.fields.smeni.amount", {
  defaultValue: 5,
  required: true,
});

const personFieldId = getConfigValue("pyrus.fields.smeni.person", {
  defaultValue: 8,
  required: true,
});

const shiftFieldId = getConfigValue("pyrus.fields.smeni.template", {
  defaultValue: 10,
  required: true,
});

const dueField = fields.find(
  (f) => f.id === dueFieldId && f.type === "due_date_time"
);
const moneyField = fields.find(
  (f) => f.id === moneyFieldId && f.type === "money"
);
const personField = fields.find(
  (f) => f.id === personFieldId && f.type === "person"
);
const shiftField = fields.find(
  (f) => f.id === shiftFieldId && f.type === "catalog"
);

    );

    if (!dueField || !personField || !shiftField || !shiftField.value) continue;

    const dueVal = dueField.value;
    if (!dueVal) continue;

    // UTC-время, как прислал Pyrus
    const dueUtc = new Date(dueVal);
    if (isNaN(dueUtc.getTime())) continue;

    // Переводим в локальное время, чтобы определить ДЕНЬ и МЕСЯЦ
    const dueLocal = new Date(dueUtc.getTime() + localOffsetMs);

    // Фильтрация по выбранному месяцу — именно по ЛОКАЛЬНОЙ дате
    if (dueLocal.getFullYear() !== year || dueLocal.getMonth() !== month0) {
      continue;
    }

    const empId = personField.value && personField.value.id;
    if (!empId) continue;

    const shiftItemId = shiftField.value.item_id;
    const shiftDef = shifts.byId[shiftItemId];

    // День в календаре — по локальному времени
    const day = dueLocal.getDate();

    // ---------- ВРЕМЯ СМЕНЫ ----------

    let startUtcMinutes = null;
    let endUtcMinutes = null;
    let startMinutesLocal = null;
    let endMinutesLocal = null;

    if (typeof dueField.duration === "number" && dueField.duration > 0) {
      // 1) duration есть → Pyrus даёт старт (dueVal) и длительность в минутах (в UTC).
      const hUtc = dueUtc.getUTCHours();
      const mUtc = dueUtc.getUTCMinutes();
      startUtcMinutes = hUtc * 60 + mUtc;
      endUtcMinutes = (startUtcMinutes + dueField.duration) % (24 * 60);

      // Локальное время = UTC + offset
      startMinutesLocal =
        (startUtcMinutes + localOffsetMin + 24 * 60) % (24 * 60);
      endMinutesLocal =
        (endUtcMinutes + localOffsetMin + 24 * 60) % (24 * 60);
    } else if (
      shiftDef &&
      shiftDef.startMinutes != null &&
      shiftDef.durationMinutes != null
    ) {
      // 2) duration нет → используем шаблон смены.
      // В справочнике время уже в локальном поясе:
      //   - локальное время берём как есть,
      //   - UTC считаем как local - offset.
      startMinutesLocal = shiftDef.startMinutes;
      endMinutesLocal =
        (shiftDef.startMinutes + shiftDef.durationMinutes) % (24 * 60);

      startUtcMinutes =
        (startMinutesLocal - localOffsetMin + 24 * 60) % (24 * 60);
      endUtcMinutes =
        (endMinutesLocal - localOffsetMin + 24 * 60) % (24 * 60);
    } else {
      // 3) Нет информации о времени → считаем 00:00–00:00
      startUtcMinutes = 0;
      endUtcMinutes = 0;
      startMinutesLocal =
        (startUtcMinutes + localOffsetMin + 24 * 60) % (24 * 60);
      endMinutesLocal =
        (endUtcMinutes + localOffsetMin + 24 * 60) % (24 * 60);
    }

    // ---------- ДЕНЬГИ ----------

    const amount =
      typeof moneyField.value === "number"
        ? moneyField.value
        : moneyField.value
        ? parseInt(String(moneyField.value).replace(/\D/g, ""), 10) || 0
        : 0;

    // ---------- ЛИНИЯ (L1 / L2) ----------

    const line =
      shiftDef && shiftDef.lines
        ? shiftDef.lines.has("L1") && !shiftDef.lines.has("L2")
          ? "L1"
          : shiftDef.lines.has("L2") && !shiftDef.lines.has("L1")
          ? "L2"
          : null
        : null;

    const empMap = (byEmployee[empId] = byEmployee[empId] || {});
    empMap[day] = {
      taskId: task.id,
      shiftItemId,
      // UTC (для API):
      startUtcMinutes,
      endUtcMinutes,
      // Локальное время (для UI):
      startMinutes: startMinutesLocal,
      endMinutes: endMinutesLocal,
      amount,
      line
    };
  }

  console.log("График из Pyrus (учёт локального времени и дней)", byEmployee);
  return { byEmployee };
}
