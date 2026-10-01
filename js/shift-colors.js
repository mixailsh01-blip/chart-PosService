// shift-colors.js
// Система динамического назначения цветов для шаблонов смен

const SHIFT_COLORS_STYLE_ID = 'dynamic-shift-colors';
const colorState = {
  theme: 'dark',
  templatesByLine: {},
  templateMetaById: new Map(),
};

function generateColorForIndex(index, saturation = 78, lightness = 52, isDark = false) {
  const goldenRatioConjugate = 0.618033988749895;
  const hue = Math.round((index * goldenRatioConjugate * 360 + 200) % 360);

  const adjSaturation = isDark ? Math.min(saturation + 8, 90) : saturation;
  const adjLightness = isDark ? Math.min(lightness + 4, 62) : Math.max(lightness - 8, 40);

  return { hue, saturation: adjSaturation, lightness: adjLightness };
}

function createCSSVariablesForColor(hsl, isDark = false) {
  // Плотная заливка и яркая рамка — смены хорошо различаются на любом фоне
  const bgOpacity = isDark ? 0.5 : 0.36;
  const borderOpacity = 1;

  return {
    bg: `hsla(${hsl.hue}, ${hsl.saturation}%, ${hsl.lightness}%, ${bgOpacity})`,
    border: `hsla(${hsl.hue}, ${hsl.saturation}%, ${isDark ? hsl.lightness + 8 : hsl.lightness - 4}%, ${borderOpacity})`,
  };
}

function ensureStyleEl() {
  let styleEl = document.getElementById(SHIFT_COLORS_STYLE_ID);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = SHIFT_COLORS_STYLE_ID;
    document.head.appendChild(styleEl);
  }
  return styleEl;
}

function getTemplateClass(line, templateId) {
  if (!line || templateId == null) return '';
  return `shift-template-${line.toLowerCase()}-${templateId}`;
}

function rebuildColors() {
  const styleEl = ensureStyleEl();
  colorState.templateMetaById.clear();

  const isDark = colorState.theme === 'dark';
  const cssRules = [];

  const lineKeys = Object.keys(colorState.templatesByLine || {});

  lineKeys.forEach((line) => {
    const templates = colorState.templatesByLine[line] || [];
    let colorIndex = 0;

    templates.forEach((template) => {
      const className = getTemplateClass(line, template.id);
      const meta = { line, className, isSpecial: Boolean(template.specialShortLabel) };
      colorState.templateMetaById.set(template.id, meta);

      if (meta.isSpecial) return;

      const colorHSL = generateColorForIndex(colorIndex++, 78, 52, isDark);
      const cssVars = createCSSVariablesForColor(colorHSL, isDark);

      cssRules.push(`
.shift-pill.${className},
.shift-legend-color.${className} {
  background: ${cssVars.bg};
  border-color: ${cssVars.border};
}
      `.trim());
    });
  });

  // Базовый стиль для специальных смен
  cssRules.push(`
.shift-pill.special,
.shift-legend-color.special {
  background: var(--shift-special-bg);
  border-color: var(--shift-special-border);
}
  `.trim());

  styleEl.textContent = cssRules.join('\n');
}

function applyColorToPill(pillEl, templateId, fallbackLine) {
  if (!pillEl || templateId == null) return;

  const meta = colorState.templateMetaById.get(templateId);

  if (meta?.isSpecial) {
    pillEl.classList.add('special');
    return;
  }

  const className = fallbackLine ? getTemplateClass(fallbackLine, templateId) : meta?.className;

  if (className) {
    pillEl.classList.add(className);
  }
}

function renderColorLegend(currentLine) {
  const legendContent = document.getElementById('shift-legend-content');
  if (!legendContent) return;

  legendContent.innerHTML = '';

  // Для конкретной линии — её шаблоны; для «ВСЕ» (и если у линии нет шаблонов) — все линии, где они есть
  const own = currentLine && currentLine !== 'ALL' ? colorState.templatesByLine[currentLine] || [] : [];
  const lines = own.length
    ? [currentLine]
    : Object.keys(colorState.templatesByLine || {}).filter(
        (k) => k !== 'ALL' && (colorState.templatesByLine[k] || []).length
      );

  if (!lines.length) {
    legendContent.innerHTML = '<div class="muted">Нет шаблонов смен.</div>';
    return;
  }

  lines.forEach((line) => {
    const templates = colorState.templatesByLine[line] || [];
    const group = document.createElement('div');
    group.className = 'shift-legend-group';

    const title = document.createElement('div');
    title.className = 'shift-legend-group-title';
    title.textContent = `Линия ${line}`;
    group.appendChild(title);

    const items = document.createElement('div');
    items.className = 'shift-legend-items';

    templates.forEach((template) => {
      const item = document.createElement('div');
      item.className = 'shift-legend-item';

      const color = document.createElement('div');
      color.className = 'shift-legend-color';

      if (template.specialShortLabel) {
        color.classList.add('special');
      } else {
        const className = getTemplateClass(line, template.id);
        if (className) color.classList.add(className);
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

function initialize(templatesByLine, theme = 'dark') {
  colorState.templatesByLine = templatesByLine || {};
  colorState.theme = theme === 'light' ? 'light' : 'dark';
  rebuildColors();
}

function applyTheme(theme) {
  colorState.theme = theme === 'light' ? 'light' : 'dark';
  rebuildColors();
}

if (typeof window !== 'undefined') {
  window.ShiftColors = {
    initialize,
    applyTheme,
    renderColorLegend,
    applyColorToPill,
    getTemplateClass,
  };
}
