// app-patch.js
// Добавьте эти функции и интеграции в app.js

// ========================================
// 1. ДОБАВЬТЕ ЭТУ ФУНКЦИЮ ПОСЛЕ renderScheduleCurrentLine()
// ========================================

function renderShiftLegend() {
  const legendContent = document.getElementById('shift-legend-content');
  if (!legendContent) return;

  legendContent.innerHTML = '';

  // Создаём группы для каждой линии
  ['L1', 'L2'].forEach(line => {
    const templates = state.shiftTemplatesByLine[line] || [];
    if (templates.length === 0) return;

    const group = document.createElement('div');
    group.className = 'shift-legend-group';

    const groupTitle = document.createElement('div');
    groupTitle.className = 'shift-legend-group-title';
    groupTitle.textContent = `Линия ${line}`;
    group.appendChild(groupTitle);

    const items = document.createElement('div');
    items.className = 'shift-legend-items';

    templates.forEach(template => {
      const item = document.createElement('div');
      item.className = 'shift-legend-item';

      const color = document.createElement('div');
      color.className = 'shift-legend-color';
      
      if (template.specialShortLabel) {
        // Специальные смены
        color.classList.add('special');
      } else if (window.ShiftColors) {
        // Обычные смены - применяем динамический класс
        const colorClass = window.ShiftColors.getTemplateClass(line, template.id);
        if (colorClass) {
          color.classList.add(colorClass);
        }
      }

      const label = document.createElement('span');
      const timeLabel = template.timeRange 
        ? ` (${template.timeRange.start}–${template.timeRange.end})`
        : '';
      label.textContent = `${template.name}${timeLabel}`;

      item.appendChild(color);
      item.appendChild(label);
      items.appendChild(item);
    });

    group.appendChild(items);
    legendContent.appendChild(group);
  });
}

// ========================================
// 2. В ФУНКЦИИ loadShiftsCatalog() ДОБАВЬТЕ ПОСЛЕ ЭТИХ СТРОК:
// state.shiftTemplatesByLine.L1 = templatesByLine.L1;
// state.shiftTemplatesByLine.L2 = templatesByLine.L2;
// ========================================

// Инициализация динамических цветов для каждого шаблона
if (window.ShiftColors) {
  window.ShiftColors.initialize(
    state.shiftTemplatesByLine,
    state.ui.theme === 'dark'
  );
  renderShiftLegend();
}

// ========================================
// 3. В ФУНКЦИИ applyTheme(theme) ДОБАВЬТЕ ПОСЛЕ ЭТОЙ СТРОКИ:
// localStorage.setItem(STORAGE_KEYS.theme, theme);
// ========================================

// Обновляем цвета смен для новой темы
if (window.ShiftColors && state.shiftTemplatesByLine) {
  window.ShiftColors.updateForTheme(
    state.shiftTemplatesByLine,
    theme === 'dark'
  );
}

// ========================================
// 4. В ФУНКЦИИ renderScheduleCurrentLine() ЗАМЕНИТЕ БЛОК СОЗДАНИЯ ПИЛЮЛИ
// Найдите секцию где:
// const pill = document.createElement("div");
// pill.className = "shift-pill";
//
// if (shift.specialShortLabel) {
//   ...
// } else {
//   ...
// }
// ========================================

// ЗАМЕНИТЕ НА:

const pill = document.createElement("div");
pill.className = "shift-pill";

if (shift.specialShortLabel) {
  // Специальные смены (ВЫХ, ОТП, ДР) - жёлтый цвет
  pill.classList.add("special");
  const label = document.createElement("div");
  label.className = "shift-special-label";
  label.textContent = shift.specialShortLabel;
  pill.appendChild(label);
} else {
  // Обычные смены - применяем цвет на основе templateId
  if (shift.templateId && window.ShiftColors) {
    const colorClass = window.ShiftColors.getTemplateClass(line, shift.templateId);
    if (colorClass) {
      pill.classList.add(colorClass);
    }
  }
  
  const line1 = document.createElement("div");
  line1.className = "shift-time-line start";
  line1.textContent = shift.startLocal;

  const line2 = document.createElement("div");
  line2.className = "shift-time-line end";
  line2.textContent = shift.endLocal;

  pill.appendChild(line1);
  pill.appendChild(line2);
}

// ========================================
// КОНЕЦ ПАТЧА
// ========================================