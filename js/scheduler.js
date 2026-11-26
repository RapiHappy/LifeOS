/**
 * LifeOS — Интеллектуальный планировщик расписания (Scheduler v1.1)
 * Отвечает за бесконфликтное распределение школьных уроков, ДЗ, ЕГЭ,
 * олимпиад, проектов и гарантированных защищённых блоков.
 * Исправлена проблема потери времени задач при нехватке слота (поддержка разбиения на части).
 */

// Поддержка TimeUtils как в браузере, так и в Node.js
const _TimeUtilsScheduler = (typeof globalThis !== 'undefined' && typeof globalThis.TimeUtils !== 'undefined')
  ? globalThis.TimeUtils
  : (typeof require !== 'undefined' ? require('./time.js') : null);

const _PrayerManagerScheduler = (typeof globalThis !== 'undefined' && typeof globalThis.PrayerManager !== 'undefined')
  ? globalThis.PrayerManager
  : (typeof require !== 'undefined' ? require('./prayer.js') : null);

const Scheduler = {
  // Минуты в формат "HH:MM"
  minToTime(mins) {
    if (_TimeUtilsScheduler) return _TimeUtilsScheduler.minToTime(mins);
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  },

  // "HH:MM" в минуты
  timeToMin(timeStr) {
    if (_TimeUtilsScheduler) return _TimeUtilsScheduler.timeToMin(timeStr);
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
  detectMode(dateStr, homeworkList = [], projectsList = [], olympiadsList = [], settings = {}) {
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

    // 2. Проверка на Соревновательный режим (хакатон или олимпиада в ближайшие 7 дней)
    const activeProject = projectsList.find(p => p.priority === 'active' || p.isMain);
    if (activeProject && activeProject.deadline) {
      const diffDays = _TimeUtilsScheduler
        ? _TimeUtilsScheduler.diffDays(activeProject.deadline, dateStr)
        : Math.ceil((new Date(activeProject.deadline) - new Date(dateStr)) / (1000 * 60 * 60 * 24));

      if (diffDays >= 0 && diffDays <= 7) {
        return {
          mode: 'competitive',
          reason: `Приближается хакатон / дедлайн проекта «${activeProject.title}» (${activeProject.deadline}, осталось дней: ${diffDays}). Приоритет отдан разработке!`
        };
      }
    }

    // Проверка олимпиад (только подтверждённые пользователем реальные олимпиады, НЕ шаблоны!)
    const upcomingOly = olympiadsList.find(o => {
      if (!o.date) return false;
      if (o.isTemplate === true || o.isConfirmed === false) return false;
      const diff = _TimeUtilsScheduler
        ? _TimeUtilsScheduler.diffDays(o.date, dateStr)
        : Math.ceil((new Date(o.date) - new Date(dateStr)) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= 5;
    });
    if (upcomingOly) {
      return {
        mode: 'competitive',
        reason: `Приближается олимпиада «${upcomingOly.title}» (${upcomingOly.date}). Фокус на олимпиадной подготовке!`
      };
    }

    // 3. Проверка на Загруженный режим (много домашки на завтра/сегодня или контрольные)
    const tomorrowStr = _TimeUtilsScheduler
      ? _TimeUtilsScheduler.getTomorrowStr(dateStr)
      : new Date(new Date(dateStr).getTime() + 86400000).toISOString().split('T')[0];

    let urgentHwMinutes = 0;
    homeworkList.forEach(hw => {
      if (hw.status !== 'completed' && (hw.dueDate === dateStr || hw.dueDate === tomorrowStr || hw.dueDate < dateStr)) {
        urgentHwMinutes += (Number(hw.estimatedMinutes) || 30);
      }
    });

    if (urgentHwMinutes >= 120) {
      return {
        mode: 'loaded',
        reason: `Высокая учебная нагрузка: срочное ДЗ составляет ${urgentHwMinutes} мин. Приоритет обязательным предметам на завтра, необязательные активности перенесены.`
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
  async generateDailySchedule(dateStr, db, customSettings = null) {
    const baseSettings = db ? db.getSettings() : {};
    const settings = customSettings ? { ...baseSettings, ...customSettings } : baseSettings;
    const homework = db ? await db.getAllHomework() : [];
    const timetable = db ? await db.getSchoolTimetable() : [];
    const projects = db ? await db.getProjects() : [];
    const olympiads = db ? await db.getOlympiads() : [];
    const egeTopics = db ? await db.getEgeTopics() : [];

    const dayOfWeek = _TimeUtilsScheduler
      ? _TimeUtilsScheduler.getDayOfWeek(dateStr)
      : (new Date(dateStr + 'T12:00:00').getDay() === 0 ? 7 : new Date(dateStr + 'T12:00:00').getDay());

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

    // 1. Утренний блок (Подъем, зарядка, завтрак, сборы) — 90 минут
    tasks.push({
      id: `morning_${dateStr}`,
      title: 'Утренний подъем и сборы',
      subtitle: 'Зарядка, завтрак, подготовка к школе',
      startTime: this.minToTime(wakeMin),
      endTime: this.minToTime(wakeMin + 90),
      durationMinutes: 90,
      category: 'routine',
      status: 'pending',
      isProtected: true,
      description: 'Утренний ритуал: бодрый старт дня, полноценный завтрак.'
    });
    markOccupied(wakeMin, wakeMin + 90, 'morning');

    // 2. Школьные уроки из расписания (только при подтверждении или в демо-режиме)
    let schoolEndMin = wakeMin + 90;
    const isSchoolActive = settings.schoolTimetableConfirmed === true || settings.isDemoMode === true;
    const dayTimetable = isSchoolActive ? timetable.find(t => t.dayOfWeek === dayOfWeek) : null;

    let has8thLesson = false;
    let actualLessonsCount = 0;

    if (dayTimetable && dayTimetable.lessons && dayTimetable.lessons.length > 0) {
      const activeLessons = dayTimetable.lessons.filter(l => !l.isCanceled);
      actualLessonsCount = activeLessons.length;

      if (activeLessons.length > 0) {
        // Дорога в школу перед первым уроком (настраиваемое время, по умолчанию 25 мин)
        const commuteMinutes = Number(settings.commuteMinutes) || 25;
        const firstLesson = activeLessons[0];
        const firstStart = this.timeToMin(firstLesson.startTime);
        const roadStart = Math.max(wakeMin + 90, firstStart - commuteMinutes);

        if (firstStart > roadStart) {
          tasks.push({
            id: `road_to_school_${dateStr}`,
            title: 'Дорога в школу',
            subtitle: `Прогулка до школы (${commuteMinutes} мин), подготовка к 1 уроку`,
            startTime: this.minToTime(roadStart),
            endTime: firstLesson.startTime,
            durationMinutes: firstStart - roadStart,
            category: 'school',
            status: 'pending',
            isProtected: true
          });
          markOccupied(roadStart, firstStart, 'road_to_school');
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
            room: lesson.room || '',
            notes: lesson.notes || '',
            isExtra: !!lesson.isExtra
          });
          markOccupied(start, end, `lesson_${lesson.lessonNumber}`);
          schoolEndMin = Math.max(schoolEndMin, end);
        });
      }
    }

    // 3. Возвращение домой и обед
    let actualSchoolEndMin = schoolEndMin;
    let freeTimeStartMin = schoolEndMin;

    if (actualLessonsCount > 0 && schoolEndMin > wakeMin + 90) {
      const lunchDuration = Number(settings.lunchMinutes) || 40;

      if (has8thLesson) {
        // Во вторник и четверг: уроки заканчиваются в 14:35, дорога домой занимает около 25 минут.
        const returnCommuteMinutes = Number(settings.returnCommuteMinutes) ||
          Number(settings.commuteMinutes) || 25;
        const homeArrivalMin = schoolEndMin + returnCommuteMinutes;
        const lunchEndMin = homeArrivalMin + lunchDuration;

        tasks.push({
          id: `road_home_lunch_${dateStr}`,
          title: 'Дорога домой',
          subtitle: `Домой примерно к ${this.minToTime(homeArrivalMin)}`,
          startTime: this.minToTime(schoolEndMin),
          endTime: this.minToTime(homeArrivalMin),
          durationMinutes: returnCommuteMinutes,
          category: 'routine',
          status: 'pending',
          isProtected: true,
          description: 'Дорога из школы домой.'
        });
        markOccupied(schoolEndMin, homeArrivalMin, 'road_home');

        tasks.push({
          id: `lunch_${dateStr}`,
          title: 'Обед',
          subtitle: 'После возвращения домой',
          startTime: this.minToTime(homeArrivalMin),
          endTime: this.minToTime(lunchEndMin),
          durationMinutes: lunchDuration,
          category: 'routine',
          status: 'pending',
          isProtected: true,
          description: 'Горячий обед и восстановление сил.'
        });
        markOccupied(homeArrivalMin, lunchEndMin, 'lunch');
        freeTimeStartMin = lunchEndMin;
      } else {
        const lunchEndMin = schoolEndMin + lunchDuration;
        tasks.push({
          id: `road_home_lunch_${dateStr}`,
          title: 'Возвращение домой и обед',
          subtitle: 'Обед и восстановление сил',
          startTime: this.minToTime(schoolEndMin),
          endTime: this.minToTime(lunchEndMin),
          durationMinutes: lunchDuration,
          category: 'routine',
          status: 'pending',
          isProtected: true,
          description: 'Дорога домой и обед.'
        });
        markOccupied(schoolEndMin, lunchEndMin, 'lunch');
        freeTimeStartMin = lunchEndMin;
      }
    } else if (dayOfWeek === 7 || actualLessonsCount === 0) {
      // Воскресенье или день без уроков
      actualSchoolEndMin = this.timeToMin('13:00');
      freeTimeStartMin = actualSchoolEndMin;
    }

    // 4. ЗАЩИЩЁННЫЙ БЛОК: Намаз Ясту (Иша)
    const yastuBlock = _PrayerManagerScheduler
      ? _PrayerManagerScheduler.getYastuScheduleBlock(dateStr, settings)
      : {
          id: `prayer_yastu_${dateStr}`,
          title: 'Намаз ясту',
          startTime: '17:00',
          endTime: '17:20',
          durationMinutes: 20,
          category: 'prayer',
          status: 'pending',
          isProtected: true
        };

    const yastuStartMin = this.timeToMin(yastuBlock.startTime);
    const yastuEndMin = this.timeToMin(yastuBlock.endTime);
    tasks.push(yastuBlock);
    markOccupied(yastuStartMin, yastuEndMin, 'yastu');

    // 5. ЗАЩИЩЁННЫЕ БЛОКИ: игры после школы, семья и восстановление вечером.
    const gameDuration = settings.gameMinutes !== undefined ? Number(settings.gameMinutes) : 60;
    const sportDuration = settings.sportMinutes !== undefined ? Number(settings.sportMinutes) : 30;
    const familyDuration = settings.familyMinutes !== undefined ? Number(settings.familyMinutes) : 40;
    const offlineRestDuration = settings.offlineRestMinutes !== undefined ? Number(settings.offlineRestMinutes) : 30;

    // Сон: sleepMin - wakeMin (например, 21:30 - 06:00 = 8ч 30мин)
    const sleepDuration = (1440 - sleepMin) + wakeMin;
    tasks.push({
      id: `sleep_${dateStr}`,
      title: `Сон и восстановление (${Math.floor(sleepDuration / 60)}ч ${sleepDuration % 60 ? (sleepDuration % 60) + 'мин' : ''})`.trim(),
      subtitle: `Отбой в ${this.minToTime(sleepMin)}, подъём в ${this.minToTime(wakeMin)}`,
      startTime: this.minToTime(sleepMin),
      endTime: this.minToTime(wakeMin),
      durationMinutes: sleepDuration,
      category: 'sleep',
      status: 'pending',
      isProtected: true,
      description: 'Строго охраняемый физиологический сон для высокой продуктивности.'
    });

    // Отдых без компьютера перед сном.
    const restStartMin = sleepMin - offlineRestDuration;
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

    // Семейное время остаётся вечером, примерно в прежнем окне 19:20–20:00.
    const familyEndMin = restStartMin - 60;
    const familyStartMin = familyEndMin - familyDuration;
    tasks.push({
      id: `family_dinner_${dateStr}`,
      title: 'Ужин с родителями и семейное время',
      subtitle: 'Общение с семьёй, совместный ужин',
      startTime: this.minToTime(familyStartMin),
      endTime: this.minToTime(familyEndMin),
      durationMinutes: familyDuration,
      category: 'family',
      status: 'pending',
      isProtected: true,
      description: 'Ценное время с близкими: ужин, обсуждение новостей, поддержка контакта с родителями.'
    });
    markOccupied(familyStartMin, familyEndMin, 'family');

    // Игры на ПК — первый свободный блок после возвращения домой и обеда.
    // Если время игр пересекается с ясту, ищем ближайшее непрерывное окно до семейного времени.
    const gameCandidates = [
      freeTimeStartMin,
      yastuStartMin - gameDuration,
      yastuEndMin + 10
    ].filter((value, index, list) => list.indexOf(value) === index).sort((a, b) => a - b);
    let gameStartMin = gameCandidates.find(candidate =>
      candidate >= freeTimeStartMin &&
      candidate + gameDuration <= familyStartMin &&
      !(candidate < yastuEndMin && candidate + gameDuration > yastuStartMin)
    );
    if (gameStartMin === undefined) {
      gameStartMin = Math.max(freeTimeStartMin, yastuEndMin + 10);
    }
    const gameEndMin = gameStartMin + gameDuration;
    tasks.push({
      id: `pc_games_${dateStr}`,
      title: 'Игры на ПК',
      subtitle: `После школы и обеда • ${gameDuration} минут`,
      startTime: this.minToTime(gameStartMin),
      endTime: this.minToTime(gameEndMin),
      durationMinutes: gameDuration,
      category: 'gaming',
      status: 'pending',
      isProtected: true,
      description: 'Запланированный отдых после школы и обеда. Не является наградой за выполненные уроки.'
    });
    markOccupied(gameStartMin, gameEndMin, 'gaming');

    // Спорт размещаем после игр, стараясь поставить его после ясту и до семейного времени.
    const sportEarliestMin = gameEndMin + 10;
    const sportCandidates = [
      yastuEndMin + 10,
      yastuStartMin - sportDuration - 10,
      sportEarliestMin
    ];
    let sportStartMin = sportCandidates.find(candidate =>
      candidate >= sportEarliestMin &&
      candidate + sportDuration <= familyStartMin &&
      !(candidate < yastuEndMin && candidate + sportDuration > yastuStartMin)
    );
    if (sportStartMin === undefined) {
      sportStartMin = sportEarliestMin;
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

    // 6. ВЫЧИСЛЕНИЕ СВОБОДНЫХ ОКОН ДЛЯ УЧЁБЫ И ПРОЕКТОВ
    occupiedIntervals.sort((a, b) => a.start - b.start);
    const freeSlots = [];
    let curPointer = freeTimeStartMin;

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

    // 7. СБОР КАНДИДАТОВ НА РАЗМЕЩЕНИЕ (С УЧЁТОМ ДЕДЛАЙНОВ И ПРИОРИТЕТОВ)
    const tomorrowStr = _TimeUtilsScheduler
      ? _TimeUtilsScheduler.getTomorrowStr(dateStr)
      : new Date(new Date(dateStr).getTime() + 86400000).toISOString().split('T')[0];

    // Домашка фильтруется по сроку:
    // Сначала просроченная, затем на сегодня, затем на завтра
    const activeHw = homework
      .filter(h => h.status !== 'completed')
      .map(h => {
        let urgency = 1;
        if (h.dueDate < dateStr) urgency = 4; // просрочено
        else if (h.dueDate === dateStr) urgency = 3; // сегодня
        else if (h.dueDate === tomorrowStr) urgency = 2; // завтра
        else urgency = 1; // в будущем

        return { ...h, urgency };
      });

    // Сортировка домашки: срочность -> обязательность -> приоритет
    activeHw.sort((a, b) => {
      if (b.urgency !== a.urgency) return b.urgency - a.urgency;
      if (b.required !== a.required) return (b.required ? 1 : 0) - (a.required ? 1 : 0);
      const prio = { critical: 4, high: 3, medium: 2, low: 1 };
      return (prio[b.priority] || 1) - (prio[a.priority] || 1);
    });

    const tasksToSchedule = [];
    const activeProject = projects.find(p => p.priority === 'active' || p.isMain) || projects[0];
    const activeOly = olympiads.find(o => o.status === 'active') || olympiads[0];

    // Выбираем тему ЕГЭ для ротации
    const nextEgeTopic = egeTopics.find(t => t.status === 'in_progress') || egeTopics[0];

    if (mode === 'competitive') {
      // Соревновательный режим:
      // 1. Проект / Хакатон — ГЛАВНЫЙ СЛОТ (60-80 мин)
      if (activeProject) {
        tasksToSchedule.push({
          title: `Проект «${activeProject.title}» (Подготовка к хакатону)`,
          subtitle: 'Разработка и тестирование модулей',
          totalMinutes: 70,
          remainingMinutes: 70,
          category: 'project',
          priorityWeight: 100,
          description: `Фокусная работа над проектом «${activeProject.title}». До хакатона 27 ноября осталось совсем мало времени!`
        });
      }

      // 2. Срочная домашка (только сегодня, завтра или просроченная)
      activeHw.filter(h => h.urgency >= 2).forEach(hw => {
        const mins = Number(hw.estimatedMinutes) || 30;
        tasksToSchedule.push({
          title: `ДЗ: ${hw.subject}`,
          subtitle: hw.title,
          totalMinutes: mins,
          remainingMinutes: mins,
          category: 'homework',
          priorityWeight: hw.required ? 85 : 45,
          hwId: hw.id,
          description: hw.description || ''
        });
      });

      // 3. Компактное поддержание ЕГЭ (30 мин)
      if (nextEgeTopic) {
        tasksToSchedule.push({
          title: 'ЕГЭ: Профильная математика (Часть 2)',
          subtitle: `${nextEgeTopic.code} — ${nextEgeTopic.title}`,
          totalMinutes: 30,
          remainingMinutes: 30,
          category: 'ege',
          priorityWeight: 60,
          description: 'Поддержание формы: решение прототипов второй части.'
        });
      }

    } else if (mode === 'loaded') {
      // Загруженный режим:
      // 1. Вся срочная домашка в первую очередь
      activeHw.forEach(hw => {
        const mins = Number(hw.estimatedMinutes) || 30;
        tasksToSchedule.push({
          title: `ДЗ: ${hw.subject}`,
          subtitle: hw.title,
          totalMinutes: mins,
          remainingMinutes: mins,
          category: 'homework',
          priorityWeight: (hw.urgency * 25) + (hw.required ? 30 : 0),
          hwId: hw.id,
          description: hw.description || ''
        });
      });

      // 2. Компактное повторение ЕГЭ
      if (nextEgeTopic) {
        tasksToSchedule.push({
          title: 'ЕГЭ: Профильная математика',
          subtitle: `${nextEgeTopic.code} — ${nextEgeTopic.title}`,
          totalMinutes: 25,
          remainingMinutes: 25,
          category: 'ege',
          priorityWeight: 50,
          description: 'Компактное повторение ключевых формул.'
        });
      }

    } else {
      // Обычный сбалансированный режим:
      // 1. Домашние задания
      activeHw.forEach(hw => {
        // Задания с далеким сроком (>3 дней) добавляем только если они обязательные
        if (hw.urgency === 1 && !hw.required) return;
        const mins = Number(hw.estimatedMinutes) || 30;
        tasksToSchedule.push({
          title: `ДЗ: ${hw.subject}`,
          subtitle: hw.title,
          totalMinutes: mins,
          remainingMinutes: mins,
          category: 'homework',
          priorityWeight: (hw.urgency * 25) + (hw.required ? 20 : 0),
          hwId: hw.id,
          description: hw.description || ''
        });
      });

      // 2. Блок ЕГЭ (45 мин)
      if (nextEgeTopic) {
        tasksToSchedule.push({
          title: 'ЕГЭ: Профильная математика',
          subtitle: `${nextEgeTopic.code} — ${nextEgeTopic.title}`,
          totalMinutes: 45,
          remainingMinutes: 45,
          category: 'ege',
          priorityWeight: 75,
          description: 'Разбор теории, решение прототипов первой и второй части.'
        });
      }

      // 3. Олимпиада (понедельник/среда) или Проект (вторник/четверг)
      if (dayOfWeek === 1 || dayOfWeek === 3) {
        if (activeOly) {
          tasksToSchedule.push({
            title: `Олимпиада: ${activeOly.subject || 'Информатика'}`,
            subtitle: activeOly.title || 'Решение олимпиадных задач',
            totalMinutes: 40,
            remainingMinutes: 40,
            category: 'olympiad',
            priorityWeight: 65,
            description: 'Олимпиадный практикум нестандартных задач.'
          });
        }
      } else {
        if (activeProject) {
          tasksToSchedule.push({
            title: `Проект «${activeProject.title}»`,
            subtitle: 'Плановый блок разработки и алгоритмов',
            totalMinutes: 40,
            remainingMinutes: 40,
            category: 'project',
            priorityWeight: 65,
            description: 'Работа над проектом, улучшение функциональности.'
          });
        }
      }
    }

    // Сортируем задачи по весу приоритета
    tasksToSchedule.sort((a, b) => b.priorityWeight - a.priorityWeight);

    // 8. РАСПРЕДЕЛЕНИЕ С ПОДДЕРЖКОЙ РАЗБИЕНИЯ ЗАДАЧ (БЕЗ УРЕЗАНИЯ ВРЕМЕНИ!)
    let unallocatedMinutes = 0;
    const unallocatedTasks = [];

    for (const item of tasksToSchedule) {
      let partNumber = 1;

      while (item.remainingMinutes > 0) {
        let placedChunk = false;

        for (let i = 0; i < freeSlots.length; i++) {
          const slot = freeSlots[i];
          if (slot.duration >= 15) {
            // Если задача помещается полностью
            if (item.remainingMinutes <= slot.duration) {
              const dur = item.remainingMinutes;
              const titleSuffix = partNumber > 1 ? ` (Часть ${partNumber})` : '';
              const taskId = item.hwId
                ? (partNumber > 1 ? `task_hw_${item.hwId}_p${partNumber}` : `task_hw_${item.hwId}`)
                : `task_${item.category || 'act'}_${dateStr}_${tasks.length + 1}`;

              tasks.push({
                id: taskId,
                title: `${item.title}${titleSuffix}`,
                subtitle: item.subtitle,
                startTime: this.minToTime(slot.start),
                endTime: this.minToTime(slot.start + dur),
                durationMinutes: dur,
                totalTaskMinutes: item.totalMinutes,
                category: item.category,
                status: 'pending',
                isProtected: false,
                hwId: item.hwId || null,
                description: item.description || ''
              });

              slot.start += dur + 5;
              slot.duration -= (dur + 5);
              item.remainingMinutes = 0;
              placedChunk = true;
              break;
            }
            // Если слот меньше задачи, но в нем можно сделать ощутимую часть (>= 20 мин)
            else if (slot.duration >= 20) {
              const dur = slot.duration;
              const titleSuffix = ` (Часть ${partNumber})`;
              const taskId = item.hwId
                ? `task_hw_${item.hwId}_p${partNumber}`
                : `task_${item.category || 'act'}_${dateStr}_${tasks.length + 1}`;

              tasks.push({
                id: taskId,
                title: `${item.title}${titleSuffix}`,
                subtitle: `${item.subtitle} [${dur} из ${item.totalMinutes} мин]`,
                startTime: this.minToTime(slot.start),
                endTime: this.minToTime(slot.start + dur),
                durationMinutes: dur,
                totalTaskMinutes: item.totalMinutes,
                category: item.category,
                status: 'pending',
                isProtected: false,
                hwId: item.hwId || null,
                description: item.description || ''
              });

              slot.start += dur;
              slot.duration = 0;
              item.remainingMinutes -= dur;
              partNumber++;
              placedChunk = true;
              break;
            }
          }
        }

        // Если не удалось разместить текущую часть ни в одном слоте
        if (!placedChunk) {
          unallocatedMinutes += item.remainingMinutes;
          unallocatedTasks.push({
            title: item.title,
            hwId: item.hwId || null,
            totalMinutes: item.totalMinutes,
            unallocatedMinutes: item.remainingMinutes,
            reason: partNumber > 1
              ? `Размещено ${item.totalMinutes - item.remainingMinutes} мин. Остаток (${item.remainingMinutes} мин) не поместился до отбоя.`
              : 'Недостаточно свободного времени до отбоя.'
          });
          break; // Выходим из while для этой задачи
        }
      }
    }

    // Сортировка всех задач по времени начала
    tasks.sort((a, b) => this.timeToMin(a.startTime) - this.timeToMin(b.startTime));

    // Проверка целостности и отсутствия конфликтов с проверкой всех защищённых блоков
    const integrityCheck = this.verifyScheduleIntegrity(tasks, {
      ...settings,
      wakeMin,
      sleepMin,
      sportMinutes: sportDuration,
      gameMinutes: gameDuration,
      familyMinutes: familyDuration,
      offlineRestMinutes: offlineRestDuration
    });

    const scheduleResult = {
      date: dateStr,
      mode: mode,
      modeReason: modeInfo.reason,
      has8thLesson: has8thLesson,
      hasSchoolTimetable: actualLessonsCount > 0,
      isSchoolConfirmed: isSchoolActive,
      schoolNotice: isSchoolActive ? null : 'Школьное расписание уроков ещё не подтверждено: фиктивные уроки не включены в план дня.',
      schoolEndTime: this.minToTime(actualSchoolEndMin),
      yastuTime: yastuBlock.startTime,
      unallocatedMinutes: unallocatedMinutes,
      unallocatedTasks: unallocatedTasks,
      isOverloaded: unallocatedMinutes > 0,
      overloadWarning: unallocatedMinutes > 0
        ? `⚠️ Внимание: учебная нагрузка превышает доступное время до отбоя (не поместилось ${unallocatedMinutes} мин). Не поместившиеся задачи: ${unallocatedTasks.map(u => `${u.title} (${u.unallocatedMinutes} мин)`).join(', ')}. Сон в ${settings.sleepStart || '21:30'} и защищённые блоки соблюдены.`
        : null,
      integrity: integrityCheck,
      generatedAt: new Date().toISOString(),
      tasks: tasks
    };

    return scheduleResult;
  },

  /**
   * Полная верификация расписания: проверка наложений, границ и защищённых интервалов
   * @param {Array|Object} tasksOrSchedule - массив задач или объект расписания
   * @param {Object|number} settingsOrWakeMin - объект настроек или wakeMin
   * @param {number} maybeSleepMin
   * @returns {{ valid: boolean, errors: string[] }}
   */
  verifyScheduleIntegrity(tasksOrSchedule, settingsOrWakeMin = 360, maybeSleepMin = 1290) {
    const tasks = Array.isArray(tasksOrSchedule)
      ? tasksOrSchedule
      : (tasksOrSchedule && Array.isArray(tasksOrSchedule.tasks) ? tasksOrSchedule.tasks : []);
    const errors = [];

    let settings = {};
    let wakeMin = 360;
    let sleepMin = 1290;

    if (typeof settingsOrWakeMin === 'object' && settingsOrWakeMin !== null) {
      settings = settingsOrWakeMin;
      wakeMin = settings.wakeTime ? this.timeToMin(settings.wakeTime) : (typeof settings.wakeMin === 'number' ? settings.wakeMin : 360);
      sleepMin = settings.sleepStart ? this.timeToMin(settings.sleepStart) : (typeof settings.sleepMin === 'number' ? settings.sleepMin : 1290);
    } else {
      wakeMin = typeof settingsOrWakeMin === 'number' ? settingsOrWakeMin : 360;
      sleepMin = typeof maybeSleepMin === 'number' ? maybeSleepMin : 1290;
    }

    const expectedSport = settings.sportMinutes !== undefined ? Number(settings.sportMinutes) : 30;
    const expectedGame = settings.gameMinutes !== undefined ? Number(settings.gameMinutes) : 60;
    const expectedFamily = settings.familyMinutes !== undefined ? Number(settings.familyMinutes) : 40;
    const expectedRest = settings.offlineRestMinutes !== undefined ? Number(settings.offlineRestMinutes) : 30;
    const expectedPrayer = settings.prayerDuration !== undefined ? Number(settings.prayerDuration) : 20;
    const expectedSleep = (1440 - sleepMin) + wakeMin;

    // 1. Проверка продолжительности и пересечений задач между собой
    const nonSleepTasks = tasks.filter(t => t.category !== 'sleep').slice();
    nonSleepTasks.sort((a, b) => this.timeToMin(a.startTime) - this.timeToMin(b.startTime));

    for (let i = 0; i < nonSleepTasks.length; i++) {
      const cur = nonSleepTasks[i];
      const start = this.timeToMin(cur.startTime);
      const end = this.timeToMin(cur.endTime);

      if (end <= start) {
        errors.push(`Отрицательная или нулевая продолжительность: "${cur.title}" (${cur.startTime}–${cur.endTime})`);
      }

      if (i > 0) {
        const prev = nonSleepTasks[i - 1];
        const prevEnd = this.timeToMin(prev.endTime);
        if (prevEnd > start) {
          errors.push(`Временное пересечение: "${prev.title}" (до ${prev.endTime}) накладывается на "${cur.title}" (с ${cur.startTime})`);
        }
      }
    }

    // 2. Проверка: ни одна учебная или личная задача не накладывается на школьные уроки
    const schoolLessons = tasks.filter(t => t.category === 'school');
    const nonSchoolTasks = tasks.filter(t => t.category !== 'school' && t.category !== 'sleep');
    for (const lesson of schoolLessons) {
      const lStart = this.timeToMin(lesson.startTime);
      const lEnd = this.timeToMin(lesson.endTime);
      for (const other of nonSchoolTasks) {
        const oStart = this.timeToMin(other.startTime);
        const oEnd = this.timeToMin(other.endTime);
        if (Math.max(lStart, oStart) < Math.min(lEnd, oEnd)) {
          errors.push(`Задача "${other.title}" (${other.startTime}–${other.endTime}) накладывается на школьный урок "${lesson.title}" (${lesson.startTime}–${lesson.endTime})`);
        }
      }
    }

    // 3. Проверка обязательных защищенных блоков и их точной длительности
    const sleepTask = tasks.find(t => t.category === 'sleep');
    if (!sleepTask) {
      errors.push('Отсутствует защищённый блок сна!');
    } else {
      const sStart = this.timeToMin(sleepTask.startTime);
      const sEnd = this.timeToMin(sleepTask.endTime);
      const sleepDur = Number(sleepTask.durationMinutes) || (sEnd < sStart ? (1440 - sStart + sEnd) : (sEnd - sStart));
      if (sleepDur !== expectedSleep) {
        errors.push(`Длительность сна (${sleepDur} мин) не соответствует настройкам (${expectedSleep} мин)`);
      }
    }

    const sportTask = tasks.find(t => t.category === 'sport');
    if (!sportTask) {
      errors.push('Отсутствует защищённый блок спорта!');
    } else {
      const sportDur = Number(sportTask.durationMinutes) || (this.timeToMin(sportTask.endTime) - this.timeToMin(sportTask.startTime));
      if (sportDur !== expectedSport) {
        errors.push(`Длительность блока спорта (${sportDur} мин) не соответствует настройкам (${expectedSport} мин)`);
      }
    }

    const gameTask = tasks.find(t => t.category === 'gaming');
    if (!gameTask) {
      errors.push('Отсутствует защищённый блок игр на ПК!');
    } else {
      const gameDur = Number(gameTask.durationMinutes) || (this.timeToMin(gameTask.endTime) - this.timeToMin(gameTask.startTime));
      if (gameDur !== expectedGame) {
        errors.push(`Длительность блока игр (${gameDur} мин) не соответствует настройкам (${expectedGame} мин)`);
      }
    }

    const familyTask = tasks.find(t => t.category === 'family');
    if (!familyTask) {
      errors.push('Отсутствует защищённый блок семейного времени / ужина!');
    } else {
      const familyDur = Number(familyTask.durationMinutes) || (this.timeToMin(familyTask.endTime) - this.timeToMin(familyTask.startTime));
      if (familyDur !== expectedFamily) {
        errors.push(`Длительность блока семьи (${familyDur} мин) не соответствует настройкам (${expectedFamily} мин)`);
      }
    }

    const restTask = tasks.find(t => t.category === 'rest');
    if (!restTask) {
      errors.push('Отсутствует защищённый блок отдыха без ПК!');
    } else {
      const restDur = Number(restTask.durationMinutes) || (this.timeToMin(restTask.endTime) - this.timeToMin(restTask.startTime));
      if (restDur !== expectedRest) {
        errors.push(`Длительность отдыха без ПК (${restDur} мин) не соответствует настройкам (${expectedRest} мин)`);
      }
    }

    const prayerTask = tasks.find(t => t.category === 'prayer');
    if (!prayerTask) {
      errors.push('Отсутствует защищённый блок намаза ясту!');
    } else {
      const prayerDur = Number(prayerTask.durationMinutes) || (this.timeToMin(prayerTask.endTime) - this.timeToMin(prayerTask.startTime));
      if (prayerDur !== expectedPrayer) {
        errors.push(`Длительность намаза ясту (${prayerDur} мин) не соответствует настройкам (${expectedPrayer} мин)`);
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  },

  /**
   * Применить перепланирование с сохранением бэкапа для отката
   */
  async applyScheduleWithBackup(dateStr, newSchedule, db, reason = 'Автоматическое обновление расписания') {
    const previous = await db.getDaySchedule(dateStr);

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
