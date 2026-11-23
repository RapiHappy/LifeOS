/**
 * LifeOS — Модуль базы данных (database.js v1.1)
 * Обеспечивает надёжное локальное хранение данных в IndexedDB + LocalStorage.
 * Полностью чистый старт: никаких выдуманных выполненных задач и фальшивых процентов.
 * Предусмотрен изолированный демонстрационный режим (Demo Mode) с безопасной очисткой.
 */

// Поддержка TimeUtils как в браузере, так и в Node.js
const _TimeUtilsDB = (typeof globalThis !== 'undefined' && typeof globalThis.TimeUtils !== 'undefined')
  ? globalThis.TimeUtils
  : (typeof require !== 'undefined' ? require('./time.js') : null);

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
    aiEndpoint: '', // URL безопасного прокси (Cloudflare Worker)
    isDemoMode: false
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

  getStore(storeName, mode = 'readonly') {
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  },

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
      if (typeof localStorage === 'undefined') return { ...this.defaultSettings };
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (!saved) return { ...this.defaultSettings };
      const parsed = JSON.parse(saved);
      // Удаляем секретные ключи, если они случайно остались в старой версии
      if (parsed.aiApiKey) delete parsed.aiApiKey;
      return { ...this.defaultSettings, ...parsed };
    } catch (e) {
      console.warn('Failed to parse settings from LocalStorage', e);
      return { ...this.defaultSettings };
    }
  },

  saveSettings(newSettings) {
    const sanitized = { ...newSettings };
    if (sanitized.aiApiKey) delete sanitized.aiApiKey; // Безопасность: не хранить API-ключ в LocalStorage
    const merged = { ...this.getSettings(), ...sanitized };
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    }
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
    if (!hw.createdAt) {
      hw.createdAt = _TimeUtilsDB ? _TimeUtilsDB.getTodayStr() : new Date().toISOString().split('T')[0];
    }
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
    const today = _TimeUtilsDB ? _TimeUtilsDB.getTodayStr() : new Date().toISOString().split('T')[0];
    const record = {
      ...entry,
      timestamp: entry.timestamp || new Date().toISOString(),
      date: entry.date || today
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
  // НАЧАЛЬНЫЕ ДАННЫЕ (ЧИСТЫЙ СТАРТ БЕЗ ФЕЙКОВ)
  // ==========================================
  async checkAndSeedData() {
    const timetable = await this.getAll('school_timetable');
    const topics = await this.getAll('ege_topics');

    // Если таблица тем пуста, инициализируем чистый кодификатор
    if (topics.length === 0) {
      await this.seedCleanEgeTopics();
    }

    // Если расписание пусто, инициализируем базовый шаблон 10 класса
    if (timetable.length === 0) {
      await this.seedRealisticSchoolTimetable();
    }

    const projects = await this.getAll('projects');
    if (projects.length === 0) {
      await this.seedCleanProjects();
    }

    const olympiads = await this.getAll('olympiads');
    if (olympiads.length === 0) {
      await this.seedCleanOlympiads();
    }
  },

  /**
   * Проверка на наличие старых демонстрационных данных v1.0
   * @returns {Promise<boolean>}
   */
  async hasLegacyDemoData() {
    const math1 = await this.get('ege_topics', 'math_1');
    if (math1 && (math1.solvedCount > 0 || math1.status === 'mastered')) {
      return true;
    }
    const hwList = await this.getAll('homework');
    if (hwList.some(h => h.id === 'hw_1' && h.title.includes('Решить вариант №12'))) {
      return true;
    }
    return false;
  },

  /**
   * Чистый сброс до нулевого прогресса с предварительным бэкапом
   */
  async cleanToZeroState() {
    // 1. Создаем резервную копию перед сбросом
    const backupJson = await this.exportAllData();

    // 2. Очищаем фальшивые данные
    await this.clearStore('homework'); // чистый список ДЗ
    await this.clearStore('activity_log'); // чистые логи
    await this.clearStore('replan_history');
    await this.clearStore('schedule_days');

    // 3. Переинициализируем темы ЕГЭ на чистые нули
    await this.clearStore('ege_topics');
    await this.seedCleanEgeTopics();

    // 4. Переинициализируем проекты и олимпиады без фальшивых галочек
    await this.clearStore('projects');
    await this.seedCleanProjects();

    await this.clearStore('olympiads');
    await this.seedCleanOlympiads();

    this.saveSettings({ isDemoMode: false });
    return backupJson;
  },

  /**
   * Реалистичное школьное расписание для 10 класса (уроки заканчиваются в ~13:40, 8-е уроки во Вт и Чт)
   */
  async seedRealisticSchoolTimetable() {
    // 1 - Понедельник (6 уроков, 08:00 - 13:40)
    await this.saveDayTimetable(1, [
      { lessonNumber: 1, subject: 'Разговоры о важном', startTime: '08:00', endTime: '08:45', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 2, subject: 'Алгебра (профиль)', startTime: '08:55', endTime: '09:40', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 3, subject: 'Алгебра (профиль)', startTime: '09:55', endTime: '10:40', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 4, subject: 'Физика', startTime: '10:55', endTime: '11:40', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 5, subject: 'Русский язык', startTime: '11:55', endTime: '12:40', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 6, subject: 'Информатика', startTime: '12:55', endTime: '13:40', room: '', isExtra: false, isCanceled: false }
    ]);

    // 2 - Вторник (6 основных уроков + 8-й урок дополнительный, до 15:30)
    await this.saveDayTimetable(2, [
      { lessonNumber: 1, subject: 'Геометрия (профиль)', startTime: '08:00', endTime: '08:45', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 2, subject: 'Геометрия (профиль)', startTime: '08:55', endTime: '09:40', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 3, subject: 'Литература', startTime: '09:55', endTime: '10:40', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 4, subject: 'Английский язык', startTime: '10:55', endTime: '11:40', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 5, subject: 'Химия', startTime: '11:55', endTime: '12:40', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 6, subject: 'История', startTime: '12:55', endTime: '13:40', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 8, subject: '8-й урок: Профильный практикум ЕГЭ', startTime: '14:45', endTime: '15:30', room: '', isExtra: true, isCanceled: false, notes: 'Дополнительное занятие во вторник' }
    ]);

    // 3 - Среда (6 уроков, 08:00 - 13:40)
    await this.saveDayTimetable(3, [
      { lessonNumber: 1, subject: 'Информатика', startTime: '08:00', endTime: '08:45', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 2, subject: 'Информатика', startTime: '08:55', endTime: '09:40', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 3, subject: 'Физика', startTime: '09:55', endTime: '10:40', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 4, subject: 'Алгебра (профиль)', startTime: '10:55', endTime: '11:40', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 5, subject: 'Русский язык', startTime: '11:55', endTime: '12:40', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 6, subject: 'Биология', startTime: '12:55', endTime: '13:40', room: '', isExtra: false, isCanceled: false }
    ]);

    // 4 - Четверг (6 основных уроков + 8-й урок, до 15:30)
    await this.saveDayTimetable(4, [
      { lessonNumber: 1, subject: 'Алгебра (профиль)', startTime: '08:00', endTime: '08:45', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 2, subject: 'Алгебра (профиль)', startTime: '08:55', endTime: '09:40', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 3, subject: 'Физика', startTime: '09:55', endTime: '10:40', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 4, subject: 'Литература', startTime: '10:55', endTime: '11:40', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 5, subject: 'Английский язык', startTime: '11:55', endTime: '12:40', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 6, subject: 'Обществознание', startTime: '12:55', endTime: '13:40', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 8, subject: '8-й урок: Олимпиадный IT-практикум', startTime: '14:45', endTime: '15:30', room: '', isExtra: true, isCanceled: false, notes: 'Дополнительное занятие в четверг' }
    ]);

    // 5 - Пятница (6 уроков, 08:00 - 13:40)
    await this.saveDayTimetable(5, [
      { lessonNumber: 1, subject: 'Информатика', startTime: '08:00', endTime: '08:45', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 2, subject: 'Информатика', startTime: '08:55', endTime: '09:40', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 3, subject: 'Геометрия (профиль)', startTime: '09:55', endTime: '10:40', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 4, subject: 'Русский язык', startTime: '10:55', endTime: '11:40', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 5, subject: 'Физика', startTime: '11:55', endTime: '12:40', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 6, subject: 'История', startTime: '12:55', endTime: '13:40', room: '', isExtra: false, isCanceled: false }
    ]);

    // 6 - Суббота (5 уроков, 08:00 - 12:40)
    await this.saveDayTimetable(6, [
      { lessonNumber: 1, subject: 'Математический практикум', startTime: '08:00', endTime: '08:45', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 2, subject: 'Физический практикум', startTime: '08:55', endTime: '09:40', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 3, subject: 'Родная литература', startTime: '09:55', endTime: '10:40', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 4, subject: 'География', startTime: '10:55', endTime: '11:40', room: '', isExtra: false, isCanceled: false },
      { lessonNumber: 5, subject: 'ОБЗР', startTime: '11:55', endTime: '12:40', room: '', isExtra: false, isCanceled: false }
    ]);
  },

  /**
   * Чистый кодификатор тем ЕГЭ (все статусы not_started, решено 0, верных 0)
   */
  async seedCleanEgeTopics() {
    // 1. Профильная математика (Часть 1: 1-12, Часть 2: 13-19)
    const mathTopics = [
      { id: 'math_1', subject: 'math', part: 1, code: '№1', title: 'Планиметрия (треугольники, четырехугольники, окружность)', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'math_2', subject: 'math', part: 1, code: '№2', title: 'Векторы и координаты на плоскости', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'math_3', subject: 'math', part: 1, code: '№3', title: 'Стереометрия базовые многогранники и тела вращения', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'math_4', subject: 'math', part: 1, code: '№4', title: 'Начала теории вероятностей (классическая)', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'math_5', subject: 'math', part: 1, code: '№5', title: 'Сложная вероятность, формулы Бернулли и Байеса', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'math_6', subject: 'math', part: 1, code: '№6', title: 'Простейшие уравнения (показательные, логарифмические, иррациональные)', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'math_7', subject: 'math', part: 1, code: '№7', title: 'Вычисления и тригонометрические преобразования', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'math_8', subject: 'math', part: 1, code: '№8', title: 'Производная, касательная и геометрический смысл', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'math_9', subject: 'math', part: 1, code: '№9', title: 'Прикладные задачи и вычисления по формулам', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'math_10', subject: 'math', part: 1, code: '№10', title: 'Текстовые задачи (движение, совместная работа, сплавы)', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'math_11', subject: 'math', part: 1, code: '№11', title: 'Графики функций и определение коэффициентов', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'math_12', subject: 'math', part: 1, code: '№12', title: 'Наибольшее и наименьшее значение функции с производной', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      
      // ВТОРАЯ ЧАСТЬ (Задания 13-19)
      { id: 'math_13', subject: 'math', part: 2, code: '№13', title: 'Уравнения: тригонометрия, замена переменной, отбор корней', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'math_14', subject: 'math', part: 2, code: '№14', title: 'Стереометрия: сечения, угол и расстояние между прямыми/плоскостями', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'math_15', subject: 'math', part: 2, code: '№15', title: 'Неравенства: метод рационализации, логарифмы, показательные', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'math_16', subject: 'math', part: 2, code: '№16', title: 'Экономическая задача: аннуитетные и дифференцированные платежи, оптимизация', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'math_17', subject: 'math', part: 2, code: '№17', title: 'Планиметрия сложная: теоремы Менелая, Чевы, вписанные углы', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'math_18', subject: 'math', part: 2, code: '№18', title: 'Задачи с параметром: графический и аналитический методы', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'math_19', subject: 'math', part: 2, code: '№19', title: 'Теория чисел: делимость, остатки, оценка плюс пример', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null }
    ];

    // 2. Информатика (КЕГЭ 1-27)
    const infoTopics = [
      { id: 'inf_1', subject: 'informatics', part: 1, code: '№1', title: 'Анализ графов и весовых матриц', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'inf_2', subject: 'informatics', part: 1, code: '№2', title: 'Таблицы истинности логических функций в Python', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'inf_5', subject: 'informatics', part: 1, code: '№5', title: 'Анализ и синтез двоичных алгоритмов автоматов', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'inf_8', subject: 'informatics', part: 1, code: '№8', title: 'Комбинаторика и перестановки (itertools)', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'inf_9', subject: 'informatics', part: 1, code: '№9', title: 'Электронные таблицы и числовые последовательности', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'inf_14', subject: 'informatics', part: 1, code: '№14', title: 'Позиционные системы счисления с переменным основанием', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'inf_15', subject: 'informatics', part: 1, code: '№15', title: 'Поразрядная конъюнкция, отрезки и делимость', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'inf_16', subject: 'informatics', part: 1, code: '№16', title: 'Вычисление значений рекурсивных функций', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'inf_19_21', subject: 'informatics', part: 1, code: '№19-21', title: 'Теория игр: одна и две кучи камней (рекурсивный анализ)', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'inf_24', subject: 'informatics', part: 1, code: '№24', title: 'Обработка символьных строк в файле на Python', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'inf_25', subject: 'informatics', part: 1, code: '№25', title: 'Теория чисел, маски и поиск делителей', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'inf_26', subject: 'informatics', part: 1, code: '№26', title: 'Жадные алгоритмы, сортировка и обработка больших массивов', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'inf_27', subject: 'informatics', part: 1, code: '№27', title: 'Анализ биоданных, кластеризация и центроиды', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null }
    ];

    // 3. Русский язык
    const rusTopics = [
      { id: 'rus_9_12', subject: 'russian', part: 1, code: '№9-12', title: 'Орфография: корни, приставки, суффиксы и личные окончания', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'rus_13_15', subject: 'russian', part: 1, code: '№13-15', title: 'Правописание НЕ/НИ, слитное/раздельное/дефисное, Н и НН', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'rus_7_8', subject: 'russian', part: 1, code: '№7-8', title: 'Грамматические нормы и синтаксические ошибки', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'rus_16_21', subject: 'russian', part: 1, code: '№16-21', title: 'Пунктуация: сложносочиненные, сложноподчиненные, обособления, тире и двоеточие', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null },
      { id: 'rus_27', subject: 'russian', part: 2, code: '№27', title: 'Сочинение-рассуждение: формулировка проблемы, связка-анализ, позиция автора', status: 'not_started', solvedCount: 0, correctCount: 0, mistakes: [], plannedReviewDate: null }
    ];

    for (const t of [...mathTopics, ...infoTopics, ...rusTopics]) {
      await this.updateEgeTopic(t);
    }
  },

  async seedCleanOlympiads() {
    await this.saveOlympiad({
      id: 'oly_1',
      title: 'ВсОШ по информатике (Муниципальный этап)',
      subject: 'Информатика',
      stage: 'Муниципальный этап',
      date: '2026-12-05',
      prepTasksCount: 30,
      solvedCount: 0,
      targetPrize: 'Призёр / Победитель',
      notes: '',
      status: 'active'
    });

    await this.saveOlympiad({
      id: 'oly_2',
      title: 'ВсОШ по математике (Муниципальный этап)',
      subject: 'Математика',
      stage: 'Муниципальный этап',
      date: '2026-12-14',
      prepTasksCount: 30,
      solvedCount: 0,
      targetPrize: 'Призёр',
      notes: '',
      status: 'active'
    });
  },

  async seedCleanProjects() {
    await this.saveProject({
      id: 'proj_mirosborka',
      title: 'Миросборка',
      description: 'Проект для хакатона 27 ноября 2026 года.',
      deadline: '2026-11-27',
      status: 'active',
      priority: 'active',
      isMain: true,
      stages: [
        { name: 'Проектирование системной архитектуры', done: false },
        { name: 'Разработка прототипа ядра', done: false },
        { name: 'Сборка клиентского интерфейса и тестирование', done: false },
        { name: 'Финальная полировка, питч и демонстрация', done: false }
      ],
      tasks: [
        { id: 'pt_1', text: 'Подготовить каркас проекта', done: false },
        { id: 'pt_2', text: 'Провести первичное тестирование сценариев', done: false },
        { id: 'pt_3', text: 'Подготовить презентационный слайд-дек к защите 27 ноября', done: false }
      ]
    });
  },

  /**
   * Загрузка демонстрационных данных (Demo Mode)
   */
  async loadDemoData() {
    const today = _TimeUtilsDB ? _TimeUtilsDB.getTodayStr() : new Date().toISOString().split('T')[0];
    const tomorrow = _TimeUtilsDB ? _TimeUtilsDB.getTomorrowStr(today) : '2026-11-24';

    // Демо-домашка
    await this.addHomework({
      id: 'demo_hw_1',
      subject: 'Алгебра (профиль)',
      title: 'Демо: Задания 13 и 15 (уравнения и неравенства)',
      description: 'Отработка отбора корней и метода рационализации',
      dueDate: tomorrow,
      estimatedMinutes: 40,
      actualMinutes: null,
      difficulty: 3,
      priority: 'high',
      required: true,
      status: 'pending',
      createdAt: today
    });

    await this.addHomework({
      id: 'demo_hw_2',
      subject: 'Физика',
      title: 'Демо: Законы сохранения импульса',
      description: 'Задачи на упругие соударения',
      dueDate: tomorrow,
      estimatedMinutes: 30,
      actualMinutes: null,
      difficulty: 2,
      priority: 'medium',
      required: true,
      status: 'pending',
      createdAt: today
    });

    this.saveSettings({ isDemoMode: true });
    return true;
  },

  // ==========================================
  // ЭКСПОРТ И ИМПОРТ ДАННЫХ
  // ==========================================
  async exportAllData() {
    const data = {
      version: 1.1,
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
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SETTINGS_KEY);
    }
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
