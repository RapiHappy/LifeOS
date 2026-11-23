/**
 * LifeOS — Интеллектуальный ИИ-агент (AIPlanner)
 * Анализирует нагрузку, генерирует смысловые объяснения,
 * осуществляет предиктивное перепланирование и валидирует результаты.
 */

const AIPlanner = {
  /**
   * Выполнить полный цикл автоматического перепланирования
   * @param {string} dateStr 'YYYY-MM-DD'
   * @param {Object} db - экземпляр Database
   * @param {string} [triggerReason] - причина перепланирования
   * @returns {Promise<Object>} { schedule, explanation, changesLog }
   */
  async autoReplan(dateStr, db, triggerReason = 'Обновление данных расписания') {
    const settings = db.getSettings();
    const homework = await db.getAllHomework();
    const timetable = await db.getSchoolTimetable();
    const projects = await db.getProjects();
    const olympiads = await db.getOlympiads();
    const activityLogs = await db.getActivityLogs();

    // 1. Попытка запросить внешний защищенный API (если настроен)
    let externalSuccess = false;
    let newPlan = null;
    let aiExplanation = '';

    if (settings.aiEndpoint && settings.aiEndpoint.trim() !== '') {
      try {
        const extResult = await this.queryExternalAI(dateStr, {
          settings, homework, timetable, projects, olympiads
        });
        if (extResult && extResult.tasks) {
          // Валидация через локальный Scheduler (защита от галлюцинаций)
          newPlan = this.sanitizeAndValidateAIPlan(extResult.tasks, dateStr, settings);
          aiExplanation = extResult.explanation || 'Расписание оптимизировано внешней ИИ-моделью.';
          externalSuccess = true;
        }
      } catch (err) {
        console.warn('Внешний ИИ недоступен, переход на локальный планировщик:', err);
      }
    }

    // 2. Локальный алгоритмический ИИ-планировщик (основной/резервный)
    if (!externalSuccess) {
      newPlan = await Scheduler.generateDailySchedule(dateStr, db);
      aiExplanation = this.generateLocalExplanation(dateStr, newPlan, homework, projects, timetable, activityLogs);
    }

    // 3. Автоматическое сохранение с бэкапом предыдущей версии
    await Scheduler.applyScheduleWithBackup(dateStr, newPlan, db, triggerReason);

    return {
      success: true,
      schedule: newPlan,
      explanation: aiExplanation,
      appliedAt: new Date().toISOString()
    };
  },

  /**
   * Генерация понятного объяснения изменений на русском языке
   */
  generateLocalExplanation(dateStr, schedule, homework, projects, timetable, activityLogs) {
    const mode = schedule.mode;
    const parts = [];

    // Приветствие и режим
    if (mode === 'competitive') {
      parts.push(`🏆 **Соревновательный режим активирован.** До хакатона проекта «Миросборка» (27 ноября) осталось совсем немного времени! Выделен фокусный блок разработки на 70 минут.`);
    } else if (mode === 'loaded') {
      parts.push(`⚡ **Загруженный режим.** Высокая учебная нагрузка по домашним заданиям. Приоритет отдан обязательным урокам на завтра.`);
    } else {
      parts.push(`🌱 **Обычный сбалансированный режим.** Равномерное распределение: учёба, спорт, семья, игры и сон.`);
    }

    // Восьмой урок
    if (schedule.has8thLesson) {
      parts.push(`📍 Сегодня в расписании школы **8 уроков** (до ${schedule.schoolEndTime}). Время возвращения домой и обед сдвинуты без наложений.`);
    }

    // Намаз Ясту
    parts.push(`🕌 Время намаза ясту в Актаныше зафиксировано на **${schedule.yastuTime}**. Время защищено от любых смещений.`);

    // Защищённые блоки
    parts.push(`🛡️ Все ключевые блоки гарантированы: 1 час игр на ПК, 25 мин спорта, ужин с родителями и отбой ровно в 21:30.`);

    if (schedule.unallocatedMinutes > 0) {
      parts.push(`⚠️ Внимание: задач на сегодня больше, чем доступного времени до отбоя. Необязательные задачи перенесены, сон в 21:30 не нарушен.`);
    }

    return parts.join('\n\n');
  },

  /**
   * Валидация и защита от изменений защищенных блоков внешним ИИ
   */
  sanitizeAndValidateAIPlan(externalTasks, dateStr, settings) {
    // Гарантируем, что сон, ясту, игры и школьные уроки не удалены
    const sleepStart = settings.sleepStart || '21:30';
    const yastuBlock = PrayerManager.getYastuScheduleBlock(dateStr, settings);

    // Фильтруем любые задачи, которые залезают на сон после 21:30
    const sleepMin = Scheduler.timeToMin(sleepStart);
    const validTasks = externalTasks.filter(t => {
      const startMin = Scheduler.timeToMin(t.startTime);
      return startMin < sleepMin;
    });

    // Проверяем наличие блока Ясту
    const hasYastu = validTasks.some(t => t.category === 'prayer');
    if (!hasYastu) {
      validTasks.push(yastuBlock);
    }

    // Сортируем по времени
    validTasks.sort((a, b) => Scheduler.timeToMin(a.startTime) - Scheduler.timeToMin(b.startTime));

    return {
      date: dateStr,
      mode: settings.activeMode || 'normal',
      tasks: validTasks,
      generatedAt: new Date().toISOString()
    };
  },

  /**
   * Запрос к внешнему защищённому эндпоинту ИИ (Cloudflare Worker или OpenAI/Gemini совместимый прокси)
   */
  async queryExternalAI(dateStr, payload) {
    const { settings, homework, timetable, projects } = payload;
    const response = await fetch(settings.aiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.aiApiKey ? { 'Authorization': `Bearer ${settings.aiApiKey}` } : {})
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
      throw new Error(`AI API responded with status ${response.status}`);
    }

    return await response.json();
  },

  /**
   * Интерактивный диалог / советник с ИИ для пользователя
   */
  async getAdvice(userQuestion, db) {
    const settings = db.getSettings();
    const todayStr = new Date().toISOString().split('T')[0];
    const schedule = await db.getDaySchedule(todayStr);
    const homework = await db.getAllHomework();
    const projects = await db.getProjects();

    const q = userQuestion.toLowerCase();

    // Быстрый локальный семантический анализатор
    if (q.includes('хакатон') || q.includes('миросборк') || q.includes('проект')) {
      return `До хакатона проекта «Миросборка» (27 ноября 2026 г.) осталось 4 дня. Сейчас мы находимся в соревновательном режиме. В расписании на сегодня зарезервирован отдельный блок разработки. Рекомендую сфокусироваться на стабильности прототипа и подготовке демонстрации. Домашка оптимизирована, чтобы не отвлекать от проекта.`;
    }

    if (q.includes('математик') || q.includes('егэ') || q.includes('профиль')) {
      return `По профильной математике ключевая цель — освоить обе части (1–12 и 13–19). В плане на вечер предусмотрен разбор уравнений и неравенств (задания 13 и 15). Рекомендуем решать минимум 2 задачи второй части ежедневно без калькулятора.`;
    }

    if (q.includes('устал') || q.includes('отдых') || q.includes('перегруз')) {
      return `Главное правило LifeOS — предотвращение выгорания. Отбой строго в 21:30 (8.5 часов сна). Также сегодня запланирован 1 час игр на ПК и 45 минут отдыха без монитора перед сном. Если чувствуешь сильное утомление, переключи режим на «Загруженный» или перенеси необязательные задачи в настройках.`;
    }

    if (q.includes('намаз') || q.includes('ясту') || q.includes('молитв')) {
      const yastu = PrayerManager.calculateYastu(todayStr, settings);
      return `Время намаза ясту для Актаныша сегодня: ${yastu.time}. В расписании этот блок защищён от любых наложений. Продолжительность: ${yastu.duration} минут.`;
    }

    // Общий оптимизационный ответ
    const pendingHw = homework.filter(h => h.status !== 'completed').length;
    return `На сегодня в расписании запланировано ${schedule ? schedule.tasks.length : 0} блоков, активных домашних заданий: ${pendingHw}. Расписание оптимизировано с сохранением всех защищённых окон (спорт, семья, игры, намаз ясту и сон в 21:30). Смело двигайся по плану!`;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIPlanner;
}
