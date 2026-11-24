/**
 * LifeOS — Модуль домашних заданий (homework.js)
 * Управление списком ДЗ, расчёт нагрузки, фиксация фактического времени,
 * архив выполненных задач и авто-перепланирование дня.
 * Интеграция с TimeUtils (Europe/Moscow).
 */

const HomeworkManager = {
  activeFilter: 'all', // 'all' | 'tomorrow' | 'week' | 'completed'

  getTimeLib() {
    return (typeof TimeUtils !== 'undefined') ? TimeUtils : (typeof globalThis !== 'undefined' && globalThis.TimeUtils ? globalThis.TimeUtils : null);
  },

  getTodayString() {
    const t = this.getTimeLib();
    return t ? t.getTodayStr() : new Date().toISOString().split('T')[0];
  },

  getTomorrowString() {
    const t = this.getTimeLib();
    return t ? t.getTomorrowStr() : new Date(Date.now() + 86400000).toISOString().split('T')[0];
  },

  init(db) {
    this.db = db;
    this.render();
  },

  setFilter(filter) {
    this.activeFilter = filter;
    this.render();
  },

  async render() {
    const container = document.getElementById('homework-content');
    if (!container) return;

    const allHw = await this.db.getAllHomework();
    const todayStr = this.getTodayString();
    const tomorrowStr = this.getTomorrowString();
    const timeLib = this.getTimeLib();

    // Анализ метрик
    const activeTasks = allHw.filter(h => h.status !== 'completed');
    const completedTasks = allHw.filter(h => h.status === 'completed');

    let totalActiveMinutes = 0;
    let overdueCount = 0;
    let tomorrowMinutes = 0;

    activeTasks.forEach(h => {
      const mins = Number(h.estimatedMinutes) || 30;
      totalActiveMinutes += mins;
      if (h.dueDate < todayStr) {
        overdueCount++;
      }
      if (h.dueDate === tomorrowStr) {
        tomorrowMinutes += mins;
      }
    });

    const formatMins = (m) => {
      const hours = Math.floor(m / 60);
      const mins = m % 60;
      if (hours === 0) return `${mins} мин`;
      return `${hours}ч ${mins}м`;
    };

    // Фильтрация списка для отображения
    let displayList = [];
    if (this.activeFilter === 'completed') {
      displayList = completedTasks;
    } else if (this.activeFilter === 'tomorrow') {
      displayList = activeTasks.filter(h => h.dueDate === tomorrowStr);
    } else if (this.activeFilter === 'week') {
      const nextWeekStr = timeLib ? timeLib.addDays(todayStr, 7) : new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
      displayList = activeTasks.filter(h => h.dueDate >= todayStr && h.dueDate <= nextWeekStr);
    } else {
      displayList = activeTasks;
    }

    // Сортировка: сначала дедлайн, потом важность
    displayList.sort((a, b) => {
      if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      const prio = { critical: 4, high: 3, medium: 2, low: 1 };
      return (prio[b.priority] || 1) - (prio[a.priority] || 1);
    });

    let html = `
      <!-- Статистические карточки нагрузки -->
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-value">${activeTasks.length}</div>
          <div class="metric-label">Активных заданий</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${formatMins(totalActiveMinutes)}</div>
          <div class="metric-label">Общее расчетное время</div>
        </div>
        <div class="metric-card ${overdueCount > 0 ? 'metric-card-danger' : ''}">
          <div class="metric-value">${overdueCount}</div>
          <div class="metric-label">Просроченных заданий</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${formatMins(tomorrowMinutes)}</div>
          <div class="metric-label">Нагрузка на завтра</div>
        </div>
      </div>

      <!-- Панель управления и фильтры -->
      <div class="hw-controls-bar">
        <div class="filter-pills">
          <button class="pill-btn ${this.activeFilter === 'all' ? 'active' : ''}" onclick="HomeworkManager.setFilter('all')">Все активные (${activeTasks.length})</button>
          <button class="pill-btn ${this.activeFilter === 'tomorrow' ? 'active' : ''}" onclick="HomeworkManager.setFilter('tomorrow')">На завтра</button>
          <button class="pill-btn ${this.activeFilter === 'week' ? 'active' : ''}" onclick="HomeworkManager.setFilter('week')">На неделю</button>
          <button class="pill-btn ${this.activeFilter === 'completed' ? 'active' : ''}" onclick="HomeworkManager.setFilter('completed')">История / Архив (${completedTasks.length})</button>
        </div>
        <button class="btn btn-primary" onclick="HomeworkManager.openAddModal()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          Добавить домашку
        </button>
      </div>

      <!-- Список заданий -->
      <div class="hw-list">
    `;

    if (displayList.length === 0) {
      html += `
        <div class="empty-state">
          <p>В этом списке нет заданий.</p>
          ${this.activeFilter !== 'completed' ? '<button class="btn btn-secondary btn-sm" onclick="HomeworkManager.openAddModal()">Добавить первое задание</button>' : ''}
        </div>
      `;
    } else {
      displayList.forEach(hw => {
        const isCompleted = hw.status === 'completed';
        const isOverdue = !isCompleted && hw.dueDate < todayStr;
        const priorityLabels = {
          critical: 'Критический',
          high: 'Высокий',
          medium: 'Средний',
          low: 'Низкий'
        };
        const priorityClasses = {
          critical: 'badge-danger',
          high: 'badge-warning',
          medium: 'badge-info',
          low: 'badge-muted'
        };

        html += `
          <div class="hw-card ${isCompleted ? 'hw-card-completed' : ''} ${isOverdue ? 'hw-card-overdue' : ''}">
            <div class="hw-check-col">
              <button class="hw-check-btn ${isCompleted ? 'checked' : ''}" title="${isCompleted ? 'Вернуть в активные' : 'Отметить выполненным'}" onclick="HomeworkManager.toggleComplete('${hw.id}')">
                ${isCompleted ? '✓' : ''}
              </button>
            </div>
            <div class="hw-content-col">
              <div class="hw-header-row">
                <span class="hw-subject-badge">${hw.subject}</span>
                <span class="hw-title ${isCompleted ? 'line-through' : ''}">${hw.title}</span>
                <span class="badge ${priorityClasses[hw.priority] || 'badge-muted'}">${priorityLabels[hw.priority] || 'Обычный'}</span>
                ${hw.required ? '<span class="badge badge-accent">Обязательное</span>' : '<span class="badge badge-muted">Доп.</span>'}
                ${isOverdue ? '<span class="badge badge-danger">Просрочено!</span>' : ''}
              </div>
              ${hw.description ? `<p class="hw-desc text-muted">${hw.description}</p>` : ''}
              <div class="hw-footer-row text-muted">
                <span>📅 Срок: <strong>${hw.dueDate}</strong></span>
                <span>⏱️ Оценка: <strong>${hw.estimatedMinutes || 30} мин</strong></span>
                ${hw.actualMinutes ? `<span class="text-success">⏱️ Факт: <strong>${hw.actualMinutes} мин</strong></span>` : ''}
                <span>🎯 Сложность: ${'★'.repeat(hw.difficulty || 2)}${'☆'.repeat(3 - (hw.difficulty || 2))}</span>
              </div>
            </div>
            <div class="hw-actions-col">
              ${!isCompleted ? `
                <button class="btn-icon" title="Завершить с указанием времени" onclick="HomeworkManager.openCompleteModal('${hw.id}')">⏱️</button>
                <button class="btn-icon" title="Редактировать" onclick="HomeworkManager.openEditModal('${hw.id}')">✏️</button>
              ` : ''}
              <button class="btn-icon text-danger" title="Удалить" onclick="HomeworkManager.deleteHw('${hw.id}')">🗑️</button>
            </div>
          </div>
        `;
      });
    }

    html += `
      </div>
    `;

    container.innerHTML = html;
  },

  async toggleComplete(id) {
    const hw = await this.db.get('homework', id);
    if (!hw) return;

    const todayStr = this.getTodayString();
    const todaySchedule = await this.db.getDaySchedule(todayStr);

    if (hw.status === 'completed') {
      hw.status = 'pending';
      hw.completedAt = null;
      hw.actualMinutes = null;
      await this.db.removeActivityByTaskId(null, hw.id);

      if (todaySchedule && todaySchedule.tasks) {
        const task = todaySchedule.tasks.find(t => t.hwId === id);
        if (task) {
          task.status = 'pending';
          task.completedAt = null;
          task.actualMinutes = null;
          await this.db.saveDaySchedule(todaySchedule);
        }
      }
    } else {
      hw.status = 'completed';
      hw.completedAt = new Date().toISOString();
      const actual = hw.actualMinutes || hw.estimatedMinutes || 30;
      hw.actualMinutes = actual;

      await this.db.logActivity({
        hwId: hw.id,
        category: 'homework',
        title: `ДЗ: ${hw.subject} (${hw.title})`,
        durationMinutes: actual,
        date: todayStr,
        timestamp: hw.completedAt
      });

      if (todaySchedule && todaySchedule.tasks) {
        const task = todaySchedule.tasks.find(t => t.hwId === id);
        if (task) {
          task.status = 'completed';
          task.completedAt = hw.completedAt;
          task.actualMinutes = actual;
          await this.db.saveDaySchedule(todaySchedule);
        }
      }
    }

    await this.db.updateHomework(hw);
    await AIPlanner.autoReplan(todayStr, this.db, 'Отметка выполнения домашнего задания');

    this.render();
    if (window.App && typeof window.App.refreshCurrentView === 'function') window.App.refreshCurrentView();
  },

  openCompleteModal(id) {
    this.db.get('homework', id).then(hw => {
      if (!hw) return;
      const modalId = 'hw-complete-modal';
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
            <h3>Завершение домашнего задания</h3>
            <button class="modal-close-btn" onclick="document.getElementById('${modalId}').remove()">&times;</button>
          </div>
          <div class="modal-body">
            <p><strong>${hw.subject}:</strong> ${hw.title}</p>
            <p class="text-muted">Плановая оценка составляла: ${hw.estimatedMinutes || 30} минут.</p>
            <div class="form-group" style="margin-top: 1rem;">
              <label>Сколько минут фактически заняло выполнение?</label>
              <input type="number" id="actual-minutes-input" class="form-control" min="5" max="360" value="${hw.estimatedMinutes || 30}">
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('${modalId}').remove()">Отмена</button>
            <button type="button" class="btn btn-primary" onclick="HomeworkManager.confirmComplete('${hw.id}')">Завершить и сохранить</button>
          </div>
        </div>
      `;
    });
  },

  async confirmComplete(id) {
    const hw = await this.db.get('homework', id);
    if (!hw) return;

    const actualInput = document.getElementById('actual-minutes-input');
    const actual = Number(actualInput ? actualInput.value : hw.estimatedMinutes) || 30;
    const todayStr = this.getTodayString();

    hw.status = 'completed';
    hw.completedAt = new Date().toISOString();
    hw.actualMinutes = actual;

    await this.db.updateHomework(hw);

    await this.db.logActivity({
      hwId: hw.id,
      category: 'homework',
      title: `ДЗ: ${hw.subject} (${hw.title})`,
      durationMinutes: actual,
      date: todayStr,
      timestamp: hw.completedAt
    });

    const todaySchedule = await this.db.getDaySchedule(todayStr);
    if (todaySchedule && todaySchedule.tasks) {
      const task = todaySchedule.tasks.find(t => t.hwId === id);
      if (task) {
        task.status = 'completed';
        task.completedAt = hw.completedAt;
        task.actualMinutes = actual;
        await this.db.saveDaySchedule(todaySchedule);
      }
    }

    const modal = document.getElementById('hw-complete-modal');
    if (modal) modal.remove();

    await AIPlanner.autoReplan(todayStr, this.db, 'Завершение ДЗ с фактическим временем');

    this.render();
    if (window.App && typeof window.App.refreshCurrentView === 'function') window.App.refreshCurrentView();
  },

  async deleteHw(id) {
    if (!confirm('Удалить это домашнее задание?')) return;
    await this.db.deleteHomework(id);

    const todayStr = this.getTodayString();
    await AIPlanner.autoReplan(todayStr, this.db, 'Удаление домашнего задания');

    this.render();
    if (window.App && typeof window.App.refreshCurrentView === 'function') window.App.refreshCurrentView();
  },

  openAddModal() {
    this.showFormModal(null);
  },

  async openEditModal(id) {
    const hw = await this.db.get('homework', id);
    if (!hw) return;
    this.showFormModal(hw);
  },

  showFormModal(hwData) {
    const isEdit = !!hwData;
    const modalId = 'hw-form-modal';
    let modal = document.getElementById(modalId);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      modal.className = 'modal-backdrop';
      document.body.appendChild(modal);
    }

    const defaultDueDate = this.getTomorrowString();

    const subjects = [
      'Алгебра (профиль)', 'Геометрия (профиль)', 'Информатика', 'Физика',
      'Русский язык', 'Литература', 'Английский язык', 'Химия', 'Биология',
      'История', 'Обществознание', 'География', 'ОБЗР'
    ];

    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <h3>${isEdit ? 'Редактировать домашнее задание' : 'Новое домашнее задание'}</h3>
          <button class="modal-close-btn" onclick="document.getElementById('${modalId}').remove()">&times;</button>
        </div>
        <form id="hw-form" onsubmit="HomeworkManager.handleFormSubmit(event, '${hwData ? hwData.id : ''}')">
          <div class="form-row">
            <div class="form-group col">
              <label>Предмет *</label>
              <input list="subjects-list" id="hw-subject" class="form-control" required value="${hwData ? hwData.subject : 'Алгебра (профиль)'}">
              <datalist id="subjects-list">
                ${subjects.map(s => `<option value="${s}">`).join('')}
              </datalist>
            </div>
            <div class="form-group col">
              <label>Срок сдачи (Дедлайн) *</label>
              <input type="date" id="hw-due-date" class="form-control" required value="${hwData ? hwData.dueDate : defaultDueDate}">
            </div>
          </div>

          <div class="form-group">
            <label>Название / Тема задания *</label>
            <input type="text" id="hw-title" class="form-control" required value="${hwData ? hwData.title : ''}" placeholder="Решить вариант №14 (задания 13 и 15)">
          </div>

          <div class="form-group">
            <label>Описание / Номера задач</label>
            <textarea id="hw-desc" class="form-control" rows="2" placeholder="Параграф 12, номера 14, 16, 18, выучить формулы">${hwData ? hwData.description || '' : ''}</textarea>
          </div>

          <div class="form-row">
            <div class="form-group col">
              <label>Примерное время (минут) *</label>
              <input type="number" id="hw-est-min" class="form-control" min="5" max="300" step="5" required value="${hwData ? hwData.estimatedMinutes : 30}">
            </div>
            <div class="form-group col">
              <label>Сложность (1-3)</label>
              <select id="hw-difficulty" class="form-control">
                <option value="1" ${hwData && hwData.difficulty === 1 ? 'selected' : ''}>1 — Легко</option>
                <option value="2" ${!hwData || hwData.difficulty === 2 ? 'selected' : ''}>2 — Средне</option>
                <option value="3" ${hwData && hwData.difficulty === 3 ? 'selected' : ''}>3 — Сложно</option>
              </select>
            </div>
            <div class="form-group col">
              <label>Приоритет</label>
              <select id="hw-priority" class="form-control">
                <option value="low" ${hwData && hwData.priority === 'low' ? 'selected' : ''}>Низкий</option>
                <option value="medium" ${!hwData || hwData.priority === 'medium' ? 'selected' : ''}>Средний</option>
                <option value="high" ${hwData && hwData.priority === 'high' ? 'selected' : ''}>Высокий</option>
                <option value="critical" ${hwData && hwData.priority === 'critical' ? 'selected' : ''}>Критический</option>
              </select>
            </div>
          </div>

          <div class="form-checkbox-row">
            <label class="checkbox-label">
              <input type="checkbox" id="hw-required" ${!hwData || hwData.required !== false ? 'checked' : ''}>
              <span>Обязательное задание (учитывается в первую очередь)</span>
            </label>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('${modalId}').remove()">Отмена</button>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Сохранить изменения' : 'Добавить задание'}</button>
          </div>
        </form>
      </div>
    `;
  },

  async handleFormSubmit(e, editId) {
    e.preventDefault();

    const hwData = {
      subject: document.getElementById('hw-subject').value.trim(),
      dueDate: document.getElementById('hw-due-date').value,
      title: document.getElementById('hw-title').value.trim(),
      description: document.getElementById('hw-desc').value.trim(),
      estimatedMinutes: Number(document.getElementById('hw-est-min').value) || 30,
      difficulty: Number(document.getElementById('hw-difficulty').value) || 2,
      priority: document.getElementById('hw-priority').value,
      required: document.getElementById('hw-required').checked
    };

    if (editId) {
      const existing = await this.db.get('homework', editId);
      const updated = { ...existing, ...hwData };
      await this.db.updateHomework(updated);
    } else {
      await this.db.addHomework(hwData);
    }

    const modal = document.getElementById('hw-form-modal');
    if (modal) modal.remove();

    const todayStr = this.getTodayString();
    await AIPlanner.autoReplan(todayStr, this.db, editId ? 'Редактирование ДЗ' : 'Добавление нового ДЗ');

    this.render();
    if (window.App && typeof window.App.refreshCurrentView === 'function') window.App.refreshCurrentView();
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = HomeworkManager;
}
if (typeof globalThis !== 'undefined') {
  globalThis.HomeworkManager = HomeworkManager;
}
