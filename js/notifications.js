/**
 * LifeOS — Модуль системных уведомлений рабочего стола Windows (Web Notifications API)
 * Отправляет реальные всплывающие уведомления в правый нижний угол Windows через браузер.
 * Работает при открытой вкладке браузера или через Service Worker.
 * Интеграция с TimeUtils (Europe/Moscow).
 */

const NotificationsManager = {
  checkIntervalId: null,
  sentNotifications: new Set(), // Защита от дублей: 'taskId_reminderType_date'
  HISTORY_KEY: 'lifeos_notification_history',
  LAST_ACTIVE_KEY: 'lifeos_last_active_time',

  getTimeLib() {
    return (typeof TimeUtils !== 'undefined') ? TimeUtils : (typeof globalThis !== 'undefined' && globalThis.TimeUtils ? globalThis.TimeUtils : null);
  },

  /**
   * Честное техническое описание архитектуры уведомлений LifeOS
   */
  getWebPushDisclosure() {
    return {
      webNotifications: 'Локальные системные уведомления отправляются через Service Worker, пока страница LifeOS открыта и её таймеры выполняются. В фоновой вкладке браузер может замедлять таймеры; после закрытия вкладки проверка расписания прекращается.',
      webPush: 'Для доставки уведомлений после закрытия вкладки или браузера нужен настоящий Web Push: серверная очередь, VAPID-ключи и Push Service. На одном GitHub Pages без сервера этого нет. Пока вкладка LifeOS открыта, приложение проверяет расписание локально и отправляет системные уведомления через браузер.'
    };
  },

  /**
   * Получить историю уведомлений из LocalStorage (до 50 записей)
   */
  getNotificationHistory() {
    if (typeof localStorage === 'undefined') return [];
    try {
      const data = localStorage.getItem(this.HISTORY_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn('Ошибка чтения истории уведомлений:', e);
      return [];
    }
  },

  /**
   * Добавить запись в историю уведомлений
   */
  addNotificationToHistory(entry) {
    if (typeof localStorage === 'undefined') return;
    try {
      const history = this.getNotificationHistory();
      const newEntry = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        timestamp: new Date().toISOString(),
        title: entry.title || 'Уведомление',
        body: entry.body || '',
        category: entry.category || 'general',
        status: entry.status || 'delivered' // 'delivered' | 'in_app' | 'missed'
      };
      history.unshift(newEntry);
      if (history.length > 50) {
        history.length = 50;
      }
      localStorage.setItem(this.HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
      console.warn('Ошибка сохранения истории уведомлений:', e);
    }
  },

  /**
   * Очистить историю уведомлений
   */
  clearNotificationHistory() {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(this.HISTORY_KEY);
  },

  /**
   * Инициализация менеджера уведомлений
   */
  init(db) {
    this.db = db;
    if (this.checkIntervalId) clearInterval(this.checkIntervalId);
    this.checkIntervalId = setInterval(() => {
      this.checkScheduleAndNotify();
      this.updateLastActive();
    }, 20000);

    // Проверка пропущенных событий при возвращении
    this.checkMissedNotifications();
    this.checkScheduleAndNotify();
    this.updateLastActive();
  },

  /**
   * Обновить отметку активности пользователя
   */
  updateLastActive() {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(this.LAST_ACTIVE_KEY, Date.now().toString());
  },

  /**
   * Проверить события, наступившие пока вкладка была закрыта или неактивна
   */
  async checkMissedNotifications() {
    if (typeof localStorage === 'undefined' || !this.db) return;
    const lastActiveStr = localStorage.getItem(this.LAST_ACTIVE_KEY);
    if (!lastActiveStr) return;

    const lastActive = parseInt(lastActiveStr, 10);
    const now = Date.now();
    const diffMin = Math.floor((now - lastActive) / 60000);

    // Если прошло более 15 минут с последней активности
    if (diffMin >= 15) {
      const timeLib = this.getTimeLib();
      const dateStr = timeLib ? timeLib.getTodayStr() : new Date().toISOString().split('T')[0];
      const schedule = await this.db.getDaySchedule(dateStr);

      if (schedule && schedule.tasks) {
        const currentMin = timeLib ? timeLib.getCurrentMinutesMoscow() : (new Date().getHours() * 60 + new Date().getMinutes());
        const lastActiveDate = new Date(lastActive);
        const lastMin = lastActiveDate.getHours() * 60 + lastActiveDate.getMinutes();

        const timeToMin = (t) => {
          if (timeLib) return timeLib.timeToMin(t);
          const [h, m] = (t || '00:00').split(':').map(Number);
          return h * 60 + m;
        };

        const missed = schedule.tasks.filter(t => {
          const tStart = timeToMin(t.startTime);
          return tStart >= lastMin && tStart <= currentMin && t.status !== 'completed';
        });

        if (missed.length > 0) {
          missed.forEach(t => {
            this.addNotificationToHistory({
              title: `Пропущено: ${t.title}`,
              body: `Событие началось в ${t.startTime}, пока вкладка была неактивна`,
              category: t.category,
              status: 'missed'
            });
          });

          this.showInAppToast(
            '⚠️ Пропущенные события',
            `Пока вкладка была неактивна, наступило ${missed.length} соб.: ${missed.map(m => m.title).join(', ')}`,
            'warning'
          );
        }
      }
    }
  },

  /**
   * Отображение внутристраничного всплывающего уведомления (in-app toast)
   */
  showInAppToast(title, body = '', type = 'info') {
    if (typeof document === 'undefined') return;

    let container = document.getElementById('lifeos-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'lifeos-toast-container';
      container.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-width: 380px;
        pointer-events: none;
      `;
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `lifeos-toast toast-${type}`;
    const borderColors = {
      info: 'var(--color-primary, #2563eb)',
      warning: '#f59e0b',
      error: '#ef4444',
      success: '#10b981'
    };
    const borderColor = borderColors[type] || borderColors.info;

    toast.style.cssText = `
      background: #ffffff;
      color: #1e293b;
      border-left: 4px solid ${borderColor};
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      pointer-events: auto;
      transition: all 0.3s ease;
      opacity: 0;
      transform: translateY(15px);
      font-size: 14px;
    `;

    toast.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
        <span>${title}</span>
        <button style="border: none; background: none; cursor: pointer; color: #94a3b8; font-size: 16px; padding: 0 4px;" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
      ${body ? `<div style="color: #64748b; font-size: 13px; line-height: 1.4;">${body}</div>` : ''}
    `;

    container.appendChild(toast);

    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => setTimeout(cb, 16);
    raf(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
      }
    }, 5000);
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
   * Получить активную регистрацию Service Worker для системных уведомлений.
   */
  async getServiceWorkerRegistration() {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker ||
        typeof navigator.serviceWorker.getRegistration !== 'function') {
      return null;
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration && registration.active &&
          typeof registration.showNotification === 'function') {
        return registration;
      }
    } catch (error) {
      console.warn('Не удалось получить регистрацию Service Worker:', error);
    }
    return null;
  },

  /**
   * Системное уведомление: сначала Service Worker, затем Notification() fallback.
   * Успех пишется в историю только после успешного вызова API.
   */
  async showNotification(title, options = {}) {
    const perm = this.getPermissionStatus();
    const settings = this.db ? this.db.getSettings() : {};
    const baseUrl = (typeof window !== 'undefined' && window.location && window.location.href)
      ? window.location.href
      : 'https://localhost/';

    const defaultOptions = {
      icon: new URL('./assets/icons/icon-192.png', baseUrl).href,
      badge: new URL('./assets/icons/favicon.png', baseUrl).href,
      tag: options.tag || 'lifeos-alert',
      renotify: true,
      silent: false,
      requireInteraction: false
    };
    const finalOptions = { ...defaultOptions, ...options };

    if (perm !== 'granted') {
      this.showInAppToast(title, options.body || '', options.type || 'info');
      this.addNotificationToHistory({
        title, body: options.body || '',
        category: options.category || 'general', status: 'in_app'
      });
      return { success: false, inApp: true, reason: 'permission', permission: perm };
    }

    let method = null;
    let error = null;
    let notificationInstance = null;

    const registration = await this.getServiceWorkerRegistration();
    if (registration) {
      try {
        await registration.showNotification(title, finalOptions);
        method = 'service-worker';
      } catch (err) {
        error = err;
        console.warn('Service Worker notification failed; trying Notification() fallback:', err);
      }
    }

    if (!method) {
      try {
        if (typeof Notification !== 'function') {
          throw new Error('Notification API недоступен в этом контексте.');
        }
        notificationInstance = new Notification(title, finalOptions);
        notificationInstance.onclick = () => {
          if (typeof window !== 'undefined' && typeof window.focus === 'function') window.focus();
          if (notificationInstance && typeof notificationInstance.close === 'function') notificationInstance.close();
        };
        method = 'page';
      } catch (err) {
        error = err;
      }
    }

    if (!method) {
      console.error('Не удалось отправить системное уведомление:', error);
      this.showInAppToast(title, options.body || '', options.type || 'info');
      this.addNotificationToHistory({
        title, body: options.body || '',
        category: options.category || 'general', status: 'in_app'
      });
      return { success: false, inApp: true, reason: error ? error.message : 'unknown', permission: perm };
    }

    if (settings.notificationSound !== false) this.playChime();
    this.addNotificationToHistory({
      title, body: options.body || '',
      category: options.category || 'general', status: 'delivered'
    });
    return { success: true, method, notification: notificationInstance };
  },

  /**
   * Тестовое системное уведомление. Успех возвращается только после вызова API.
   */
  async sendTestNotification() {
    const status = this.getPermissionStatus();
    if (status !== 'granted') {
      return {
        success: false,
        message: 'Разрешите уведомления для LifeOS в настройках сайта браузера.'
      };
    }

    const result = await this.showNotification('LifeOS — Уведомления активны! 🚀', {
      body: 'Тестовое системное уведомление. Если Windows его не показывает, проверьте системные уведомления и режим «Не беспокоить».',
      tag: 'test_notification'
    });

    if (!result.success) {
      return {
        success: false,
        message: 'Браузер не смог создать системное уведомление. Внутреннее уведомление LifeOS показано вместо него. Проверьте разрешения браузера и Windows.'
      };
    }

    return {
      success: true,
      method: result.method,
      message: 'Браузер принял системное уведомление. Если баннер не появился, проверьте разрешения Windows и режим «Не беспокоить».'
    };
  },

  /**
   * Периодическая проверка расписания и отправка напоминаний
   */
  async checkScheduleAndNotify() {
    if (!this.db) return;

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

          await this.showNotification(title, { body, tag: advanceKey });
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

          await this.showNotification(title, { body, tag: exactKey });
        }
      }

      // 3. Напоминание о завершении за 5 минут
      if (settings.notificationEnd !== false) {
        const diffEnd = taskEndMin - currentMin;
        const endKey = `${task.id}_ending_${dateStr}`;

        if (diffEnd === 5 && !this.sentNotifications.has(endKey)) {
          this.sentNotifications.add(endKey);
          await this.showNotification(`⏰ Завершение: ${task.title}`, {
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
