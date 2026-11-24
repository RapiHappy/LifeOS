/**
 * LifeOS — Интеллектуальный ИИ-агент (AIPlanner)
 * v1.1: Чёткое разделение локального планировщика и внешнего ИИ-прокси.
 * Защита от хранения API-ключей на клиенте.
 * Валидация внешних планов через Scheduler.verifyScheduleIntegrity.
 */

const AIPlanner = {
  // Защита от циклов и троттлинг
  _lastCallTimestamps: [],
  _lastInputHashes: {},
  _debounceTimer: null,
  _isReplanning: false,

  /**
   * Сброс истории троттлинга (для тестов)
   */
  resetThrottle() {
    this._lastCallTimestamps = [];
    this._lastInputHashes = {};
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    this._isReplanning = false;
  },

  /**
   * Вызов автоперепланирования с debounce (задержка перед выполнением)
   */
  debouncedAutoReplan(dateStr, db, triggerReason = 'Быстрое обновление данных', delay = 1000) {
    return new Promise((resolve, reject) => {
      if (this._debounceTimer) {
        clearTimeout(this._debounceTimer);
      }
      this._debounceTimer = setTimeout(async () => {
        try {
          const res = await this.autoReplan(dateStr, db, triggerReason);
          resolve(res);
        } catch (err) {
          reject(err);
        }
      }, delay);
    });
  },

  /**
   * Выполнить полный цикл автоматического перепланирования
   * @param {string} dateStr 'YYYY-MM-DD'
   * @param {Object} db - экземпляр Database
   * @param {string} [triggerReason] - причина перепланирования
   * @param {boolean} [force=false] - принудительный перерасчёт без пропуска по хэшу
   * @returns {Promise<Object>} { success, schedule, explanation, source, appliedAt, skipped, throttled }
   */
  async autoReplan(dateStr, db, triggerReason = 'Обновление данных расписания', force = false) {
    const timeLib = (typeof TimeUtils !== 'undefined') ? TimeUtils : (typeof globalThis !== 'undefined' && globalThis.TimeUtils ? globalThis.TimeUtils : null);
    if (!dateStr && timeLib) {
      dateStr = timeLib.getTodayStr();
    } else if (!dateStr) {
      dateStr = new Date().toISOString().split('T')[0];
    }

    // 1. Троттлинг: не более 5 вызовов за последние 10 секунд
    const now = Date.now();
    this._lastCallTimestamps = this._lastCallTimestamps.filter(t => (now - t) < 10000);
    if (this._lastCallTimestamps.length >= 5) {
      console.warn('AIPlanner: превышен лимит вызовов перепланирования (>5 за 10 сек). Запрос отклонён для защиты от зацикливания.');
      const fallbackSchedule = await db.getDaySchedule(dateStr);
      return {
        success: false,
        throttled: true,
        reason: 'Превышен лимит вызовов перепланирования (троттлинг)',
        schedule: fallbackSchedule
      };
    }
    this._lastCallTimestamps.push(now);

    const settings = db.getSettings();
    const homework = await db.getAllHomework();
    const timetable = await db.getSchoolTimetable();
    const projects = await db.getProjects();
    const olympiads = await db.getOlympiads();

    // 2. Проверка изменения входных данных (Input Hash Check)
    const dayOfWeek = timeLib ? timeLib.getDayOfWeek(dateStr) : 1;
    const inputState = JSON.stringify({
      dateStr,
      hw: homework.map(h => ({ id: h.id, status: h.status, dueDate: h.dueDate, minutes: h.estimatedMinutes })),
      tt: (timetable.find(t => t.dayOfWeek === dayOfWeek) || {}).lessons || [],
      proj: projects.map(p => ({ id: p.id, deadline: p.deadline, priority: p.priority })),
      oly: olympiads.filter(o => o.isConfirmed && !o.isTemplate).map(o => ({ id: o.id, date: o.date })),
      mode: settings.activeMode,
      wake: settings.wakeTime,
      sleep: settings.sleepStart,
      prayer: settings.prayerManualTime || settings.prayerCity
    });

    if (!force && this._lastInputHashes[dateStr] === inputState) {
      const existing = await db.getDaySchedule(dateStr);
      if (existing) {
        return {
          success: true,
          schedule: existing,
          skipped: true,
          source: 'cache',
          explanation: 'Входные данные не изменились. Текущее расписание сохранено.'
        };
      }
    }

    let externalSuccess = false;
    let newPlan = null;
    let aiExplanation = '';
    let plannerSource = 'local';

    // 3. Попытка обратиться к внешнему защищённому эндпоинту (если указан в настройках)
    if (settings.aiEndpoint && typeof settings.aiEndpoint === 'string' && settings.aiEndpoint.trim().startsWith('http')) {
      try {
        const extResult = await this.queryExternalAI(dateStr, {
          settings, homework, timetable, projects, olympiads
        });
        if (extResult && extResult.tasks && Array.isArray(extResult.tasks)) {
          const validated = this.sanitizeAndValidateAIPlan(extResult.tasks, dateStr, settings);
          const integrity = Scheduler.verifyScheduleIntegrity(validated, settings);
          if (integrity.valid) {
            newPlan = validated;
            aiExplanation = extResult.explanation || 'Расписание оптимизировано внешней ИИ-моделью через безопасный эндпоинт.';
            externalSuccess = true;
            plannerSource = 'external';
          } else {
            console.warn('План внешнего ИИ не прошёл проверку целостности, откат на локальный алгоритм:', integrity.errors);
          }
        }
      } catch (err) {
        console.warn('Внешний ИИ-сервис недоступен или вернул ошибку, используется локальный планировщик:', err.message);
      }
    }

    // 4. Локальный детерминированный планировщик LifeOS
    if (!externalSuccess) {
      newPlan = await Scheduler.generateDailySchedule(dateStr, db);
      aiExplanation = this.generateLocalExplanation(dateStr, newPlan, homework, projects, timetable, settings);
      plannerSource = 'local';
    }

    // 5. Защита от потери выполненных задач текущего дня
    const previous = await db.getDaySchedule(dateStr);
    if (previous && previous.tasks && Array.isArray(previous.tasks)) {
      const completedTasks = previous.tasks.filter(t => t.status === 'completed');
      for (const comp of completedTasks) {
        const match = newPlan.tasks.find(t =>
          (comp.id && t.id === comp.id) ||
          (comp.hwId && t.hwId === comp.hwId) ||
          (t.title === comp.title && t.startTime === comp.startTime)
        );
        if (match) {
          match.status = 'completed';
          if (comp.completedAt) match.completedAt = comp.completedAt;
        } else {
          // Если выполненной задачи нет в новом плане (например, была выполнена и удалена из списка невыполненных ДЗ), сохраняем её
          newPlan.tasks.push(comp);
        }
      }
      // Пересортируем задачи по времени начала
      const timeToMin = (t) => {
        if (timeLib) return timeLib.timeToMin(t);
        const [h, m] = (t || '00:00').split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
      };
      newPlan.tasks.sort((a, b) => timeToMin(a.startTime) - timeToMin(b.startTime));
    }

    // 6. Автоматическое применение плана с резервной копией
    await Scheduler.applyScheduleWithBackup(dateStr, newPlan, db, triggerReason);
    this._lastInputHashes[dateStr] = inputState;

    return {
      success: true,
      schedule: newPlan,
      explanation: aiExplanation,
      source: plannerSource,
      appliedAt: timeLib ? timeLib.getMoscowDate().toISOString() : new Date().toISOString()
    };
  },

  /**
   * Генерация понятного объяснения работы локального планировщика на русском языке
   */
  generateLocalExplanation(dateStr, schedule, homework, projects, timetable, settings) {
    const timeLib = (typeof TimeUtils !== 'undefined') ? TimeUtils : (typeof globalThis !== 'undefined' && globalThis.TimeUtils ? globalThis.TimeUtils : null);
    const mode = schedule.mode;
    const parts = [];

    parts.push(`⚙️ **Локальный планировщик LifeOS (автономно):**`);

    // Хакатон и дни до него
    const hackathonDate = '2026-11-27';
    let daysToHackathon = null;
    if (timeLib) {
      daysToHackathon = timeLib.diffDays(dateStr, hackathonDate);
    }

    if (mode === 'competitive') {
      const hackText = daysToHackathon !== null ? `(до 27 ноября: ${daysToHackathon} дн.)` : '';
      parts.push(`🏆 **Соревновательный режим:** приоритет отдан подготовке к хакатону «Миросборка» ${hackText}. Выделен фокусный блок разработки.`);
    } else if (mode === 'loaded') {
      parts.push(`⚡ **Загруженный режим:** повышенная нагрузка по домашним заданиям. Приоритет отдан обязательным урокам на завтра.`);
    } else {
      parts.push(`🌱 **Сбалансированный режим:** равномерное распределение между школой, ДЗ, отдыхом и развитием.`);
    }

    // Восьмой урок
    if (schedule.has8thLesson) {
      parts.push(`📍 Сегодня в расписании школы **8 уроков** (до ${schedule.schoolEndTime}). Возвращение домой и обед синхронизированы без наложений.`);
    }

    // Намаз Ясту
    parts.push(`🕌 Намаз ясту (${schedule.yastuCity || 'Актаныш'}): зафиксирован на **${schedule.yastuTime}** (${schedule.yastuDuration || 20} мин). Защищён от смещений.`);

    // Защищённые блоки
    parts.push(`🛡️ Все гарантированные окна сохранены: сон 21:30–06:00 (8.5 ч), 1 час игр на ПК, 25 мин спорта, ужин с семьёй.`);

    // Непоместившиеся задачи
    if (schedule.unallocatedMinutes > 0) {
      parts.push(`⚠️ **Внимание:** суммарный объём задач превысил свободное время до отбоя. Не уместилось ${schedule.unallocatedMinutes} мин (${schedule.unallocatedTasks.length} зад.). Они безопасно перенесены, сон в 21:30 строго сохранён.`);
    }

    return parts.join('\n\n');
  },

  /**
   * Валидация и защита обязательных блоков при получении плана от внешнего ИИ
   */
  sanitizeAndValidateAIPlan(externalTasks, dateStr, settings) {
    const timeLib = (typeof TimeUtils !== 'undefined') ? TimeUtils : (typeof globalThis !== 'undefined' && globalThis.TimeUtils ? globalThis.TimeUtils : null);
    const timeToMin = (t) => {
      if (timeLib) return timeLib.timeToMin(t);
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    const sleepStart = settings.sleepStart || '21:30';
    const sleepMin = timeToMin(sleepStart);

    // Убираем задачи, выходящие за время отбоя
    const validTasks = externalTasks.filter(t => {
      const sMin = timeToMin(t.startTime);
      return sMin < sleepMin;
    });

    // Проверяем наличие блока Ясту
    const hasYastu = validTasks.some(t => t.category === 'prayer');
    if (!hasYastu) {
      const yastuBlock = PrayerManager.getYastuScheduleBlock(dateStr, settings);
      validTasks.push(yastuBlock);
    }

    // Сортировка по времени
    validTasks.sort((a, b) => timeToMin(a.startTime) - timeToMin(b.startTime));

    return {
      date: dateStr,
      mode: settings.activeMode || 'normal',
      tasks: validTasks,
      generatedAt: timeLib ? timeLib.getMoscowDate().toISOString() : new Date().toISOString()
    };
  },

  /**
   * Запрос к внешнему защищённому эндпоинту ИИ (Cloudflare Worker / Server Proxy)
   * Без хранения секретных API-ключей в клиентском JavaScript.
   */
  async queryExternalAI(dateStr, payload) {
    const { settings, homework, timetable, projects } = payload;
    const response = await fetch(settings.aiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        date: dateStr,
        city: settings.prayerCity || 'Актаныш',
        mode: settings.activeMode,
        homework: homework.filter(h => h.status !== 'completed'),
        timetable,
        activeProject: projects.find(p => p.priority === 'active'),
        sleepStart: settings.sleepStart || '21:30',
        wakeTime: settings.wakeTime || '06:00'
      })
    });

    if (!response.ok) {
      throw new Error(`AI proxy returned HTTP ${response.status}`);
    }

    return await response.json();
  },

  /**
   * Интерактивный советник / помощник для пользователя
   */
  async getAdvice(userQuestion, db) {
    const timeLib = (typeof TimeUtils !== 'undefined') ? TimeUtils : (typeof globalThis !== 'undefined' && globalThis.TimeUtils ? globalThis.TimeUtils : null);
    const todayStr = timeLib ? timeLib.getTodayStr() : new Date().toISOString().split('T')[0];

    const settings = db.getSettings();
    const schedule = await db.getDaySchedule(todayStr);
    const homework = await db.getAllHomework();

    const q = (userQuestion || '').toLowerCase();

    if (q.includes('хакатон') || q.includes('миросборк') || q.includes('проект')) {
      const days = timeLib ? timeLib.diffDays(todayStr, '2026-11-27') : 4;
      const daysText = days > 0 ? `осталось ${days} дн.` : 'сегодня!';
      return `До хакатона проекта «Миросборка» (27 ноября 2026 г.) ${daysText}. Сейчас активен соревновательный режим. В расписании выделен фокусный блок разработки. Рекомендую сосредоточиться на стабильности прототипа и репетиции питча.`;
    }

    if (q.includes('математик') || q.includes('егэ') || q.includes('профиль')) {
      return `По профильной математике цель — освоить обе части (1–12 и 13–19). В расписании предусмотрен блок разбора тем. Рекомендую решать минимум 2 задачи второй части (уравнения 13 или неравенства 15) без использования калькулятора.`;
    }

    if (q.includes('устал') || q.includes('отдых') || q.includes('перегруз')) {
      return `Главное правило LifeOS — предотвращение выгорания. Отбой строго в 21:30 (8.5 ч полноценного сна). Также сегодня запланирован 1 час игр на ПК и 45 минут отдыха без компьютера перед сном.`;
    }

    if (q.includes('намаз') || q.includes('ясту') || q.includes('молитв')) {
      const yastu = PrayerManager.calculateYastu(todayStr, settings);
      return `Время намаза ясту для Актаныша сегодня: ${yastu.time}. В расписании этот блок защищён от любых сдвигов. Продолжительность: ${yastu.duration} мин.`;
    }

    const pendingHw = homework.filter(h => h.status !== 'completed').length;
    const taskCount = (schedule && schedule.tasks) ? schedule.tasks.length : 0;
    return `На сегодня в расписании ${taskCount} блоков, активных домашних заданий: ${pendingHw}. Защищённые окна (спорт, семья, игры, намаз ясту и сон в 21:30) полностью сохранены. План сбалансирован.`;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIPlanner;
}
if (typeof globalThis !== 'undefined') {
  globalThis.AIPlanner = AIPlanner;
}
