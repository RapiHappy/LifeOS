/**
 * LifeOS — Модуль расчёта времени намаза Ясту (Иша) (prayer.js)
 * Локация по умолчанию: село Актаныш, Республика Татарстан
 * Координаты: Широта 55.725° N, Долгота 54.080° E, Часовой пояс Europe/Moscow (UTC+3)
 * Поддерживает канонический метод ДУМ РТ (угол 15°), интервальный метод и ручную корректировку.
 */

// Поддержка TimeUtils как в браузере, так и в Node.js
const _TimeUtils = (typeof globalThis !== 'undefined' && typeof globalThis.TimeUtils !== 'undefined')
  ? globalThis.TimeUtils
  : (typeof require !== 'undefined' ? require('./time.js') : null);

const PrayerManager = {
  // Константы по умолчанию для села Актаныш
  DEFAULTS: {
    city: 'Актаныш, Республика Татарстан',
    latitude: 55.725,
    longitude: 54.080,
    timezone: 3, // UTC+3 Europe/Moscow
    method: 'DUM_RT', // ДУМ РТ (угол заката 15°)
    twilightAngle: 15.0, // градусов под горизонтом для Иша
    durationMinutes: 20,
    manualTime: '' // Если задано (напр. "17:35"), используется вместо расчёта
  },

  degToRad(deg) {
    return deg * (Math.PI / 180.0);
  },

  radToDeg(rad) {
    return rad * (180.0 / Math.PI);
  },

  /**
   * Нормализация настроек: объединяет ключи из Database/SettingsManager и PrayerManager
   * @param {Object} [custom] - настройки из базы или LocalStorage
   * @returns {Object}
   */
  normalizeSettings(custom = {}) {
    return {
      city: custom.prayerCity || custom.city || this.DEFAULTS.city,
      latitude: Number(custom.prayerLat ?? custom.latitude ?? this.DEFAULTS.latitude),
      longitude: Number(custom.prayerLng ?? custom.longitude ?? this.DEFAULTS.longitude),
      timezone: Number(custom.timezone ?? this.DEFAULTS.timezone),
      method: custom.prayerMethod || custom.method || this.DEFAULTS.method,
      twilightAngle: Number(custom.prayerAngle ?? custom.twilightAngle ?? this.DEFAULTS.twilightAngle),
      durationMinutes: Number(custom.prayerDuration ?? custom.durationMinutes ?? custom.duration ?? this.DEFAULTS.durationMinutes),
      manualTime: (custom.prayerManualTime ?? custom.manualTime ?? '').trim()
    };
  },

  /**
   * Астрономический расчёт времени захода солнца и намаза Ясту на выбранную дату
   * @param {Date|string} dateInput - Дата (строка 'YYYY-MM-DD' или объект Date)
   * @param {Object} [customSettings] - Пользовательские настройки
   * @returns {{ time: string, sunset: string, solarNoon: string, method: string, isManual: boolean, duration: number, note: string }}
   */
  calculateYastu(dateInput, customSettings = {}) {
    const settings = this.normalizeSettings(customSettings);

    // 1. Ручной ввод времени (по расписанию местной мечети)
    if (settings.manualTime && settings.manualTime !== '') {
      return {
        time: settings.manualTime,
        sunset: '15:20',
        solarNoon: '11:10',
        method: 'Ручной ввод по мечети',
        isManual: true,
        duration: settings.durationMinutes,
        note: 'Время установлено вручную по расписанию местной мечети в Актаныше.'
      };
    }

    // 2. Определение дня в году через TimeUtils (без смещения часового пояса)
    let year, month, day;
    if (typeof dateInput === 'string' && _TimeUtils) {
      const parts = _TimeUtils.parseDateParts(dateInput);
      year = parts.year;
      month = parts.month;
      day = parts.day;
    } else {
      const d = (typeof dateInput === 'string') ? new Date(dateInput + 'T12:00:00') : new Date(dateInput);
      year = d.getFullYear();
      month = d.getMonth();
      day = d.getDate();
    }

    const startOfYear = new Date(year, 0, 1, 12, 0, 0);
    const currentDate = new Date(year, month, day, 12, 0, 0);
    const diffMs = currentDate - startOfYear;
    const dayOfYear = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;

    const lat = settings.latitude;
    const lng = settings.longitude;
    const tz = settings.timezone;

    // Угол наклона солнца (деклинейшн) по формуле Купера
    const b = (2 * Math.PI * (dayOfYear - 81)) / 365;
    const declination = Math.asin(Math.sin(this.degToRad(23.45)) * Math.sin(b));

    // Уравнение времени (Equation of Time) в минутах
    const gamma = (2 * Math.PI / 365) * (dayOfYear - 1);
    const eqtime = 229.18 * (
      0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma)
    );

    // Истинный полдень (Solar Noon) в часах MSK
    const timeOffset = tz * 60 - lng * 4;
    const solarNoon = (720 + timeOffset - eqtime) / 60.0;

    // Заход солнца (зенитный угол 90.833° с учётом атмосферной рефракции)
    const latRad = this.degToRad(lat);
    const cosSunsetZenith = Math.cos(this.degToRad(90.833));
    let cosH0 = (cosSunsetZenith - Math.sin(latRad) * Math.sin(declination)) /
                (Math.cos(latRad) * Math.cos(declination));
    cosH0 = Math.max(-1, Math.min(1, cosH0));
    const h0 = this.radToDeg(Math.acos(cosH0));
    const sunsetHours = solarNoon + (h0 / 15.0);

    // Расчёт времени Ясту (Иша)
    let ishaHours;
    let methodName = 'ДУМ РТ (15°)';

    if (settings.method === 'INTERVAL_90') {
      ishaHours = sunsetHours + 1.5;
      methodName = 'Интервал 90 мин после заката';
    } else {
      const angle = Number(settings.twilightAngle) || 15.0;
      const zenithIsha = 90.0 + angle;
      const cosIshaZenith = Math.cos(this.degToRad(zenithIsha));

      let cosH_isha = (cosIshaZenith - Math.sin(latRad) * Math.sin(declination)) /
                      (Math.cos(latRad) * Math.cos(declination));

      if (cosH_isha > 1 || cosH_isha < -1) {
        // Летний период белых ночей в Татарстане — правило 1/7 ночи
        ishaHours = sunsetHours + 1.5;
        methodName = 'ДУМ РТ (правило белых ночей / 1.5ч)';
      } else {
        const h_isha = this.radToDeg(Math.acos(cosH_isha));
        ishaHours = solarNoon + (h_isha / 15.0);
        methodName = `ДУМ РТ (${angle}°)`;
      }
    }

    const formatHHMM = (decHours) => {
      let h = Math.floor(decHours);
      let m = Math.round((decHours - h) * 60);
      if (m >= 60) {
        h += 1;
        m = 0;
      }
      h = (h % 24 + 24) % 24;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const ishaTime = formatHHMM(ishaHours);
    const sunsetTime = formatHHMM(sunsetHours);

    return {
      time: ishaTime,
      sunset: sunsetTime,
      solarNoon: formatHHMM(solarNoon),
      method: methodName,
      isManual: false,
      duration: settings.durationMinutes,
      note: 'Время рассчитано астрономически по правилам ДУМ РТ. При необходимости скорректируйте по расписанию местной мечети в Настройках.'
    };
  },

  /**
   * Получить гарантированный защищённый блок расписания для Намаза Ясту
   * @param {string} dateStr 'YYYY-MM-DD'
   * @param {Object} [customSettings]
   * @returns {{ id: string, title: string, subtitle: string, startTime: string, endTime: string, durationMinutes: number, category: string, status: string, isProtected: boolean, description: string }}
   */
  getYastuScheduleBlock(dateStr, customSettings = {}) {
    const calc = this.calculateYastu(dateStr, customSettings);
    const settings = this.normalizeSettings(customSettings);
    const duration = settings.durationMinutes;

    const [h, m] = calc.time.split(':').map(Number);
    let totalMinutes = h * 60 + m;
    let endMinutes = totalMinutes + duration;

    const endH = Math.floor(endMinutes / 60) % 24;
    const endM = endMinutes % 60;
    const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

    return {
      id: `prayer_yastu_${dateStr}`,
      title: 'Намаз ясту',
      subtitle: `${settings.city} (${calc.method})`,
      startTime: calc.time,
      endTime: endTime,
      durationMinutes: duration,
      category: 'prayer',
      status: 'pending',
      isProtected: true, // Защищён от удаления, смещения и урезания
      description: `Обязательный вечерний намаз ясту (Иша). ${calc.note}`
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PrayerManager;
}
