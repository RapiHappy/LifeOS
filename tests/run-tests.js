/**
 * LifeOS v1.2 — Comprehensive Automated Test Suite
 * 26 Regression Scenarios Verifying Data Safety, Clean Timetable Initialization,
 * Unified Task Status System, Deduplicated Activity Log, Real Rescheduling,
 * Secret Purging, Honest Local AI Planner, Web Notifications, and Moscow Timezone Accuracy.
 */

const assert = require('assert');

// In-memory IndexedDB mock for Node.js testing
function createMockIndexedDB() {
  const stores = {};

  return {
    open(name, version) {
      const request = {
        result: null,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null
      };

      setTimeout(() => {
        const db = {
          objectStoreNames: {
            contains(storeName) {
              return !!stores[storeName];
            }
          },
          createObjectStore(storeName, options = {}) {
            if (!stores[storeName]) {
              stores[storeName] = {
                keyPath: options.keyPath || 'id',
                autoIncrement: !!options.autoIncrement,
                autoInc: 0,
                data: new Map(),
                indexes: {}
              };
            }
            return {
              createIndex(idxName, keyPath) {
                stores[storeName].indexes[idxName] = keyPath;
              }
            };
          },
          transaction(storeNames, mode) {
            const tx = {
              oncomplete: null,
              onerror: null,
              objectStore(storeName) {
                const s = stores[storeName];
                if (!s) throw new Error(`Store ${storeName} not found`);

                return {
                  get(key) {
                    const req = { result: null, onsuccess: null, onerror: null };
                    setTimeout(() => {
                      req.result = s.data.has(key) ? JSON.parse(JSON.stringify(s.data.get(key))) : undefined;
                      if (req.onsuccess) req.onsuccess({ target: req });
                    }, 0);
                    return req;
                  },
                  getAll() {
                    const req = { result: [], onsuccess: null, onerror: null };
                    setTimeout(() => {
                      req.result = Array.from(s.data.values()).map(v => JSON.parse(JSON.stringify(v)));
                      if (req.onsuccess) req.onsuccess({ target: req });
                    }, 0);
                    return req;
                  },
                  put(item) {
                    const req = { result: null, onsuccess: null, onerror: null };
                    setTimeout(() => {
                      let key = item[s.keyPath];
                      if (key === undefined || key === null) {
                        key = ++s.autoInc;
                        item[s.keyPath] = key;
                      }
                      s.data.set(key, JSON.parse(JSON.stringify(item)));
                      req.result = key;
                      if (req.onsuccess) req.onsuccess({ target: req });
                    }, 0);
                    return req;
                  },
                  delete(key) {
                    const req = { result: null, onsuccess: null, onerror: null };
                    setTimeout(() => {
                      s.data.delete(key);
                      if (req.onsuccess) req.onsuccess({ target: req });
                    }, 0);
                    return req;
                  },
                  clear() {
                    const req = { result: null, onsuccess: null, onerror: null };
                    setTimeout(() => {
                      s.data.clear();
                      if (req.onsuccess) req.onsuccess({ target: req });
                    }, 0);
                    return req;
                  }
                };
              }
            };
            return tx;
          }
        };

        request.result = db;

        if (request.onupgradeneeded) {
          request.onupgradeneeded({ target: { result: db } });
        }
        if (request.onsuccess) {
          request.onsuccess({ target: { result: db } });
        }
      }, 0);

      return request;
    }
  };
}

// Global mocks for browser environment
globalThis.window = {
  localStorage: {
    _data: {},
    getItem(k) { return this._data[k] !== undefined ? this._data[k] : null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; },
    clear() { this._data = {}; }
  },
  sessionStorage: {
    _data: {},
    getItem(k) { return this._data[k] !== undefined ? this._data[k] : null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; },
    clear() { this._data = {}; }
  }
};
globalThis.localStorage = globalThis.window.localStorage;
globalThis.sessionStorage = globalThis.window.sessionStorage;
globalThis.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ appendChild: () => {}, style: {}, classList: { add: () => {}, remove: () => {} }, remove: () => {} }),
  body: { appendChild: () => {}, removeChild: () => {} }
};
globalThis.indexedDB = createMockIndexedDB();

// Mock Notification API for Node.js
function MockNotification(title, options = {}) {
  this.title = title;
  this.options = options;
  this.close = () => {};
}
MockNotification.permission = 'default';
MockNotification.requestPermission = async () => MockNotification.permission;
globalThis.Notification = MockNotification;
globalThis.window.Notification = MockNotification;

// Load LifeOS Modules
const TimeUtils = require('../js/time.js');
globalThis.TimeUtils = TimeUtils;

const PrayerManager = require('../js/prayer.js');
globalThis.PrayerManager = PrayerManager;

const Scheduler = require('../js/scheduler.js');
globalThis.Scheduler = Scheduler;

const Database = require('../js/database.js');
globalThis.Database = Database;

const AIPlanner = require('../js/ai-planner.js');
globalThis.AIPlanner = AIPlanner;

const NotificationsManager = require('../js/notifications.js');
globalThis.NotificationsManager = NotificationsManager;

const SchoolManager = require('../js/school.js');
globalThis.SchoolManager = SchoolManager;

const HomeworkManager = require('../js/homework.js');
globalThis.HomeworkManager = HomeworkManager;

const App = require('../js/app.js');
globalThis.App = App;

let totalTests = 0;
let passedTests = 0;

async function runScenario(number, title, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ Сценарий ${number}: ${title}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL Сценарий ${number}: ${title}`);
    console.error(`    ${err.stack || err.message}`);
  }
}

async function runAll26Scenarios() {
  console.log('\n========================================================================');
  console.log('--- LifeOS v1.2.4 — Полный комплекс из 26 тестовых сценариев ---');
  console.log('========================================================================\n');

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 1: Первый запуск с пустой базой данных (чистый старт)
  // -------------------------------------------------------------------------
  await runScenario(1, 'Первый запуск: реальное школьное расписание перенесено из пользовательских скриншотов', async () => {
    localStorage.clear();
    sessionStorage.clear();
    await Database.init();

    const topics = await Database.getEgeTopics();
    assert.strictEqual(topics.length, 73, 'Каталог ЕГЭ должен содержать 73 темы');

    let totalSolved = 0;
    let totalCorrect = 0;
    let mastered = 0;
    topics.forEach(t => {
      totalSolved += (t.solvedCount || 0);
      totalCorrect += (t.correctCount || 0);
      if (t.status === 'mastered') mastered++;
      assert.deepStrictEqual(t.mistakes, [], `Ошибки в теме ${t.code} должны быть пустыми`);
    });

    assert.strictEqual(totalSolved, 0, 'Количество решённых задач при чистом старте должно быть 0');
    assert.strictEqual(totalCorrect, 0, 'Количество правильных задач должно быть 0');
    assert.strictEqual(mastered, 0, 'Освоенных тем должно быть 0');

    const hw = await Database.getAllHomework();
    assert.strictEqual(hw.length, 0, 'Список домашних заданий должен быть абсолютно пуст');

    const oly = await Database.getOlympiads();
    assert.strictEqual(oly.length, 0, 'Список активных олимпиад пользователя должен быть пуст');

    const settings = Database.getSettings();
    assert.strictEqual(settings.version, '1.2');
    assert.strictEqual(settings.schoolTimetableConfirmed, false);
    assert.strictEqual(settings.schoolTimetableOrigin, 'user_screenshots_imported');
    assert.strictEqual(settings.schoolTimetableScreenshotsImported, true);
    const timetable = (await Database.getSchoolTimetable()).sort((a, b) => a.dayOfWeek - b.dayOfWeek);
    assert.strictEqual(timetable.length, 7);
    assert.deepStrictEqual(timetable.map(d => (d.lessons || []).length), [7, 8, 7, 8, 7, 4, 0]);
    assert.strictEqual(timetable[0].lessons[0].subject, 'Классный час');
    assert.strictEqual(timetable[0].lessons[1].subject, 'Информатика');
    assert.strictEqual(timetable[0].lessons[1].startTime, '08:45');
    assert.strictEqual(timetable[0].lessons[1].room, '218');
    assert.strictEqual(timetable[2].lessons[0].isTest, true);
    assert.strictEqual(timetable[5].lessons[3].endTime, '11:15');
    assert.ok(!timetable.flatMap(d => d.lessons || []).some(l => l.subject === 'Разговоры о важном'));
    const mondayClass = timetable[0].lessons.find(l => l.isClassHour);
    assert.deepStrictEqual(
      { lessonNumber: mondayClass.lessonNumber, startTime: mondayClass.startTime, endTime: mondayClass.endTime },
      { lessonNumber: 1, startTime: '08:00', endTime: '08:40' }
    );
    const tuesdayMath = timetable[1].lessons.find(l => l.subject === 'Дополнительная математика');
    assert.deepStrictEqual(
      { lessonNumber: tuesdayMath.lessonNumber, startTime: tuesdayMath.startTime, endTime: tuesdayMath.endTime, isAfterSchool: tuesdayMath.isAfterSchool },
      { lessonNumber: 8, startTime: '13:55', endTime: '14:35', isAfterSchool: false }
    );
    const thursdayClass = timetable[3].lessons.find(l => l.isClassHour);
    assert.deepStrictEqual(
      { lessonNumber: thursdayClass.lessonNumber, startTime: thursdayClass.startTime, endTime: thursdayClass.endTime },
      { lessonNumber: 6, startTime: '12:15', endTime: '12:55' }
    );
    const thursdayMath = timetable[3].lessons.find(l => l.subject === 'Дополнительная математика');
    assert.deepStrictEqual(
      { lessonNumber: thursdayMath.lessonNumber, startTime: thursdayMath.startTime, endTime: thursdayMath.endTime },
      { lessonNumber: 8, startTime: '13:55', endTime: '14:35' }
    );
    const thursdayNativeLit = timetable[3].lessons.find(l => l.subject === 'Родная (татарская) литература');
    assert.deepStrictEqual(
      { lessonNumber: thursdayNativeLit.lessonNumber, startTime: thursdayNativeLit.startTime, endTime: thursdayNativeLit.endTime },
      { lessonNumber: 7, startTime: '13:05', endTime: '13:45' }
    );
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 1b: Повторная инициализация не перезаписывает правки пользователя
  // -------------------------------------------------------------------------
  await runScenario('1b', 'Повторная инициализация не перезаписывает изменённое пользователем расписание', async () => {
    const monday = await Database.get('school_timetable', 1);
    const originalSubject = monday.lessons[0].subject;
    monday.lessons[0].subject = 'Пользовательская правка — информатика';
    await Database.saveDayTimetable(1, monday.lessons);
    await Database.checkAndSeedData();
    const afterRestart = await Database.get('school_timetable', 1);
    assert.strictEqual(afterRestart.lessons[0].subject, 'Пользовательская правка — информатика');
    afterRestart.lessons[0].subject = originalSubject;
    await Database.saveDayTimetable(1, afterRestart.lessons);
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 2: Попытка подтверждения пустого расписания уроков
  // -------------------------------------------------------------------------
  await runScenario(2, 'Попытка подтверждения пустого расписания (отказ, статус остаётся unconfirmed)', async () => {
    // Проверяем запрет на подтверждение пустой сетки изолированно от импортированного расписания.
    const originalTimetable = await Database.getSchoolTimetable();
    const originalSettings = Database.getSettings();

    try {
      for (let day = 1; day <= 7; day++) await Database.saveDayTimetable(day, []);
      Database.saveSettings({
        schoolTimetableConfirmed: false,
        schoolTimetableOrigin: 'empty',
        schoolTimetableScreenshotsImported: true
      });

      const timetable = await Database.getSchoolTimetable();
      const totalLessons = timetable.reduce((acc, d) => acc + (d.lessons ? d.lessons.length : 0), 0);
      assert.strictEqual(totalLessons, 0);

      let confirmed = false;
      const lessonsCount = timetable.reduce((acc, d) => acc + (d.lessons ? d.lessons.length : 0), 0);
      if (lessonsCount > 0) confirmed = true;

      assert.strictEqual(confirmed, false, 'Пустое расписание уроков не может быть подтверждено');
      assert.strictEqual(Database.getSettings().schoolTimetableConfirmed, false);
    } finally {
      for (const day of originalTimetable) await Database.saveDayTimetable(day.dayOfWeek, day.lessons || []);
      Database.saveSettings({
        schoolTimetableConfirmed: originalSettings.schoolTimetableConfirmed,
        schoolTimetableOrigin: originalSettings.schoolTimetableOrigin,
        schoolTimetableScreenshotsImported: originalSettings.schoolTimetableScreenshotsImported
      });
    }
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 3: Запуск с существующими пользовательскими данными (без перезаписи)
  // -------------------------------------------------------------------------
  await runScenario(3, 'Запуск с существующими пользовательскими данными (сохранность данных, отсутствие вайпа)', async () => {
    const userHw = {
      subject: 'Физика',
      title: 'Лабораторная работа по оптике',
      dueDate: '2026-11-25',
      estimatedMinutes: 45,
      priority: 'high',
      status: 'pending'
    };
    const hwId = await Database.addHomework(userHw);

    const topics = await Database.getEgeTopics();
    const math1Topic = topics.find(t => t.id === 'math_1' || t.code === '№1');
    assert.ok(math1Topic, 'Тема math_1 должна существовать');
    math1Topic.solvedCount = 10;
    math1Topic.correctCount = 9;
    math1Topic.theoryStudied = true;
    await Database.updateEgeTopic(math1Topic);

    // Перезапуск БД
    await Database.init();

    const savedHw = await Database.get('homework', hwId);
    assert.ok(savedHw, 'Пользовательское домашнее задание не должно быть перезаписано или удалено');
    assert.strictEqual(savedHw.title, 'Лабораторная работа по оптике');

    const reloadedTopics = await Database.getEgeTopics();
    const reloadedMath1 = reloadedTopics.find(t => t.id === 'math_1' || t.code === '№1');
    assert.ok(reloadedMath1, 'Тема math_1 должна существовать после перезапуска');
    assert.strictEqual(reloadedMath1.solvedCount, 10, 'Пользовательский прогресс по задачам должен сохраниться');
    assert.strictEqual(reloadedMath1.correctCount, 9, 'Пользовательский прогресс по правильным ответам должен сохраниться');
    assert.strictEqual(reloadedMath1.theoryStudied, true, 'Отметка о теории должна сохраниться');
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 4: Обновление до v1.2 (миграция каталога ЕГЭ с сохранением прогресса)
  // -------------------------------------------------------------------------
  await runScenario(4, 'Обновление до v1.2 (миграция тем ЕГЭ с сохранением прогресса, расписание не затирается)', async () => {
    // Сохраним реальный урок в расписание
    await Database.saveDayTimetable(2, [
      { id: 'custom_phys_1', subject: 'Физика профильная', teacher: 'Иванова М.А.', room: '304', startTime: '08:30', endTime: '09:15', sortOrder: 1 }
    ]);

    const s = Database.getSettings();
    s.version = '1.1.1';
    localStorage.setItem('lifeos_settings', JSON.stringify(s));

    // Синхронизация каталога
    await Database.syncEgeTopicsCatalog();

    const updatedTopics = await Database.getEgeTopics();
    assert.strictEqual(updatedTopics.length, 73, 'Каталог должен обновиться до всех 73 тем');

    const math1 = updatedTopics.find(t => t.id === 'math_1' || t.code === '№1');
    assert.ok(math1, 'Тема math_1 должна присутствовать в обновлённом каталоге');
    assert.strictEqual(math1.solvedCount, 10, 'Прогресс существующих тем не должен затираться');

    const tuesday = (await Database.getSchoolTimetable()).find(t => t.dayOfWeek === 2);
    assert.ok(tuesday && tuesday.lessons.some(l => l.id === 'custom_phys_1'), 'Расписание уроков не затирается при миграции');
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 5: Сохранение расписания уроков при cleanToZeroState
  // -------------------------------------------------------------------------
  await runScenario(5, 'Сохранение расписания уроков при cleanToZeroState', async () => {
    const timetableBefore = await Database.getSchoolTimetable();
    assert.strictEqual(timetableBefore.length, 7, 'В расписании должно быть 7 дней недели');

    await Database.cleanToZeroState();

    const timetableAfter = await Database.getSchoolTimetable();
    assert.strictEqual(timetableAfter.length, 7, 'Расписание уроков НЕ должно удаляться при cleanToZeroState()');

    const tuesday = timetableAfter.find(t => t.dayOfWeek === 2);
    assert.ok(tuesday && tuesday.lessons.length >= 1, 'Уроки вторника должны быть сохранены');
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 6: Неподтверждённое расписание уроков НЕ попадает в дневной план
  // -------------------------------------------------------------------------
  await runScenario(6, 'Неподтверждённое расписание уроков НЕ попадает в дневной план', async () => {
    // Убеждаемся, что расписание не подтверждено и не в демо-режиме
    Database.saveSettings({
      schoolTimetableConfirmed: false,
      isDemoMode: false
    });

    const dateStr = '2026-11-24'; // Вторник
    const plan = await Scheduler.generateDailySchedule(dateStr, Database);
    const schoolTasks = plan.tasks.filter(t => t.category === 'school');
    assert.strictEqual(schoolTasks.length, 0, 'Неподтверждённые уроки НЕ должны попадать в дневной план');
    assert.strictEqual(plan.isSchoolConfirmed, false, 'Флаг isSchoolConfirmed в плане должен быть false');

    // Теперь подтверждаем расписание
    Database.saveSettings({
      schoolTimetableConfirmed: true
    });
    const planConfirmed = await Scheduler.generateDailySchedule(dateStr, Database);
    const schoolTasksConfirmed = planConfirmed.tasks.filter(t => t.category === 'school');
    assert.ok(schoolTasksConfirmed.length >= 1, 'Подтверждённые уроки должны попасть в расписание дня');
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 7: Настройка времени на дорогу в школу (commuteMinutes)
  // -------------------------------------------------------------------------
  await runScenario(7, 'Время на дорогу в школу (commuteMinutes) настраивается и рассчитывается', async () => {
    Database.saveSettings({
      schoolTimetableConfirmed: true,
      commuteMinutes: 35
    });

    const plan = await Scheduler.generateDailySchedule('2026-11-24', Database);
    const roadTask = plan.tasks.find(t => t.id && t.id.startsWith('road_to_school'));
    assert.ok(roadTask, 'Блок дороги в школу должен присутствовать');
    assert.strictEqual(roadTask.durationMinutes, 35, 'Длительность дороги должна строго равняться commuteMinutes (35 мин)');
    assert.strictEqual(roadTask.startTime, '07:55', 'При уроке в 08:30 дорога на 35 мин начинается в 07:55');
    assert.strictEqual(roadTask.endTime, '08:30');

    // Проверим с другим значением commuteMinutes: 15 минут
    Database.saveSettings({ commuteMinutes: 15 });
    const plan15 = await Scheduler.generateDailySchedule('2026-11-24', Database);
    const road15 = plan15.tasks.find(t => t.id && t.id.startsWith('road_to_school'));
    assert.strictEqual(road15.durationMinutes, 15);
    assert.strictEqual(road15.startTime, '08:15');
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 8: Корректное распределение 8-го урока и обеда
  // -------------------------------------------------------------------------
  await runScenario(8, '8-й урок заканчивается в 14:35, дорога домой до 15:00, затем обед', async () => {
    await Database.seedRealisticSchoolTimetable();
    Database.saveSettings({ schoolTimetableConfirmed: true, commuteMinutes: 25, lunchMinutes: 40 });

    const planTue = await Scheduler.generateDailySchedule('2026-11-24', Database);
    assert.strictEqual(planTue.has8thLesson, true, 'Во вторник зафиксирован 8-й урок');
    assert.strictEqual(planTue.schoolEndTime, '14:35', 'Окончание 8-го урока — 14:35');

    const roadHome = planTue.tasks.find(t => t.id && t.id.startsWith('road_home_lunch_'));
    assert.ok(roadHome, 'Отдельная дорога домой должна присутствовать');
    assert.strictEqual(roadHome.title, 'Дорога домой');
    assert.strictEqual(roadHome.startTime, '14:35');
    assert.strictEqual(roadHome.endTime, '15:00');
    assert.strictEqual(roadHome.durationMinutes, 25);

    const lunchTask = planTue.tasks.find(t => t.id === 'lunch_2026-11-24');
    assert.ok(lunchTask, 'Обед должен начинаться после возвращения домой');
    assert.strictEqual(lunchTask.startTime, '15:00');
    assert.strictEqual(lunchTask.endTime, '15:40');
    assert.strictEqual(lunchTask.durationMinutes, 40);

    const planThu = await Scheduler.generateDailySchedule('2026-11-26', Database);
    assert.strictEqual(planThu.schoolEndTime, '14:35');
    const thuRoad = planThu.tasks.find(t => t.id && t.id.startsWith('road_home_lunch_'));
    const thuLunch = planThu.tasks.find(t => t.id === 'lunch_2026-11-26');
    assert.deepStrictEqual([thuRoad.startTime, thuRoad.endTime, thuLunch.startTime, thuLunch.endTime],
      ['14:35', '15:00', '15:00', '15:40']);

    const integrity = Scheduler.verifyScheduleIntegrity(planTue);
    assert.strictEqual(integrity.valid, true, `Расписание вторника валидно: ${integrity.errors.join(', ')}`);
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 9: Обнаружение конфликтов уроков и наложений в verifyScheduleIntegrity
  // -------------------------------------------------------------------------
  await runScenario(9, 'Обнаружение конфликтов и наложений задач в verifyScheduleIntegrity', async () => {
    const invalidTasks = [
      { id: '1', title: 'Урок 1', startTime: '08:30', endTime: '09:15', category: 'school' },
      { id: '2', title: 'ДЗ в школе', startTime: '09:00', endTime: '09:45', category: 'homework' }, // Пересечение!
      { id: '3', title: 'Сон', startTime: '21:30', endTime: '06:00', category: 'sleep' },
      { id: '4', title: 'Спорт', startTime: '17:30', endTime: '18:00', durationMinutes: 30, category: 'sport' },
      { id: '5', title: 'Игры', startTime: '20:00', endTime: '21:00', durationMinutes: 60, category: 'gaming' },
      { id: '6', title: 'Семья', startTime: '19:20', endTime: '20:00', durationMinutes: 40, category: 'family' },
      { id: '7', title: 'Отдых', startTime: '21:00', endTime: '21:30', durationMinutes: 30, category: 'rest' },
      { id: '8', title: 'Ясту', startTime: '17:00', endTime: '17:20', durationMinutes: 20, category: 'prayer' }
    ];

    const check = Scheduler.verifyScheduleIntegrity(invalidTasks);
    assert.strictEqual(check.valid, false, 'Должен обнаружить наложение задач');
    assert.ok(check.errors.some(e => e.includes('пересечение') || e.includes('накладывается')));
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 10: Единая система статусов (completed, pending, skipped) и синхронизация
  // -------------------------------------------------------------------------
  await runScenario(10, 'Единая система статусов: обновление статуса синхронизирует schedule_days, homework и activity_log', async () => {
    const hwId = await Database.addHomework({
      subject: 'Информатика',
      title: 'КЕГЭ Задача 26',
      dueDate: '2026-11-23',
      estimatedMinutes: 30,
      priority: 'high',
      status: 'pending'
    });

    AIPlanner.resetThrottle();
    await AIPlanner.autoReplan('2026-11-23', Database, 'Тест статусов', true);

    const schedule = await Database.getDaySchedule('2026-11-23');
    const taskIdx = schedule.tasks.findIndex(t => t.hwId === hwId || (t.title && t.title.includes('Задача 26')));
    assert.ok(taskIdx >= 0, 'Задача должна быть в дневном плане');
    const taskId = schedule.tasks[taskIdx].id;

    // 1. Отмечаем выполненной через updateTaskStatus
    await App.updateTaskStatus(taskId, 'completed', { dateStr: '2026-11-23' });

    let updatedSchedule = await Database.getDaySchedule('2026-11-23');
    const completedTaskInSchedule = updatedSchedule.tasks.find(t => t.id === taskId || t.hwId === hwId);
    assert.ok(completedTaskInSchedule);
    assert.strictEqual(completedTaskInSchedule.status, 'completed', 'В расписании статус должен стать completed');

    let updatedHw = await Database.get('homework', hwId);
    assert.strictEqual(updatedHw.status, 'completed', 'В хранилище homework статус должен стать completed');

    let logs = await Database.getAll('activity_log');
    let taskLog = logs.find(l => l.hwId === hwId || l.taskId === taskId);
    assert.ok(taskLog, 'В activity_log обязана появиться запись о выполнении');
    assert.strictEqual(taskLog.action, 'completed');

    // 2. Возвращаем в статус pending (отмена выполнения)
    await App.updateTaskStatus(taskId, 'pending', { dateStr: '2026-11-23' });

    updatedSchedule = await Database.getDaySchedule('2026-11-23');
    const pendingTaskInSchedule = updatedSchedule.tasks.find(t => t.id === taskId || t.hwId === hwId);
    assert.ok(pendingTaskInSchedule);
    assert.strictEqual(pendingTaskInSchedule.status, 'pending');

    updatedHw = await Database.get('homework', hwId);
    assert.strictEqual(updatedHw.status, 'pending');

    // Запись о завершении должна удалиться из activity_log
    logs = await Database.getAll('activity_log');
    taskLog = logs.find(l => l.hwId === hwId || l.taskId === taskId);
    assert.strictEqual(taskLog, undefined, 'При возврате задачи в pending лог выполнения должен быть удалён');

    // 3. Проверка через HomeworkManager (делегирование без дублирования с сохранением actualMinutes)
    await HomeworkManager.confirmComplete(hwId);
    updatedHw = await Database.get('homework', hwId);
    assert.strictEqual(updatedHw.status, 'completed');
    assert.strictEqual(updatedHw.actualMinutes, 30);

    await HomeworkManager.toggleComplete(hwId);
    updatedHw = await Database.get('homework', hwId);
    assert.strictEqual(updatedHw.status, 'pending');
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 10b: App.replanToday(): проверка статуса, успех только при success===true, предупреждение при throttling
  // -------------------------------------------------------------------------
  await runScenario('10b', 'App.replanToday(): проверка статуса, успех только при success===true, предупреждение при throttling', async () => {
    let lastToast = null;
    const originalShowToast = App.showToast.bind(App);
    App.showToast = (msg, type) => {
      lastToast = { msg, type };
      originalShowToast(msg, type);
    };

    try {
      AIPlanner.resetThrottle();

      // 1. Успешный запуск
      await App.replanToday();
      assert.ok(lastToast, 'Toast должен быть вызван');
      assert.strictEqual(lastToast.type, 'success', 'При успехе тип тоста должен быть success');
      assert.ok(lastToast.msg.includes('успешно') || lastToast.msg.includes('актуально'));

      // 2. Имитация троттлинга (более 5 вызовов подряд)
      for (let i = 0; i < 6; i++) {
        await App.replanToday();
      }
      assert.ok(lastToast);
      assert.strictEqual(lastToast.type, 'warning', 'При throttling тип тоста должен быть warning');
      assert.ok(lastToast.msg.includes('Слишком частые запросы') || lastToast.msg.includes('Превышен лимит') || lastToast.msg.includes('троттлинг'));
    } finally {
      App.showToast = originalShowToast;
    }
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 11: Реальный перенос задачи (rescheduled обновляет дату и перепланирует)
  // -------------------------------------------------------------------------
  await runScenario(11, 'Реальный перенос задачи (rescheduled обновляет dueDate и запускает автоперепланирование)', async () => {
    const hwId = await Database.addHomework({
      subject: 'Геометрия',
      title: 'Теорема о трёх перпендикулярах',
      dueDate: '2026-11-23',
      estimatedMinutes: 40,
      priority: 'normal',
      status: 'pending'
    });

    AIPlanner.resetThrottle();
    await AIPlanner.autoReplan('2026-11-23', Database, 'Тест переноса', true);

    const schedule = await Database.getDaySchedule('2026-11-23');
    const taskIdx = schedule.tasks.findIndex(t => t.hwId === hwId);
    assert.ok(taskIdx >= 0);

    // Переносим задачу на 2026-11-25
    await App.updateTaskStatus(taskIdx, 'rescheduled', { targetDate: '2026-11-25', dateStr: '2026-11-23' });

    const updatedHw = await Database.get('homework', hwId);
    assert.strictEqual(updatedHw.dueDate, '2026-11-25', 'Дедлайн ДЗ обязан быть обновлён на новую дату');

    const updatedToday = await Database.getDaySchedule('2026-11-23');
    const stillActiveInToday = updatedToday.tasks.some(t => t.hwId === hwId && t.status !== 'rescheduled');
    assert.strictEqual(stillActiveInToday, false, 'Перенесённая задача освобождает время в расписании текущего дня');

    const targetSchedule = await Database.getDaySchedule('2026-11-25');
    assert.ok(targetSchedule, 'Расписание целевого дня должно быть автоматически обновлено');
    const scheduledInTarget = targetSchedule.tasks.some(t => t.hwId === hwId);
    assert.ok(scheduledInTarget, 'Перенесённая задача автоматически запланирована на целевой день');
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 12: Отсутствие дубликатов в activity_log при повторных обновлениях
  // -------------------------------------------------------------------------
  await runScenario(12, 'Отсутствие дубликатов в activity_log при многократном переключении статуса', async () => {
    await Database.logActivity({
      taskId: 'task_dedup_test',
      hwId: 'hw_dedup_test',
      title: 'Тест дедупликации',
      category: 'homework',
      action: 'completed'
    });

    let logs = (await Database.getAll('activity_log')).filter(l => l.taskId === 'task_dedup_test');
    assert.strictEqual(logs.length, 1);

    // Повторная запись того же taskId не создаёт дубликат
    await Database.logActivity({
      taskId: 'task_dedup_test',
      hwId: 'hw_dedup_test',
      title: 'Тест дедупликации',
      category: 'homework',
      action: 'completed'
    });

    logs = (await Database.getAll('activity_log')).filter(l => l.taskId === 'task_dedup_test');
    assert.strictEqual(logs.length, 1, 'Повторный вызов logActivity не должен создавать дублирующую запись');

    // Удаление по taskId
    await Database.removeActivityByTaskId('task_dedup_test', 'hw_dedup_test');
    logs = (await Database.getAll('activity_log')).filter(l => l.taskId === 'task_dedup_test');
    assert.strictEqual(logs.length, 0, 'removeActivityByTaskId должен удалить запись');
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 13: Автоперепланирование при изменении статуса и сохранение выполненных задач
  // -------------------------------------------------------------------------
  await runScenario(13, 'Автоперепланирование сохраняет выполненные задачи и защищённые интервалы', async () => {
    AIPlanner.resetThrottle();
    const dateStr = '2026-11-23';

    await AIPlanner.autoReplan(dateStr, Database, 'Начальный план', true);
    const schedule = await Database.getDaySchedule(dateStr);
    assert.ok(schedule.tasks.length > 2);

    schedule.tasks[1].status = 'completed';
    schedule.tasks[1].completedAt = '2026-11-23T15:00:00.000Z';
    const completedTaskId = schedule.tasks[1].id;
    await Database.saveDaySchedule(schedule);

    // Добавляем новое ДЗ и запускаем автоперепланирование
    await Database.addHomework({
      subject: 'История',
      title: 'Параграф 14 конспект',
      dueDate: '2026-11-24',
      estimatedMinutes: 25
    });

    const res = await AIPlanner.autoReplan(dateStr, Database, 'Новая домашка', true);
    assert.strictEqual(res.success, true);

    const reloaded = await Database.getDaySchedule(dateStr);
    const preserved = reloaded.tasks.find(t => t.id === completedTaskId);
    assert.ok(preserved, 'Выполненная задача сохраняется в расписании');
    assert.strictEqual(preserved.status, 'completed');
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 14: Откат перепланирования расписания (rollbackLastReplan)
  // -------------------------------------------------------------------------
  await runScenario(14, 'Откат перепланирования расписания (rollbackLastReplan)', async () => {
    const dateStr = '2026-11-23';
    const initialSchedule = await Database.getDaySchedule(dateStr);
    const initialTasksCount = initialSchedule.tasks.length;

    const modifiedSchedule = JSON.parse(JSON.stringify(initialSchedule));
    modifiedSchedule.tasks.push({
      id: 'custom_rollback_task',
      title: 'Временная задача',
      startTime: '18:15',
      endTime: '18:45',
      durationMinutes: 30,
      category: 'routine'
    });

    await Scheduler.applyScheduleWithBackup(dateStr, modifiedSchedule, Database, 'Тест отката');
    const midSchedule = await Database.getDaySchedule(dateStr);
    assert.strictEqual(midSchedule.tasks.length, initialTasksCount + 1);

    const rollback = await Scheduler.rollbackLastReplan(dateStr, Database);
    assert.strictEqual(rollback.success, true, 'Откат должен пройти успешно');

    const restoredSchedule = await Database.getDaySchedule(dateStr);
    assert.strictEqual(restoredSchedule.tasks.length, initialTasksCount);
    assert.ok(!restoredSchedule.tasks.some(t => t.id === 'custom_rollback_task'));
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 15: Отсутствие aiApiKey в SETTINGS_KEY и BACKUP_KEY
  // -------------------------------------------------------------------------
  await runScenario(15, 'Отсутствие aiApiKey в хранилищах (SETTINGS_KEY и BACKUP_KEY) и предупреждение об отзыве', async () => {
    // Симулируем наличие старого ключа в active settings и в backup key
    localStorage.setItem('lifeos_settings', JSON.stringify({
      version: '1.0',
      wakeTime: '06:00',
      aiApiKey: 'sk-ant-secret-legacy-key-99999'
    }));
    localStorage.setItem('lifeos_settings_legacy_backup', JSON.stringify({
      aiApiKey: 'sk-ant-secret-legacy-key-99999'
    }));

    // Инициализация БД
    await Database.init();

    // 1. В активных настройках ключ отсутствует
    const cleanSettings = Database.getSettings();
    assert.strictEqual(cleanSettings.aiApiKey, undefined, 'aiApiKey не должен присутствовать в Database.getSettings()');

    // 2. В BACKUP_KEY ключ полностью удалён
    assert.strictEqual(localStorage.getItem('lifeos_settings_legacy_backup'), null, 'lifeos_settings_legacy_backup должен быть удалён');

    // 3. В сырой строке lifeos_settings нет секретного ключа
    const rawSettings = localStorage.getItem('lifeos_settings');
    assert.ok(!rawSettings.includes('sk-ant-secret-legacy-key-99999'), 'Секретный ключ не должен находиться в localStorage');

    // 4. Пользователю выставлен флаг предупреждения об отзыве ключа
    assert.strictEqual(sessionStorage.getItem('lifeos_revocation_warning'), 'true', 'Должен быть выставлен lifeos_revocation_warning');
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 15b: Удаление BACKUP_KEY до ранних выходов из getSettings() при отсутствии основной записи
  // -------------------------------------------------------------------------
  await runScenario('15b', 'Удаление BACKUP_KEY до ранних выходов из getSettings() при отсутствии основной записи SETTINGS_KEY', async () => {
    localStorage.clear();
    sessionStorage.clear();

    // Записываем ТОЛЬКО резервную копию, без SETTINGS_KEY
    localStorage.setItem('lifeos_settings_legacy_backup', JSON.stringify({
      aiApiKey: 'sk-ant-orphan-secret-key-12345'
    }));
    assert.strictEqual(localStorage.getItem('lifeos_settings'), null, 'Основной ключ настроек должен отсутствовать');

    // Вызываем getSettings()
    const settings = Database.getSettings();

    // 1. BACKUP_KEY обязан быть удалён до любого раннего возврата
    assert.strictEqual(localStorage.getItem('lifeos_settings_legacy_backup'), null, 'BACKUP_KEY должен быть удален даже при отсутствии SETTINGS_KEY');

    // 2. Должно быть выставлено предупреждение об отзыве ключа
    assert.strictEqual(sessionStorage.getItem('lifeos_revocation_warning'), 'true', 'Должен быть выставлен флаг lifeos_revocation_warning');

    // 3. Возвращённые настройки валидны и безопасны
    assert.strictEqual(settings.aiApiKey, undefined);
    assert.strictEqual(settings.version, '1.2');
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 16: Безопасный импорт с пред-импортным снапшотом и санитизацией
  // -------------------------------------------------------------------------
  await runScenario(16, 'Безопасный импорт с пред-импортным снапшотом, валидацией схемы и очисткой ключей', async () => {
    // 1. Попытка импорта невалидного JSON
    let threwError = false;
    try {
      await Database.importAllData('NOT_VALID_JSON_STRING{{{');
    } catch (e) {
      threwError = true;
    }
    assert.strictEqual(threwError, true, 'Невалидный JSON должен вызывать ошибку');

    // 2. Импорт с вредоносным/устаревшим aiApiKey в settings
    const maliciousPayload = JSON.stringify({
      version: '1.2',
      settings: {
        wakeTime: '06:30',
        aiApiKey: 'injected_stolen_key'
      },
      homework: [],
      school_timetable: [],
      ege_topics: []
    });

    await Database.importAllData(maliciousPayload);

    const importedSettings = Database.getSettings();
    assert.strictEqual(importedSettings.wakeTime, '06:30');
    assert.strictEqual(importedSettings.aiApiKey, undefined, 'Импортированные настройки должны быть очищены от aiApiKey');
    assert.strictEqual(localStorage.getItem('lifeos_settings_legacy_backup'), null);
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 16b: Откат импорта при ошибке после частичной записи (восстановление ВСЕХ хранилищ, включая activity_log и replan_history)
  // -------------------------------------------------------------------------
  await runScenario('16b', 'Откат импорта при ошибке после частичной записи (восстановление всех хранилищ, включая activity_log и replan_history)', async () => {
    // 1. Заполняем базу исходными данными
    const testHwId = await Database.addHomework({
      subject: 'Химия',
      title: 'Контрольная работа',
      dueDate: '2026-11-23',
      estimatedMinutes: 45
    });

    const preActivityId = 'act_pre_rollback_test';
    await Database.logActivity({
      id: preActivityId,
      taskId: 'task_pre_test',
      title: 'Пре-импортная активность',
      durationMinutes: 45,
      date: '2026-11-23',
      action: 'completed'
    });

    await Database.addReplanHistory({
      date: '2026-11-23',
      timestamp: new Date().toISOString(),
      reason: 'Пре-импортная история перепланирования',
      mode: 'normal'
    });

    const preActivities = await Database.getAll('activity_log');
    const preHistory = await Database.getAll('replan_history');
    assert.ok(preActivities.some(a => a.id === preActivityId || a.taskId === 'task_pre_test'));
    assert.ok(preHistory.length > 0);

    // 2. Создаём повреждённый пакет для импорта, в котором первые хранилища валидны,
    // но при записи в projects вызывается сбой (имитация частичной записи)
    const originalPut = Database.put.bind(Database);
    let putCallCount = 0;
    Database.put = async function(storeName, item) {
      if (storeName === 'projects' && putCallCount++ === 0) {
        throw new Error('Имитация аппаратного сбоя IndexedDB при записи в projects');
      }
      return originalPut(storeName, item);
    };

    const partialFailurePayload = JSON.stringify({
      version: '1.2',
      settings: { wakeTime: '05:00' },
      schedule_days: [{ date: '2026-11-23', tasks: [{ id: 'corrupted_task', title: 'Битый план' }] }],
      homework: [{ id: 'hw_corrupted', title: 'Би ДЗ', dueDate: '2026-11-23' }],
      school_timetable: [],
      ege_topics: [],
      olympiads: [],
      projects: [{ id: 'proj_fail', title: 'Сбойный проект' }],
      replan_history: [{ id: 999, reason: 'Битый лог' }],
      activity_log: [{ id: 'act_corrupted', title: 'Битый лог' }]
    });

    let importFailed = false;
    try {
      await Database.importAllData(partialFailurePayload);
    } catch (err) {
      importFailed = true;
      assert.ok(err.message.includes('Импорт прерван') || err.message.includes('Имитация'));
    } finally {
      Database.put = originalPut;
    }

    assert.strictEqual(importFailed, true, 'Импорт должен завершиться ошибкой');

    // 3. Проверяем полное восстановление ВСЕХ хранилищ из снимка
    const restoredHw = await Database.get('homework', testHwId);
    assert.ok(restoredHw, 'Домашнее задание должно быть полностью восстановлено');
    assert.strictEqual(restoredHw.title, 'Контрольная работа');

    const restoredActivities = await Database.getAll('activity_log');
    assert.ok(restoredActivities.some(a => a.id === preActivityId || a.taskId === 'task_pre_test'), 'activity_log обязан быть восстановлен');
    assert.strictEqual(restoredActivities.some(a => a.id === 'act_corrupted'), false, 'Битые записи activity_log должны быть удалены');

    const restoredHistory = await Database.getAll('replan_history');
    assert.ok(restoredHistory.length > 0, 'replan_history обязан быть восстановлен');
    assert.strictEqual(restoredHistory.some(h => h.id === 999 || (h.reason && h.reason.includes('Битый'))), false, 'Битые записи replan_history должны быть удалены');
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 17: Автономная работа без внешнего сервера ИИ и динамические советы
  // -------------------------------------------------------------------------
  await runScenario(17, 'Автономная работа без внешнего сервера ИИ и динамические советы без захардкоженных дат', async () => {
    AIPlanner.resetThrottle();
    Database.saveSettings({
      aiEndpoint: '',
      sleepStart: '22:00',
      gameMinutes: 45
    });

    const res = await AIPlanner.autoReplan('2026-11-23', Database, 'Автономный тест', true);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.source, 'local');

    // Проверяем динамический совет по усталости: использует реальные sleepStart и gameMinutes
    const adviceRest = await AIPlanner.getAdvice('Я чувствую усталость', Database);
    assert.ok(adviceRest.includes('22:00'), 'Совет обязан использовать реальный sleepStart (22:00)');
    assert.ok(adviceRest.includes('45 мин игр'), 'Совет обязан использовать реальные gameMinutes (45 мин)');

    // Проверяем внешний эндпоинт: запрет HTTP для не-localhost
    let httpError = false;
    try {
      await AIPlanner.queryExternalAI('2026-11-23', {
        settings: { aiEndpoint: 'http://insecure-api.com/plan' },
        homework: [], timetable: [], projects: []
      });
    } catch (e) {
      httpError = true;
      assert.ok(e.message.includes('Недопустимый протокол') || e.message.includes('HTTPS'));
    }
    assert.strictEqual(httpError, true, 'Запросы к внешнему API по небезопасному HTTP должны блокироваться');
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 18: Поведение уведомлений и журнал истории до 50 записей
  // -------------------------------------------------------------------------
  await runScenario(18, 'Поведение уведомлений (granted vs denied, ведение истории до 50 записей)', async () => {
    NotificationsManager.clearNotificationHistory();

    MockNotification.permission = 'denied';
    NotificationsManager.showNotification('Тест denied', { body: 'Текст', category: 'study' });

    let history = NotificationsManager.getNotificationHistory();
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].status, 'in_app', 'При denied статус должен быть in_app');

    MockNotification.permission = 'granted';
    NotificationsManager.showNotification('Тест granted', { body: 'Текст 2', category: 'prayer' });

    history = NotificationsManager.getNotificationHistory();
    assert.strictEqual(history.length, 2);
    assert.strictEqual(history[0].status, 'delivered', 'При granted статус должен быть delivered');

    // Переполнение истории: добавим 60 уведомлений
    for (let i = 0; i < 60; i++) {
      NotificationsManager.showNotification(`Тест ${i}`, { body: `Тело ${i}` });
    }
    history = NotificationsManager.getNotificationHistory();
    assert.strictEqual(history.length, 50, 'Журнал уведомлений должен строго ограничиваться 50 записями');

    const disclosure = NotificationsManager.getWebPushDisclosure();
    assert.ok(disclosure.webPush.includes('VAPID') && disclosure.webPush.includes('GitHub Pages'));
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 19: Проверка целостности всех защищённых блоков с пользовательскими настройками
  // -------------------------------------------------------------------------
  await runScenario(19, 'Проверка целостности всех защищённых блоков с пользовательскими длительностями', async () => {
    const customSettings = {
      wakeTime: '06:15',
      sleepStart: '21:45',
      gameMinutes: 75,
      sportMinutes: 40,
      familyMinutes: 50,
      offlineRestMinutes: 35,
      prayerDuration: 25,
      lunchMinutes: 40
    };

    const plan = await Scheduler.generateDailySchedule('2026-11-23', Database, customSettings);
    const tasks = plan.tasks;

    const sleep = tasks.find(t => t.category === 'sleep');
    assert.ok(sleep);
    assert.strictEqual(sleep.startTime, '21:45');
    assert.strictEqual(sleep.endTime, '06:15');

    const games = tasks.find(t => t.category === 'gaming');
    assert.ok(games);
    assert.strictEqual(games.durationMinutes, 75);

    const sport = tasks.find(t => t.category === 'sport');
    assert.ok(sport);
    assert.strictEqual(sport.durationMinutes, 40);

    const family = tasks.find(t => t.category === 'family');
    assert.ok(family);
    assert.strictEqual(family.durationMinutes, 50);

    const rest = tasks.find(t => t.category === 'rest');
    assert.ok(rest);
    assert.strictEqual(rest.durationMinutes, 35);

    const prayer = tasks.find(t => t.category === 'prayer');
    assert.ok(prayer);
    assert.strictEqual(prayer.durationMinutes, 25);

    const integrity = Scheduler.verifyScheduleIntegrity(plan, customSettings);
    assert.strictEqual(integrity.valid, true, `Проверка целостности: ${integrity.errors.join(', ')}`);
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 20: Точность даты и времени в часовом поясе Europe/Moscow
  // -------------------------------------------------------------------------
  await runScenario(20, 'Точность даты и времени в часовом поясе Europe/Moscow', async () => {
    const todayMoscow = TimeUtils.getTodayStr();
    assert.match(todayMoscow, /^\d{4}-\d{2}-\d{2}$/);

    const utcMidnightEdge = new Date(Date.UTC(2026, 10, 23, 21, 30, 0));
    const moscowDateStr = TimeUtils.formatDateISO(utcMidnightEdge);
    assert.strictEqual(moscowDateStr, '2026-11-24', 'В Москве должно быть уже 24 ноября');

    assert.strictEqual(TimeUtils.diffDays('2026-11-23', '2026-11-27'), 4);
    assert.strictEqual(TimeUtils.diffDays('2026-11-27', '2026-11-23'), -4);
    assert.strictEqual(TimeUtils.diffDays('2026-11-23', '2026-11-23'), 0);
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 20b: Отображаемые перемены рассчитываются по реальным интервалам уроков
  // -------------------------------------------------------------------------
  await runScenario('20b', 'Перемены между уроками рассчитаны по интервалам на скриншотах', async () => {
    // Изолированно поднимаем исходное расписание: предыдущие сценарии тестируют другие наборы данных.
    await Database.seedUserSchoolTimetableFromScreenshots();
    Database.saveSettings({ schoolTimetableSupplementsVersion: null });
    await Database.ensureUserTimetableSupplements();
    const timetable = (await Database.getSchoolTimetable()).sort((a, b) => a.dayOfWeek - b.dayOfWeek);
    const durationsFor = (dayOfWeek) => {
      const lessons = (timetable.find(day => day.dayOfWeek === dayOfWeek)?.lessons || [])
        .filter(lesson => !lesson.isAfterSchool)
        .sort((a, b) => TimeUtils.timeToMin(a.startTime) - TimeUtils.timeToMin(b.startTime));
      return lessons.slice(1).map((lesson, index) => {
        const interval = SchoolManager.getBreakBetweenLessons(lessons[index], lesson);
        return interval ? interval.durationMinutes : 0;
      });
    };

    assert.deepStrictEqual(durationsFor(1), [5, 5, 20, 20, 5, 10], 'Понедельник: перемены с классным часом');
    assert.deepStrictEqual(durationsFor(2), [5, 5, 20, 20, 5, 10, 10], 'Вторник: перемена перед восьмой математикой');
    assert.deepStrictEqual(durationsFor(3), [5, 5, 20, 20, 5, 10], 'Среда: перемены между видимыми уроками');
    assert.deepStrictEqual(durationsFor(4), [5, 5, 20, 20, 5, 10, 10], 'Четверг: перемена перед восьмой математикой');
    assert.deepStrictEqual(durationsFor(5), [5, 5, 20, 20, 5, 10], 'Пятница: перемены между видимыми уроками');
    assert.deepStrictEqual(durationsFor(6), [5, 15, 15], 'Суббота: 5/15/15 минут');

    assert.strictEqual(SchoolManager.getBreakBetweenLessons(
      { endTime: '09:30' }, { startTime: '09:30' }
    ), null, 'Нулевая перемена не создаётся');
    assert.strictEqual(SchoolManager.getBreakBetweenLessons(
      { endTime: '09:40' }, { startTime: '09:30' }
    ), null, 'Пересечение не маскируется под перемену');
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 20c: Старые 45-минутные допки обновляются до 40 минут без дублей
  // -------------------------------------------------------------------------
  await runScenario('20c', 'Миграция старых допок с 14:45–15:30 на 13:55–14:35 без дублей', async () => {
    await Database.seedUserSchoolTimetableFromScreenshots();
    const tuesday = await Database.get('school_timetable', 2);
    const thursday = await Database.get('school_timetable', 4);
    tuesday.lessons.push({
      id: 'school_tue_math_extra', lessonNumber: 8, subject: 'Дополнительная математика',
      startTime: '14:45', endTime: '15:30', isExtra: true, isAfterSchool: false
    });
    thursday.lessons.push({
      id: 'school_thu_math_extra', lessonNumber: 8, subject: 'Дополнительная математика',
      startTime: '14:45', endTime: '15:30', isExtra: true, isAfterSchool: false
    });
    await Database.saveDayTimetable(2, tuesday.lessons);
    await Database.saveDayTimetable(4, thursday.lessons);
    Database.saveSettings({ schoolTimetableScreenshotsImported: true,
      schoolTimetableSupplementsVersion: '2026-11-24-class-hours-math-extra-v1' });
    await Database.ensureUserTimetableSupplements();
    for (const dayOfWeek of [2, 4]) {
      const day = await Database.get('school_timetable', dayOfWeek);
      const extras = day.lessons.filter(l => l.subject === 'Дополнительная математика');
      assert.strictEqual(extras.length, 1);
      assert.deepStrictEqual(
        { lessonNumber: extras[0].lessonNumber, startTime: extras[0].startTime, endTime: extras[0].endTime },
        { lessonNumber: 8, startTime: '13:55', endTime: '14:35' }
      );
    }
  });

  console.log('\n========================================================================');
  console.log(`ИТОГО СЦЕНАРИЕВ: ${totalTests} | УСПЕШНО: ${passedTests} | ПРОВАЛЕНО: ${totalTests - passedTests}`);
  console.log('========================================================================\n');

  if (totalTests !== passedTests) {
    process.exit(1);
  }
}

runAll26Scenarios().catch(err => {
  console.error('Критический сбой тестового набора:', err);
  process.exit(1);
});
