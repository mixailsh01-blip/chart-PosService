# Интеграция динамической системы цветов смен

## Что было добавлено

### 1. `js/shift-colors.js` - Система динамических цветов
- Генерирует уникальный цвет для каждого шаблона смены
- Использует HSL цветовое пространство с золотым сечением
- Отдельные палитры для L1 и L2
- Поддержка светлой и тёмной темы

### 2. `index.html` - Легенда цветов
- Динамически генерируемая легенда всех типов смен
- Показывает название смены, время и соответствующий цвет

## Инструкция по интеграции в app.js

Добавьте следующие изменения в `app.js`:

### Шаг 1: Инициализация цветов после загрузки шаблонов

В функции `loadShiftsCatalog()`, после строки:
```javascript
state.shiftTemplatesByLine.L2 = templatesByLine.L2;
```

Добавьте:
```javascript
// Инициализация динамических цветов для каждого шаблона
if (window.ShiftColors) {
  window.ShiftColors.initialize(
    state.shiftTemplatesByLine,
    state.ui.theme === 'dark'
  );
  renderShiftLegend(); // Добавим эту функцию далее
}
```

### Шаг 2: Обновление цветов при смене темы

В функции `applyTheme(theme)`, после строки:
```javascript
localStorage.setItem(STORAGE_KEYS.theme, theme);
```

Добавьте:
```javascript
// Обновляем цвета смен для новой темы
if (window.ShiftColors && state.shiftTemplatesByLine) {
  window.ShiftColors.updateForTheme(
    state.shiftTemplatesByLine,
    theme === 'dark'
  );
}
```

### Шаг 3: Применение цветов к пилюлям смен

В функции `renderScheduleCurrentLine()`, найдите секцию где создаётся пилюля смены:
```javascript
const pill = document.createElement("div");
pill.className = "shift-pill";
```

Замените блок создания пилюли на:
```javascript
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
```

### Шаг 4: Добавление функции рендера легенды

Добавьте новую функцию после `renderScheduleCurrentLine()`:

```javascript
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
```

### Шаг 5: Обновление стилей легенды в CSS

Убедитесь что в `styles.css` есть стили для элементов легенды с динамическими классами.
Добавьте после существующих стилей легенды:

```css
/* Динамические классы для легенды генерируются в shift-colors.js */
.shift-legend-color[class*="shift-template-"] {
  /* Цвета применяются динамически через CSS variables */
}
```

## Результат

 После интеграции:
- ✅ Каждый шаблон смены получает уникальный цвет
- ✅ Цвета не пересекаются внутри одной линии (L1 или L2)
- ✅ Легенда внизу экрана показывает все смены с их цветами
- ✅ Работает в светлой и тёмной темах
- ✅ Специальные смены (ВЫХ, ОТП, ДР) остаются жёлтыми

## Проверка работы

1. Откройте консоль браузера
2. Проверьте что `window.ShiftColors` доступен
3. После загрузки данных в `<head>` должен появиться `<style id="dynamic-shift-colors">`
4. Легенда должна отображать все шаблоны смен с цветными индикаторами
