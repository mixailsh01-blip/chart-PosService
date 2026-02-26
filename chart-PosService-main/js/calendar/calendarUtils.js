
/**
 * Возвращает информацию о днях месяца.
 * month0: 0-11
 */
export function getMonthMeta(year, month0) {
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month0, d);
    const weekday = date.getDay(); // 0 - вс, 6 - сб
    const isWeekend = weekday === 0 || weekday === 6;
    days.push({
      day: d,
      weekday,
      isWeekend
    });
  }
  return { year, month: month0, days, daysInMonth };
}

export function formatMinutesToTime(mins) {
  const m = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
}
