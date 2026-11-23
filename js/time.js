/**
 * LifeOS — Единый модуль работы с датой и временем (time.js)
 * Все операции привязаны к часовому поясу пользователя: Europe/Moscow (UTC+3)
 * Исключает смещение дат при использовании toISOString() или парсинге UTC.
 */

const TimeUtils = {
  TIMEZONE: 'Europe/Moscow',

  /**
   * Получить сегодняшнюю дату в формате 'YYYY-MM-DD' для часового пояса Europe/Moscow
   * @param {Date} [refDate] - опциональная дата (по умолчанию сейчас)
   * @returns {string} 'YYYY-MM-DD'
   */
  getTodayStr(refDate = new Date()) {
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: this.TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      return formatter.format(refDate);
    } catch (e) {
      const offsetMs = 3 * 60 * 60 * 1000;
      const mskDate = new Date(refDate.getTime() + offsetMs);
      const y = mskDate.getUTCFullYear();
      const m = String(mskDate.getUTCMonth() + 1).padStart(2, '0');
      const d = String(mskDate.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  },

  /**
   * Алиас для getTodayStr(refDate)
   */
  formatDateMoscow(refDate = new Date()) {
    return this.getTodayStr(refDate);
  },

  /**
   * Алиас для formatDateMoscow (ISO дата YYYY-MM-DD в МСК)
   */
  formatDateISO(refDate = new Date()) {
    return this.getTodayStr(refDate);
  },

  /**
   * Получить локальный Date объект с настенным московским временем
   * @param {Date} [refDate]
   * @returns {Date}
   */
  getMoscowDate(refDate = new Date()) {
    try {
      const str = new Intl.DateTimeFormat('en-CA', {
        timeZone: this.TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(refDate);
      const [dPart, tPart] = str.split(', ');
      const [y, m, d] = dPart.split('-').map(Number);
      const [h, min, s] = (tPart || '00:00:00').split(':').map(Number);
      return new Date(y, m - 1, d, h, min, s);
    } catch (e) {
      const offsetMs = 3 * 60 * 60 * 1000;
      return new Date(refDate.getTime() + offsetMs);
    }
  },

  /**
   * Разобрать дату 'YYYY-MM-DD' на компоненты без влияния часовых поясов
   * @param {string} dateStr 'YYYY-MM-DD'
   * @returns {{ year: number, month: number, day: number }}
   */
  parseDateParts(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') {
      const today = this.getTodayStr();
      return this.parseDateParts(today);
    }
    const [y, m, d] = dateStr.split('-').map(Number);
    return {
      year: y || 2026,
      month: (m || 1) - 1, // 0-indexed
      day: d || 1
    };
  },

  /**
   * Создать локальный объект Date для 'YYYY-MM-DD' в полдень (12:00)
   * Это предотвращает любые сдвиги дня из-за смены поясов или переходов
   * @param {string} dateStr 'YYYY-MM-DD'
   * @returns {Date}
   */
  toDateAtNoon(dateStr) {
    const { year, month, day } = this.parseDateParts(dateStr);
    return new Date(year, month, day, 12, 0, 0);
  },

  /**
   * Прибавить/вычесть N календарных дней к строке даты 'YYYY-MM-DD'
   * @param {string} dateStr 'YYYY-MM-DD'
   * @param {number} days
   * @returns {string} 'YYYY-MM-DD'
   */
  addDays(dateStr, days) {
    const { year, month, day } = this.parseDateParts(dateStr);
    const d = new Date(year, month, day + days, 12, 0, 0);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayFormatted = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dayFormatted}`;
  },

  /**
   * Получить завтрашнюю дату в формате 'YYYY-MM-DD'
   * @param {string} [baseDateStr]
   * @returns {string} 'YYYY-MM-DD'
   */
  getTomorrowStr(baseDateStr) {
    const base = baseDateStr || this.getTodayStr();
    return this.addDays(base, 1);
  },

  /**
   * Разница в днях между двумя датами: targetDateStr - baseDateStr
   * Например: diffDays('2026-11-23', '2026-11-27') => +4 (дней осталось)
   * @param {string} baseDateStr 'YYYY-MM-DD'
   * @param {string} targetDateStr 'YYYY-MM-DD'
   * @returns {number}
   */
  diffDays(baseDateStr, targetDateStr) {
    const d1 = this.toDateAtNoon(baseDateStr);
    const d2 = this.toDateAtNoon(targetDateStr);
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.round((d2 - d1) / oneDay);
  },

  /**
   * Получить день недели (1 - Пн, 2 - Вт, ..., 6 - Сб, 7 - Вс)
   * @param {string} dateStr 'YYYY-MM-DD'
   * @returns {number} 1..7
   */
  getDayOfWeek(dateStr) {
    const d = this.toDateAtNoon(dateStr);
    const jsDay = d.getDay(); // 0-вс, 1-пн, ..., 6-сб
    return jsDay === 0 ? 7 : jsDay;
  },

  /**
   * Преобразовать время 'HH:MM' в количество минут от начала суток (0..1439)
   * @param {string} timeStr 'HH:MM'
   * @returns {number}
   */
  timeToMin(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  },

  /**
   * Преобразовать количество минут от начала суток в 'HH:MM'
   * @param {number} totalMinutes
   * @returns {string} 'HH:MM'
   */
  minToTime(totalMinutes) {
    const total = Math.max(0, Math.min(1439, Math.round(totalMinutes)));
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  },

  /**
   * Получить текущее количество минут от начала суток в часовом поясе Europe/Moscow
   * @returns {number}
   */
  getCurrentMinutesMoscow() {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: this.TIMEZONE,
        hour: 'numeric',
        minute: 'numeric',
        hour12: false
      }).formatToParts(new Date());

      let h = 0, m = 0;
      for (const p of parts) {
        if (p.type === 'hour') h = Number(p.value);
        if (p.type === 'minute') m = Number(p.value);
      }
      return h * 60 + m;
    } catch (e) {
      const d = new Date();
      return d.getHours() * 60 + d.getMinutes();
    }
  },

  /**
   * Форматировать дату для отображения на русском языке
   * @param {string} dateStr 'YYYY-MM-DD'
   * @returns {string} Например: "Понедельник, 23 ноября 2026 г."
   */
  formatDateRu(dateStr) {
    const d = this.toDateAtNoon(dateStr);
    const formatted = d.toLocaleDateString('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TimeUtils;
}
if (typeof globalThis !== 'undefined') {
  globalThis.TimeUtils = TimeUtils;
}
