/**
 * LifeOS — Модуль базы данных (IndexedDB + LocalStorage)
 * Обеспечивает надёжное локальное хранение данных без внешней регистрации
 */

const DB_NAME = 'LifeOS_DB';
const DB_VERSION = 1;
const SETTINGS_KEY = 'lifeos_settings';

const Database = {
  db: null,

  // Настройки по умолчанию
  defaultSettings: {
    sleepStart: '21:30',
    wakeTime: '06:00',
    gameMinutes: 60,
    sportMinutes: 25,
    familyMinutes: 30,
    offlineRestMinutes: 45,
    lunchMinutes: 40,
    prayerCity: 'Актаныш, Республика Татарстан',
    prayerLat: 55.725,
    prayerLng: 54.080,
    prayerMethod: 'DUM_RT',
    prayerAngle: 15.0,
    prayerDuration: 20,
    prayerManualTime: '',
    activeMode: 'auto', // 'auto' | 'normal' | 'loaded' | 'competitive'
    notificationAdvance: 10,
    notificationStart: true,
    notificationEnd: true,
    notificationSound: true,
    notificationPrayer: true,
    notificationRest: true,
    aiEndpoint: '',
    aiApiKey: '',
    aiModel: 'default'
  },

  /**
   * Инициализация базы данных IndexedDB
   */
  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. Дневные расписания по дате ('YYYY-MM-DD')
        if (!db.objectStoreNames.contains('schedule_days')) {
          db.createObjectStore('schedule_days', { keyPath: 'date' });
        }

        // 2. Домашние задания
        if (!db.objectStoreNames.contains('homework')) {
          const hwStore = db.createObjectStore('homework', { keyPath: 'id' });
          hwStore.createIndex('dueDate', 'dueDate', { unique: false });
          hwStore.createIndex('status', 'status', { unique: false });
        }

        // 3. Школьное расписание (по дням недели 1..6)
        if (!db.objectStoreNames.contains('school_timetable')) {
          db.createObjectStore('school_timetable', { keyPath: 'dayOfWeek' });
        }

        // 4. Темы ЕГЭ (Математика, Информатика, Русский)
        if (!db.objectStoreNames.contains('ege_topics')) {
          const egeStore = db.createObjectStore('ege_topics', { keyPath: 'id' });
          egeStore.createIndex('subject', 'subject', { unique: false });
        }

        // 5. Олимпиады
        if (!db.objectStoreNames.contains('olympiads')) {
          db.createObjectStore('olympiads', { keyPath: 'id' });
        }

        // 6. Проекты и хакатоны
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }

        // 7. Журнал изменений и отката перепланирования
        if (!db.objectStoreNames.contains('replan_history')) {
          const historyStore = db.createObjectStore('replan_history', { keyPath: 'id', autoIncrement: true });
          historyStore.createIndex('date', 'date', { unique: false });
        }

        // 8. Лог фактической активности для статистики
        if (!db.objectStoreNames.contains('activity_log')) {
          const actStore = db.createObjectStore('activity_log', { keyPath: 'id', autoIncrement: true });
          actStore.createIndex('date', 'date', { unique: false });
          actStore.createIndex('category', 'category', { unique: false });
        }
      };

      request.onsuccess = async (event) => {
        this.db = event.target.result;
        await this.checkAndSeedData();
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB Error:', event.target.error);
        reject(event.target.error);
      };
    });
  },

  /**
   * Получить транзакцию и хранилище
   */
  getStore(storeName, mode = 'readonly') {
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  },

  /**
   * Универсальные операции с IndexedDB
   */
  async get(storeName, key) {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName, 'readonly');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async getAll(storeName) {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName, 'readonly');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async put(storeName, value) {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName, 'readwrite');
      const req = store.put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async delete(storeName, key) {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName, 'readwrite');
      const req = store.delete(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async clearStore(storeName) {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName, 'readwrite');
      const req = store.clear();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  // ==========================================
  // НАСТРОЙКИ (LocalStorage)
  // ==========================================
  getSettings() {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (!saved) return { ...this.defaultSettings };
      return { ...this.defaultSettings, ...JSON.parse(saved) };
    } catch (e) {
      console.warn('Failed to parse settings from LocalStorage', e);
      return { ...this.defaultSettings };
    }
  },

  saveSettings(newSettings) {
    const merged = { ...this.getSettings(), ...newSettings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    return merged;
  },

  // ==========================================
  // МЕТОДЫ ДЛЯ СУЩНОСТЕЙ
  // ==========================================

  // Расписание дня
  async getDaySchedule(dateStr) {
    return await this.get('schedule_days', dateStr);
  },

  async saveDaySchedule(scheduleData) {
    return await this.put('schedule_days', scheduleData);
  },

  // Домашние задания
  async getAllHomework() {
    return await this.getAll('homework');
  },

  async addHomework(hw) {
    if (!hw.id) hw.id = 'hw_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    if (!hw.createdAt) hw.createdAt = new Date().toISOString();
    if (!hw.status) hw.status = 'pending';
    await this.put('homework', hw);
    return hw;
  },

  async updateHomework(hw) {
    await this.put('homework', hw);
    return hw;
  },

  async deleteHomework(id) {
    return await this.delete('homework', id);
  },

  // Школьное расписание
  async getSchoolTimetable() {
    return await this.getAll('school_timetable');
  },

  async saveDayTimetable(dayOfWeek, lessons) {
    return await this.put('school_timetable', { dayOfWeek, lessons });
  },

  // ЕГЭ Темы
  async getEgeTopics(subject = null) {
    const all = await this.getAll('ege_topics');
    if (!subject) return all;
    return all.filter(t => t.subject === subject);
  },

  async updateEgeTopic(topic) {
    return await this.put('ege_topics', topic);
  },

  // Олимпиады
  async getOlympiads() {
    return await this.getAll('olympiads');
  },

  async saveOlympiad(olympiad) {
    if (!olympiad.id) olympiad.id = 'oly_' + Date.now();
    return await this.put('olympiads', olympiad);
  },

  async deleteOlympiad(id) {
    return await this.delete('olympiads', id);
  },

  // Проекты
  async getProjects() {
    return await this.getAll('projects');
  },

  async saveProject(project) {
    if (!project.id) project.id = 'proj_' + Date.now();
    return await this.put('projects', project);
  },

  async deleteProject(id) {
    return await this.delete('projects', id);
  },

  // Логи активности
  async logActivity(entry) {
    const record = {
      ...entry,
      timestamp: entry.timestamp || new Date().toISOString(),
      date: entry.date || new Date().toISOString().split('T')[0]
    };
    return await this.put('activity_log', record);
  },

  async getActivityLogs(startDate, endDate) {
    const all = await this.getAll('activity_log');
    if (!startDate && !endDate) return all;
    return all.filter(item => {
      if (startDate && item.date < startDate) return false;
      if (endDate && item.date > endDate) return false;
      return true;
    });
  },

  // Журнал перепланирования & Откат
  async addReplanHistory(entry) {
    const record = {
      ...entry,
      timestamp: new Date().toISOString()
    };
    return await this.put('replan_history', record);
  },

  async getLastReplan(dateStr) {
    const all = await this.getAll('replan_history');
    const filtered = all.filter(r => r.date === dateStr);
    if (filtered.length === 0) return null;
    return filtered[filtered.length - 1];
  },

  async popLastReplan(dateStr) {
    const all = await this.getAll('replan_history');
    const filtered = all.filter(r => r.date === dateStr);
    if (filtered.length === 0) return null;
    const last = filtered[filtered.length - 1];
    await this.delete('replan_history', last.id);
    return last;
  },

  async getReplanHistory(dateStr) {
    const all = await this.getAll('replan_history');
    if (!dateStr) return all;
    return all.filter(r => r.date === dateStr);
  },

  // ==========================================
  // НАЧАЛЬНЫЕ ДАННЫЕ (SEED DATA)
  // ==========================================
  async checkAndSeedData() {
    const timetable = await this.getAll('school_timetable');
    if (timetable.length === 0) {
      console.log('Seeding initial LifeOS data...');
      await this.seedSchoolTimetable();
      await this.seedHomework();
      await this.seedEgeTopics();
      await this.seedOlympiads();
      await this.seedProjects();
    }
  },

  async seedSchoolTimetable() {
    // 1 - Понедельник (7 уроков, 08:00 - 14:35)
    await this.saveDayTimetable(1, [
      { lessonNumber: 1, subject: 'Разговоры о важном', startTime: '08:00', endTime: '08:45', room: '204', isExtra: false, isCanceled: false },
      { lessonNumber: 2, subject: 'Алгебра (профиль)', startTime: '08:55', endTime: '09:40', room: '204', isExtra: false, isCanceled: false },
      { lessonNumber: 3, subject: 'Алгебра (профиль)', startTime: '09:55', endTime: '10:40', room: '204', isExtra: false, isCanceled: false },
      { lessonNumber: 4, subject: 'Физика', startTime: '10:55', endTime: '11:40', room: '301', isExtra: false, isCanceled: false },
      { lessonNumber: 5, subject: 'Русский язык', startTime: '11:55', endTime: '12:40', room: '108', isExtra: false, isCanceled: false },
      { lessonNumber: 6, subject: 'Информатика', startTime: '12:55', endTime: '13:40', room: '210', isExtra: false, isCanceled: false },
      { lessonNumber: 7, subject: 'Обществознание', startTime: '13:50', endTime: '14:35', room: '206', isExtra: false, isCanceled: false }
    ]);

    // 2 - Вторник (8 уроков, 08:00 - 15:30 — 8-Й УРОК!)
    await this.saveDayTimetable(2, [
      { lessonNumber: 1, subject: 'Геометрия (профиль)', startTime: '08:00', endTime: '08:45', room: '204', isExtra: false, isCanceled: false },
      { lessonNumber: 2, subject: 'Геометрия (профиль)', startTime: '08:55', endTime: '09:40', room: '204', isExtra: false, isCanceled: false },
      { lessonNumber: 3, subject: 'Литература', startTime: '09:55', endTime: '10:40', room: '108', isExtra: false, isCanceled: false },
      { lessonNumber: 4, subject: 'Английский язык', startTime: '10:55', endTime: '11:40', room: '305', isExtra: false, isCanceled: false },
      { lessonNumber: 5, subject: 'Химия', startTime: '11:55', endTime: '12:40', room: '312', isExtra: false, isCanceled: false },
      { lessonNumber: 6, subject: 'История', startTime: '12:55', endTime: '13:40', room: '206', isExtra: false, isCanceled: false },
      { lessonNumber: 7, subject: 'Физическая культура', startTime: '13:50', endTime: '14:35', room: 'Спортзал', isExtra: false, isCanceled: false },
      { lessonNumber: 8, subject: '8-й урок: Профильный практикум ЕГЭ', startTime: '14:45', endTime: '15:30', room: '204', isExtra: true, isCanceled: false, notes: 'Обязательный дополнительный 8-й урок во вторник' }
    ]);

    // 3 - Среда (7 уроков, 08:00 - 14:35)
    await this.saveDayTimetable(3, [
      { lessonNumber: 1, subject: 'Информатика', startTime: '08:00', endTime: '08:45', room: '210', isExtra: false, isCanceled: false },
      { lessonNumber: 2, subject: 'Информатика', startTime: '08:55', endTime: '09:40', room: '210', isExtra: false, isCanceled: false },
      { lessonNumber: 3, subject: 'Физика', startTime: '09:55', endTime: '10:40', room: '301', isExtra: false, isCanceled: false },
      { lessonNumber: 4, subject: 'Алгебра (профиль)', startTime: '10:55', endTime: '11:40', room: '204', isExtra: false, isCanceled: false },
      { lessonNumber: 5, subject: 'Русский язык', startTime: '11:55', endTime: '12:40', room: '108', isExtra: false, isCanceled: false },
      { lessonNumber: 6, subject: 'Биология', startTime: '12:55', endTime: '13:40', room: '308', isExtra: false, isCanceled: false },
      { lessonNumber: 7, subject: 'ОБЗР', startTime: '13:50', endTime: '14:35', room: '102', isExtra: false, isCanceled: false }
    ]);

    // 4 - Четверг (8 уроков, 08:00 - 15:30 — 8-Й УРОК!)
    await this.saveDayTimetable(4, [
      { lessonNumber: 1, subject: 'Алгебра (профиль)', startTime: '08:00', endTime: '08:45', room: '204', isExtra: false, isCanceled: false },
      { lessonNumber: 2, subject: 'Алгебра (профиль)', startTime: '08:55', endTime: '09:40', room: '204', isExtra: false, isCanceled: false },
      { lessonNumber: 3, subject: 'Физика', startTime: '09:55', endTime: '10:40', room: '301', isExtra: false, isCanceled: false },
      { lessonNumber: 4, subject: 'Литература', startTime: '10:55', endTime: '11:40', room: '108', isExtra: false, isCanceled: false },
      { lessonNumber: 5, subject: 'Английский язык', startTime: '11:55', endTime: '12:40', room: '305', isExtra: false, isCanceled: false },
      { lessonNumber: 6, subject: 'География', startTime: '12:55', endTime: '13:40', room: '202', isExtra: false, isCanceled: false },
      { lessonNumber: 7, subject: 'Физическая культура', startTime: '13:50', endTime: '14:35', room: 'Спортзал', isExtra: false, isCanceled: false },
      { lessonNumber: 8, subject: '8-й урок: Олимпиадное программирование IT', startTime: '14:45', endTime: '15:30', room: '210', isExtra: true, isCanceled: false, notes: 'Обязательный дополнительный 8-й урок в четверг' }
    ]);

    // 5 - Пятница (7 уроков, 08:00 - 14:35)
    await this.saveDayTimetable(5, [
      { lessonNumber: 1, subject: 'Информатика', startTime: '08:00', endTime: '08:45', room: '210', isExtra: false, isCanceled: false },
      { lessonNumber: 2, subject: 'Информатика', startTime: '08:55', endTime: '09:40', room: '210', isExtra: false, isCanceled: false },
      { lessonNumber: 3, subject: 'Геометрия (профиль)', startTime: '09:55', endTime: '10:40', room: '204', isExtra: false, isCanceled: false },
      { lessonNumber: 4, subject: 'Русский язык', startTime: '10:55', endTime: '11:40', room: '108', isExtra: false, isCanceled: false },
      { lessonNumber: 5, subject: 'Физика', startTime: '11:55', endTime: '12:40', room: '301', isExtra: false, isCanceled: false },
      { lessonNumber: 6, subject: 'История', startTime: '12:55', endTime: '13:40', room: '206', isExtra: false, isCanceled: false },
      { lessonNumber: 7, subject: 'Классный час / Профориентация', startTime: '13:50', endTime: '14:35', room: '204', isExtra: false, isCanceled: false }
    ]);

    // 6 - Суббота (5 уроков, 08:00 - 12:40)
    await this.saveDayTimetable(6, [
      { lessonNumber: 1, subject: 'Математический практикум', startTime: '08:00', endTime: '08:45', room: '204', isExtra: false, isCanceled: false },
      { lessonNumber: 2, subject: 'Физический практикум', startTime: '08:55', endTime: '09:40', room: '301', isExtra: false, isCanceled: false },
      { lessonNumber: 3, subject: 'Родная литература', startTime: '09:55', endTime: '10:40', room: '108', isExtra: false, isCanceled: false },
      { lessonNumber: 4, subject: 'Обществознание', startTime: '10:55', endTime: '11:40', room: '206', isExtra: false, isCanceled: false },
      { lessonNumber: 5, subject: 'Элективный курс IT', startTime: '11:55', endTime: '12:40', room: '210', isExtra: false, isCanceled: false }
    ]);
  },

  async seedHomework() {
    const todayStr = '2026-11-23';
    const tomorrowStr = '2026-11-24';
    const dayAfterTomorrowStr = '2026-11-25';

    const items = [
      {
        id: 'hw_1',
        subject: 'Алгебра (профиль)',
        title: 'Решить вариант №12 (задания 13 и 15)',
        description: 'Тригонометрическое уравнение с отбором корней и логарифмическое неравенство с ОДЗ',
        dueDate: tomorrowStr,
        estimatedMinutes: 40,
        actualMinutes: null,
        difficulty: 3, // 1-легко, 2-средне, 3-сложно
        priority: 'high', // low, medium, high, critical
        required: true,
        status: 'pending',
        createdAt: todayStr
      },
      {
        id: 'hw_2',
        subject: 'Физика',
        title: 'Задачи 8.1–8.5 на импульс и энергию',
        description: 'Параграф 24, упр. 8 задачи 1, 2, 3, 5 на закон сохранения энергии',
        dueDate: tomorrowStr,
        estimatedMinutes: 30,
        actualMinutes: null,
        difficulty: 2,
        priority: 'medium',
        required: true,
        status: 'pending',
        createdAt: todayStr
      },
      {
        id: 'hw_3',
        subject: 'Русский язык',
        title: 'Выучить теорию и решить задания 9–12',
        description: 'Безударные гласные в корне слова, приставки ПРЕ/ПРИ, суффиксы и окончания глаголов',
        dueDate: dayAfterTomorrowStr,
        estimatedMinutes: 25,
        actualMinutes: null,
        difficulty: 2,
        priority: 'medium',
        required: true,
        status: 'pending',
        createdAt: todayStr
      },
      {
        id: 'hw_4',
        subject: 'Информатика',
        title: 'Код на Python для задачи 24 ЕГЭ',
        description: 'Поиск самой длинной непрерывной цепочки символов без сочетаний гласных',
        dueDate: dayAfterTomorrowStr,
        estimatedMinutes: 35,
        actualMinutes: null,
        difficulty: 3,
        priority: 'high',
        required: true,
        status: 'pending',
        createdAt: todayStr
      },
      {
        id: 'hw_5',
        subject: 'Английский язык',
        title: 'Составить 10 предложений (Conditionals)',
        description: 'Упражнение 4 на стр. 62 — Conditionals Type 2 & 3',
        dueDate: tomorrowStr,
        estimatedMinutes: 15,
        actualMinutes: null,
        difficulty: 1,
        priority: 'low',
        required: true,
        status: 'pending',
        createdAt: todayStr
      }
    ];

    for (const item of items) {
      await this.addHomework(item);
    }
  },

  async seedEgeTopics() {
    // 1. Профильная математика (Часть 1: 1-12, Часть 2: 13-19)
    const mathTopics = [
      { id: 'math_1', subject: 'math', part: 1, code: '№1', title: 'Планиметрия (треугольники, четырехугольники, окружность)', status: 'mastered', solvedCount: 42, correctCount: 39, mistakes: ['Ошибки при вычислении радиуса вписанной окружности'], plannedReviewDate: '2026-11-26' },
      { id: 'math_2', subject: 'math', part: 1, code: '№2', title: 'Векторы и координаты на плоскости', status: 'mastered', solvedCount: 30, correctCount: 29, mistakes: [], plannedReviewDate: '2026-11-28' },
      { id: 'math_3', subject: 'math', part: 1, code: '№3', title: 'Стереометрия базовые многогранники и тела вращения', status: 'in_progress', solvedCount: 25, correctCount: 20, mistakes: ['Объем усеченного конуса'], plannedReviewDate: '2026-11-24' },
      { id: 'math_4', subject: 'math', part: 1, code: '№4', title: 'Начала теории вероятностей (классическая)', status: 'mastered', solvedCount: 35, correctCount: 34, mistakes: [], plannedReviewDate: '2026-11-29' },
      { id: 'math_5', subject: 'math', part: 1, code: '№5', title: 'Сложная вероятность, формулы Бернулли и Байеса', status: 'in_progress', solvedCount: 28, correctCount: 22, mistakes: ['Дерево вероятностей в задачах с монетами'], plannedReviewDate: '2026-11-25' },
      { id: 'math_6', subject: 'math', part: 1, code: '№6', title: 'Простейшие уравнения (показательные, логарифмические, иррациональные)', status: 'mastered', solvedCount: 50, correctCount: 48, mistakes: [], plannedReviewDate: '2026-12-01' },
      { id: 'math_7', subject: 'math', part: 1, code: '№7', title: 'Вычисления и тригонометрические преобразования', status: 'mastered', solvedCount: 45, correctCount: 42, mistakes: ['Формулы приведения со сменой знака'], plannedReviewDate: '2026-11-27' },
      { id: 'math_8', subject: 'math', part: 1, code: '№8', title: 'Производная, касательная и геометрический смысл', status: 'mastered', solvedCount: 38, correctCount: 36, mistakes: [], plannedReviewDate: '2026-11-30' },
      { id: 'math_9', subject: 'math', part: 1, code: '№9', title: 'Прикладные задачи и вычисления по формулам', status: 'mastered', solvedCount: 40, correctCount: 39, mistakes: [], plannedReviewDate: '2026-12-02' },
      { id: 'math_10', subject: 'math', part: 1, code: '№10', title: 'Текстовые задачи (движение, совместная работа, сплавы)', status: 'in_progress', solvedCount: 32, correctCount: 26, mistakes: ['Задачи на круговое движение'], plannedReviewDate: '2026-11-25' },
      { id: 'math_11', subject: 'math', part: 1, code: '№11', title: 'Графики функций и определение коэффициентов', status: 'in_progress', solvedCount: 24, correctCount: 20, mistakes: ['Определение сдвига гиперболы'], plannedReviewDate: '2026-11-26' },
      { id: 'math_12', subject: 'math', part: 1, code: '№12', title: 'Наибольшее и наименьшее значение функции с производной', status: 'mastered', solvedCount: 36, correctCount: 33, mistakes: [], plannedReviewDate: '2026-11-28' },
      
      // ВТОРАЯ ЧАСТЬ
      { id: 'math_13', subject: 'math', part: 2, code: '№13', title: 'Уравнения: тригонометрия, замена переменной, отбор корней', status: 'in_progress', solvedCount: 35, correctCount: 28, mistakes: ['Отбор корней на тригонометрическом круге при ограничении ОДЗ'], plannedReviewDate: '2026-11-24' },
      { id: 'math_14', subject: 'math', part: 2, code: '№14', title: 'Стереометрия: сечения, угол и расстояние между прямыми/плоскостями', status: 'in_progress', solvedCount: 16, correctCount: 10, mistakes: ['Метод координат в наклонных призмах'], plannedReviewDate: '2026-11-26' },
      { id: 'math_15', subject: 'math', part: 2, code: '№15', title: 'Неравенства: метод рационализации, логарифмы, показательные', status: 'in_progress', solvedCount: 30, correctCount: 24, mistakes: ['Учет ОДЗ основания переменного логарифма'], plannedReviewDate: '2026-11-25' },
      { id: 'math_16', subject: 'math', part: 2, code: '№16', title: 'Экономическая задача: аннуитетные и дифференцированные платежи, оптимизация', status: 'in_progress', solvedCount: 20, correctCount: 16, mistakes: ['Составление таблицы остатков долга'], plannedReviewDate: '2026-11-27' },
      { id: 'math_17', subject: 'math', part: 2, code: '№17', title: 'Планиметрия сложная: теоремы Менелая, Чевы, вписанные углы', status: 'not_started', solvedCount: 8, correctCount: 4, mistakes: ['Построение вспомогательной окружности'], plannedReviewDate: '2026-11-29' },
      { id: 'math_18', subject: 'math', part: 2, code: '№18', title: 'Задачи с параметром: графический и аналитический методы', status: 'in_progress', solvedCount: 15, correctCount: 9, mistakes: ['Раскрытие модулей в плоскости (x; a)'], plannedReviewDate: '2026-11-28' },
      { id: 'math_19', subject: 'math', part: 2, code: '№19', title: 'Теория чисел: делимость, остатки, оценка плюс пример', status: 'in_progress', solvedCount: 14, correctCount: 10, mistakes: ['Пункт В: аккуратная оценка минимального значения'], plannedReviewDate: '2026-11-30' }
    ];

    // 2. Информатика
    const infoTopics = [
      { id: 'inf_1', subject: 'informatics', part: 1, code: '№1', title: 'Анализ графов и весовых матриц', status: 'mastered', solvedCount: 30, correctCount: 29, mistakes: [], plannedReviewDate: '2026-11-27' },
      { id: 'inf_2', subject: 'informatics', part: 1, code: '№2', title: 'Таблицы истинности логических функций в Python', status: 'mastered', solvedCount: 35, correctCount: 35, mistakes: [], plannedReviewDate: '2026-12-01' },
      { id: 'inf_5', subject: 'informatics', part: 1, code: '№5', title: 'Анализ и синтез двоичных алгоритмов автоматов', status: 'mastered', solvedCount: 28, correctCount: 27, mistakes: [], plannedReviewDate: '2026-11-26' },
      { id: 'inf_8', subject: 'informatics', part: 1, code: '№8', title: 'Комбинаторика и перестановки (itertools)', status: 'mastered', solvedCount: 34, correctCount: 32, mistakes: [], plannedReviewDate: '2026-11-28' },
      { id: 'inf_9', subject: 'informatics', part: 1, code: '№9', title: 'Электронные таблицы и числовые последовательности', status: 'in_progress', solvedCount: 20, correctCount: 18, mistakes: ['Условия повторения чисел в строке Excel/Python'], plannedReviewDate: '2026-11-25' },
      { id: 'inf_14', subject: 'informatics', part: 1, code: '№14', title: 'Позиционные системы счисления с переменным основанием', status: 'mastered', solvedCount: 32, correctCount: 31, mistakes: [], plannedReviewDate: '2026-11-29' },
      { id: 'inf_15', subject: 'informatics', part: 1, code: '№15', title: 'Поразрядная конъюнкция, отрезки и делимость', status: 'in_progress', solvedCount: 26, correctCount: 22, mistakes: ['Отрезки: границы полуинтервалов'], plannedReviewDate: '2026-11-25' },
      { id: 'inf_16', subject: 'informatics', part: 1, code: '№16', title: 'Вычисление значений рекурсивных функций (sys.setrecursionlimit)', status: 'mastered', solvedCount: 25, correctCount: 24, mistakes: [], plannedReviewDate: '2026-12-02' },
      { id: 'inf_19_21', subject: 'informatics', part: 1, code: '№19-21', title: 'Теория игр: одна и две кучи камней (рекурсивный анализ)', status: 'in_progress', solvedCount: 36, correctCount: 30, mistakes: ['Отличие неудачного первого хода Вани от любого хода'], plannedReviewDate: '2026-11-26' },
      { id: 'inf_24', subject: 'informatics', part: 1, code: '№24', title: 'Обработка символьных строк в файле на Python', status: 'in_progress', solvedCount: 22, correctCount: 17, mistakes: ['Динамическое окно и регулярные выражения'], plannedReviewDate: '2026-11-24' },
      { id: 'inf_25', subject: 'informatics', part: 1, code: '№25', title: 'Теория чисел, маски и поиск делителей', status: 'in_progress', solvedCount: 24, correctCount: 21, mistakes: ['Эффективный поиск до sqrt(N)'], plannedReviewDate: '2026-11-26' },
      { id: 'inf_26', subject: 'informatics', part: 1, code: '№26', title: 'Жадные алгоритмы, сортировка и обработка больших массивов', status: 'in_progress', solvedCount: 18, correctCount: 13, mistakes: ['Оптимальное расписание мероприятий'], plannedReviewDate: '2026-11-27' },
      { id: 'inf_27', subject: 'informatics', part: 1, code: '№27', title: 'Анализ биоданных, кластеризация и центроиды', status: 'not_started', solvedCount: 8, correctCount: 4, mistakes: ['Алгоритм K-Means и вычисление расстояния'], plannedReviewDate: '2026-11-30' }
    ];

    // 3. Русский язык
    const rusTopics = [
      { id: 'rus_9_12', subject: 'russian', part: 1, code: '№9-12', title: 'Орфография: корни, приставки, суффиксы и личные окончания', status: 'in_progress', solvedCount: 45, correctCount: 38, mistakes: ['Спряжения глаголов-исключений (стелить, брить, клеить)'], plannedReviewDate: '2026-11-24' },
      { id: 'rus_13_15', subject: 'russian', part: 1, code: '№13-15', title: 'Правописание НЕ/НИ, слитное/раздельное/дефисное, Н и НН', status: 'in_progress', solvedCount: 38, correctCount: 32, mistakes: ['Краткие причастия vs отглагольные прилагательные'], plannedReviewDate: '2026-11-25' },
      { id: 'rus_7_8', subject: 'russian', part: 1, code: '№7-8', title: 'Грамматические нормы и синтаксические ошибки', status: 'mastered', solvedCount: 30, correctCount: 28, mistakes: ['Деепричастный оборот'], plannedReviewDate: '2026-11-29' },
      { id: 'rus_16_21', subject: 'russian', part: 1, code: '№16-21', title: 'Пунктуация: сложносочиненные, сложноподчиненные, обособления, тире и двоеточие', status: 'in_progress', solvedCount: 40, correctCount: 33, mistakes: ['Задание 21: правила постановки тире'], plannedReviewDate: '2026-11-26' },
      { id: 'rus_27', subject: 'russian', part: 2, code: '№27', title: 'Сочинение-рассуждение: формулировка проблемы, связка-анализ, позиция автора', status: 'in_progress', solvedCount: 6, correctCount: 5, mistakes: ['Логический переход между двумя иллюстрациями из текста'], plannedReviewDate: '2026-11-28' }
    ];

    for (const t of [...mathTopics, ...infoTopics, ...rusTopics]) {
      await this.updateEgeTopic(t);
    }
  },

  async seedOlympiads() {
    await this.saveOlympiad({
      id: 'oly_1',
      title: 'ВсОШ по информатике (Муниципальный этап)',
      subject: 'Информатика',
      stage: 'Муниципальный этап',
      date: '2026-12-05',
      prepTasksCount: 40,
      solvedCount: 28,
      targetPrize: 'Призёр / Победитель',
      notes: 'Отработать динамическое программирование и графовые задачи',
      status: 'active'
    });

    await this.saveOlympiad({
      id: 'oly_2',
      title: 'ВсОШ по математике (Муниципальный этап)',
      subject: 'Математика',
      stage: 'Муниципальный этап',
      date: '2026-12-14',
      prepTasksCount: 30,
      solvedCount: 19,
      targetPrize: 'Призёр',
      notes: 'Геометрия и теория чисел повышенного уровня',
      status: 'active'
    });
  },

  async seedProjects() {
    await this.saveProject({
      id: 'proj_mirosborka',
      title: 'Миросборка',
      description: 'Главный проект: Интеллектуальная система управления, автоматизации и прототипирования для предстоящего хакатона.',
      deadline: '2026-11-27', // Хакатон 27 ноября 2026 года!
      status: 'active',
      priority: 'active',
      isMain: true,
      stages: [
        { name: 'Проектирование системной архитектуры', done: true },
        { name: 'Разработка ядра и алгоритмического модуля', done: true },
        { name: 'Сборка клиентского интерфейса и тестирование', done: false },
        { name: 'Финальная полировка, питч и демонстрационный стенд', done: false }
      ],
      tasks: [
        { id: 'pt_1', text: 'Завершить модуль агрегации метрик', done: true },
        { id: 'pt_2', text: 'Провести нагрузочное тестирование сценариев', done: false },
        { id: 'pt_3', text: 'Подготовить презентационный слайд-дек к защите 27 ноября', done: false }
      ]
    });
  },

  // ==========================================
  // ЭКСПОРТ И ИМПОРТ ДАННЫХ
  // ==========================================
  async exportAllData() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: this.getSettings(),
      schedule_days: await this.getAll('schedule_days'),
      homework: await this.getAll('homework'),
      school_timetable: await this.getAll('school_timetable'),
      ege_topics: await this.getAll('ege_topics'),
      olympiads: await this.getAll('olympiads'),
      projects: await this.getAll('projects'),
      replan_history: await this.getAll('replan_history'),
      activity_log: await this.getAll('activity_log')
    };
    return JSON.stringify(data, null, 2);
  },

  async importAllData(jsonString) {
    let data;
    try {
      data = JSON.parse(jsonString);
    } catch (e) {
      throw new Error('Некорректный формат JSON');
    }

    if (!data.schedule_days && !data.homework && !data.school_timetable) {
      throw new Error('Файл не содержит валидных данных LifeOS');
    }

    // Сохраняем настройки
    if (data.settings) {
      this.saveSettings(data.settings);
    }

    // Очищаем существующие таблицы
    await this.clearStore('schedule_days');
    await this.clearStore('homework');
    await this.clearStore('school_timetable');
    await this.clearStore('ege_topics');
    await this.clearStore('olympiads');
    await this.clearStore('projects');
    await this.clearStore('replan_history');
    await this.clearStore('activity_log');

    // Наполняем импортированными данными
    if (Array.isArray(data.schedule_days)) {
      for (const item of data.schedule_days) await this.put('schedule_days', item);
    }
    if (Array.isArray(data.homework)) {
      for (const item of data.homework) await this.put('homework', item);
    }
    if (Array.isArray(data.school_timetable)) {
      for (const item of data.school_timetable) await this.put('school_timetable', item);
    }
    if (Array.isArray(data.ege_topics)) {
      for (const item of data.ege_topics) await this.put('ege_topics', item);
    }
    if (Array.isArray(data.olympiads)) {
      for (const item of data.olympiads) await this.put('olympiads', item);
    }
    if (Array.isArray(data.projects)) {
      for (const item of data.projects) await this.put('projects', item);
    }
    if (Array.isArray(data.replan_history)) {
      for (const item of data.replan_history) await this.put('replan_history', item);
    }
    if (Array.isArray(data.activity_log)) {
      for (const item of data.activity_log) await this.put('activity_log', item);
    }

    return true;
  },

  async resetToDefaults() {
    localStorage.removeItem(SETTINGS_KEY);
    await this.clearStore('schedule_days');
    await this.clearStore('homework');
    await this.clearStore('school_timetable');
    await this.clearStore('ege_topics');
    await this.clearStore('olympiads');
    await this.clearStore('projects');
    await this.clearStore('replan_history');
    await this.clearStore('activity_log');
    await this.checkAndSeedData();
    return true;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Database;
}
