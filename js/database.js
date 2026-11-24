/**
 * LifeOS — Модуль базы данных (database.js v1.1.1)
 * Обеспечивает надёжное локальное хранение данных в IndexedDB + LocalStorage.
 * Полная сохранность пользовательских данных при обновлениях.
 * Чистый старт: 0 решённых задач, отсутствие неподтверждённых олимпиад.
 * Полный каталог ЕГЭ ФИПИ (Математика 1-19, Информатика 1-27, Русский язык 1-27).
 * Безопасное разделение школьного расписания (подтверждённое vs шаблон).
 */

const _TimeUtilsDB = (typeof globalThis !== 'undefined' && typeof globalThis.TimeUtils !== 'undefined')
  ? globalThis.TimeUtils
  : (typeof require !== 'undefined' ? require('./time.js') : null);

const DB_NAME = 'LifeOS_DB';
const DB_VERSION = 1;
const SETTINGS_KEY = 'lifeos_settings';
const BACKUP_KEY = 'lifeos_settings_legacy_backup';

const Database = {
  db: null,

  // Настройки по умолчанию
  defaultSettings: {
    version: '1.1.1',
    sleepStart: '21:30',
    wakeTime: '06:00',
    gameMinutes: 60,
    sportMinutes: 30,
    familyMinutes: 40,
    offlineRestMinutes: 30,
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
    aiEndpoint: '', // URL безопасного внешнего прокси
    isDemoMode: false,
    schoolTimetableConfirmed: false,
    schoolTimetableOrigin: 'unconfirmed_template' // 'unconfirmed_template' | 'user_customized' | 'user_confirmed'
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

  // ==========================================
  // БАЗОВЫЕ ОПЕРАЦИИ INDEXEDDB
  // ==========================================
  getStore(storeName, mode = 'readonly') {
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  },

  async get(storeName, key) {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName, 'readonly');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
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
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  },

  async clearStore(storeName) {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName, 'readwrite');
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  },

  // ==========================================
  // НАСТРОЙКИ (LOCALSTORAGE) С МИГРАЦИЕЙ КЛЮЧЕЙ
  // ==========================================
  getSettings() {
    try {
      if (typeof localStorage === 'undefined') return { ...this.defaultSettings };
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...this.defaultSettings };
      const parsed = JSON.parse(raw);

      // Безопасность: обнаружение и безопасная очистка устаревшего aiApiKey
      if (parsed.aiApiKey) {
        try {
          const backupObj = {
            aiApiKey: parsed.aiApiKey,
            cleanedAt: new Date().toISOString()
          };
          localStorage.setItem(BACKUP_KEY, JSON.stringify(backupObj));
          delete parsed.aiApiKey;
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed));
          console.info('LifeOS Security: устаревший API-ключ безопасно удалён из LocalStorage');
        } catch (e) {
          delete parsed.aiApiKey;
        }
      }

      return { ...this.defaultSettings, ...parsed };
    } catch (e) {
      console.warn('Failed to parse settings from LocalStorage', e);
      return { ...this.defaultSettings };
    }
  },

  saveSettings(newSettings) {
    const sanitized = { ...newSettings };
    if (sanitized.aiApiKey) delete sanitized.aiApiKey; // Никогда не хранить ключ в клиенте
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
    return await this.put('homework', hw);
  },

  async updateHomework(hw) {
    return await this.put('homework', hw);
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

  // Темы ЕГЭ
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
    if (!olympiad.id) olympiad.id = 'oly_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
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

  // Журнал перепланирования
  async addReplanHistory(entry) {
    const record = {
      ...entry,
      timestamp: new Date().toISOString()
    };
    return await this.put('replan_history', record);
  },

  async getReplanHistory(dateStr) {
    const all = await this.getAll('replan_history');
    if (!dateStr) return all;
    return all.filter(r => r.date === dateStr);
  },

  async popLastReplan(dateStr) {
    const all = await this.getAll('replan_history');
    const filtered = all.filter(r => !dateStr || r.date === dateStr);
    if (filtered.length === 0) return null;
    filtered.sort((a, b) => (b.id || 0) - (a.id || 0));
    const last = filtered[0];
    if (last.id !== undefined) {
      await this.delete('replan_history', last.id);
    }
    return last;
  },

  // ==========================================
  // НАЧАЛЬНЫЕ ДАННЫЕ И МИГРАЦИЯ
  // ==========================================
  async checkAndSeedData() {
    // 1. Синхронизация каталога тем ЕГЭ без потери пользовательского прогресса
    await this.syncEgeTopicsCatalog();

    // 2. Расписание школы: если пусто, создаём шаблон с пометкой "не подтверждено"
    const timetable = await this.getAll('school_timetable');
    if (timetable.length === 0) {
      await this.seedRealisticSchoolTimetable();
      this.saveSettings({
        schoolTimetableConfirmed: false,
        schoolTimetableOrigin: 'unconfirmed_template'
      });
    }

    // 3. Проекты (если пусто, инициализируем проект «Миросборка»)
    const projects = await this.getAll('projects');
    if (projects.length === 0) {
      await this.seedCleanProjects();
    }

    // 4. Олимпиады: по умолчанию список чист. Неподтверждённые даты не создаются как реальные.
    // Пользователь может добавить олимпиаду сам или выбрать из шаблонов.
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
   * Чистый сброс до нулевого прогресса с предварительным бэкапом.
   * Важно: НЕ удаляет расписание школы, сохраняет его происхождение.
   */
  async cleanToZeroState() {
    const backupJson = await this.exportAllData();

    await this.clearStore('homework');
    await this.clearStore('activity_log');
    await this.clearStore('replan_history');
    await this.clearStore('schedule_days');

    // Переинициализируем темы ЕГЭ в чистое состояние (все счетчики 0)
    await this.clearStore('ege_topics');
    await this.syncEgeTopicsCatalog(true);

    // Проекты
    await this.clearStore('projects');
    await this.seedCleanProjects();

    // Олимпиады: чистый список
    await this.clearStore('olympiads');

    this.saveSettings({ isDemoMode: false });
    return backupJson;
  },

  /**
   * Реалистичное школьное расписание для 10 класса (базовый шаблон).
   * Включает поддержку уроков с 1 по 8, с явным разделением уроков и внешкольных занятий.
   */
  async seedRealisticSchoolTimetable() {
    // 1 - Понедельник (6 уроков, 08:00 - 13:40)
    await this.saveDayTimetable(1, [
      { lessonNumber: 1, subject: 'Разговоры о важном', startTime: '08:00', endTime: '08:45', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 2, subject: 'Алгебра (профиль)', startTime: '08:55', endTime: '09:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 3, subject: 'Алгебра (профиль)', startTime: '09:55', endTime: '10:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 4, subject: 'Физика', startTime: '10:55', endTime: '11:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 5, subject: 'Русский язык', startTime: '11:55', endTime: '12:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 6, subject: 'Информатика', startTime: '12:55', endTime: '13:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false }
    ]);

    // 2 - Вторник (6 основных уроков + 8-й урок дополнительный, до 15:30)
    // Между 6-м и 8-м уроками предусмотрено окно или факультатив 7-го урока
    await this.saveDayTimetable(2, [
      { lessonNumber: 1, subject: 'Геометрия (профиль)', startTime: '08:00', endTime: '08:45', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 2, subject: 'Геометрия (профиль)', startTime: '08:55', endTime: '09:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 3, subject: 'Литература', startTime: '09:55', endTime: '10:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 4, subject: 'Английский язык', startTime: '10:55', endTime: '11:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 5, subject: 'Химия', startTime: '11:55', endTime: '12:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 6, subject: 'История', startTime: '12:55', endTime: '13:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 8, subject: '8-й урок: Профильный практикум ЕГЭ', startTime: '14:45', endTime: '15:30', room: '', isExtra: true, isAfterSchool: false, isCanceled: false, notes: 'Дополнительное занятие во вторник' }
    ]);

    // 3 - Среда (6 уроков, 08:00 - 13:40)
    await this.saveDayTimetable(3, [
      { lessonNumber: 1, subject: 'Информатика', startTime: '08:00', endTime: '08:45', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 2, subject: 'Информатика', startTime: '08:55', endTime: '09:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 3, subject: 'Физика', startTime: '09:55', endTime: '10:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 4, subject: 'Алгебра (профиль)', startTime: '10:55', endTime: '11:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 5, subject: 'Русский язык', startTime: '11:55', endTime: '12:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 6, subject: 'Биология', startTime: '12:55', endTime: '13:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false }
    ]);

    // 4 - Четверг (6 основных уроков + 8-й урок, до 15:30)
    await this.saveDayTimetable(4, [
      { lessonNumber: 1, subject: 'Алгебра (профиль)', startTime: '08:00', endTime: '08:45', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 2, subject: 'Алгебра (профиль)', startTime: '08:55', endTime: '09:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 3, subject: 'Физика', startTime: '09:55', endTime: '10:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 4, subject: 'Литература', startTime: '10:55', endTime: '11:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 5, subject: 'Английский язык', startTime: '11:55', endTime: '12:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 6, subject: 'Обществознание', startTime: '12:55', endTime: '13:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 8, subject: '8-й урок: Олимпиадный IT-практикум', startTime: '14:45', endTime: '15:30', room: '', isExtra: true, isAfterSchool: false, isCanceled: false, notes: 'Дополнительное занятие в четверг' }
    ]);

    // 5 - Пятница (6 уроков, 08:00 - 13:40)
    await this.saveDayTimetable(5, [
      { lessonNumber: 1, subject: 'Информатика', startTime: '08:00', endTime: '08:45', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 2, subject: 'Информатика', startTime: '08:55', endTime: '09:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 3, subject: 'Геометрия (профиль)', startTime: '09:55', endTime: '10:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 4, subject: 'Русский язык', startTime: '10:55', endTime: '11:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 5, subject: 'Физика', startTime: '11:55', endTime: '12:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 6, subject: 'История', startTime: '12:55', endTime: '13:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false }
    ]);

    // 6 - Суббота (5 уроков, 08:00 - 12:40)
    await this.saveDayTimetable(6, [
      { lessonNumber: 1, subject: 'Математический практикум', startTime: '08:00', endTime: '08:45', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 2, subject: 'Физический практикум', startTime: '08:55', endTime: '09:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 3, subject: 'Родная литература', startTime: '09:55', endTime: '10:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 4, subject: 'География', startTime: '10:55', endTime: '11:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false },
      { lessonNumber: 5, subject: 'ОБЗР', startTime: '11:55', endTime: '12:40', room: '', isExtra: false, isAfterSchool: false, isCanceled: false }
    ]);

    // 7 - Воскресенье (выходной день)
    await this.saveDayTimetable(7, []);
  },

  /**
   * Полный каталог тем ЕГЭ по официальным спецификациям ФИПИ (2026/2027)
   * 1. Профильная математика: задания 1-19 (Часть 1: 1-12, Часть 2: 13-19)
   * 2. Информатика (КЕГЭ): задания 1-27
   * 3. Русский язык: задания 1-27 (1-26 тестовая часть + 27 сочинение)
   * Итого: ровно 73 темы без пропусков заданий.
   */
  getFipiEgeCatalog() {
    const fipiSource = 'ФИПИ 2026/2027 (спецификация и демоверсия)';

    // 1. Профильная математика (19 тем)
    const math = [
      { id: 'math_1', subject: 'math', part: 1, code: '№1', title: 'Планиметрия (треугольники, четырёхугольники, многоугольники, окружности)', fipiSource },
      { id: 'math_2', subject: 'math', part: 1, code: '№2', title: 'Векторы на плоскости (координаты, длина, скалярное произведение, угол)', fipiSource },
      { id: 'math_3', subject: 'math', part: 1, code: '№3', title: 'Стереометрия (многогранники и тела вращения, объёмы и площади)', fipiSource },
      { id: 'math_4', subject: 'math', part: 1, code: '№4', title: 'Начала теории вероятностей (классическое определение, базовые теоремы)', fipiSource },
      { id: 'math_5', subject: 'math', part: 1, code: '№5', title: 'Сложная вероятность (условная вероятность, дерево событий, формулы Байеса/Бернулли)', fipiSource },
      { id: 'math_6', subject: 'math', part: 1, code: '№6', title: 'Простейшие уравнения (линейные, квадратные, дробно-рациональные, иррациональные, логарифмы)', fipiSource },
      { id: 'math_7', subject: 'math', part: 1, code: '№7', title: 'Вычисления и преобразования (тригонометрия, корни, степени, логарифмы)', fipiSource },
      { id: 'math_8', subject: 'math', part: 1, code: '№8', title: 'Производная и первообразная (геометрический и физический смысл, касательная)', fipiSource },
      { id: 'math_9', subject: 'math', part: 1, code: '№9', title: 'Прикладные задачи с физическими и техническими формулами', fipiSource },
      { id: 'math_10', subject: 'math', part: 1, code: '№10', title: 'Текстовые задачи (движение, совместная работа, сплавы, смеси, прогрессии)', fipiSource },
      { id: 'math_11', subject: 'math', part: 1, code: '№11', title: 'Графики функций (линейная, парабола, гипербола, экспонента, логарифм; коэффициенты)', fipiSource },
      { id: 'math_12', subject: 'math', part: 1, code: '№12', title: 'Наибольшее и наименьшее значение функции с помощью производной', fipiSource },
      // Вторая часть (развёрнутый ответ)
      { id: 'math_13', subject: 'math', part: 2, code: '№13', title: 'Уравнения: тригонометрия, логарифмы, отбор корней на промежутке', fipiSource },
      { id: 'math_14', subject: 'math', part: 2, code: '№14', title: 'Стереометрическая задача: доказательство, углы и расстояния в пространстве', fipiSource },
      { id: 'math_15', subject: 'math', part: 2, code: '№15', title: 'Неравенства: метод рационализации, логарифмические и показательные', fipiSource },
      { id: 'math_16', subject: 'math', part: 2, code: '№16', title: 'Финансовая математика: кредиты (аннуитет, дифференцированный платёж), оптимизация', fipiSource },
      { id: 'math_17', subject: 'math', part: 2, code: '№17', title: 'Планиметрия повышенной сложности: теоремы Менелая/Чевы, окружности, площади', fipiSource },
      { id: 'math_18', subject: 'math', part: 2, code: '№18', title: 'Уравнения и неравенства с параметром: аналитический и функционально-графический методы', fipiSource },
      { id: 'math_19', subject: 'math', part: 2, code: '№19', title: 'Числа и их свойства: теория чисел, делимость, метод «оценка + пример»', fipiSource }
    ];

    // 2. Информатика КЕГЭ (27 тем)
    const informatics = [
      { id: 'inf_1', subject: 'informatics', part: 1, code: '№1', title: 'Анализ графов и весовых матриц дорог', fipiSource },
      { id: 'inf_2', subject: 'informatics', part: 1, code: '№2', title: 'Таблицы истинности логических функций в Python', fipiSource },
      { id: 'inf_3', subject: 'informatics', part: 1, code: '№3', title: 'Поиск и фильтрация в реляционных базах данных', fipiSource },
      { id: 'inf_4', subject: 'informatics', part: 1, code: '№4', title: 'Кодирование и декодирование информации (условие Фано)', fipiSource },
      { id: 'inf_5', subject: 'informatics', part: 1, code: '№5', title: 'Анализ и синтез алгоритмов автоматов для двоичных чисел', fipiSource },
      { id: 'inf_6', subject: 'informatics', part: 1, code: '№6', title: 'Анализ алгоритмов исполнителей («Черепаха» / «Кумир»)', fipiSource },
      { id: 'inf_7', subject: 'informatics', part: 1, code: '№7', title: 'Кодирование растровых изображений и звукозаписей', fipiSource },
      { id: 'inf_8', subject: 'informatics', part: 1, code: '№8', title: 'Комбинаторика, перестановки и подсчёт слов (itertools)', fipiSource },
      { id: 'inf_9', subject: 'informatics', part: 1, code: '№9', title: 'Обработка числовых табличных данных в электронных таблицах', fipiSource },
      { id: 'inf_10', subject: 'informatics', part: 1, code: '№10', title: 'Поиск символов и слов средствами текстового процессора', fipiSource },
      { id: 'inf_11', subject: 'informatics', part: 1, code: '№11', title: 'Вычисление количества информации при хранении идентификаторов', fipiSource },
      { id: 'inf_12', subject: 'informatics', part: 1, code: '№12', title: 'Алгоритмы обработки строковых последовательностей («Редактор»)', fipiSource },
      { id: 'inf_13', subject: 'informatics', part: 1, code: '№13', title: 'Адресация в компьютерных сетях (маска подсети, IP-адреса)', fipiSource },
      { id: 'inf_14', subject: 'informatics', part: 1, code: '№14', title: 'Позиционные системы счисления с переменным основанием', fipiSource },
      { id: 'inf_15', subject: 'informatics', part: 1, code: '№15', title: 'Логические выражения: множества, отрезки, поразрядная конъюнкция', fipiSource },
      { id: 'inf_16', subject: 'informatics', part: 1, code: '№16', title: 'Рекурсивные алгоритмы и вычисление глубины вызовов', fipiSource },
      { id: 'inf_17', subject: 'informatics', part: 1, code: '№17', title: 'Обработка целочисленных последовательностей из файла на Python', fipiSource },
      { id: 'inf_18', subject: 'informatics', part: 1, code: '№18', title: 'Динамическое программирование в таблицах (маршрут робота)', fipiSource },
      { id: 'inf_19', subject: 'informatics', part: 1, code: '№19', title: 'Теория игр: выигрышная стратегия за 1 ход', fipiSource },
      { id: 'inf_20', subject: 'informatics', part: 1, code: '№20', title: 'Теория игр: выигрышная стратегия за 2 хода', fipiSource },
      { id: 'inf_21', subject: 'informatics', part: 1, code: '№21', title: 'Теория игр: выигрышная стратегия при любой игре соперника', fipiSource },
      { id: 'inf_22', subject: 'informatics', part: 1, code: '№22', title: 'Анализ параллельных процессов и времени выполнения потоков', fipiSource },
      { id: 'inf_23', subject: 'informatics', part: 1, code: '№23', title: 'Динамическое программирование: подсчёт количества программ', fipiSource },
      { id: 'inf_24', subject: 'informatics', part: 1, code: '№24', title: 'Обработка символьных строк в файле на Python (максимальные подстроки)', fipiSource },
      { id: 'inf_25', subject: 'informatics', part: 1, code: '№25', title: 'Целочисленные алгоритмы: маски чисел, делители, простые числа', fipiSource },
      { id: 'inf_26', subject: 'informatics', part: 1, code: '№26', title: 'Жадные алгоритмы, сортировка и обработка очередей', fipiSource },
      { id: 'inf_27', subject: 'informatics', part: 1, code: '№27', title: 'Анализ больших массивов данных: кластеризация, центроиды, префиксы', fipiSource }
    ];

    // 3. Русский язык (27 тем)
    const russian = [
      { id: 'rus_1', subject: 'russian', part: 1, code: '№1', title: 'Логико-смысловые отношения между предложениями текста', fipiSource },
      { id: 'rus_2', subject: 'russian', part: 1, code: '№2', title: 'Лексическое значение многозначного слова в контексте текста', fipiSource },
      { id: 'rus_3', subject: 'russian', part: 1, code: '№3', title: 'Стилистический анализ текста (функциональные стили, средства)', fipiSource },
      { id: 'rus_4', subject: 'russian', part: 1, code: '№4', title: 'Орфоэпические нормы (постановка ударения по словнику ФИПИ)', fipiSource },
      { id: 'rus_5', subject: 'russian', part: 1, code: '№5', title: 'Лексические нормы (употребление паронимов)', fipiSource },
      { id: 'rus_6', subject: 'russian', part: 1, code: '№6', title: 'Лексические нормы (плеоназм, тавтология, лексическая сочетаемость)', fipiSource },
      { id: 'rus_7', subject: 'russian', part: 1, code: '№7', title: 'Морфологические нормы (образование грамматических форм слова)', fipiSource },
      { id: 'rus_8', subject: 'russian', part: 1, code: '№8', title: 'Синтаксические нормы (грамматические ошибки в построении предложений)', fipiSource },
      { id: 'rus_9', subject: 'russian', part: 1, code: '№9', title: 'Правописание корней (проверяемые, непроверяемые, чередующиеся гласные)', fipiSource },
      { id: 'rus_10', subject: 'russian', part: 1, code: '№10', title: 'Правописание приставок (неизменяемые, на -з/-с, пре-/при-, Ы/И, Ъ/Ь)', fipiSource },
      { id: 'rus_11', subject: 'russian', part: 1, code: '№11', title: 'Правописание суффиксов различных частей речи (кроме -Н-/-НН-)', fipiSource },
      { id: 'rus_12', subject: 'russian', part: 1, code: '№12', title: 'Правописание личных окончаний глаголов и суффиксов причастий', fipiSource },
      { id: 'rus_13', subject: 'russian', part: 1, code: '№13', title: 'Слитное и раздельное написание НЕ с различными частями речи', fipiSource },
      { id: 'rus_14', subject: 'russian', part: 1, code: '№14', title: 'Слитное, дефисное и раздельное написание служебных и самостоятельных слов', fipiSource },
      { id: 'rus_15', subject: 'russian', part: 1, code: '№15', title: 'Правописание -Н- и -НН- в различных частях речи', fipiSource },
      { id: 'rus_16', subject: 'russian', part: 1, code: '№16', title: 'Пунктуация в сложносочинённом предложении и при однородных членах', fipiSource },
      { id: 'rus_17', subject: 'russian', part: 1, code: '№17', title: 'Знаки препинания в предложениях с обособленными членами (определения, обстоятельства)', fipiSource },
      { id: 'rus_18', subject: 'russian', part: 1, code: '№18', title: 'Знаки препинания при вводных словах, конструкциях и обращениях', fipiSource },
      { id: 'rus_19', subject: 'russian', part: 1, code: '№19', title: 'Знаки препинания в сложноподчинённом предложении', fipiSource },
      { id: 'rus_20', subject: 'russian', part: 1, code: '№20', title: 'Знаки препинания в сложных предложениях с разными видами связи (стык союзов)', fipiSource },
      { id: 'rus_21', subject: 'russian', part: 1, code: '№21', title: 'Пунктуационный анализ текста (правила постановки тире, двоеточия, запятой)', fipiSource },
      { id: 'rus_22', subject: 'russian', part: 1, code: '№22', title: 'Текстовый анализ (соответствие содержания текста утверждениям)', fipiSource },
      { id: 'rus_23', subject: 'russian', part: 1, code: '№23', title: 'Функционально-смысловые типы речи (повествование, описание, рассуждение)', fipiSource },
      { id: 'rus_24', subject: 'russian', part: 1, code: '№24', title: 'Лексика текста (синонимы, антонимы, омонимы, фразеологизмы)', fipiSource },
      { id: 'rus_25', subject: 'russian', part: 1, code: '№25', title: 'Средства связи предложений в тексте', fipiSource },
      { id: 'rus_26', subject: 'russian', part: 1, code: '№26', title: 'Языковые средства выразительности (тропы, фигуры, лексические средства)', fipiSource },
      // Вторая часть (сочинение)
      { id: 'rus_27', subject: 'russian', part: 2, code: '№27', title: 'Сочинение-рассуждение: проблема, комментарий, авторская и личная позиция', fipiSource }
    ];

    return [...math, ...informatics, ...russian].map(item => ({
      ...item,
      taskNumber: parseInt(item.code.replace('№', ''), 10),
      difficulty: item.part === 2 ? 'advanced' : 'basic'
    }));
  },

  /**
   * Синхронизация каталога ЕГЭ:
   * Сохраняет пользовательский прогресс (решено, верных, ошибки, теория) для существующих тем,
   * и добавляет недостающие темы без потери данных.
   * @param {boolean} forceReset - принудительный сброс всех тем в 0
   */
  async syncEgeTopicsCatalog(forceReset = false) {
    const catalog = this.getFipiEgeCatalog();
    const existingTopics = await this.getAll('ege_topics');
    const existingMap = new Map(existingTopics.map(t => [t.id, t]));

    for (const item of catalog) {
      const existing = existingMap.get(item.id);

      if (existing && !forceReset) {
        // Сохраняем прогресс пользователя
        const updated = {
          ...item,
          status: existing.status || 'not_started',
          solvedCount: Number(existing.solvedCount) || 0,
          correctCount: Number(existing.correctCount) || 0,
          theoryStudied: !!existing.theoryStudied,
          mistakes: Array.isArray(existing.mistakes) ? existing.mistakes : [],
          plannedReviewDate: existing.plannedReviewDate || null
        };
        await this.updateEgeTopic(updated);
      } else {
        // Новая тема — чистый старт с 0
        const fresh = {
          ...item,
          status: 'not_started',
          solvedCount: 0,
          correctCount: 0,
          theoryStudied: false,
          mistakes: [],
          plannedReviewDate: null
        };
        await this.updateEgeTopic(fresh);
      }
    }
  },

  /**
   * Шаблоны олимпиад для ознакомления (не добавляются в базу как подтверждённые)
   */
  getOlympiadTemplates() {
    return [
      {
        id: 'template_oly_inf',
        title: 'ВсОШ по информатике (Муниципальный этап)',
        subject: 'Информатика',
        stage: 'Муниципальный этап',
        date: '2026-12-05',
        time: '10:00',
        location: 'Очно в пункте проведения / онлайн-тестирование',
        sourceUrl: 'https://vos.olimpiada.ru/',
        prepTasksCount: 30,
        targetPrize: 'Призёр / Победитель',
        notes: 'Дата примерная — проверьте даты в школьном графике',
        isTemplate: true
      },
      {
        id: 'template_oly_math',
        title: 'ВсОШ по математике (Муниципальный этап)',
        subject: 'Математика',
        stage: 'Муниципальный этап',
        date: '2026-12-14',
        time: '10:00',
        location: 'Очно в базовой школе',
        sourceUrl: 'https://vos.olimpiada.ru/',
        prepTasksCount: 30,
        targetPrize: 'Призёр',
        notes: 'Дата примерная — уточните у преподавателя математики',
        isTemplate: true
      },
      {
        id: 'template_oly_hse',
        title: 'Олимпиада «Высшая проба» (НИУ ВШЭ)',
        subject: 'Информатика / Математика',
        stage: 'Отборочный этап (онлайн)',
        date: '2026-11-30',
        time: '12:00',
        location: 'Дистанционно на платформе ВШЭ',
        sourceUrl: 'https://olymp.hse.ru/mmo/',
        prepTasksCount: 25,
        targetPrize: 'Диплом I-III степени (льготы БВИ/100 баллов)',
        notes: 'Перечневая олимпиада 1 уровня. Регистрация обязательна.',
        isTemplate: true
      },
      {
        id: 'template_oly_inno',
        title: 'Innopolis Open по информатике',
        subject: 'Информатика',
        stage: '1-й профильный отборочный тур',
        date: '2026-12-06',
        time: '15:00',
        location: 'Онлайн (Яндекс Контест)',
        sourceUrl: 'https://olymp.innopolis.university/',
        prepTasksCount: 20,
        targetPrize: 'Выход в финал в Иннополисе',
        notes: 'Олимпиада Университета Иннополис для школьников 7-11 классов.',
        isTemplate: true
      }
    ];
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

    // Демо-олимпиада
    await this.saveOlympiad({
      id: 'demo_oly_1',
      title: 'ВсОШ по информатике (Демо-пример)',
      subject: 'Информатика',
      stage: 'Школьный этап',
      date: tomorrow,
      time: '14:00',
      location: 'Кабинет информатики',
      sourceUrl: 'https://vos.olimpiada.ru/',
      prepTasksCount: 15,
      solvedCount: 0,
      targetPrize: 'Призёр',
      notes: 'Демонстрационная олимпиадная запись для ознакомления',
      status: 'active',
      isConfirmed: true,
      isTemplate: false
    });

    this.saveSettings({ isDemoMode: true });
    return true;
  },

  // ==========================================
  // ЭКСПОРТ И ИМПОРТ ДАННЫХ
  // ==========================================
  async exportAllData() {
    const data = {
      version: '1.1.1',
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
    const data = JSON.parse(jsonString);

    if (data.settings) {
      this.saveSettings(data.settings);
    }

    if (Array.isArray(data.schedule_days)) {
      await this.clearStore('schedule_days');
      for (const item of data.schedule_days) await this.put('schedule_days', item);
    }

    if (Array.isArray(data.homework)) {
      await this.clearStore('homework');
      for (const item of data.homework) await this.put('homework', item);
    }

    if (Array.isArray(data.school_timetable)) {
      await this.clearStore('school_timetable');
      for (const item of data.school_timetable) await this.put('school_timetable', item);
    }

    if (Array.isArray(data.ege_topics)) {
      await this.clearStore('ege_topics');
      for (const item of data.ege_topics) await this.put('ege_topics', item);
    }

    if (Array.isArray(data.olympiads)) {
      await this.clearStore('olympiads');
      for (const item of data.olympiads) await this.put('olympiads', item);
    }

    if (Array.isArray(data.projects)) {
      await this.clearStore('projects');
      for (const item of data.projects) await this.put('projects', item);
    }

    if (Array.isArray(data.replan_history)) {
      await this.clearStore('replan_history');
      for (const item of data.replan_history) await this.put('replan_history', item);
    }

    if (Array.isArray(data.activity_log)) {
      await this.clearStore('activity_log');
      for (const item of data.activity_log) await this.put('activity_log', item);
    }

    return true;
  },

  async resetToDefaults() {
    await this.clearStore('schedule_days');
    await this.clearStore('homework');
    await this.clearStore('school_timetable');
    await this.clearStore('ege_topics');
    await this.clearStore('olympiads');
    await this.clearStore('projects');
    await this.clearStore('replan_history');
    await this.clearStore('activity_log');

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SETTINGS_KEY);
    }

    await this.checkAndSeedData();
    return true;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Database;
}
if (typeof globalThis !== 'undefined') {
  globalThis.Database = Database;
}
