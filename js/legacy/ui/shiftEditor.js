// js/ui/shiftEditor.js
import { getConfigValue } from "../config.js";

const TIMEZONE_OFFSET_MIN = getConfigValue("timezone.localOffsetMin", {
  defaultValue: 4 * 60,
  required: true,
});

function formatTimezoneLabel(offsetMin) {
  if (!Number.isFinite(offsetMin)) return "локальное время";

  const sign = offsetMin >= 0 ? "+" : "-";
  const absMin = Math.abs(offsetMin);
  const hours = Math.floor(absMin / 60);
  const minutes = absMin % 60;

  if (minutes === 0) {
    return `GMT${sign}${hours}`;
  }
  return `GMT${sign}${hours}:${String(minutes).padStart(2, "0")}`;
}

const TIMEZONE_LABEL = formatTimezoneLabel(TIMEZONE_OFFSET_MIN);



/**
 * Панель редактирования смены.
 *
 * initShiftEditor({
 *   getShiftsForLine: (line) => [ { id, name, startMinutes, endMinutes, amount, line }, ... ],
 *   onApply: ({ employee, line, year, monthIndex, dayNumber, shift }) => void
 * })
 *
 * openShiftEditor({
 *   employee,
 *   line,
 *   year,
 *   monthIndex,
 *   dayNumber,
 *   dateLabel,
 *   existingShift
 * })
 */

let getShiftsForLineFn = null;
let onApplyFn = null;
let backdropEl = null;
let titleEl = null;
let subtitleEl = null;
let lineBadgeEl = null;
let selectShiftEl = null;
let startTimeEl = null;
let endTimeEl = null;
let amountEl = null;
let errorEl = null;

let currentCtx = null;

function updateTimezoneLabel() {
  if (!backdropEl) return;
  const labelEl = backdropEl.querySelector("#shift-editor-timezone-label");
  if (!labelEl) return;
  labelEl.textContent = `Время смены (${TIMEZONE_LABEL})`;
}

export function initShiftEditor({ getShiftsForLine, onApply }) {
  getShiftsForLineFn = getShiftsForLine;
  onApplyFn = onApply;

  if (backdropEl) return; // уже инициализировано

  backdropEl = document.createElement("div");
  backdropEl.className = "shift-editor-backdrop";
  backdropEl.id = "shift-editor-backdrop";

  backdropEl.innerHTML = `
    <div class="shift-editor-panel">
      <div class="shift-editor-header">
        <div>
          <div class="shift-editor-title" id="shift-editor-title"></div>
          <div class="shift-editor-subtitle" id="shift-editor-subtitle"></div>
        </div>
        <div class="shift-editor-badge" id="shift-editor-line-badge"></div>
      </div>
      <div class="shift-editor-body">
        <div class="shift-editor-row">
          <label for="shift-editor-select">Шаблон смены</label>
          <select id="shift-editor-select"></select>
</div>
<div class="shift-editor-row">
  <label>Время смены (локальное ${TIMEZONE_LABEL})</label>
  <div style="display:flex; gap:6px;">
    <input
      id="shift-editor-start"
      type="time"
      min="00:00"
      max="23:59"
      style="flex:1;"
    />
    <input
      id="shift-editor-end"
      type="time"
      min="00:00"
      max="23:59"
      style="flex:1;"
    />
  </div>

        </div>
        <div class="shift-editor-row">
          <label for="shift-editor-amount">Сумма за смену, ₽</label>
          <input id="shift-editor-amount" type="number" min="0" step="1" placeholder="0" />
        </div>
        <div class="shift-editor-error" id="shift-editor-error"></div>
      </div>
      <div class="shift-editor-footer">
        <button type="button" class="btn secondary" id="shift-editor-cancel">Отмена</button>
        <button type="button" class="btn primary" id="shift-editor-save">Сохранить</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdropEl);

  titleEl = backdropEl.querySelector("#shift-editor-title");
  subtitleEl = backdropEl.querySelector("#shift-editor-subtitle");
  lineBadgeEl = backdropEl.querySelector("#shift-editor-line-badge");
  selectShiftEl = backdropEl.querySelector("#shift-editor-select");
  startTimeEl = backdropEl.querySelector("#shift-editor-start");
  endTimeEl = backdropEl.querySelector("#shift-editor-end");
  amountEl = backdropEl.querySelector("#shift-editor-amount");
  errorEl = backdropEl.querySelector("#shift-editor-error");

  const btnCancel = backdropEl.querySelector("#shift-editor-cancel");
  const btnSave = backdropEl.querySelector("#shift-editor-save");

  btnCancel.addEventListener("click", () => closeEditor());
  btnSave.addEventListener("click", () => handleSave());

  backdropEl.addEventListener("click", (e) => {
    if (e.target === backdropEl) {
      closeEditor();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (!backdropEl.classList.contains("open")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeEditor();
    }
  });

  selectShiftEl.addEventListener("change", handleTemplateChange);

}

export function openShiftEditor(context) {
  if (!backdropEl) {
    console.warn("shiftEditor не инициализирован (initShiftEditor)");
    return;
  }

  currentCtx = context;
  errorEl.textContent = "";

  const { employee, line, dateLabel, existingShift } = context;

  titleEl.textContent = employee.name;
  subtitleEl.textContent = dateLabel;
  lineBadgeEl.textContent = line;

  // Шаблоны смен для линии
  const templates =
    typeof getShiftsForLineFn === "function"
      ? getShiftsForLineFn(line) || []
      : [];

  // заполнить select
  selectShiftEl.innerHTML = "";
  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "— Без шаблона —";
  selectShiftEl.appendChild(emptyOption);

  templates.forEach((tpl) => {
    const opt = document.createElement("option");
    opt.value = String(tpl.id);
    opt.textContent = tpl.name;
    selectShiftEl.appendChild(opt);
  });

  // проставить значения времени / суммы
  if (existingShift) {
    startTimeEl.value = minutesToTime(existingShift.startMinutes);
    endTimeEl.value = minutesToTime(existingShift.endMinutes);
    amountEl.value =
      typeof existingShift.amount === "number" && !isNaN(existingShift.amount)
        ? existingShift.amount
        : "";
  } else {
    startTimeEl.value = "";
    endTimeEl.value = "";
    amountEl.value = "";
  }

  // пока не пытаемся угадать шаблон по item_id,
  // просто оставляем "без шаблона"
  selectShiftEl.value = "";

  backdropEl.classList.add("open");
}

function closeEditor() {
  if (!backdropEl) return;
  backdropEl.classList.remove("open");
  currentCtx = null;
}

function handleTemplateChange() {
  if (!currentCtx) return;

  const tplId = selectShiftEl.value;
  if (!tplId) return; // выбрали "без шаблона"

  const templates =
    typeof getShiftsForLineFn === "function"
      ? getShiftsForLineFn(currentCtx.line) || []
      : [];

  const tpl = templates.find((t) => String(t.id) === tplId);
  if (!tpl) return;

  // применяем время и сумму из шаблона
  if (typeof tpl.startMinutes === "number") {
    startTimeEl.value = minutesToTime(tpl.startMinutes);
  }
  if (typeof tpl.endMinutes === "number") {
    endTimeEl.value = minutesToTime(tpl.endMinutes);
  }
  if (typeof tpl.amount === "number") {
    amountEl.value = tpl.amount;
  }
}

function handleSave() {
  if (!currentCtx || typeof onApplyFn !== "function") return;

  const startStr = (startTimeEl.value || "").trim();
  const endStr = (endTimeEl.value || "").trim();
  const amountStr = (amountEl.value || "").trim();

  const startMin = parseTimeToMinutes(startStr);
  const endMin = parseTimeToMinutes(endStr);

  if (startMin == null || endMin == null) {
    errorEl.textContent = "Укажите корректное время начала и окончания смены.";
    return;
  }

  let amount = 0;
  if (amountStr) {
    const num = Number(amountStr);
    if (!Number.isFinite(num) || num < 0) {
      errorEl.textContent = "Сумма должна быть неотрицательным числом.";
      return;
    }
    amount = Math.round(num);
  }

  const tplId = selectShiftEl.value || null;
  const templates =
    typeof getShiftsForLineFn === "function"
      ? getShiftsForLineFn(currentCtx.line) || []
      : [];
  const tpl = tplId ? templates.find((t) => String(t.id) === tplId) : null;

  const shiftData = {
    startMinutes: startMin,
    endMinutes: endMin,
    amount,
    line: currentCtx.line,
    catalogItemId:
      tpl?.id ?? currentCtx.existingShift?.catalogItemId ?? null,
    templateName:
      tpl?.name ?? currentCtx.existingShift?.templateName ?? null,
    isDraft: true,
  };

  onApplyFn({
    ...currentCtx,
    shift: shiftData,
  });

  closeEditor();
}

// helpers

function parseTimeToMinutes(str) {
  if (!str) return null;
  const parts = str.split(":");
  if (parts.length !== 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function minutesToTime(minutes) {
  if (minutes == null || isNaN(minutes)) return "";
  let m = Math.round(minutes);
  m = ((m % 1440) + 1440) % 1440; // 0..1439
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
