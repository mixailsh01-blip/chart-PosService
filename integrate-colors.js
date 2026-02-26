#!/usr/bin/env node
// integrate-colors.js
// Автоматически применяет патчи из app-patch.js к app.js

const fs = require('fs');
const path = require('path');

const APP_JS_PATH = path.join(__dirname, 'js', 'app.js');

console.log('🔧 Начинаем интеграцию динамических цветов смен...');
console.log('');

if (!fs.existsSync(APP_JS_PATH)) {
  console.error('❌ Ошибка: файл js/app.js не найден!');
  console.error('   Запустите сначала: bash RESTORE_AND_INTEGRATE.sh');
  process.exit(1);
}

let appContent = fs.readFileSync(APP_JS_PATH, 'utf8');
let changesMade = 0;

// ========================================
// 1. Добавить renderShiftLegend() после renderScheduleCurrentLine()
// ========================================

const renderLegendFunc = `
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

  legendRootEl.innerHTML = \`
    <div class="shift-legend-title">Легенда смен (\${currentLine})</div>
    <div class="shift-legend-items">
      \${templates
        .map((tmpl) => {
          const colorClass = ShiftColors.getTemplateClass(tmpl.id);
          const timeLabel = tmpl.timeRange
            ? \`\${tmpl.timeRange.start}–\${tmpl.timeRange.end}\`
            : "";
          const specialClass = tmpl.specialShortLabel ? "special" : "";
          
          return \`
            <div class="shift-legend-item">
              <div class="shift-pill \${colorClass} \${specialClass}">
                <div class="shift-time-line">\${timeLabel || tmpl.name}</div>
              </div>
              <span class="shift-legend-label">\${tmpl.name}</span>
            </div>
          \`;
        })
        .join("")}
    </div>
  \`;
}
`;

if (!appContent.includes('function renderShiftLegend()')) {
  // Найти позицию после function renderScheduleCurrentLine()
  const renderSchedulePos = appContent.indexOf('// поповер смены');
  if (renderSchedulePos === -1) {
    console.error('❌ Не найдена секция "// поповер смены" для вставки renderShiftLegend()');
    process.exit(1);
  }
  
  appContent = appContent.slice(0, renderSchedulePos) + renderLegendFunc + '\n' + appContent.slice(renderSchedulePos);
  changesMade++;
  console.log('✅ 1. Добавлена функция renderShiftLegend()');
} else {
  console.log('⏭️  1. Функция renderShiftLegend() уже существует');
}

// ========================================
// 2. Инициализация в loadShiftsCatalog()
// ========================================

const initCode = `
  // Инициализировать систему цветов для шаблонов
  ShiftColors.initialize();

  // Отрисовать легенду
  renderShiftLegend();`;

if (!appContent.includes('ShiftColors.initialize()')) {
  const targetLine = 'state.shiftTemplatesByLine.L2 = templatesByLine.L2;';
  const pos = appContent.indexOf(targetLine);
  
  if (pos === -1) {
    console.error('❌ Не найдена строка для добавления инициализации в loadShiftsCatalog()');
    process.exit(1);
  }
  
  const insertPos = appContent.indexOf('\n', pos) + 1;
  appContent = appContent.slice(0, insertPos) + initCode + '\n' + appContent.slice(insertPos);
  changesMade++;
  console.log('✅ 2. Добавлена инициализация в loadShiftsCatalog()');
} else {
  console.log('⏭️  2. Инициализация уже добавлена');
}

// ========================================
// 3. Обновление цветов в applyTheme()
// ========================================

const updateThemeCode = `
  // Обновить цвета смен для новой темы
  ShiftColors.updateForTheme();`;

if (!appContent.includes('ShiftColors.updateForTheme()')) {
  const targetLine = 'localStorage.setItem(STORAGE_KEYS.theme, theme);';
  const pos = appContent.indexOf(targetLine);
  
  if (pos === -1) {
    console.error('❌ Не найдена строка для добавления обновления темы');
    process.exit(1);
  }
  
  const insertPos = appContent.indexOf('\n', pos) + 1;
  appContent = appContent.slice(0, insertPos) + updateThemeCode + '\n' + appContent.slice(insertPos);
  changesMade++;
  console.log('✅ 3. Добавлено обновление цветов в applyTheme()');
} else {
  console.log('⏭️  3. Обновление цветов уже добавлено');
}

// ========================================
// 4. Применение цветов в renderScheduleCurrentLine()
// ========================================

const oldPillCode = 'pill.className = "shift-pill";';
const newPillCode = `// Применяем цвет на основе templateId
      let pillClasses = "shift-pill";
      
      // Специальные смены (ВЫХ, ОТП, ДР) получают желтый цвет
      if (shift.specialShortLabel) {
        pillClasses += " special";
      } else if (shift.templateId) {
        // Обычные смены получают уникальный цвет на основе templateId
        const colorClass = ShiftColors.getTemplateClass(shift.templateId);
        pillClasses += \` \${colorClass}\`;
      }
      
      pill.className = pillClasses;`;

if (appContent.includes('const colorClass = ShiftColors.getTemplateClass(shift.templateId)')) {
  console.log('⏭️  4. Применение цветов уже добавлено');
} else if (appContent.includes(oldPillCode)) {
  appContent = appContent.replace(oldPillCode, newPillCode);
  changesMade++;
  console.log('✅ 4. Добавлено применение цветов к пилюлям смен');
} else {
  console.warn('⚠️  4. Не найден код создания пилюли для замены');
}

// ========================================
// 5. Обновление легенды при переключении линий
// ========================================

const updateLegendCalls = [
  { search: 'state.ui.currentLine = "L1";', after: 'renderScheduleCurrentLine();' },
  { search: 'state.ui.currentLine = "L2";', after: 'renderScheduleCurrentLine();' }
];

updateLegendCalls.forEach((call, idx) => {
  const searchPos = appContent.indexOf(call.search);
  if (searchPos === -1) {
    console.warn(`⚠️  5.${idx + 1}. Не найдена секция для добавления renderShiftLegend()`);
    return;
  }
  
  const afterPos = appContent.indexOf(call.after, searchPos);
  if (afterPos === -1) {
    console.warn(`⚠️  5.${idx + 1}. Не найдена строка после для вставки`);
    return;
  }
  
  const lineEndPos = appContent.indexOf('\n', afterPos);
  const checkArea = appContent.substring(afterPos, lineEndPos + 200);
  
  if (checkArea.includes('renderShiftLegend()')) {
    console.log(`⏭️  5.${idx + 1}. renderShiftLegend() уже добавлен после ${call.search}`);
  } else {
    const insertCode = '\n  renderShiftLegend();';
    appContent = appContent.slice(0, lineEndPos) + insertCode + appContent.slice(lineEndPos);
    changesMade++;
    console.log(`✅ 5.${idx + 1}. Добавлен вызов renderShiftLegend() после ${call.search}`);
  }
});

// ========================================
// Сохранить изменения
// ========================================

if (changesMade > 0) {
  fs.writeFileSync(APP_JS_PATH, appContent, 'utf8');
  console.log('');
  console.log(`🎉 Интеграция завершена! Применено изменений: ${changesMade}`);
  console.log('');
  console.log('Следующие шаги:');
  console.log('  1. Проверьте работу в браузере');
  console.log('  2. git add js/app.js');
  console.log('  3. git commit -m "feat: Complete integration of dynamic shift colors"');
  console.log('  4. git push origin feature/corporate-branding');
} else {
  console.log('');
  console.log('ℹ️  Все изменения уже применены. Файл app.js актуален.');
}
