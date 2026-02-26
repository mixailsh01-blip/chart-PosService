
import { pyrusFetch } from "./pyrusAuth.js";
import { getConfigValue } from "../config.js";

const PYRUS_CATALOG_IDS = getConfigValue("pyrus.catalogs", {
  defaultValue: { shifts: 281369 },
  required: true,
});

/**
 * Загружаем справочник смен (catalog 281369) и формируем структуры по L1 и L2.
 *
 * Возвращаем:
 * {
 *   byId: {
 *     [item_id]: {
 *       id: item_id,
 *       order: number,
 *       name: string,
 *       timeRange: "HH:MM-HH:MM" | "",
 *       startMinutes: number|null,
 *       durationMinutes: number|null,
 *       defaultAmount: number|null,
 *       lines: Set(["L1","L2"])
 *     }
 *   },
 *   byLine: {
 *     L1: [shiftId,...],
 *     L2: [shiftId,...]
 *   }
 * }
 */
export async function loadShiftsFromCatalog() {
  const res = await pyrusFetch(`/catalogs/${PYRUS_CATALOG_IDS.shifts}`, { method: "GET" });
  const json = await res.json();

  const catalog = Array.isArray(json) ? json[0] : json;
  const items = catalog && Array.isArray(catalog.items) ? catalog.items : [];

  const byId = {};
  const byLine = { L1: [], L2: [] };

  for (const item of items) {
    const [orderStr, title, timeRange, amountStr, dept] = item.values || [];
    const id = item.item_id;

    const lines = new Set();
    if (dept === "L1") lines.add("L1");
    else if (dept === "L2") lines.add("L2");
    else if (dept === "L2/L1") {
      lines.add("L1");
      lines.add("L2");
    }

    let startMinutes = null;
    let durationMinutes = null;

    if (timeRange && timeRange.includes("-")) {
      const [start, end] = timeRange.split("-");
      const [sh, sm] = start.split(/[.:]/).map((v) => parseInt(v, 10) || 0);
      const [eh, em] = end.split(/[.:]/).map((v) => parseInt(v, 10) || 0);
      startMinutes = sh * 60 + sm;
      let endMinutes = eh * 60 + em;
      if (endMinutes <= startMinutes) {
        endMinutes += 24 * 60;
      }
      durationMinutes = endMinutes - startMinutes;
    }

    const defaultAmount =
      typeof amountStr === "number"
        ? amountStr
        : amountStr
        ? parseInt(String(amountStr).replace(/\D/g, ""), 10) || null
        : null;

    const shift = {
      id,
      order: parseInt(orderStr, 10) || 0,
      name: title,
      timeRange: timeRange || "",
      startMinutes,
      durationMinutes,
      defaultAmount,
      lines
    };

    byId[id] = shift;

    if (lines.has("L1")) byLine.L1.push(id);
    if (lines.has("L2")) byLine.L2.push(id);
  }

  byLine.L1.sort((a, b) => byId[a].order - byId[b].order);
  byLine.L2.sort((a, b) => byId[a].order - byId[b].order);

  console.log("Смены из Pyrus", { byId, byLine });

  return { byId, byLine };
}
