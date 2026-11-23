/**
 * LifeOS — Модуль школьного расписания (school.js)
 * Управление уроками с 1 по 6 дни недели, поддержка 8-х уроков (Вт/Чт),
 * контрольных работ, отменённых занятий и автоматического пересчёта расписания.
 * Интеграция с TimeUtils (Europe/Moscow).
 */

const SchoolManager = {
  currentDayTab: 1, // 1-Пн по умолчанию
  daysNames: [
    { id: 1, name: 'Понедельник', short: 'ПН', lessonsCount: 6 },
    { id: 2, name: 'Вторник', short: 'ВТ', lessonsCount: 8, has8th: true },
    { id: 3, name: 'Среда', short: 'СР', lessonsCount: 6 },
    { id: 4, name: 'Четверг', short: 'ЧТ', lessonsCount: 8, has8th: true },
    { id: 5, name: 'Пятница', short: 'ПТ', lessonsCount: 6 },
    { id: 6, name: 'Суббота', short: 'СБ', lessonsCount: 4 }
  ],

  getTodayString() {
    const timeLib = (typeof TimeUtils !== 'undefined') ? TimeUtils : (typeof globalThis !== 'undefined' && globalThis.TimeUtils ? globalThis.TimeUtils : null);
    return timeLib ? timeLib.getTodayStr() : new Date().toISOString().split('T')[0];
  },

  getCurrentDayOfWeek() {
    const timeLib = (typeof TimeUtils !== 'undefined') ? TimeUtils : (typeof globalThis !== 'undefined' && globalThis.TimeUtils ? globalThis.TimeUtils : null);
    if (timeLib) {
      return timeLib.getDayOfWeek(timeLib.getTodayStr());
    }
    const d = new Date().getDay();
    return d === 0 ? 7 : d;
  },

  init(db) {
    this.db = db;
    const currentDow = this.getCurrentDayOfWeek();
    this.currentDayTab = (currentDow >= 1 && currentDow <= 6) ? currentDow : 1;
    this.render();
  },

  selectDay(dayId) {
    this.currentDayTab = dayId;
    this.render();
  },

  async render() {
    const container = document.getElementById('school-content');
    if (!container) return;

    const timetable = await this.db.getSchoolTimetable();
    const dayData = timetable.find(t => t.dayOfWeek === this.currentDayTab) || { dayOfWeek: this.currentDayTab, lessons: [] };
    const currentDayMeta = this.daysNames.find(d => d.id === this.currentDayTab) || this.daysNames[0];

    // Подсчет окончания занятий
    let lastTime = '—';
    if (dayData.lessons && dayData.lessons.length > 0) {
      const active = dayData.lessons.filter(l => !l.isCanceled);
      if (active.length > 0) {
        lastTime = active[active.length - 1].endTime;
      }
    }

    let html = `
      <div class="school-header-card">
        <div class="school-header-info">
          <h2>Школьное расписание 10 класса</h2>
          <p class="text-muted">Реальное расписание уроков. Во вторник и четверг предусмотрен 8-й урок (до 15:30) с автоматической адаптацией дороги домой и обеда.</p>
        </div>
        <div class="school-day-badge">
          <span>Окончание школы: <strong>${lastTime}</strong></span>
          ${currentDayMeta.has8th ? '<span class="badge badge-accent">⚡ День с 8-м уроком (до 15:30)</span>' : ''}
        </div>
      </div>

      <!-- Переключатель дней недели -->
      <div class="days-nav-tabs">
        ${this.daysNames.map(d => `
          <button class="day-tab-btn ${d.id === this.currentDayTab ? 'active' : ''}" onclick="SchoolManager.selectDay(${d.id})">
            <span class="day-short">${d.short}</span>
            <span class="day-full">${d.name}</span>
            ${d.has8th ? '<span class="dot-accent" title="8-й урок">•</span>' : ''}
          </button>
        `).join('')}
      </div>

      <div class="school-lessons-container">
        <div class="lessons-header-actions">
          <h3>${currentDayMeta.name}</h3>
          <button class="btn btn-primary btn-sm" onclick="SchoolManager.openAddLessonModal()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            Добавить урок
          </button>
        </div>

        <div class="lessons-list">
    `;

    if (!dayData.lessons || dayData.lessons.length === 0) {
      html += `
        <div class="empty-state">
          <p>В этот день уроки не запланированы.</p>
          <button class="btn btn-secondary btn-sm" onclick="SchoolManager.openAddLessonModal()">Добавить первый урок</button>
        </div>
      `;
    } else {
      dayData.lessons.forEach((lesson, index) => {
        const isCanceled = !!lesson.isCanceled;
        const isExtra = !!lesson.isExtra || lesson.lessonNumber === 8;

        html += `
          <div class="lesson-card ${isCanceled ? 'lesson-canceled' : ''} ${isExtra ? 'lesson-extra' : ''}">
            <div class="lesson-num-badge">${lesson.lessonNumber || (index + 1)}</div>
            <div class="lesson-main-info">
              <div class="lesson-title-row">
                <span class="lesson-subject ${isCanceled ? 'line-through' : ''}">${lesson.subject}</span>
                ${isExtra ? '<span class="badge badge-purple">8-й урок / Практикум</span>' : ''}
                ${lesson.isTest ? '<span class="badge badge-danger">🔥 Контрольная</span>' : ''}
                ${isCanceled ? '<span class="badge badge-muted">Отменён</span>' : ''}
              </div>
              <div class="lesson-meta-row text-muted">
                <span>⏰ ${lesson.startTime} – ${lesson.endTime}</span>
                ${lesson.room ? `<span>🚪 Кабинет: ${lesson.room}</span>` : ''}
                ${lesson.notes ? `<span class="lesson-notes-text">📝 ${lesson.notes}</span>` : ''}
              </div>
            </div>
            <div class="lesson-actions">
              <button class="btn-icon" title="${isCanceled ? 'Восстановить урок' : 'Отметить отмену урока'}" onclick="SchoolManager.toggleCancelLesson(${index})">
                ${isCanceled ? '↩️' : '🚫'}
              </button>
              <button class="btn-icon" title="Отметить контрольную" onclick="SchoolManager.toggleTestLesson(${index})">
                📝
              </button>
              <button class="btn-icon" title="Редактировать" onclick="SchoolManager.openEditLessonModal(${index})">
                ✏️
              </button>
              <button class="btn-icon text-danger" title="Удалить урок" onclick="SchoolManager.deleteLesson(${index})">
                🗑️
              </button>
            </div>
          </div>
        `;
      });
    }

    html += `
        </div>
      </div>
    `;

    container.innerHTML = html;
  },

  async toggleCancelLesson(index) {
    const timetable = await this.db.getSchoolTimetable();
    const dayData = timetable.find(t => t.dayOfWeek === this.currentDayTab);
    if (!dayData || !dayData.lessons[index]) return;

    dayData.lessons[index].isCanceled = !dayData.lessons[index].isCanceled;
    await this.db.saveDayTimetable(this.currentDayTab, dayData.lessons);

    const todayStr = this.getTodayString();
    await AIPlanner.autoReplan(todayStr, this.db, 'Изменение статуса урока');

    this.render();
    if (window.App && typeof window.App.refreshCurrentView === 'function') window.App.refreshCurrentView();
  },

  async toggleTestLesson(index) {
    const timetable = await this.db.getSchoolTimetable();
    const dayData = timetable.find(t => t.dayOfWeek === this.currentDayTab);
    if (!dayData || !dayData.lessons[index]) return;

    dayData.lessons[index].isTest = !dayData.lessons[index].isTest;
    await this.db.saveDayTimetable(this.currentDayTab, dayData.lessons);

    const todayStr = this.getTodayString();
    await AIPlanner.autoReplan(todayStr, this.db, 'Отметка контрольной работы');

    this.render();
    if (window.App && typeof window.App.refreshCurrentView === 'function') window.App.refreshCurrentView();
  },

  async deleteLesson(index) {
    if (!confirm('Удалить этот урок из расписания?')) return;
    const timetable = await this.db.getSchoolTimetable();
    const dayData = timetable.find(t => t.dayOfWeek === this.currentDayTab);
    if (!dayData || !dayData.lessons[index]) return;

    dayData.lessons.splice(index, 1);
    await this.db.saveDayTimetable(this.currentDayTab, dayData.lessons);

    const todayStr = this.getTodayString();
    await AIPlanner.autoReplan(todayStr, this.db, 'Удаление урока из расписания');

    this.render();
    if (window.App && typeof window.App.refreshCurrentView === 'function') window.App.refreshCurrentView();
  },

  openAddLessonModal() {
    this.showLessonModal(null);
  },

  async openEditLessonModal(index) {
    const timetable = await this.db.getSchoolTimetable();
    const dayData = timetable.find(t => t.dayOfWeek === this.currentDayTab);
    if (!dayData || !dayData.lessons[index]) return;
    this.showLessonModal(dayData.lessons[index], index);
  },

  showLessonModal(lessonData, editIndex = null) {
    const isEdit = editIndex !== null;
    const modalId = 'lesson-form-modal';
    let modal = document.getElementById(modalId);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      modal.className = 'modal-backdrop';
      document.body.appendChild(modal);
    }

    const defaultStartTime = '08:00';
    const defaultEndTime = '08:45';

    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <h3>${isEdit ? 'Редактировать урок' : 'Добавить урок в расписание'}</h3>
          <button class="modal-close-btn" onclick="document.getElementById('${modalId}').remove()">&times;</button>
        </div>
        <form id="lesson-form" onsubmit="SchoolManager.handleLessonFormSubmit(event, ${editIndex})">
          <div class="form-group">
            <label>Предмет *</label>
            <input type="text" id="lesson-subject-input" class="form-control" required value="${lessonData ? lessonData.subject : ''}" placeholder="Алгебра (профиль)">
          </div>

          <div class="form-row">
            <div class="form-group col">
              <label>Номер урока</label>
              <input type="number" id="lesson-num-input" class="form-control" min="1" max="10" value="${lessonData ? lessonData.lessonNumber : 1}">
            </div>
            <div class="form-group col">
              <label>Кабинет</label>
              <input type="text" id="lesson-room-input" class="form-control" value="${lessonData ? (lessonData.room || '') : ''}" placeholder="204">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group col">
              <label>Начало *</label>
              <input type="time" id="lesson-start-input" class="form-control" required value="${lessonData ? lessonData.startTime : defaultStartTime}">
            </div>
            <div class="form-group col">
              <label>Окончание *</label>
              <input type="time" id="lesson-end-input" class="form-control" required value="${lessonData ? lessonData.endTime : defaultEndTime}">
            </div>
          </div>

          <div class="form-group">
            <label>Заметки / Домашнее задание</label>
            <input type="text" id="lesson-notes-input" class="form-control" value="${lessonData ? (lessonData.notes || '') : ''}" placeholder="Параграф 14, номера 3-5">
          </div>

          <div class="form-checkbox-row">
            <label class="checkbox-label">
              <input type="checkbox" id="lesson-extra-input" ${lessonData && lessonData.isExtra ? 'checked' : ''}>
              <span>Это 8-й урок / факультатив (смещает окончание школы до 15:30)</span>
            </label>
          </div>

          <div class="form-checkbox-row">
            <label class="checkbox-label">
              <input type="checkbox" id="lesson-test-input" ${lessonData && lessonData.isTest ? 'checked' : ''}>
              <span>Предстоит контрольная работа / срез</span>
            </label>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('${modalId}').remove()">Отмена</button>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Сохранить изменения' : 'Добавить'}</button>
          </div>
        </form>
      </div>
    `;
  },

  async handleLessonFormSubmit(e, editIndex) {
    e.preventDefault();
    const timetable = await this.db.getSchoolTimetable();
    let dayData = timetable.find(t => t.dayOfWeek === this.currentDayTab);
    if (!dayData) {
      dayData = { dayOfWeek: this.currentDayTab, lessons: [] };
    }

    const timeLib = (typeof TimeUtils !== 'undefined') ? TimeUtils : (typeof globalThis !== 'undefined' && globalThis.TimeUtils ? globalThis.TimeUtils : null);
    const toMin = (t) => timeLib ? timeLib.timeToMin(t) : ((h, m) => h * 60 + m)(...t.split(':').map(Number));

    const newLesson = {
      lessonNumber: Number(document.getElementById('lesson-num-input').value) || 1,
      subject: document.getElementById('lesson-subject-input').value.trim(),
      startTime: document.getElementById('lesson-start-input').value,
      endTime: document.getElementById('lesson-end-input').value,
      room: document.getElementById('lesson-room-input').value.trim(),
      notes: document.getElementById('lesson-notes-input').value.trim(),
      isExtra: document.getElementById('lesson-extra-input').checked,
      isTest: document.getElementById('lesson-test-input').checked,
      isCanceled: false
    };

    if (editIndex !== null) {
      dayData.lessons[editIndex] = newLesson;
    } else {
      dayData.lessons.push(newLesson);
    }

    // Сортировка по времени начала
    dayData.lessons.sort((a, b) => toMin(a.startTime) - toMin(b.startTime));

    await this.db.saveDayTimetable(this.currentDayTab, dayData.lessons);

    const modal = document.getElementById('lesson-form-modal');
    if (modal) modal.remove();

    // Автоматическое перепланирование сегодняшнего дня
    const todayStr = this.getTodayString();
    await AIPlanner.autoReplan(todayStr, this.db, 'Редактирование расписания уроков');

    this.render();
    if (window.App && typeof window.App.refreshCurrentView === 'function') window.App.refreshCurrentView();
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SchoolManager;
}
if (typeof globalThis !== 'undefined') {
  globalThis.SchoolManager = SchoolManager;
}
