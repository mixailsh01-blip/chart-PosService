# Задача: Интеграция динамических цветов смен в app.js

## Контекст
В ветке `feature/corporate-branding` уже готовы все модули для системы динамических цветов:
- ✅ `js/shift-colors.js` - модуль управления цветами
- ✅ `index.html` - блок легенды добавлен
- ✅ `css/styles.css` - стили для цветных пилюль

**Осталось:** интегрировать 4 блока кода в файл `js/app.js`

---

## ⚠️ ВАЖНО: Восстановление app.js

**Файл `js/app.js` был случайно перезаписан в коммите `d78a8099`.**

Перед выполнением задачи нужно восстановить рабочую версию файла:

```bash
# Откатить app.js к состоянию до ошибки
git checkout 5b25dfe93c00d16964075d6a52204a7769fd81a6~1 -- js/app.js
```

После восстановления применить интеграцию ниже.

---

## Задача: 4 точки интеграции

### 1. Добавить функцию renderShiftLegend() (после renderScheduleCurrentLine)

**Где:** После функции `renderScheduleCurrentLine()`, примерно на строке 1100

**Что добавить:**

```javascript
// -----------------------------
// Легенда цветов смен
// -----------------------------

function renderShiftLegend() {
  const legendRootEl = document.getElementById("shift-legend-root");
  if (!legendRootEl) return;

  const currentLine = state.ui.currentLine;
  const templates = state.shiftTemplatesByLine[currentLine] || [];

  if (templates.length === 0) {
    legendRootEl.innerHTML = "<p>Нет шаблонов смен для отображения</p>";
    return;
  }

  legendRootEl.innerHTML = `
    <div class="shift-legend-title">Легенда смен (${currentLine})</div>
    <div class="shift-legend-items">
      ${templates
        .map((tmpl) => {
          const colorClass = ShiftColors.getTemplateClass(tmpl.id);
          const timeLabel = tmpl.timeRange
            ? `${tmpl.timeRange.start}–${tmpl.timeRange.end}`
            : "";
          const specialClass = tmpl.specialShortLabel ? "special" : "";
          
          return `
            <div class="shift-legend-item">
              <div class="shift-pill ${colorClass} ${specialClass}">
                <div class="shift-time-line">${timeLabel || tmpl.name}</div>
              </div>
              <span class="shift-legend-label">${tmpl.name}</span>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}
```

---

### 2. Инициализировать цвета в loadShiftsCatalog()

**Где:** В функции `loadShiftsCatalog()`, в самом конце функции после:
```javascript
state.shiftTemplatesByLine.L1 = templatesByLine.L1;
state.shiftTemplatesByLine.L2 = templatesByLine.L2;
```

**Что добавить:**

```javascript
// Инициализировать систему цветов для шаблонов
ShiftColors.initialize();

// Отрисовать легенду
renderShiftLegend();
```

---

### 3. Обновлять цвета при смене темы в applyTheme()

**Где:** В функции `applyTheme()`, после строки:
```javascript
localStorage.setItem(STORAGE_KEYS.theme, theme);
```

**Что добавить:**

```javascript
// Обновить цвета смен для новой темы
ShiftColors.updateForTheme();
```

---

### 4. Применять цветовые классы к пилюлям смен в renderScheduleCurrentLine()

**Где:** В функции `renderScheduleCurrentLine()`, в блоке создания пилюли смены

**Найти код:**
```javascript
if (shift) {
  td.classList.add("has-shift");
  const pill = document.createElement("div");
  pill.className = "shift-pill";
```

**Заменить на:**
```javascript
if (shift) {
  td.classList.add("has-shift");
  const pill = document.createElement("div");
  
  // Применяем цвет на основе templateId
  let pillClasses = "shift-pill";
  
  // Специальные смены (ВЫХ, ОТП, ДР) получают желтый цвет
  if (shift.specialShortLabel) {
    pillClasses += " special";
  } else if (shift.templateId) {
    // Обычные смены получают уникальный цвет на основе templateId
    const colorClass = ShiftColors.getTemplateClass(shift.templateId);
    pillClasses += ` ${colorClass}`;
  }
  
  pill.className = pillClasses;
```

---

### 5. Обновлять легенду при переключении линий

**Где:** В функциях обработчиков `btnLineL1El` и `btnLineL2El` в `bindTopBarButtons()`

**Найти:**
```javascript
btnLineL1El.addEventListener("click", () => {
  state.ui.currentLine = "L1";
  updateLineToggleUI();
  updateSaveButtonState();
  updateQuickModeForLine();
  renderQuickTemplateOptions();
  renderScheduleCurrentLine();
});
```

**Добавить в конец:**
```javascript
renderShiftLegend(); // <-- Добавить эту строку
```

**То же самое для L2:**
```javascript
btnLineL2El.addEventListener("click", () => {
  state.ui.currentLine = "L2";
  updateLineToggleUI();
  updateSaveButtonState();
  updateQuickModeForLine();
  renderQuickTemplateOptions();
  renderScheduleCurrentLine();
  renderShiftLegend(); // <-- Добавить эту строку
});
```

---

## Проверка работоспособности

После интеграции:

1. ✅ Каждая смена должна иметь уникальный цвет в зависимости от templateId
2. ✅ Специальные смены (ВЫХ, ОТП, ДР) должны быть желтыми
3. ✅ Легенда внизу экрана должна показывать все смены с их цветами
4. ✅ При переключении L1/L2 легенда должна обновляться
5. ✅ При смене темы (темная/светлая) цвета должны корректно адаптироваться

---

## Контрольный список

- [ ] Восстановлен файл app.js из коммита до ошибки
- [ ] Добавлена функция renderShiftLegend()
- [ ] Добавлена инициализация в loadShiftsCatalog()
- [ ] Добавлено обновление цветов в applyTheme()
- [ ] Добавлено применение цветов к пилюлям смен
- [ ] Добавлено обновление легенды при переключении линий
- [ ] Проверено в браузере - цвета работают
- [ ] Проверено переключение темы
- [ ] Проверено переключение L1/L2

---

## Коммит

После успешной интеграции:

```bash
git add js/app.js
git commit -m "feat: Complete integration of dynamic shift colors system

- Restore app.js from working state
- Add renderShiftLegend() function
- Initialize colors in loadShiftsCatalog()
- Update colors on theme change in applyTheme()
- Apply color classes to shift pills based on templateId
- Update legend when switching between L1 and L2
- Special shifts (ВЫХ, ОТП, ДР) maintain yellow color
- Each regular shift gets unique color for better distinction"
```

---

## Примечания

- Все файлы модулей (shift-colors.js) и стили уже готовы
- Система использует HSL цветовое пространство с golden ratio для распределения
- Цвета детерминированные - один и тот же templateId всегда получает один и тот же цвет
- Система автоматически адаптируется под светлую и темную темы
