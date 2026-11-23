/**
 * LifeOS — Интеллектуальный ИИ-агент (AIPlanner)
 * v1.1: Чёткое разделение локального планировщика и внешнего ИИ-прокси.
 * Защита от хранения API-ключей на клиенте.
 * Валидация внешних планов через Scheduler.verifyScheduleIntegrity.
 */

const AIPlanner = {
  /**
   * Выполнить полный цикл автоматического перепланирования
   * @param {string} dateStr 'YYYY-MM-DD'
   * @param {Object} db - экземпляр Database
   * @param {string} [triggerReason] - причина перепланирования
   * @returns {Promise<Object>} { success, schedule, explanation, source, appliedAt }
   */
  async autoReplan(dateStr, db, triggerReason = 'Обновление данных расписания') {
    const timeLib = (typeof TimeUtils !== 'undefined') ? TimeUtils : (typeof globalThis !== 'undefined' && globalThis.TimeUtils ? globalThis.TimeUtils : null);
    if (!dateStr && timeLib) {
      dateStr = timeLib.getTodayStr();
    } else if (!dateStr) {
      dateStr = new Date().toISOString().split('T')[0];
    }

    const settings = db.getSettings();
    const homework = await db.getAllHomework();
    const timetable = await db.getSchoolTimetable();
    const projects = await db.getProjects();
    const olympiads = await db.getOlympiads();

    let externalSuccess = false;
    let newPlan = null;
    let aiExplanation = '';
    let plannerSource = 'local';

    // 1. Попытка обратиться к внешнему защищённому эндпоинту (если указан в настройках)
    if (settings.aiEndpoint && typeof settings.aiEndpoint === 'string' && settings.aiEndpoint.trim().startsWith('http')) {
      try {
        const extResult = await this.queryExternalAI(dateStr, {
          settings, homework, timetable, projects, olympiads
        });
        if (extResult && extResult.tasks && Array.isArray(extResult.tasks)) {
          const validated = this.sanitizeAndValidateAIPlan(extResult.tasks, dateStr, settings);
          const integrity = Scheduler.verifyScheduleIntegrity(validated);
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

    // 2. Локальный детерминированный планировщик LifeOS
    if (!externalSuccess) {
      newPlan = await Scheduler.generateDailySchedule(dateStr, db);
      aiExplanation = this.generateLocalExplanation(dateStr, newPlan, homework, projects, timetable, settings);
      plannerSource = 'local';
    }

    // 3. Автоматическое применение плана с резервной копией
    await Scheduler.applyScheduleWithBackup(dateStr, newPlan, db, triggerReason);

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
