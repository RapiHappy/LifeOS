/**
 * LifeOS — Модуль расчёта времени намаза Ясту (Иша)
 * Локация по умолчанию: село Актаныш, Республика Татарстан
 * Координаты: Широта 55.725° N, Долгота 54.080° E, Часовой пояс Europe/Moscow (UTC+3)
 */

const PrayerManager = {
  // Константы по умолчанию
  DEFAULTS: {
    city: 'Актаныш, Республика Татарстан',
    latitude: 55.725,
    longitude: 54.080,
    timezone: 3, // UTC+3
    method: 'DUM_RT', // ДУМ РТ (15° угол или 1.5 часа после магриба)
    twilightAngle: 15.0, // градусов под горизонтом для Иша
    durationMinutes: 20,
    manualTime: '' // Если задано (напр. "17:35"), используется вместо расчёта
  },

  /**
   * Градусы в радианы и обратно
   */
  degToRad(deg) {
    return deg * (Math.PI / 180.0);
  },

  radToDeg(rad) {
    return rad * (180.0 / Math.PI);
  },

  /**
   * Астрономический расчёт времени захода солнца и намаза Ясту на выбранную дату
   * @param {Date|string} dateInput - Дата (объект Date или строка YYYY-MM-DD)
   * @param {Object} [customSettings] - Пользовательские настройки из LocalStorage
   * @returns {{ time: string, sunset: string, method: string, isManual: boolean }}
   */
  calculateYastu(dateInput, customSettings = {}) {
    const settings = { ...this.DEFAULTS, ...customSettings };

    // Если включен ручной режим и задано точное время
    if (settings.manualTime && settings.manualTime.trim() !== '') {
      return {
        time: settings.manualTime.trim(),
        sunset: '15:20',
        method: 'Ручной ввод',
        isManual: true,
        duration: settings.durationMinutes || 20
      };
    }

    const date = typeof dateInput === 'string' ? new Date(dateInput + 'T12:00:00') : new Date(dateInput);
    
    // День в году
    const startOfYear = new Date(date.getFullYear(), 0, 0);
    const diff = date - startOfYear;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);

    const lat = Number(settings.latitude) || this.DEFAULTS.latitude;
    const lng = Number(settings.longitude) || this.DEFAULTS.longitude;
    const tz = Number(settings.timezone) || this.DEFAULTS.timezone;

    // Угол наклона солнца (деклинейшн) по формуле Купера
    const b = (2 * Math.PI * (dayOfYear - 81)) / 365;
    const declination = Math.asin(Math.sin(this.degToRad(23.45)) * Math.sin(b)); // в радианах

    // Уравнение времени (Equation of Time) в минутах
    const gamma = (2 * Math.PI / 365) * (dayOfYear - 1);
    const eqtime = 229.18 * (
      0.000075 + 
      0.001868 * Math.cos(gamma) - 
      0.032077 * Math.sin(gamma) - 
      0.014615 * Math.cos(2 * gamma) - 
      0.040849 * Math.sin(2 * gamma)
    );

    // Истинный полдень (Solar Noon) в часах (десятичная дробь)
    // Актаныш ~54.08 E, tz = 3
    const timeOffset = tz * 60 - lng * 4; // разница в минутах с местным солнечным
    const solarNoon = (720 + timeOffset - eqtime) / 60.0;

    // Расчёт захода солнца (зен. угол 90.833°)
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
      // Фиксированный интервал 90 минут после магриба
      ishaHours = sunsetHours + 1.5;
      methodName = 'Интервал 90 минут';
    } else {
      // Астрономический угол заката (по умолчанию 15° для РТ, либо пользовательский)
      const angle = Number(settings.twilightAngle) || 15.0;
      const zenithIsha = 90.0 + angle;
      const cosIshaZenith = Math.cos(this.degToRad(zenithIsha));
      
      let cosH_isha = (cosIshaZenith - Math.sin(latRad) * Math.sin(declination)) / 
                      (Math.cos(latRad) * Math.cos(declination));
      
      // В высоких широтах летом солнце может не опускаться на 15-18° (белые ночи)
      if (cosH_isha > 1 || cosH_isha < -1) {
        // Правило 1/7 ночи или фиксированный интервал
        ishaHours = sunsetHours + 1.5;
        methodName = 'ДУМ РТ (правило 1/7 ночи)';
      } else {
        const h_isha = this.radToDeg(Math.acos(cosH_isha));
        ishaHours = solarNoon + (h_isha / 15.0);
        methodName = `Астрономический (${angle}°)`;
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
      duration: settings.durationMinutes || 20
    };
  },

  /**
   * Получить защищённый блок расписания для Намаза Ясту
   * @param {string} dateStr 'YYYY-MM-DD'
   * @param {Object} [settings]
   * @returns {{ id: string, title: string, startTime: string, endTime: string, category: string, isProtected: boolean }}
   */
  getYastuScheduleBlock(dateStr, settings = {}) {
    const calc = this.calculateYastu(dateStr, settings);
    const duration = settings.durationMinutes || this.DEFAULTS.durationMinutes;

    const [h, m] = calc.time.split(':').map(Number);
    let totalMinutes = h * 60 + m;
    let endMinutes = totalMinutes + duration;

    const endH = Math.floor(endMinutes / 60) % 24;
    const endM = endMinutes % 60;
    const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

    return {
      id: `prayer_yastu_${dateStr}`,
      title: 'Намаз ясту',
      subtitle: `Актаныш (${calc.method})`,
      startTime: calc.time,
      endTime: endTime,
      durationMinutes: duration,
      category: 'prayer',
      status: 'pending',
      isProtected: true, // Защищён от удаления и урезания
      description: 'Обязательный вечерний намаз ясту. Спокойное время молитвы.'
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PrayerManager;
}
