/**
 * LifeOS — Модуль системных уведомлений рабочего стола Windows (Web Notifications API)
 * Отправляет реальные всплывающие уведомления в правый нижний угол Windows через браузер.
 * Работает при открытой вкладке браузера или через Service Worker.
 * Интеграция с TimeUtils (Europe/Moscow).
 */

const NotificationsManager = {
  checkIntervalId: null,
  sentNotifications: new Set(), // Защита от дублей: 'taskId_reminderType_date'

  getTimeLib() {
    return (typeof TimeUtils !== 'undefined') ? TimeUtils : (typeof globalThis !== 'undefined' && globalThis.TimeUtils ? globalThis.TimeUtils : null);
  },

  /**
   * Инициализация менеджера уведомлений
   */
  init(db) {
    this.db = db;
    if (this.checkIntervalId) clearInterval(this.checkIntervalId);
    this.checkIntervalId = setInterval(() => this.checkScheduleAndNotify(), 20000);
    this.checkScheduleAndNotify();
  },

  /**
   * Проверить статус разрешения в браузере
   * @returns {'granted'|'denied'|'default'|'unsupported'}
   */
  getPermissionStatus() {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  },

  /**
   * Запрос разрешения на отправку уведомлений
   */
  async requestPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      alert('Ваш браузер не поддерживает Web Notifications API.');
      return 'unsupported';
    }

    try {
      const perm = await Notification.requestPermission();
      return perm;
    } catch (e) {
      console.error('Ошибка запроса разрешения на уведомления:', e);
      return Notification.permission;
    }
  },

  /**
   * Проиграть мягкий звуковой сигнал через Web Audio API
   */
  playChime() {
    try {
      if (typeof window === 'undefined') return;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      // Мелодичный двухтоновый перелив (C5 -> E5 -> G5)
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.12);
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.25);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.3, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.5);
    } catch (e) {
      console.warn('Не удалось воспроизвести звук уведомления:', e);
    }
  },

  /**
   * Отправка реального системного уведомления Windows
   */
  showNotification(title, options = {}) {
    if (this.getPermissionStatus() !== 'granted') {
      console.log('Уведомление пропущено: разрешение не предоставлено.');
      return null;
    }

    const settings = this.db ? this.db.getSettings() : {};
    if (settings.notificationSound !== false) {
      this.playChime();
    }

    const defaultOptions = {
      icon: 'assets/icons/icon-192.png',
      badge: 'assets/icons/favicon.png',
      tag: options.tag || 'lifeos-alert',
      renotify: true,
      silent: false,
      requireInteraction: false
    };

    const finalOptions = { ...defaultOptions, ...options };

    try {
      const notif = new Notification(title, finalOptions);

      notif.onclick = () => {
        if (typeof window !== 'undefined') window.focus();
        notif.close();
      };

      return notif;
    } catch (e) {
      console.warn('Notification constructor error (возможно ServiceWorker context):', e);
      if (typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then(reg => {
          reg.showNotification(title, finalOptions);
        });
      }
      return null;
    }
  },

  /**
   * Тестовое системное уведомление
   */
  sendTestNotification() {
    const status = this.getPermissionStatus();
    if (status !== 'granted') {
      return {
        success: false,
        message: 'Сначала разрешите уведомления в браузере!'
      };
    }

    this.showNotification('LifeOS — Уведомления активны! 🚀', {
      body: 'Система напоминаний Windows успешно настроена. Вы будете вовремя узнавать о начале уроков, намазе ясту и отдыхе.',
      tag: 'test_notification'
    });

    return {
      success: true,
      message: 'Тестовое уведомление отправлено в правый нижний угол рабочего стола Windows.'
    };
  },

  /**
   * Периодическая проверка расписания и отправка напоминаний
   */
  async checkScheduleAndNotify() {
    if (!this.db) return;
    if (this.getPermissionStatus() !== 'granted') return;

    const timeLib = this.getTimeLib();
    const settings = this.db.getSettings();
    const dateStr = timeLib ? timeLib.getTodayStr() : new Date().toISOString().split('T')[0];
    const currentMin = timeLib ? timeLib.getCurrentMinutesMoscow() : (new Date().getHours() * 60 + new Date().getMinutes());

    const schedule = await this.db.getDaySchedule(dateStr);
    if (!schedule || !schedule.tasks || schedule.tasks.length === 0) return;

    const advanceMin = Number(settings.notificationAdvance) || 10;
    const timeToMin = (t) => {
      if (timeLib) return timeLib.timeToMin(t);
      const [h, m] = (t || '00:00').split(':').map(Number);
      return h * 60 + m;
    };

    for (const task of schedule.tasks) {
      if (task.status === 'completed' || task.status === 'skipped') continue;

      const taskStartMin = timeToMin(task.startTime);
      const taskEndMin = timeToMin(task.endTime);

      // 1. Напоминание за N минут до начала
      if (settings.notificationStart !== false) {
        const diffBefore = taskStartMin - currentMin;
        const advanceKey = `${task.id}_advance_${dateStr}`;

        if (diffBefore > 0 && diffBefore <= advanceMin && !this.sentNotifications.has(advanceKey)) {
          this.sentNotifications.add(advanceKey);
          
          let title = `⏳ Через ${diffBefore} мин: ${task.title}`;
          let body = `Начало в ${task.startTime}. ${task.subtitle || task.description || ''}`;

          if (task.category === 'prayer') {
            if (settings.notificationPrayer === false) continue;
            title = `🕌 Через ${diffBefore} минут наступит время намаза ясту!`;
            body = `Время молитвы: ${task.startTime}. Подготовьтесь к спокойному совершению намаза.`;
          }

          this.showNotification(title, { body, tag: advanceKey });
        }

        // 2. Напоминание ровно в момент начала
        const exactKey = `${task.id}_exact_${dateStr}`;
        if (currentMin === taskStartMin && !this.sentNotifications.has(exactKey)) {
          this.sentNotifications.add(exactKey);

          let title = `🚀 Начинается: ${task.title}`;
          let body = `Время: ${task.startTime}–${task.endTime}. ${task.subtitle || ''}`;

          if (task.category === 'prayer') {
            if (settings.notificationPrayer === false) continue;
            title = `🕌 Наступило время намаза ясту (${task.startTime})`;
            body = 'Отложите дела на время молитвы. Актаныш, Татарстан.';
          } else if (task.category === 'gaming') {
            title = `🎮 Время игр на ПК (60 минут)!`;
            body = 'Запланированный час отдыха. Приятной игры!';
          } else if (task.category === 'sport') {
            title = `🏃 Время спорта (25 минут)!`;
            body = 'Разминка, турник или упражнения для осанки.';
          } else if (task.category === 'rest') {
            title = `🌿 Время отдыха без компьютера`;
            body = 'Отключите экраны, почитайте книгу или проведите время с семьёй.';
          }

          this.showNotification(title, { body, tag: exactKey });
        }
      }

      // 3. Напоминание о завершении за 5 минут
      if (settings.notificationEnd !== false) {
        const diffEnd = taskEndMin - currentMin;
        const endKey = `${task.id}_ending_${dateStr}`;

        if (diffEnd === 5 && !this.sentNotifications.has(endKey)) {
          this.sentNotifications.add(endKey);
          this.showNotification(`⏰ Завершение: ${task.title}`, {
            body: `До окончания задачи осталось 5 минут. Пора подводить итог и переходить к следующему этапу.`,
            tag: endKey
          });
        }
      }
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = NotificationsManager;
}
if (typeof globalThis !== 'undefined') {
  globalThis.NotificationsManager = NotificationsManager;
}
