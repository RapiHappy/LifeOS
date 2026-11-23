/**
 * LifeOS — Главный координатор приложения (app.js)
 * Управляет навигацией, экраном «Сегодня», статусами задач,
 * ИИ-ассистентом, живыми часами и Service Worker.
 */

const App = {
  currentView: 'today',
  selectedDate: null, // по умолчанию текущая дата 'YYYY-MM-DD'
  clockTimer: null,

  async init() {
    console.log('Инициализация LifeOS 1.0...');
    
    // Текущая дата
    const now = new Date();
    this.selectedDate = now.toISOString().split('T')[0];

    // Инициализация базы данных
    await Database.init();

    // Инициализация менеджера уведомлений
    NotificationsManager.init(Database);

    // Запуск живых часов
    this.startClock();

    // Настройка навигации
    this.setupNavigation();

    // Первичная генерация расписания на сегодня, если его ещё нет
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
        const now = new Date();
        const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        el.textContent = timeStr;
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
    } else if (this.currentView === 'school') {
      SchoolManager.init(Database);
    } else if (this.currentView === 'homework') {
      HomeworkManager.init(Database);
    } else if (this.currentView === 'goals') {
      GoalsManager.init(Database);
    } else if (this.currentView === 'statistics') {
      StatisticsManager.init(Database);
    } else if (this.currentView === 'settings') {
      SettingsManager.init(Database);
    }
  },

  // ==========================================
  // ГЛАВНЫЙ ЭКРАН «СЕГОДНЯ»
  // ==========================================
  async renderTodayView() {
    const container = document.getElementById('today-content');
    if (!container) return;

    const schedule = await Database.getDaySchedule(this.selectedDate);
    const homework = await Database.getAllHomework();
    const settings = Database.getSettings();
    const now = new Date();

    const tasks = schedule ? (schedule.tasks || []) : [];
    const mode = schedule ? schedule.mode : (settings.activeMode || 'normal');

    // Подсчет метрик дня
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
    const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Домашка на сегодня/завтра
    const activeHw = homework.filter(h => h.status !== 'completed');
    let hwMinutes = 0;
    activeHw.forEach(h => hwMinutes += (h.estimatedMinutes || 30));

    // Ближайшее предстоящее событие
    const currentMin = now.getHours() * 60 + now.getMinutes();
    let nextEvent = null;
    let nextReminderTime = '—';

    for (const t of tasks) {
      const [h, m] = (t.startTime || '00:00').split(':').map(Number);
      const startMin = h * 60 + m;
      if (startMin >= currentMin && t.status !== 'completed' && t.status !== 'skipped') {
        nextEvent = t;
        const advance = Number(settings.notificationAdvance) || 10;
        const remMin = Math.max(0, startMin - advance);
        nextReminderTime = Scheduler.minToTime(remMin);
        break;
      }
    }

    // Приветствие по времени суток
    const hour = now.getHours();
    let greeting = 'Добрый день';
    if (hour >= 5 && hour < 12) greeting = 'Доброе утро';
    else if (hour >= 18 && hour < 23) greeting = 'Добрый вечер';
    else if (hour >= 23 || hour < 5) greeting = 'Доброй ночи';

    // Форматирование даты
    const dateFormatted = new Date(this.selectedDate + 'T12:00:00').toLocaleDateString('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    const capitalizedDate = dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1);

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

    let html = `
      <!-- Верхний приветственный блок дня -->
      <div class="today-hero-card">
        <div class="today-hero-left">
          <div class="today-greeting-row">
            <h2>${greeting}!</h2>
            <span class="badge ${modeClasses[mode] || 'badge-info'}">${modeLabels[mode] || 'Обычный'}</span>
            ${schedule && schedule.has8thLesson ? '<span class="badge badge-accent">8-й урок сегодня</span>' : ''}
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
        const isSkipped = task.status === 'skipped';

        const categoryClass = `cat-${task.category || 'other'}`;
        const statusLabels = {
          pending: 'В ожидании',
          in_progress: 'Выполняется',
          completed: 'Выполнено',
          skipped: 'Пропущено',
          rescheduled: 'Перенесено'
        };
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

  async setTaskStatus(index, newStatus) {
    const schedule = await Database.getDaySchedule(this.selectedDate);
    if (!schedule || !schedule.tasks || !schedule.tasks[index]) return;

    const task = schedule.tasks[index];
    task.status = newStatus;

    if (newStatus === 'completed') {
      task.completedAt = new Date().toISOString();
      await Database.logActivity({
        category: task.category || 'routine',
        title: task.title,
        durationMinutes: task.durationMinutes || 30,
        date: this.selectedDate
      });
    }

    await Database.saveDaySchedule(schedule);
    this.renderTodayView();
  },

  async toggleTaskComplete(index) {
    const schedule = await Database.getDaySchedule(this.selectedDate);
    if (!schedule || !schedule.tasks || !schedule.tasks[index]) return;

    const task = schedule.tasks[index];
    if (task.status === 'completed') {
      task.status = 'pending';
      task.completedAt = null;
    } else {
      task.status = 'completed';
      task.completedAt = new Date().toISOString();

      await Database.logActivity({
        category: task.category || 'routine',
        title: task.title,
        durationMinutes: task.durationMinutes || 30,
        date: this.selectedDate
      });

      // Если это было ДЗ, отметим в модуле ДЗ
      if (task.hwId) {
        const hw = await Database.get('homework', task.hwId);
        if (hw) {
          hw.status = 'completed';
          hw.completedAt = new Date().toISOString();
          hw.actualMinutes = task.durationMinutes;
          await Database.updateHomework(hw);
        }
      }
    }

    await Database.saveDaySchedule(schedule);
    this.renderTodayView();
  },

  async replanToday() {
    const result = await AIPlanner.autoReplan(this.selectedDate, Database, 'Ручной запуск перепланирования');
    this.renderTodayView();
    alert('Расписание успешно оптимизировано и перестроено!');
  },

  async rollbackToday() {
    const res = await Scheduler.rollbackLastReplan(this.selectedDate, Database);
    if (res.success) {
      alert(res.message);
      this.renderTodayView();
    } else {
      alert(res.message || 'Нет сохранённых предыдущих планов для отката.');
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
    const lastHistory = history.length > 0 ? history[history.length - 1] : null;

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
              <strong>Защищённые интервалы:</strong> Сон 21:30–06:00, Намаз ясту (${schedule ? schedule.yastuTime : '16:56'}), 60 мин игр на ПК, 25 мин спорта и ужин с родителями.
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

window.App = App;
window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
