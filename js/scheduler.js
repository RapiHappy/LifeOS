/**
 * LifeOS — Интеллектуальный планировщик расписания (Scheduler)
 * Отвечает за бесконфликтное распределение школьных уроков, ДЗ, ЕГЭ,
 * олимпиад, проектов и гарантированных защищённых блоков.
 */

const Scheduler = {
  // Минуты в формат "HH:MM"
  minToTime(mins) {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  },

  // "HH:MM" в минуты
  timeToMin(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  },

  /**
   * Определение режима расписания на день
   * @param {string} dateStr 'YYYY-MM-DD'
   * @param {Array} homeworkList
   * @param {Array} projectsList
   * @param {Array} olympiadsList
   * @param {Object} settings
   * @returns {{ mode: 'normal'|'loaded'|'competitive', reason: string }}
   */
  detectMode(dateStr, homeworkList, projectsList, olympiadsList, settings) {
    // 1. Ручной выбор режима в настройках имеет приоритет, если не 'auto'
    if (settings.activeMode && settings.activeMode !== 'auto') {
      const modeNames = {
        normal: 'Обычный режим (установлен вручную)',
        loaded: 'Загруженный режим (установлен вручную)',
        competitive: 'Соревновательный режим (установлен вручную)'
      };
      return {
        mode: settings.activeMode,
        reason: modeNames[settings.activeMode] || 'Пользовательский выбор'
      };
    }

    const targetDate = new Date(dateStr);
    const dayOfWeek = targetDate.getDay(); // 0-вс, 1-пн, ...

    // 2. Проверка на Соревновательный режим (хакатон или олимпиада в ближайшие 7 дней)
    const activeProject = projectsList.find(p => p.priority === 'active' || p.isMain);
    if (activeProject && activeProject.deadline) {
      const deadlineDate = new Date(activeProject.deadline);
      const diffDays = Math.ceil((deadlineDate - targetDate) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= 7) {
        return {
          mode: 'competitive',
          reason: `Приближается хакатон / дедлайн проекта «${activeProject.title}» (${activeProject.deadline}, осталось дней: ${diffDays}). Приоритет отдан разработке!`
        };
      }
    }

    // Проверка олимпиад
    const upcomingOly = olympiadsList.find(o => {
      if (!o.date) return false;
      const olyDate = new Date(o.date);
      const diff = Math.ceil((olyDate - targetDate) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= 5;
    });
    if (upcomingOly) {
      return {
        mode: 'competitive',
        reason: `Приближается олимпиада «${upcomingOly.title}» (${upcomingOly.date}). Фокус на олимпиадной подготовке!`
      };
    }

    // 3. Проверка на Загруженный режим (много домашки на завтра/сегодня или контрольные)
    // Вычисляем суммарное время невыполненных ДЗ со сроком сегодня или завтра
    const tomorrow = new Date(targetDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    let urgentHwMinutes = 0;
    homeworkList.forEach(hw => {
      if (hw.status !== 'completed' && (hw.dueDate === dateStr || hw.dueDate === tomorrowStr)) {
        urgentHwMinutes += (hw.estimatedMinutes || 30);
      }
    });

    if (urgentHwMinutes >= 120) {
      return {
        mode: 'loaded',
        reason: `Высокая учебная нагрузка: суммарное ДЗ составляет ${urgentHwMinutes} мин. Приоритет обязательным предметам, необязательные активности сокращены.`
      };
    }

    // 4. Обычный режим по умолчанию
    return {
      mode: 'normal',
      reason: 'Сбалансированная нагрузка. Равномерное развитие: школа, ДЗ, ЕГЭ, спорт, игры и отдых.'
    };
  },

  /**
   * Сформировать расписание на день
   * @param {string} dateStr 'YYYY-MM-DD'
   * @param {Object} db - экземпляр Database
   * @returns {Promise<Object>} объект с расписанием
   */
  async generateDailySchedule(dateStr, db) {
    const settings = db.getSettings();
    const homework = await db.getAllHomework();
    const timetable = await db.getSchoolTimetable();
    const projects = await db.getProjects();
    const olympiads = await db.getOlympiads();
    const egeTopics = await db.getEgeTopics();

    const date = new Date(dateStr + 'T12:00:00');
    // JS: 0-Sun, 1-Mon, ..., 6-Sat
    const jsDay = date.getDay();
    const dayOfWeek = jsDay === 0 ? 7 : jsDay; // 1-пн ... 6-сб, 7-вс

    // Определение режима
    const modeInfo = this.detectMode(dateStr, homework, projects, olympiads, settings);
    const mode = modeInfo.mode;

    // Временные рамки дня
    const wakeMin = this.timeToMin(settings.wakeTime || '06:00');
    const sleepMin = this.timeToMin(settings.sleepStart || '21:30');

    const tasks = [];
    const occupiedIntervals = []; // [{ start, end, id }]

    function markOccupied(start, end, id) {
      occupiedIntervals.push({ start, end, id });
      occupiedIntervals.sort((a, b) => a.start - b.start);
    }

    // 1. Утренний блок (Подъем, зарядка, завтрак, сборы)
    tasks.push({
      id: `morning_${dateStr}`,
      title: 'Утренний подъем и сборы',
      subtitle: 'Зарядка, завтрак, подготовка к школе',
      startTime: this.minToTime(wakeMin),
      endTime: this.minToTime(wakeMin + 90), // 06:00 - 07:30
      durationMinutes: 90,
      category: 'routine',
      status: 'pending',
      isProtected: true,
      description: 'Утренний ритуал: бодрый старт дня, полноценный завтрак.'
    });
    markOccupied(wakeMin, wakeMin + 90, 'morning');

    // 2. Школьные уроки из расписания
    let schoolEndMin = wakeMin + 90; // по умолчанию если нет школы
    const dayTimetable = timetable.find(t => t.dayOfWeek === dayOfWeek);

    let has8thLesson = false;
    if (dayTimetable && dayTimetable.lessons && dayTimetable.lessons.length > 0) {
      const activeLessons = dayTimetable.lessons.filter(l => !l.isCanceled);
      
      // Дорога в школу перед первым уроком
      const firstLesson = activeLessons[0];
      if (firstLesson) {
        const firstStart = this.timeToMin(firstLesson.startTime);
        tasks.push({
          id: `road_to_school_${dateStr}`,
          title: 'Дорога в школу',
          subtitle: 'Прогулка до школы, подготовка к 1 уроку',
          startTime: this.minToTime(firstStart - 25),
          endTime: firstLesson.startTime,
          durationMinutes: 25,
          category: 'school',
          status: 'pending',
          isProtected: true
        });
        markOccupied(firstStart - 25, firstStart, 'road_to_school');
      }

      // Добавление каждого урока в расписание
      activeLessons.forEach(lesson => {
        const start = this.timeToMin(lesson.startTime);
        const end = this.timeToMin(lesson.endTime);
        if (lesson.lessonNumber === 8 || lesson.isExtra) {
          has8thLesson = true;
        }

        tasks.push({
          id: `lesson_${dayOfWeek}_${lesson.lessonNumber}_${dateStr}`,
          title: `${lesson.lessonNumber}. ${lesson.subject}`,
          subtitle: `Кабинет ${lesson.room || '—'}${lesson.isExtra ? ' (8-й урок)' : ''}`,
          startTime: lesson.startTime,
          endTime: lesson.endTime,
          durationMinutes: end - start,
          category: 'school',
          status: 'pending',
          isProtected: true,
          room: lesson.room,
          notes: lesson.notes || '',
          isExtra: !!lesson.isExtra
        });
        markOccupied(start, end, `lesson_${lesson.lessonNumber}`);
        schoolEndMin = Math.max(schoolEndMin, end);
      });
    }

    // 3. Возвращение домой и обед (35-40 минут после последнего урока)
    if (schoolEndMin > wakeMin + 90) {
      const lunchDuration = settings.lunchMinutes || 40;
      const lunchEndMin = schoolEndMin + lunchDuration;
      tasks.push({
        id: `road_home_lunch_${dateStr}`,
        title: 'Возвращение домой и обед',
        subtitle: has8thLesson ? 'Позднее возвращение (после 8 урока)' : 'Обед и восстановление сил',
        startTime: this.minToTime(schoolEndMin),
        endTime: this.minToTime(lunchEndMin),
        durationMinutes: lunchDuration,
        category: 'routine',
        status: 'pending',
        isProtected: true,
        description: 'Дорога домой, горячий обед, переключение внимания.'
      });
      markOccupied(schoolEndMin, lunchEndMin, 'lunch');
      schoolEndMin = lunchEndMin;
    } else if (dayOfWeek === 7) {
      // Воскресенье — свободный день: спокойное утро и обед
      schoolEndMin = this.timeToMin('13:00');
    }

    // 4. ЗАЩИЩЁННЫЙ БЛОК: Намаз Ясту (Иша)
    const yastuBlock = PrayerManager.getYastuScheduleBlock(dateStr, settings);
    const yastuStartMin = this.timeToMin(yastuBlock.startTime);
    const yastuEndMin = this.timeToMin(yastuBlock.endTime);
    tasks.push(yastuBlock);
    markOccupied(yastuStartMin, yastuEndMin, 'yastu');

    // 5. ЗАЩИЩЁННЫЕ БЛОКИ ВТОРОЙ ПОЛОВИНЫ ДНЯ:
    // - Игры на ПК: 60 минут (запланированный блок, не награда!)
    // - Спорт: 25 минут
    // - Семья: 30 минут (ужин с родителями)
    // - Отдых без ПК: 45 минут перед сном
    // - Сон: 21:30 - 06:00

    const gameDuration = settings.gameMinutes || 60;
    const sportDuration = settings.sportMinutes || 25;
    const familyDuration = settings.familyMinutes || 30;
    const offlineRestDuration = settings.offlineRestMinutes || 45;

    // Отдых без ПК фиксируем перед сном: (sleepMin - offlineRestDuration) до sleepMin
    const restStartMin = sleepMin - offlineRestDuration; // 20:45 - 21:30
    tasks.push({
      id: `offline_rest_${dateStr}`,
      title: 'Отдых без компьютера',
      subtitle: 'Чтение книги, подготовка ко сну, релаксация',
      startTime: this.minToTime(restStartMin),
      endTime: this.minToTime(sleepMin),
      durationMinutes: offlineRestDuration,
      category: 'rest',
      status: 'pending',
      isProtected: true,
      description: 'Важнейший блок гигиены сна: выключить экраны, почитать книгу, подвести итоги дня.'
    });
    markOccupied(restStartMin, sleepMin, 'offline_rest');

    // Сон: 21:30 - 06:00
    tasks.push({
      id: `sleep_${dateStr}`,
      title: 'Сон и восстановление (8ч 30мин)',
      subtitle: 'Отбой в 21:30, подъём в 06:00',
      startTime: this.minToTime(sleepMin),
      endTime: settings.wakeTime || '06:00',
      durationMinutes: 510,
      category: 'sleep',
      status: 'pending',
      isProtected: true,
      description: 'Строго охраняемый физиологический сон для высокой продуктивности.'
    });

    // Игры на ПК: 60 минут (обычно ставим перед отдыхом без ПК, напр. 19:40 - 20:40)
    const gameStartMin = restStartMin - gameDuration; // 19:45 - 20:45
    tasks.push({
      id: `pc_games_${dateStr}`,
      title: 'Игры на ПК',
      subtitle: 'Запланированное игровое время (60 мин)',
      startTime: this.minToTime(gameStartMin),
      endTime: this.minToTime(restStartMin),
      durationMinutes: gameDuration,
      category: 'gaming',
      status: 'pending',
      isProtected: true,
      description: 'Законный запланированный отдых. Не является наградой за выполненные уроки.'
    });
    markOccupied(gameStartMin, restStartMin, 'gaming');

    // Семейное время (ужин с родителями): 30 мин (напр. перед играми: 19:15 - 19:45)
    const familyStartMin = gameStartMin - familyDuration; // 19:15 - 19:45
    tasks.push({
      id: `family_dinner_${dateStr}`,
      title: 'Ужин с родителями и семейное время',
      subtitle: 'Общение с семьёй, совместный ужин',
      startTime: this.minToTime(familyStartMin),
      endTime: this.minToTime(gameStartMin),
      durationMinutes: familyDuration,
      category: 'family',
      status: 'pending',
      isProtected: true,
      description: 'Ценное время с близкими: ужин, обсуждение новостей, поддержка контакта с родителями.'
    });
    markOccupied(familyStartMin, gameStartMin, 'family');

    // Спорт (25 минут): размещаем либо до ясту, либо сразу после ясту
    // Проверим, где есть красивое окно
    let sportStartMin = yastuEndMin + 10;
    if (sportStartMin + sportDuration > familyStartMin) {
      sportStartMin = familyStartMin - sportDuration - 10;
    }
    tasks.push({
      id: `sport_${dateStr}`,
      title: 'Спорт и физическая активность',
      subtitle: 'Разминка, турник, отжимания или прогулка',
      startTime: this.minToTime(sportStartMin),
      endTime: this.minToTime(sportStartMin + sportDuration),
      durationMinutes: sportDuration,
      category: 'sport',
      status: 'pending',
      isProtected: true,
      description: 'Ежедневная двигательная активность для осанки и снятия умственной усталости.'
    });
    markOccupied(sportStartMin, sportStartMin + sportDuration, 'sport');

    // 6. РАСПРЕДЕЛЕНИЕ УЧЕБНЫХ И ПРОДУКТИВНЫХ ЗАДАЧ В СВОБОДНЫЕ ОКНА
    // Вычисляем свободные окна между schoolEndMin и familyStartMin
    const freeSlots = [];
    let curPointer = schoolEndMin;

    occupiedIntervals.sort((a, b) => a.start - b.start);
    for (const occ of occupiedIntervals) {
      if (occ.start > curPointer && occ.start <= familyStartMin) {
        const gap = occ.start - curPointer;
        if (gap >= 15) {
          freeSlots.push({ start: curPointer, end: occ.start, duration: gap });
        }
      }
      if (occ.end > curPointer) {
        curPointer = occ.end;
      }
    }
    if (curPointer < familyStartMin) {
      const gap = familyStartMin - curPointer;
      if (gap >= 15) {
        freeSlots.push({ start: curPointer, end: familyStartMin, duration: gap });
      }
    }

    // Собираем кандидатов на размещение по приоритетам в зависимости от режима:
    const tasksToSchedule = [];

    // А) Домашка (фильтруем активные ДЗ)
    const activeHw = homework
      .filter(h => h.status !== 'completed')
      .sort((a, b) => {
        // Сначала те, у кого дедлайн раньше
        if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        // Затем по приоритету
        const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        return (priorityOrder[b.priority] || 1) - (priorityOrder[a.priority] || 1);
      });

    // Б) Целевые учебные блоки: ЕГЭ, Проект, Олимпиада
    const activeProject = projects.find(p => p.priority === 'active' || p.isMain) || projects[0];
    const activeOly = olympiads.find(o => o.status === 'active') || olympiads[0];

    // Выбираем тему ЕГЭ для ротации
    const nextEgeTopic = egeTopics.find(t => t.status === 'in_progress') || egeTopics[0];

    if (mode === 'competitive') {
      // В соревновательном режиме:
      // 1. Проект / Хакатон — ГЛАВНЫЙ СЛОТ (60-80 мин)
      if (activeProject) {
        tasksToSchedule.push({
          title: `Проект «${activeProject.title}» (Подготовка к хакатону)`,
          subtitle: 'Разработка ядра, тестирование модулей',
          durationMinutes: 70,
          category: 'project',
          priorityWeight: 100,
          description: `Фокусная работа над проектом «${activeProject.title}». До хакатона 27 ноября осталось совсем мало времени!`
        });
      }
      // 2. Обязательные ДЗ с близким сроком
      activeHw.forEach(hw => {
        tasksToSchedule.push({
          title: `ДЗ: ${hw.subject}`,
          subtitle: hw.title,
          durationMinutes: hw.estimatedMinutes || 30,
          category: 'homework',
          priorityWeight: hw.required ? 80 : 40,
          hwId: hw.id,
          description: hw.description
        });
      });
      // 3. Компактное поддержание ЕГЭ
      tasksToSchedule.push({
        title: 'ЕГЭ: Профильная математика (Часть 2)',
        subtitle: nextEgeTopic ? `${nextEgeTopic.code} — ${nextEgeTopic.title}` : 'Уравнения и неравенства',
        durationMinutes: 35,
        category: 'ege',
        priorityWeight: 60,
        description: 'Ежедневная поддержка формы: решение 2 задач второй части.'
      });

    } else if (mode === 'loaded') {
      // В загруженном режиме:
      // 1. Все обязательные ДЗ
      activeHw.forEach(hw => {
        tasksToSchedule.push({
          title: `ДЗ: ${hw.subject}`,
          subtitle: hw.title,
          durationMinutes: hw.estimatedMinutes || 30,
          category: 'homework',
          priorityWeight: hw.required ? 100 : 50,
          hwId: hw.id,
          description: hw.description
        });
      });
      // 2. Компактное повторение ЕГЭ
      tasksToSchedule.push({
        title: 'ЕГЭ: Профильная математика',
        subtitle: nextEgeTopic ? `${nextEgeTopic.code} ${nextEgeTopic.title}` : 'Быстрый тренинг',
        durationMinutes: 30,
        category: 'ege',
        priorityWeight: 70,
        description: 'Компактное повторение формул и ключевых прототипов.'
      });

    } else {
      // В обычном режиме:
      // 1. Домашние задания
      activeHw.forEach(hw => {
        tasksToSchedule.push({
          title: `ДЗ: ${hw.subject}`,
          subtitle: hw.title,
          durationMinutes: hw.estimatedMinutes || 30,
          category: 'homework',
          priorityWeight: hw.required ? 90 : 50,
          hwId: hw.id,
          description: hw.description
        });
      });
      // 2. Блок ЕГЭ (45 мин)
      tasksToSchedule.push({
        title: 'ЕГЭ: Профильная математика (Часть 1 и 2)',
        subtitle: nextEgeTopic ? `${nextEgeTopic.code} ${nextEgeTopic.title}` : 'Интенсивная практика',
        durationMinutes: 45,
        category: 'ege',
        priorityWeight: 80,
        description: 'Разбор теории, решение прототипов первой и второй части.'
      });
      // 3. Блок олимпиад или проектов по дням (2 раза в неделю олимпиада, 2 раза проект)
      if (dayOfWeek === 1 || dayOfWeek === 3) {
        // Олимпиада
        tasksToSchedule.push({
          title: `Олимпиада: ${activeOly ? activeOly.subject : 'Информатика/Математика'}`,
          subtitle: activeOly ? activeOly.title : 'Решение олимпиадных задач прошлых лет',
          durationMinutes: 40,
          category: 'olympiad',
          priorityWeight: 65,
          description: 'Практика нестандартных олимпиадных задач.'
        });
      } else {
        // Проект «Миросборка»
        tasksToSchedule.push({
          title: `Проект «${activeProject ? activeProject.title : 'Миросборка'}»`,
          subtitle: 'Плановый блок разработки и алгоритмов',
          durationMinutes: 40,
          category: 'project',
          priorityWeight: 65,
          description: 'Работа над проектом, улучшение функциональности.'
        });
      }
    }

    // Сортируем задачи по весу приоритета
    tasksToSchedule.sort((a, b) => b.priorityWeight - a.priorityWeight);

    // Заполнение свободных слотов
    let unallocatedMinutes = 0;
    const unallocatedTasks = [];

    for (const item of tasksToSchedule) {
      let allocated = false;

      // Ищем свободный слот подходящего размера
      for (let i = 0; i < freeSlots.length; i++) {
        const slot = freeSlots[i];
        if (slot.duration >= 20) {
          const taskDur = Math.min(item.durationMinutes, slot.duration);
          
          tasks.push({
            id: `task_${dateStr}_${tasks.length + 1}`,
            title: item.title,
            subtitle: item.subtitle,
            startTime: this.minToTime(slot.start),
            endTime: this.minToTime(slot.start + taskDur),
            durationMinutes: taskDur,
            category: item.category,
            status: 'pending',
            isProtected: false,
            hwId: item.hwId || null,
            description: item.description || ''
          });

          // Уменьшаем свободный слот
          slot.start += taskDur + 5; // +5 мин на короткую передышку
          slot.duration -= (taskDur + 5);
          allocated = true;
          break;
        }
      }

      if (!allocated) {
        unallocatedMinutes += item.durationMinutes;
        unallocatedTasks.push(item);
      }
    }

    // Сортировка всех задач по времени начала
    tasks.sort((a, b) => this.timeToMin(a.startTime) - this.timeToMin(b.startTime));

    // Итоговый объект расписания
    const scheduleResult = {
      date: dateStr,
      mode: mode,
      modeReason: modeInfo.reason,
      has8thLesson: has8thLesson,
      schoolEndTime: this.minToTime(schoolEndMin),
      yastuTime: yastuBlock.startTime,
      unallocatedMinutes: unallocatedMinutes,
      unallocatedTasks: unallocatedTasks,
      generatedAt: new Date().toISOString(),
      tasks: tasks
    };

    return scheduleResult;
  },

  /**
   * Применить перепланирование с сохранением бэкапа для отката
   */
  async applyScheduleWithBackup(dateStr, newSchedule, db, reason = 'Автоматическое обновление расписания') {
    const previous = await db.getDaySchedule(dateStr);
    
    // Сохраняем в историю отката
    if (previous && previous.tasks) {
      await db.addReplanHistory({
        date: dateStr,
        reason: reason,
        previousTasks: previous.tasks,
        newTasks: newSchedule.tasks,
        mode: newSchedule.mode
      });
      newSchedule.backupPlan = previous.tasks;
    }

    await db.saveDaySchedule(newSchedule);
    return newSchedule;
  },

  /**
   * Откат последнего перепланирования
   */
  async rollbackLastReplan(dateStr, db) {
    const lastHistory = await db.popLastReplan(dateStr);
    if (!lastHistory || !lastHistory.previousTasks) {
      return { success: false, message: 'Нет предыдущих версий для отката' };
    }

    const currentSchedule = await db.getDaySchedule(dateStr);
    if (currentSchedule) {
      currentSchedule.tasks = lastHistory.previousTasks;
      currentSchedule.mode = lastHistory.mode || currentSchedule.mode;
      currentSchedule.generatedAt = new Date().toISOString();
      await db.saveDaySchedule(currentSchedule);
    }

    return {
      success: true,
      message: `План успешно возвращён к состоянию до «${lastHistory.reason}»`,
      tasks: lastHistory.previousTasks
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Scheduler;
}
