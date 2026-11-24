/**
 * LifeOS — Главный координатор приложения (app.js)
 * v1.1: Полная интеграция с TimeUtils (Europe/Moscow),
 * уведомление об очистке старых демо-данных, предупреждения о перегрузке,
 * управление расписанием и PWA.
 */

const App = {
  currentView: 'today',
  selectedDate: null,
  clockTimer: null,

  getTimeLib() {
    return (typeof TimeUtils !== 'undefined') ? TimeUtils : (typeof globalThis !== 'undefined' && globalThis.TimeUtils ? globalThis.TimeUtils : null);
  },

  async init() {
    console.log('Инициализация LifeOS v1.2...');
    const timeLib = this.getTimeLib();

    // Текущая дата в Московском часовом поясе
    this.selectedDate = timeLib ? timeLib.getTodayStr() : new Date().toISOString().split('T')[0];

    // Инициализация базы данных
    await Database.init();

    // Инициализация менеджера уведомлений
    if (typeof NotificationsManager !== 'undefined') {
      NotificationsManager.init(Database);
    }

    // Запуск живых часов
    this.startClock();

    // Настройка навигации
    this.setupNavigation();

    // Проверка расписания на сегодня
    let todaySchedule = await Database.getDaySchedule(this.selectedDate);
    if (!todaySchedule || !todaySchedule.tasks || todaySchedule.tasks.length === 0) {
      await AIPlanner.autoReplan(this.selectedDate, Database, 'Первичная генерация расписания');
    }

    // Регистрация Service Worker для PWA
    this.registerServiceWorker();

    // Открытие стартового экрана
    this.navigateTo('today');
  },

  startClock() {
    const updateTime = () => {
      const el = document.getElementById('header-live-clock');
      if (el) {
        const timeLib = this.getTimeLib();
        if (timeLib) {
          const mDate = timeLib.getMoscowDate();
          el.textContent = mDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } else {
          el.textContent = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
      }
    };
    updateTime();
    if (this.clockTimer) clearInterval(this.clockTimer);
    this.clockTimer = setInterval(updateTime, 1000);
  },

  setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-item');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetView = btn.getAttribute('data-view');
        if (targetView) this.navigateTo(targetView);
      });
    });
  },

  navigateTo(viewName) {
    this.currentView = viewName;

    // Обновляем подсветку кнопок навигации
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
    });

    // Скрываем все разделы
    document.querySelectorAll('.view-section').forEach(sec => {
      sec.classList.remove('active');
    });

    // Отображаем активный раздел
    const targetSection = document.getElementById(`view-${viewName}`);
    if (targetSection) {
      targetSection.classList.add('active');
    }

    // Рендерим контент нужного модуля
    this.refreshCurrentView();
  },

  refreshCurrentView() {
    if (this.currentView === 'today') {
      this.renderTodayView();
    } else if (this.currentView === 'school' && typeof SchoolManager !== 'undefined') {
      SchoolManager.init(Database);
    } else if (this.currentView === 'homework' && typeof HomeworkManager !== 'undefined') {
      HomeworkManager.init(Database);
    } else if (this.currentView === 'goals' && typeof GoalsManager !== 'undefined') {
      GoalsManager.init(Database);
    } else if (this.currentView === 'statistics' && typeof StatisticsManager !== 'undefined') {
      StatisticsManager.init(Database);
    } else if (this.currentView === 'settings' && typeof SettingsManager !== 'undefined') {
      SettingsManager.init(Database);
    }
  },

  showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast-message toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('visible'), 20);
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  // ==========================================
  // ГЛАВНЫЙ ЭКРАН «СЕГОДНЯ»
  // ==========================================
  async renderTodayView() {
    const container = document.getElementById('today-content');
    if (!container) return;

    const timeLib = this.getTimeLib();
    const schedule = await Database.getDaySchedule(this.selectedDate);
    const homework = await Database.getAllHomework();
    const settings = Database.getSettings();
    const hasLegacyDemo = await Database.hasLegacyDemoData();

    const tasks = schedule ? (schedule.tasks || []) : [];
    const mode = schedule ? schedule.mode : (settings.activeMode || 'normal');

    // Метрики дня
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
    const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // ДЗ
    const activeHw = homework.filter(h => h.status !== 'completed');
    let hwMinutes = 0;
    activeHw.forEach(h => hwMinutes += (Number(h.estimatedMinutes) || 30));

    // Ближайшее событие
    const currentMin = timeLib ? timeLib.getCurrentMinutesMoscow() : (new Date().getHours() * 60 + new Date().getMinutes());
    let nextEvent = null;
    let nextReminderTime = '—';

    for (const t of tasks) {
      const startMin = timeLib ? timeLib.timeToMin(t.startTime) : ((h, m) => h * 60 + m)(...(t.startTime || '00:00').split(':').map(Number));
      if (startMin >= currentMin && t.status !== 'completed' && t.status !== 'skipped') {
        nextEvent = t;
        const advance = Number(settings.notificationAdvance) || 10;
        const remMin = Math.max(0, startMin - advance);
        nextReminderTime = timeLib ? timeLib.minToTime(remMin) : Scheduler.minToTime(remMin);
        break;
      }
    }

    // Приветствие
    const mDate = timeLib ? timeLib.getMoscowDate() : new Date();
    const hour = mDate.getHours();
    let greeting = 'Добрый день';
    if (hour >= 5 && hour < 12) greeting = 'Доброе утро';
    else if (hour >= 18 && hour < 23) greeting = 'Добрый вечер';
    else if (hour >= 23 || hour < 5) greeting = 'Доброй ночи';

    const capitalizedDate = timeLib ? timeLib.formatDateRu(this.selectedDate) : this.selectedDate;

    const modeLabels = {
      normal: 'Обычный режим',
      loaded: 'Загруженный режим',
      competitive: 'Соревновательный режим'
    };
    const modeClasses = {
      normal: 'badge-info',
      loaded: 'badge-warning',
      competitive: 'badge-purple'
    };

    let html = '';

    // Предупреждение о неподтверждённом шаблоне школьного расписания
    if (settings.schoolTimetableConfirmed === false && !sessionStorage.getItem('dismiss_timetable_banner')) {
      html += `
        <div class="unconfirmed-timetable-banner" style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin-bottom: 1rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
          <div style="color: #92400e; font-size: 0.95rem;">
            <strong>⚠️ Школьное расписание уроков ещё не подтверждено:</strong> загружен типовой шаблон 10 класса. Проверьте расписание во вкладке «Неделя» или подтвердите текущий шаблон.
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-sm btn-primary" onclick="App.navigateTo('school')">Проверить уроки</button>
            <button class="btn btn-sm btn-secondary" onclick="App.confirmTimetableQuick()">✓ Подтвердить шаблон</button>
            <button class="btn btn-sm btn-outline-secondary" onclick="sessionStorage.setItem('dismiss_timetable_banner', '1'); App.renderTodayView();">Скрыть</button>
          </div>
        </div>
      `;
    }

    // Предупреждение о старых демо-данных v1.0
    if (hasLegacyDemo && !sessionStorage.getItem('dismiss_legacy_banner')) {
      html += `
        <div class="legacy-demo-banner" style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin-bottom: 1rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
          <div style="color: #92400e; font-size: 0.95rem;">
            <strong>⚠️ Обнаружены устаревшие демонстрационные данные (v1.0):</strong> фиктивные 563 решённые задачи и примеры уроков. Рекомендуется очистить базу до чистого нуля для реального использования (с автосохранением резервной копии).
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-sm btn-primary" onclick="App.cleanLegacyDemo()">Очистить до чистого нуля</button>
            <button class="btn btn-sm btn-secondary" onclick="sessionStorage.setItem('dismiss_legacy_banner', '1'); App.renderTodayView();">Скрыть</button>
          </div>
        </div>
      `;
    }

    // Предупреждение о не уместившихся задачах
    if (schedule && schedule.unallocatedMinutes > 0) {
      const taskNames = (schedule.unallocatedTasks || []).map(u => `${u.title} (${u.unallocatedMinutes} мин)`).join(', ');
      html += `
        <div class="overload-warning-banner" style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px 16px; margin-bottom: 1rem; display: flex; align-items: center; gap: 1rem;">
          <span style="font-size: 1.5rem;">ℹ️</span>
          <div style="color: #1e40af; font-size: 0.9rem;">
            <strong>Уведомление оптимизатора:</strong> задач на сегодня больше, чем доступного времени до отбоя в ${settings.sleepStart || '21:30'}. Не уместилось ${schedule.unallocatedMinutes} мин (${schedule.unallocatedTasks.length} зад.): <em>${taskNames}</em>. Они не удалены, а безопасно перенесены. Время сна и защищённые блоки строго соблюдены.
          </div>
        </div>
      `;
    }

    html += `
      <!-- Верхний приветственный блок дня -->
      <div class="today-hero-card">
        <div class="today-hero-left">
          <div class="today-greeting-row">
            <h2>${greeting}!</h2>
            <span class="badge ${modeClasses[mode] || 'badge-info'}">${modeLabels[mode] || 'Обычный'}</span>
            ${schedule && schedule.has8thLesson ? '<span class="badge badge-accent">8-й урок сегодня (до 15:30)</span>' : ''}
          </div>
          <p class="today-date-text">📅 ${capitalizedDate}</p>
          <p class="text-muted">${schedule && schedule.modeReason ? schedule.modeReason : 'Автопланировщик держит всё под контролем.'}</p>
        </div>

        <div class="today-hero-actions">
          <button class="btn btn-primary" onclick="App.openAiModal()">
            🤖 ИИ-Помощник LifeOS
          </button>
          <button class="btn btn-secondary btn-sm" onclick="App.replanToday()">
            🔄 Перестроить
          </button>
          <button class="btn btn-secondary btn-sm" onclick="App.rollbackToday()" title="Отменить последнее перепланирование">
            ↩️ Откат
          </button>
        </div>
      </div>

      <!-- Быстрые карточки показателей дня -->
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-value">${progressPercent}%</div>
          <div class="metric-label">Выполнение плана дня</div>
          <div class="progress-bar-bg" style="margin-top: 8px;">
            <div class="progress-bar-fill" style="width: ${progressPercent}%;"></div>
          </div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${pendingTasks}</div>
          <div class="metric-label">Осталось задач (${completedTasks} готово)</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${Math.floor(hwMinutes / 60)}ч ${hwMinutes % 60}м</div>
          <div class="metric-label">Общая домашка (${activeHw.length} заданий)</div>
        </div>
        <div class="metric-card">
          <div class="metric-value text-accent" style="font-size: 1.25rem;">
            ${nextEvent ? `${nextEvent.startTime} — ${nextEvent.title}` : 'Все дела завершены!'}
          </div>
          <div class="metric-label">Ближайшее событие (напоминание: ${nextReminderTime})</div>
        </div>
      </div>

      <!-- Таблица / Список расписания на сегодня -->
      <div class="schedule-section-card">
        <div class="schedule-card-header">
          <div>
            <h3>Расписание на сегодня</h3>
            <p class="text-muted">Все уроки, блоки ЕГЭ, намаз ясту, игры и отдых распределены без наложений.</p>
          </div>
          <div class="schedule-legend">
            <span class="legend-dot dot-school"></span> Школа
            <span class="legend-dot dot-study"></span> Учёба/ЕГЭ
            <span class="legend-dot dot-prayer"></span> Намаз
            <span class="legend-dot dot-rest"></span> Отдых/Игры
          </div>
        </div>

        <div class="tasks-table-container">
    `;

    if (tasks.length === 0) {
      html += `
        <div class="empty-state">
          <p>Расписание на этот день ещё не сформировано.</p>
          <button class="btn btn-primary" onclick="App.replanToday()">Сформировать расписание автоматически</button>
        </div>
      `;
    } else {
      html += `
        <table class="schedule-table">
          <thead>
            <tr>
              <th style="width: 140px;">Время</th>
              <th>Задача и содержание</th>
              <th style="width: 160px;">Статус</th>
              <th style="width: 140px; text-align: right;">Действие</th>
            </tr>
          </thead>
          <tbody>
      `;

      tasks.forEach((task, index) => {
        const isCompleted = task.status === 'completed';
        const isCurrent = task.status === 'in_progress';

        const categoryClass = `cat-${task.category || 'other'}`;
        const statusClasses = {
          pending: 'badge-muted',
          in_progress: 'badge-warning',
          completed: 'badge-success',
          skipped: 'badge-danger',
          rescheduled: 'badge-info'
        };

        html += `
          <tr class="task-row ${isCompleted ? 'row-completed' : ''} ${isCurrent ? 'row-current' : ''} ${categoryClass}">
            <td class="task-time-cell">
              <span class="time-range">${task.startTime} – ${task.endTime}</span>
              <span class="time-duration text-muted">${task.durationMinutes} мин</span>
            </td>
            <td class="task-info-cell">
              <div class="task-title-line">
                <span class="task-title-text ${isCompleted ? 'line-through' : ''}">${task.title}</span>
                ${task.isProtected ? '<span class="badge badge-light-outline" title="Защищённый блок: время гарантировано">🛡️ Защищено</span>' : ''}
                ${task.isExtra ? '<span class="badge badge-purple">8-й урок</span>' : ''}
              </div>
              ${task.subtitle ? `<div class="task-subtitle-text text-muted">${task.subtitle}</div>` : ''}
            </td>
            <td class="task-status-cell">
              <select class="form-control form-control-sm status-select ${statusClasses[task.status] || ''}" onchange="App.setTaskStatus(${index}, this.value)">
                <option value="pending" ${task.status === 'pending' ? 'selected' : ''}>В ожидании</option>
                <option value="in_progress" ${task.status === 'in_progress' ? 'selected' : ''}>Выполняется</option>
                <option value="completed" ${task.status === 'completed' ? 'selected' : ''}>Выполнено</option>
                <option value="skipped" ${task.status === 'skipped' ? 'selected' : ''}>Пропущено</option>
                <option value="rescheduled" ${task.status === 'rescheduled' ? 'selected' : ''}>Перенесено</option>
              </select>
            </td>
            <td class="task-actions-cell" style="text-align: right;">
              <button class="btn btn-sm ${isCompleted ? 'btn-secondary' : 'btn-success'}" onclick="App.toggleTaskComplete(${index})">
                ${isCompleted ? '↩️ Вернуть' : '✓ Готово'}
              </button>
            </td>
          </tr>
        `;
      });

      html += `
          </tbody>
        </table>
      `;
    }

    html += `
        </div>
      </div>
    `;

    container.innerHTML = html;
  },

  async cleanLegacyDemo() {
    if (!confirm('Очистить старые демонстрационные данные? Система сначала автоматически скачает резервную копию.')) {
      return;
    }
    // Автоэкспорт бэкапа
    if (typeof SettingsManager !== 'undefined') {
      await SettingsManager.exportData();
    }
    await Database.cleanToZeroState();
    await AIPlanner.autoReplan(this.selectedDate, Database, 'Очистка демо-данных');
    alert('База очищена до чистого нуля! Прогресс готов к заполнению вашими реальными результатами.');
    this.renderTodayView();
  },

  /**
   * Единая функция изменения статуса задачи (P0.2)
   * Синхронизирует расписание, исходное домашнее задание, журнал активности и запускает автоперепланирование.
   */
  async updateTaskStatus(taskIdOrIndex, newStatus, options = {}) {
    const timeLib = this.getTimeLib();
    const dateStr = (options && options.dateStr) || this.selectedDate || (timeLib ? timeLib.getTodayStr() : new Date().toISOString().split('T')[0]);
    this.selectedDate = dateStr;
    const schedule = await Database.getDaySchedule(dateStr);

    let task = null;
    let taskIndex = -1;
    if (schedule && schedule.tasks) {
      if (typeof taskIdOrIndex === 'number') {
        taskIndex = taskIdOrIndex;
        task = schedule.tasks[taskIndex];
      } else {
        taskIndex = schedule.tasks.findIndex(t => t.id === taskIdOrIndex || (t.hwId && t.hwId === taskIdOrIndex));
        task = taskIndex >= 0 ? schedule.tasks[taskIndex] : null;
      }
    }

    // Поиск связанного ДЗ (по task.hwId или если передан сам ID ДЗ)
    let hw = null;
    if (task && task.hwId) {
      hw = await Database.get('homework', task.hwId);
    } else if (typeof taskIdOrIndex === 'string') {
      hw = await Database.get('homework', taskIdOrIndex);
    }

    if (!task && !hw) return;

    const completedAt = options.completedAt || (timeLib ? timeLib.getMoscowDate().toISOString() : new Date().toISOString());
    const actualMin = options.actualMinutes || (task ? task.actualMinutes : null) || (hw ? hw.actualMinutes : null) || (task ? task.durationMinutes : null) || (hw ? hw.estimatedMinutes : 30) || 30;

    // 1. Статус "completed" (выполнено)
    if (newStatus === 'completed') {
      if (task) {
        task.status = 'completed';
        task.completedAt = completedAt;
        task.actualMinutes = actualMin;
      }
      if (hw) {
        hw.status = 'completed';
        hw.completedAt = completedAt;
        hw.actualMinutes = actualMin;
        await Database.updateHomework(hw);
      }

      // Журнал активности с дедупликацией по taskId / hwId
      await Database.logActivity({
        taskId: task ? task.id : ('hw_' + hw.id),
        hwId: hw ? hw.id : (task ? task.hwId : null),
        category: (task && task.category) || 'homework',
        title: task ? task.title : `ДЗ: ${hw.subject} (${hw.title})`,
        action: 'completed',
        durationMinutes: actualMin,
        date: dateStr,
        timestamp: completedAt
      });
    }
    // 2. Возврат в статус "pending" (отмена выполнения)
    else if (newStatus === 'pending') {
      if (task) {
        task.status = 'pending';
        task.completedAt = null;
        task.actualMinutes = null;
      }
      if (hw) {
        hw.status = 'pending';
        hw.completedAt = null;
        hw.actualMinutes = null;
        await Database.updateHomework(hw);
      }

      // Удаление записи из журнала активности во избежание накрутки статистики
      await Database.removeActivityByTaskId(task ? task.id : null, hw ? hw.id : (task ? task.hwId : null));
    }
    // 3. Статус "skipped" (пропущено)
    else if (newStatus === 'skipped') {
      if (task) {
        task.status = 'skipped';
        task.completedAt = null;
      }
      if (hw) {
        hw.status = 'skipped';
        await Database.updateHomework(hw);
      }
      await Database.removeActivityByTaskId(task ? task.id : null, hw ? hw.id : (task ? task.hwId : null));
    }
    // 4. Реальный перенос "rescheduled"
    else if (newStatus === 'rescheduled') {
      const targetDate = options.targetDate || (timeLib ? timeLib.getTomorrowStr(dateStr) : null);
      if (task) {
        task.status = 'rescheduled';
        task.rescheduledTo = targetDate;
        task.rescheduledAt = new Date().toISOString();
      }
      if (hw && targetDate) {
        hw.dueDate = targetDate;
        hw.status = 'pending';
        await Database.updateHomework(hw);
      }
      await Database.removeActivityByTaskId(task ? task.id : null, hw ? hw.id : (task ? task.hwId : null));

      if (targetDate && targetDate !== dateStr) {
        const itemTitle = (task && task.title) || (hw && hw.title) || 'задача';
        await AIPlanner.autoReplan(targetDate, Database, `Принят перенос задачи: ${itemTitle}`);
      }
    }

    // Сохранение обновлённого расписания
    if (schedule) {
      await Database.saveDaySchedule(schedule);
    }

    // Автоперепланирование текущего дня без лишних подтверждений
    const taskTitle = (task && task.title) || (hw && hw.title) || 'задача';
    await AIPlanner.autoReplan(dateStr, Database, `Изменение статуса задачи «${taskTitle}» на ${newStatus}`);

    this.renderTodayView();
    if (typeof HomeworkManager !== 'undefined' && HomeworkManager.render) {
      HomeworkManager.render();
    }
  },

  async setTaskStatus(index, newStatus) {
    if (newStatus === 'rescheduled') {
      this.openRescheduleModal(index);
    } else {
      await this.updateTaskStatus(index, newStatus);
    }
  },

  async toggleTaskComplete(index) {
    const schedule = await Database.getDaySchedule(this.selectedDate);
    if (!schedule || !schedule.tasks || !schedule.tasks[index]) return;
    const task = schedule.tasks[index];
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    await this.updateTaskStatus(index, newStatus);
  },

  openRescheduleModal(index) {
    const timeLib = this.getTimeLib();
    const todayStr = this.selectedDate;
    const tomorrowStr = timeLib ? timeLib.getTomorrowStr(todayStr) : new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const modalId = 'reschedule-task-modal';
    let modal = document.getElementById(modalId);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      modal.className = 'modal-backdrop';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <h3>Реальный перенос задачи</h3>
          <button class="modal-close-btn" onclick="document.getElementById('${modalId}').remove(); App.renderTodayView();">&times;</button>
        </div>
        <div class="modal-body">
          <p>Выберите новую дату для переноса задачи. Планировщик автоматически выделит для неё свободное время в выбранный день:</p>
          <div class="form-group" style="margin-top: 1rem;">
            <label>Дата переноса:</label>
            <input type="date" id="reschedule-target-date" class="form-control" value="${tomorrowStr}" min="${todayStr}">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('${modalId}').remove(); App.renderTodayView();">Отмена</button>
          <button type="button" class="btn btn-primary" onclick="App.confirmReschedule(${index})">Перенести и обновить план</button>
        </div>
      </div>
    `;
  },

  async confirmReschedule(index) {
    const targetInput = document.getElementById('reschedule-target-date');
    const targetDate = targetInput ? targetInput.value : null;
    const modal = document.getElementById('reschedule-task-modal');
    if (modal) modal.remove();

    if (targetDate) {
      await this.updateTaskStatus(index, 'rescheduled', { targetDate });
      this.showToast(`Задача успешно перенесена на ${targetDate}`, 'success');
    }
  },

  async confirmTimetableQuick() {
    const timetable = await Database.getSchoolTimetable();
    const totalLessons = timetable.reduce((acc, d) => acc + (d.lessons ? d.lessons.length : 0), 0);
    if (totalLessons === 0) {
      this.showToast('В расписании пока нет уроков. Перейдите во вкладку «Неделя», чтобы внести уроки.', 'warning');
      this.navigateTo('school');
      return;
    }

    Database.saveSettings({
      schoolTimetableConfirmed: true,
      schoolTimetableOrigin: 'user_confirmed'
    });
    sessionStorage.removeItem('dismiss_timetable_banner');
    await AIPlanner.autoReplan(this.selectedDate, Database, 'Подтверждение расписания уроков', true);
    this.showToast('Расписание уроков подтверждено!', 'success');
    this.renderTodayView();
  },

  async replanToday() {
    try {
      const res = await AIPlanner.autoReplan(this.selectedDate, Database, 'Ручной запуск перепланирования', true);
      this.renderTodayView();
      if (res && res.success === true) {
        if (res.skipped) {
          this.showToast('Расписание актуально. Входные данные не изменились.', 'info');
        } else {
          this.showToast('Расписание успешно оптимизировано и перестроено!', 'success');
        }
      } else if (res && res.throttled) {
        this.showToast(res.reason || 'Слишком частые запросы на перепланирование. Подождите несколько секунд.', 'warning');
      } else {
        this.showToast((res && res.reason) || 'Не удалось перепланировать день. Попробуйте позже.', 'error');
      }
    } catch (err) {
      this.showToast('Ошибка при перепланировании: ' + (err.message || err), 'error');
    }
  },

  async rollbackToday() {
    const res = await Scheduler.rollbackLastReplan(this.selectedDate, Database);
    if (res.success) {
      this.showToast(res.message, 'success');
      this.renderTodayView();
    } else {
      this.showToast(res.message || 'Нет сохранённых предыдущих планов для отката.', 'warning');
    }
  },

  // ==========================================
  // МОДАЛЬНОЕ ОКНО ИИ-ПОМОЩНИКА
  // ==========================================
  async openAiModal() {
    const modalId = 'ai-assistant-modal';
    let modal = document.getElementById(modalId);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      modal.className = 'modal-backdrop';
      document.body.appendChild(modal);
    }

    const schedule = await Database.getDaySchedule(this.selectedDate);
    const history = await Database.getReplanHistory(this.selectedDate);

    modal.innerHTML = `
      <div class="modal-card modal-card-lg">
        <div class="modal-header">
          <div class="modal-header-title">
            <span class="ai-avatar">🤖</span>
            <div>
              <h3>ИИ-Помощник LifeOS</h3>
              <p class="text-muted">Анализ нагрузки, журнал перепланирования и рекомендации</p>
            </div>
          </div>
          <button class="modal-close-btn" onclick="document.getElementById('${modalId}').remove()">&times;</button>
        </div>

        <div class="modal-body">
          <div class="ai-section-box">
            <h4>💡 Анализ текущего расписания:</h4>
            <div class="ai-explanation-text">
              ${schedule && schedule.modeReason ? schedule.modeReason : 'Расписание находится в оптимальном состоянии.'}
              <br><br>
              <strong>Защищённые интервалы:</strong> Сон 21:30–06:00 (8.5 ч), Намаз ясту (${schedule ? schedule.yastuTime : '16:56'}), 60 мин игр на ПК, 25 мин спорта и ужин с родителями.
            </div>
          </div>

          <div class="ai-section-box" style="margin-top: 1rem;">
            <h4>📋 Журнал изменений (Change Log):</h4>
            <div class="replan-history-list">
              ${history.length === 0 ? '<p class="text-muted">История перепланирований пока пуста.</p>' : `
                <ul>
                  ${history.slice(-4).reverse().map(h => `
                    <li>
                      <span class="history-time text-muted">${new Date(h.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}:</span>
                      <strong>${h.reason}</strong>
                      <span class="badge badge-light-outline">Режим: ${h.mode || 'авто'}</span>
                    </li>
                  `).join('')}
                </ul>
              `}
            </div>
          </div>

          <div class="ai-section-box" style="margin-top: 1rem;">
            <h4>💬 Задать вопрос ИИ-помощнику:</h4>
            <div class="ai-quick-buttons">
              <button class="btn btn-sm btn-outline-primary" onclick="App.askAi('Успеваю ли я к хакатону 27 ноября?')">Хакатон «Миросборка»</button>
              <button class="btn btn-sm btn-outline-primary" onclick="App.askAi('Как распределить время на профильную математику ЕГЭ?')">ЕГЭ: Математика</button>
              <button class="btn btn-sm btn-outline-primary" onclick="App.askAi('Я чувствую усталость, как оптимизировать день?')">Снять усталость</button>
              <button class="btn btn-sm btn-outline-primary" onclick="App.askAi('Когда сегодня намаз ясту?')">Время ясту</button>
            </div>
            <div id="ai-chat-response" class="ai-chat-bubble" style="display: none; margin-top: 10px;"></div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-outline-danger btn-sm" onclick="App.rollbackToday(); document.getElementById('${modalId}').remove();">
            ↩️ Отменить последнее перепланирование
          </button>
          <button class="btn btn-secondary btn-sm" onclick="document.getElementById('${modalId}').remove()">
            Закрыть
          </button>
        </div>
      </div>
    `;
  },

  async askAi(question) {
    const respBox = document.getElementById('ai-chat-response');
    if (!respBox) return;
    respBox.style.display = 'block';
    respBox.innerHTML = '<em>Анализирую расписание и цели...</em>';

    const answer = await AIPlanner.getAdvice(question, Database);
    respBox.innerHTML = `<strong>Вопрос:</strong> ${question}<br><br><strong>ИИ LifeOS:</strong> ${answer}`;
  },

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((reg) => {
          console.log('LifeOS ServiceWorker зарегистрирован успешно:', reg.scope);
        }).catch((err) => {
          console.warn('Ошибка регистрации ServiceWorker:', err);
        });
      });
    }
  }
};

if (typeof window !== 'undefined') {
  window.App = App;
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('DOMContentLoaded', () => {
      App.init();
    });
  }
}
if (typeof globalThis !== 'undefined') {
  globalThis.App = App;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = App;
}
