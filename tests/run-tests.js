/**
 * LifeOS v1.1.1 — Comprehensive Automated Test Suite
 * 17 Production Scenarios Verifying Data Safety, EGE Catalogs, Scheduler Integrity,
 * AI Loop Protection, Web Notifications Fallbacks, and Moscow Timezone Accuracy.
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
                      const key = item[s.keyPath];
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
  }
};
globalThis.localStorage = globalThis.window.localStorage;
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

async function runAll17Scenarios() {
  console.log('\n========================================================================');
  console.log('--- LifeOS v1.1.1 — Полный комплекс из 17 тестовых сценариев ---');
  console.log('========================================================================\n');

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 1: Первый запуск с пустой базой данных
  // -------------------------------------------------------------------------
  await runScenario(1, 'Первый запуск с пустой базой данных (чистый старт, все метрики 0)', async () => {
    localStorage.clear();
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
    assert.strictEqual(oly.length, 0, 'Список активных олимпиад пользователя должен быть пуст (без фиктивных дат)');

    const settings = Database.getSettings();
    assert.strictEqual(settings.version, '1.1.1');
    assert.strictEqual(settings.schoolTimetableConfirmed, false, 'Расписание должно требовать проверки пользователя');
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 2: Запуск с существующими пользовательскими данными (без перезаписи)
  // -------------------------------------------------------------------------
  await runScenario(2, 'Запуск с существующими пользовательскими данными (сохранность данных, отсутствие вайпа)', async () => {
    // Добавим реальную задачу пользователя
    const userHw = {
      subject: 'Физика',
      title: 'Лабораторная работа по оптике',
      dueDate: '2026-11-25',
      estimatedMinutes: 45,
      priority: 'high',
      status: 'pending'
    };
    const hwId = await Database.addHomework(userHw);

    // Добавим прогресс по теме ЕГЭ
    const topics = await Database.getEgeTopics();
    const math1Topic = topics.find(t => t.id === 'math_1' || t.code === '№1');
    assert.ok(math1Topic, 'Тема math_1 должна существовать');
    math1Topic.solvedCount = 10;
    math1Topic.correctCount = 9;
    math1Topic.theoryStudied = true;
    await Database.updateEgeTopic(math1Topic);

    // Перезапуск БД (имитация перезапуска приложения)
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
  // СЦЕНАРИЙ 3: Обновление с v1.1 до v1.1.1 (миграция тем ЕГЭ с сохранением прогресса)
  // -------------------------------------------------------------------------
  await runScenario(3, 'Обновление с v1.1 до v1.1.1 (миграция тем ЕГЭ с сохранением прогресса)', async () => {
    // Изменим настройки на старую версию 1.1
    const s = Database.getSettings();
    s.version = '1.1';
    localStorage.setItem('lifeos_settings', JSON.stringify(s));

    // Запустим синхронизацию
    await Database.syncEgeTopicsCatalog();

    const updatedTopics = await Database.getEgeTopics();
    assert.strictEqual(updatedTopics.length, 73, 'Каталог должен обновиться до всех 73 тем');

    const math1 = updatedTopics.find(t => t.id === 'math_1' || t.code === '№1');
    assert.ok(math1, 'Тема math_1 должна присутствовать в обновлённом каталоге');
    assert.strictEqual(math1.solvedCount, 10, 'Прогресс существующих тем не должен затираться');
    assert.strictEqual(math1.theoryStudied, true);
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 4: Сохранение расписания уроков при cleanToZeroState
  // -------------------------------------------------------------------------
  await runScenario(4, 'Сохранение расписания уроков при обновлении и очистке cleanToZeroState', async () => {
    const timetableBefore = await Database.getSchoolTimetable();
    assert.strictEqual(timetableBefore.length, 7, 'В расписании должно быть 7 дней недели');

    // Вызываем очистку до нулевого состояния
    await Database.cleanToZeroState();

    const timetableAfter = await Database.getSchoolTimetable();
    assert.strictEqual(timetableAfter.length, 7, 'Расписание уроков НЕ должно удаляться при cleanToZeroState()');

    const tuesday = timetableAfter.find(t => t.dayOfWeek === 2);
    assert.ok(tuesday && tuesday.lessons.length >= 7, 'Уроки вторника должны быть сохранены');
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 5: Отсутствие фиктивных олимпиад в активном списке и шаблоны с isTemplate
  // -------------------------------------------------------------------------
  await runScenario(5, 'Отсутствие фиктивных олимпиад в активном списке; шаблоны не включают соревновательный режим', async () => {
    const activeOlys = await Database.getOlympiads();
    assert.strictEqual(activeOlys.length, 0, 'В активном хранилище не должно быть фиктивных олимпиад');

    const templates = Database.getOlympiadTemplates();
    assert.ok(templates.length >= 4, 'Шаблоны олимпиад должны быть доступны для выбора');
    templates.forEach(tpl => {
      assert.strictEqual(tpl.isTemplate, true, 'Все шаблонные олимпиады обязаны иметь isTemplate: true');
    });

    // Проверяем, что шаблонная олимпиада в ближайшие дни НЕ включает соревновательный режим
    const templateWithCloseDate = {
      id: 'tpl_close',
      title: 'Шаблон ВсОШ',
      date: '2026-11-25',
      isTemplate: true,
      isConfirmed: false
    };

    const mode = Scheduler.detectMode('2026-11-23', [], [], [templateWithCloseDate], { activeMode: 'auto' });
    assert.notStrictEqual(mode.mode, 'competitive', 'Неподтверждённый шаблон не должен включать соревновательный режим');
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 6: Корректное распределение 8-го урока и обеда
  // -------------------------------------------------------------------------
  await runScenario(6, 'Корректное распределение 8-го урока (до 15:30) и обеда (15:30–16:10)', async () => {
    // 2026-11-24 — Вторник, 8 уроков
    const planTue = await Scheduler.generateDailySchedule('2026-11-24', Database);
    assert.strictEqual(planTue.has8thLesson, true, 'Во вторник должен быть зафиксирован 8-й урок');
    assert.strictEqual(planTue.schoolEndTime, '15:30', 'Окончание 8-го урока должно быть ровно 15:30');

    const lunchTask = planTue.tasks.find(t => t.id.startsWith('road_home_lunch_'));
    assert.ok(lunchTask, 'Блок возвращения домой и обеда должен присутствовать');
    assert.strictEqual(lunchTask.startTime, '15:30', 'Обед после 8 уроков начинается ровно в 15:30');
    assert.strictEqual(lunchTask.endTime, '16:10', 'Обед продолжается до 16:10 (40 минут)');

    const integrity = Scheduler.verifyScheduleIntegrity(planTue);
    assert.strictEqual(integrity.valid, true, `Расписание вторника должно быть валидно: ${integrity.errors.join(', ')}`);
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 7: Обнаружение конфликтов уроков и наложений в verifyScheduleIntegrity
  // -------------------------------------------------------------------------
  await runScenario(7, 'Обнаружение конфликтов и наложений задач в verifyScheduleIntegrity', async () => {
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
    assert.ok(check.errors.some(e => e.includes('пересечение') || e.includes('накладывается')), 'В ошибках должно быть указано пересечение');
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 8: Обработка перегрузки расписания (unallocatedTasks, overloadWarning)
  // -------------------------------------------------------------------------
  await runScenario(8, 'Обработка перегрузки расписания (фиксация unallocatedTasks и overloadWarning)', async () => {
    // Добавим 4 больших домашних задания по 90 минут = 360 минут (6 часов)
    for (let i = 1; i <= 4; i++) {
      await Database.addHomework({
        subject: `Предмет ${i}`,
        title: `Огромное ДЗ ${i}`,
        dueDate: '2026-11-24',
        estimatedMinutes: 90,
        priority: 'high'
      });
    }

    const plan = await Scheduler.generateDailySchedule('2026-11-23', Database);
    assert.strictEqual(plan.isOverloaded, true, 'Должен быть зафиксирован флаг перегрузки');
    assert.ok(plan.unallocatedMinutes > 0, 'Количество неуместившихся минут должно быть > 0');
    assert.ok(plan.unallocatedTasks.length > 0, 'Список unallocatedTasks должен содержать задачи');
    assert.ok(plan.overloadWarning.includes('учебная нагрузка превышает'), 'Должно быть сформировано понятное предупреждение');

    // Проверяем, что сон и защищённые блоки НЕ пострадали
    const integrity = Scheduler.verifyScheduleIntegrity(plan);
    assert.strictEqual(integrity.valid, true, 'Даже при перегрузке целостность защищённых блоков сохраняется');

    // Очищаем тестовую домашку
    const allHw = await Database.getAllHomework();
    for (const h of allHw) {
      await Database.deleteHomework(h.id);
    }
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 9: Дробление длинных задач на части без потери времени
  // -------------------------------------------------------------------------
  await runScenario(9, 'Дробление длинных задач на части (split into chunk parts без потери времени)', async () => {
    await Database.addHomework({
      subject: 'Профильная математика',
      title: 'Большой вариант ЕГЭ Часть 2',
      dueDate: '2026-11-24',
      estimatedMinutes: 90,
      priority: 'urgent'
    });

    const plan = await Scheduler.generateDailySchedule('2026-11-23', Database);
    const mathHwTasks = plan.tasks.filter(t => t.category === 'homework' && t.title.includes('Профильная математика'));
    const unallocatedMath = plan.unallocatedTasks.find(u => u.title.includes('Профильная математика'));

    const scheduledMins = mathHwTasks.reduce((acc, t) => acc + t.durationMinutes, 0);
    const unallocatedMins = unallocatedMath ? unallocatedMath.unallocatedMinutes : 0;

    assert.strictEqual(scheduledMins + unallocatedMins, 90, 'Баланс минут строго соблюдён: запланировано + неуместилось = 90 мин');

    // Очистка
    const allHw = await Database.getAllHomework();
    for (const h of allHw) {
      await Database.deleteHomework(h.id);
    }
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 10: Отсутствие потери выполненных задач при автоперепланировании
  // -------------------------------------------------------------------------
  await runScenario(10, 'Отсутствие потери выполненных задач при автоперепланировании', async () => {
    AIPlanner.resetThrottle();
    const dateStr = '2026-11-23';

    // Создаём начальный план
    const res1 = await AIPlanner.autoReplan(dateStr, Database, 'Первичный план', true);
    assert.strictEqual(res1.success, true);

    // Отмечаем одну из задач как выполненную
    const currentSchedule = await Database.getDaySchedule(dateStr);
    assert.ok(currentSchedule.tasks.length > 2);
    currentSchedule.tasks[1].status = 'completed';
    currentSchedule.tasks[1].completedAt = '2026-11-23T16:45:00.000Z';
    const completedTaskId = currentSchedule.tasks[1].id;
    await Database.saveDaySchedule(currentSchedule);

    // Добавляем новое ДЗ и вызываем перепланирование
    await Database.addHomework({
      subject: 'Информатика',
      title: 'КЕГЭ Задача 24',
      dueDate: '2026-11-24',
      estimatedMinutes: 30
    });

    const res2 = await AIPlanner.autoReplan(dateStr, Database, 'Добавлено ДЗ', true);
    assert.strictEqual(res2.success, true);

    const reloadedSchedule = await Database.getDaySchedule(dateStr);
    const preservedTask = reloadedSchedule.tasks.find(t => t.id === completedTaskId);
    assert.ok(preservedTask, 'Выполненная задача должна присутствовать в обновлённом расписании');
    assert.strictEqual(preservedTask.status, 'completed', 'Статус выполненной задачи обязан остаться completed');

    // Очистка
    const allHw = await Database.getAllHomework();
    for (const h of allHw) await Database.deleteHomework(h.id);
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 11: Откат перепланирования расписания (rollbackLastReplan)
  // -------------------------------------------------------------------------
  await runScenario(11, 'Откат перепланирования расписания (rollbackLastReplan)', async () => {
    const dateStr = '2026-11-23';
    const initialSchedule = await Database.getDaySchedule(dateStr);
    const initialTasksCount = initialSchedule.tasks.length;

    // Применяем новое расписание с бэкапом
    const modifiedSchedule = JSON.parse(JSON.stringify(initialSchedule));
    modifiedSchedule.tasks.push({
      id: 'custom_test_task',
      title: 'Временная тестовая задача',
      startTime: '18:15',
      endTime: '18:45',
      durationMinutes: 30,
      category: 'routine'
    });

    await Scheduler.applyScheduleWithBackup(dateStr, modifiedSchedule, Database, 'Тестовое изменение');
    const midSchedule = await Database.getDaySchedule(dateStr);
    assert.strictEqual(midSchedule.tasks.length, initialTasksCount + 1);

    // Выполняем откат
    const rollback = await Scheduler.rollbackLastReplan(dateStr, Database);
    assert.strictEqual(rollback.success, true, 'Откат должен пройти успешно');

    const restoredSchedule = await Database.getDaySchedule(dateStr);
    assert.strictEqual(restoredSchedule.tasks.length, initialTasksCount, 'Расписание должно вернуться к предыдущему составу');
    assert.ok(!restoredSchedule.tasks.some(t => t.id === 'custom_test_task'), 'Временная задача должна исчезнуть после отката');
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 12: Проверка целостности всех защищённых блоков с пользовательскими настройками
  // -------------------------------------------------------------------------
  await runScenario(12, 'Проверка целостности всех защищённых блоков с пользовательскими настройками', async () => {
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

    // 1. Сон
    const sleep = tasks.find(t => t.category === 'sleep');
    assert.ok(sleep, 'Блок сна должен присутствовать');
    assert.strictEqual(sleep.startTime, '21:45');
    assert.strictEqual(sleep.endTime, '06:15');
    assert.strictEqual(sleep.durationMinutes, (1440 - (21 * 60 + 45)) + (6 * 60 + 15)); // 510 мин

    // 2. Игры
    const games = tasks.find(t => t.category === 'gaming');
    assert.ok(games);
    assert.strictEqual(games.durationMinutes, 75, 'Длительность игр должна строго соответствовать настройке 75 мин');

    // 3. Спорт
    const sport = tasks.find(t => t.category === 'sport');
    assert.ok(sport);
    assert.strictEqual(sport.durationMinutes, 40, 'Длительность спорта должна строго соответствовать настройке 40 мин');

    // 4. Семейный ужин
    const family = tasks.find(t => t.category === 'family');
    assert.ok(family);
    assert.strictEqual(family.durationMinutes, 50, 'Семейный ужин должен строго соответствовать настройке 50 мин');

    // 5. Отдых без ПК
    const rest = tasks.find(t => t.category === 'rest');
    assert.ok(rest);
    assert.strictEqual(rest.durationMinutes, 35, 'Отдых без ПК должен строго соответствовать настройке 35 мин');

    // 6. Намаз ясту
    const prayer = tasks.find(t => t.category === 'prayer');
    assert.ok(prayer);
    assert.strictEqual(prayer.durationMinutes, 25, 'Намаз ясту должен соответствовать настройке 25 мин');

    // Проверка целостности
    const integrity = Scheduler.verifyScheduleIntegrity(plan, customSettings);
    assert.strictEqual(integrity.valid, true, `Проверка целостности должна быть успешной: ${integrity.errors.join(', ')}`);
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 13: Полный каталог ЕГЭ из 73 тем по кодификатору ФИПИ без пропусков
  // -------------------------------------------------------------------------
  await runScenario(13, 'Полный каталог ЕГЭ из 73 тем по кодификатору ФИПИ без пропущенных номеров', async () => {
    const catalog = Database.getFipiEgeCatalog();
    assert.strictEqual(catalog.length, 73, 'Общий каталог должен содержать ровно 73 темы');

    const math = catalog.filter(t => t.subject === 'math' || t.subject === 'math_p');
    assert.strictEqual(math.length, 19, 'Профильная математика должна содержать 19 заданий');
    for (let i = 1; i <= 19; i++) {
      assert.ok(math.some(t => t.taskNumber === i), `Математика обязана содержать задание №${i}`);
    }

    const info = catalog.filter(t => t.subject === 'informatics');
    assert.strictEqual(info.length, 27, 'Информатика КЕГЭ должна содержать 27 заданий');
    for (let i = 1; i <= 27; i++) {
      assert.ok(info.some(t => t.taskNumber === i), `Информатика обязана содержать задание №${i}`);
    }

    const rus = catalog.filter(t => t.subject === 'russian');
    assert.strictEqual(rus.length, 27, 'Русский язык должен содержать 27 заданий');
    for (let i = 1; i <= 27; i++) {
      assert.ok(rus.some(t => t.taskNumber === i), `Русский язык обязан содержать задание №${i}`);
    }
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 14: Поведение уведомлений при различных разрешениях и журнал истории
  // -------------------------------------------------------------------------
  await runScenario(14, 'Поведение уведомлений при предоставленном/заблокированном доступе и журнал истории', async () => {
    NotificationsManager.clearNotificationHistory();

    // 1. При отсутствии разрешения (default или denied) -> отправляет in-app toast, статус 'in_app'
    MockNotification.permission = 'denied';
    NotificationsManager.showNotification('Тестовое уведомление без прав', { body: 'Текст', category: 'study' });

    let history = NotificationsManager.getNotificationHistory();
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].status, 'in_app', 'При denied статус должен быть in_app');

    // 2. При наличии разрешения -> системное окно, статус 'delivered'
    MockNotification.permission = 'granted';
    NotificationsManager.showNotification('Системное уведомление Windows', { body: 'Текст 2', category: 'prayer' });

    history = NotificationsManager.getNotificationHistory();
    assert.strictEqual(history.length, 2);
    assert.strictEqual(history[0].status, 'delivered', 'При granted статус должен быть delivered');

    // 3. Честное техническое описание Web Push
    const disclosure = NotificationsManager.getWebPushDisclosure();
    assert.ok(disclosure.webNotifications.includes('Web Notifications API'));
    assert.ok(disclosure.webPush.includes('VAPID') && disclosure.webPush.includes('GitHub Pages'));
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 15: Отсутствие aiApiKey в LocalStorage и безопасная миграция в бэкап
  // -------------------------------------------------------------------------
  await runScenario(15, 'Отсутствие aiApiKey в LocalStorage и безопасная миграция в бэкап', async () => {
    // Сымитируем старую уязвимую запись настроек с aiApiKey
    localStorage.setItem('lifeos_settings', JSON.stringify({
      version: '1.0',
      wakeTime: '06:00',
      aiApiKey: 'sk-ant-api03-legacy-secret-key-12345'
    }));

    const cleanSettings = Database.getSettings();
    assert.strictEqual(cleanSettings.aiApiKey, undefined, 'aiApiKey не должен присутствовать в активных настройках');

    const backup = localStorage.getItem('lifeos_settings_legacy_backup');
    assert.ok(backup, 'Устаревший ключ должен быть изолирован в резервной копии');
    const parsedBackup = JSON.parse(backup);
    assert.strictEqual(parsedBackup.aiApiKey, 'sk-ant-api03-legacy-secret-key-12345');
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 16: Автономная работа без внешнего сервера ИИ
  // -------------------------------------------------------------------------
  await runScenario(16, 'Автономная работа без внешнего сервера ИИ (детерминированный планировщик LifeOS)', async () => {
    AIPlanner.resetThrottle();
    Database.saveSettings({ aiEndpoint: '' }); // Без внешнего эндпоинта

    const res = await AIPlanner.autoReplan('2026-11-23', Database, 'Автономный тест', true);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.source, 'local', 'При пустом эндпоинте планировщик обязан работать автономно (local)');
    assert.ok(res.explanation.includes('Локальный планировщик LifeOS (автономно)'), 'Объяснение должно честно указывать на локальный расчёт');
  });

  // -------------------------------------------------------------------------
  // СЦЕНАРИЙ 17: Точность даты и времени в часовом поясе Europe/Moscow
  // -------------------------------------------------------------------------
  await runScenario(17, 'Точность даты и времени в часовом поясе Europe/Moscow', async () => {
    const todayMoscow = TimeUtils.getTodayStr();
    assert.match(todayMoscow, /^\d{4}-\d{2}-\d{2}$/);

    // Тестирование краевого случая полуночи: UTC 21:30 23 ноября -> Москва UTC+3 это 00:30 24 ноября
    const utcMidnightEdge = new Date(Date.UTC(2026, 10, 23, 21, 30, 0));
    const moscowDateStr = TimeUtils.formatDateISO(utcMidnightEdge);
    assert.strictEqual(moscowDateStr, '2026-11-24', 'В Москве должно быть уже 24 ноября');

    // Проверка разности дней
    assert.strictEqual(TimeUtils.diffDays('2026-11-23', '2026-11-27'), 4);
    assert.strictEqual(TimeUtils.diffDays('2026-11-27', '2026-11-23'), -4);
  });

  console.log('\n========================================================================');
  console.log(`ИТОГО СЦЕНАРИЕВ: ${totalTests} | УСПЕШНО: ${passedTests} | ПРОВАЛЕНО: ${totalTests - passedTests}`);
  console.log('========================================================================\n');

  if (totalTests !== passedTests) {
    process.exit(1);
  }
}

runAll17Scenarios().catch(err => {
  console.error('Критический сбой тестового набора:', err);
  process.exit(1);
});
