/**
 * LifeOS — Модуль школьного расписания (school.js v1.1.1)
 * Управление уроками с 1 по 6 дни недели.
 * Полная поддержка 7-х и 8-х уроков (во Вт/Чт или в любой день),
 * контрольных работ, отменённых занятий, разделение уроков и внешкольных занятий.
 * Подтверждение расписания пользователем (защита от выдуманных данных).
 * Интеграция с TimeUtils (Europe/Moscow).
 */

const SchoolManager = {
  currentDayTab: 1, // 1-Пн по умолчанию
  daysNames: [
    { id: 1, name: 'Понедельник', short: 'ПН' },
    { id: 2, name: 'Вторник', short: 'ВТ', has8th: true },
    { id: 3, name: 'Среда', short: 'СР' },
    { id: 4, name: 'Четверг', short: 'ЧТ', has8th: true },
    { id: 5, name: 'Пятница', short: 'ПТ' },
    { id: 6, name: 'Суббота', short: 'СБ' }
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

  /**
   * Рассчитывает перемены по разнице между окончанием и началом соседних уроков.
   * Перемены не хранятся как отдельные уроки и не попадают в автопланировщик.
   */
  getBreakBetweenLessons(previousLesson, nextLesson) {
    if (!previousLesson || !nextLesson || !previousLesson.endTime || !nextLesson.startTime) return null;
    const timeLib = (typeof TimeUtils !== 'undefined')
      ? TimeUtils
      : (typeof globalThis !== 'undefined' && globalThis.TimeUtils ? globalThis.TimeUtils : null);
    const toMinutes = (value) => {
      if (timeLib && typeof timeLib.timeToMin === 'function') return timeLib.timeToMin(value);
      const parts = String(value).split(':').map(Number);
      return parts.length === 2 && parts.every(Number.isFinite) ? parts[0] * 60 + parts[1] : NaN;
    };
    const start = toMinutes(previousLesson.endTime);
    const end = toMinutes(nextLesson.startTime);
    const durationMinutes = end - start;
    if (!Number.isFinite(start) || !Number.isFinite(end) || durationMinutes <= 0) return null;
    return { startTime: previousLesson.endTime, endTime: nextLesson.startTime, durationMinutes };
  },

  async confirmTimetable() {
    const timetable = await this.db.getSchoolTimetable();
    const totalLessons = timetable.reduce((acc, d) => acc + (d.lessons ? d.lessons.length : 0), 0);
    if (totalLessons === 0) {
      alert('В расписании пока нет ни одного урока. Добавьте уроки вашей школы или выберите типовой шаблон перед подтверждением.');
      return;
    }
    this.openConfirmPreviewModal(timetable);
  },

  openConfirmPreviewModal(timetable) {
    const modalId = 'confirm-timetable-modal';
    let modal = document.getElementById(modalId);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      modal.className = 'modal-backdrop';
      document.body.appendChild(modal);
    }

    const daysSummary = this.daysNames.map(d => {
      const dayData = timetable.find(t => t.dayOfWeek === d.id);
      const count = dayData && dayData.lessons ? dayData.lessons.filter(l => !l.isCanceled).length : 0;
      const lessonTitles = dayData && dayData.lessons ? dayData.lessons.filter(l => !l.isCanceled).map(l => l.subject).join(', ') : 'нет уроков';
      return `
        <div style="border-bottom: 1px solid #f1f5f9; padding: 6px 0; font-size: 13px;">
          <strong>${d.name}:</strong> ${count} уроков ${count > 0 ? `<span class="text-muted" style="font-size: 12px;">(${lessonTitles})</span>` : ''}
        </div>
      `;
    }).join('');

    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <h3>Проверка и подтверждение расписания</h3>
          <button class="modal-close-btn" onclick="document.getElementById('${modalId}').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <p>Пожалуйста, проверьте уроки перед подтверждением. Автопланировщик будет использовать эти данные для планирования вашего дня:</p>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; margin: 12px 0; max-height: 240px; overflow-y: auto;">
            ${daysSummary}
          </div>
          <p style="font-size: 13px; color: #475569;">Вы подтверждаете, что данное расписание соответствует вашей реальной школе?</p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('${modalId}').remove()">Отмена / Редактировать</button>
          <button type="button" class="btn btn-primary" onclick="SchoolManager.executeConfirmTimetable()">✓ Да, подтверждаю расписание</button>
        </div>
      </div>
    `;
  },

  async executeConfirmTimetable() {
    this.db.saveSettings({
      schoolTimetableConfirmed: true,
      schoolTimetableOrigin: 'user_confirmed'
    });
    const modal = document.getElementById('confirm-timetable-modal');
    if (modal) modal.remove();

    const todayStr = this.getTodayString();
    await AIPlanner.autoReplan(todayStr, this.db, 'Подтверждение проверенного школьного расписания');
    this.render();
    if (window.App && typeof window.App.refreshCurrentView === 'function') window.App.refreshCurrentView();
    alert('Школьное расписание успешно подтверждено и синхронизировано с рабочим планом дня!');
  },

  async markAsUnconfirmed() {
    this.db.saveSettings({
      schoolTimetableConfirmed: false,
      schoolTimetableOrigin: 'unconfirmed'
    });
    this.render();
  },

  async render() {
    const container = document.getElementById('school-content');
    if (!container) return;

    const settings = this.db.getSettings();
    const isConfirmed = !!settings.schoolTimetableConfirmed;
    const timetable = await this.db.getSchoolTimetable();
    const dayData = timetable.find(t => t.dayOfWeek === this.currentDayTab) || { dayOfWeek: this.currentDayTab, lessons: [] };
    const currentDayMeta = this.daysNames.find(d => d.id === this.currentDayTab) || this.daysNames[0];

    const lessons = dayData.lessons || [];
    const schoolLessons = lessons.filter(l => !l.isAfterSchool);
    const afterSchoolActivities = lessons.filter(l => !!l.isAfterSchool);

    // Подсчет времени окончания школы
    let schoolEndTime = '—';
    const activeSchool = schoolLessons.filter(l => !l.isCanceled);
    if (activeSchool.length > 0) {
      schoolEndTime = activeSchool[activeSchool.length - 1].endTime;
    }

    // Проверка 7 и 8 уроков
    const hasLesson8 = activeSchool.some(l => l.lessonNumber === 8 || l.isExtra);
    const hasLesson7 = activeSchool.some(l => l.lessonNumber === 7);
    const hasGap7 = hasLesson8 && !hasLesson7;

    const totalTimetableLessons = timetable.reduce((acc, d) => acc + (d.lessons ? d.lessons.length : 0), 0);

    let html = `
      <!-- Статус расписания -->
      ${totalTimetableLessons === 0 ? `
        <div class="school-empty-banner" style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin-bottom: 1rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
          <div>
            <strong style="color: #1e40af;">🏫 Школьное расписание уроков не заполнено:</strong>
            <p style="color: #3b82f6; font-size: 0.9rem; margin: 4px 0 0 0;">LifeOS не добавляет вымышленные уроки в рабочий план. Внесите ваши уроки вручную или загрузите шаблон 10 класса для ознакомления.</p>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="btn btn-sm btn-primary" onclick="SchoolManager.openAddLessonModal()">+ Добавить урок</button>
            <button class="btn btn-sm btn-secondary" onclick="SchoolManager.openTemplateModal()">📋 Загрузить шаблон...</button>
          </div>
        </div>
      ` : (!isConfirmed ? `
        <div class="school-unconfirmed-banner" style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin-bottom: 1rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
          <div style="color: #92400e; font-size: 0.95rem;">
            <strong>⚠️ Расписание восстановлено из твоих скриншотов:</strong> проверь предметы и кабинеты. В субботнем снимке видны 4 урока; если есть продолжение, добавь его. До подтверждения уроки не попадут в активный план дня.
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="btn btn-sm btn-primary" onclick="SchoolManager.confirmTimetable()">✓ Проверить и подтвердить</button>
            <button class="btn btn-sm btn-secondary" onclick="SchoolManager.openTemplateModal()">🔄 Сменить шаблон...</button>
          </div>
        </div>
      ` : `
        <div style="margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
          <span class="badge badge-success" style="font-size: 0.85rem; padding: 6px 10px;">✓ Реальное расписание подтверждено</span>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-sm btn-outline-secondary" onclick="SchoolManager.markAsUnconfirmed()">Отметить как непроверенное</button>
            <button class="btn btn-sm btn-secondary" onclick="SchoolManager.openTemplateModal()">🔄 Сменить шаблон...</button>
          </div>
        </div>
      `)}

      <div class="school-header-card">
        <div class="school-header-info">
          <h2>Школьное расписание 10 класса</h2>
          <p class="text-muted">Точный график занятий. Поддерживаются 7-й и 8-й уроки, контрольные работы и внешкольные секции с автоматической синхронизацией дороги и обеда.</p>
        </div>
        <div class="school-day-badge">
          <span>Окончание школы: <strong>${schoolEndTime}</strong></span>
          ${hasLesson8 ? '<span class="badge badge-accent">⚡ Есть 8-й урок</span>' : ''}
          ${hasGap7 ? '<span class="badge badge-warning" title="7-й урок отсутствует, перед 8-м окном">Окно перед 8-м</span>' : ''}
        </div>
      </div>

      <!-- Переключатель дней недели -->
      <div class="days-nav-tabs">
        ${this.daysNames.map(d => {
          const dData = timetable.find(t => t.dayOfWeek === d.id);
          const dHas8th = dData && dData.lessons && dData.lessons.some(l => (l.lessonNumber === 8 || l.isExtra) && !l.isCanceled);
          return `
            <button class="day-tab-btn ${d.id === this.currentDayTab ? 'active' : ''}" onclick="SchoolManager.selectDay(${d.id})">
              <span class="day-short">${d.short}</span>
              <span class="day-full">${d.name}</span>
              ${dHas8th ? '<span class="dot-accent" title="8-й урок">•</span>' : ''}
            </button>
          `;
        }).join('')}
      </div>

      <div class="school-lessons-container">
        <div class="lessons-header-actions">
          <h3>${currentDayMeta.name}</h3>
          <div style="display: flex; gap: 8px;">
            ${hasGap7 ? `<button class="btn btn-sm btn-outline-primary" onclick="SchoolManager.openAddLesson7Modal()">+ Добавить 7-й урок</button>` : ''}
            <button class="btn btn-primary btn-sm" onclick="SchoolManager.openAddLessonModal()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
              Добавить занятие
            </button>
          </div>
        </div>

        <div class="lessons-list">
    `;

    if (lessons.length === 0) {
      html += `
        <div class="empty-state">
          <p>В этот день уроки не запланированы.</p>
          <button class="btn btn-secondary btn-sm" onclick="SchoolManager.openAddLessonModal()">Добавить первый урок</button>
        </div>
      `;
    } else {
      // 1. Школьные уроки
      if (schoolLessons.length > 0) {
        const orderedSchoolLessons = [...schoolLessons].sort((a, b) => {
          const toMin = (value) => {
            const timeLib = (typeof TimeUtils !== 'undefined') ? TimeUtils : null;
            if (timeLib && timeLib.timeToMin) return timeLib.timeToMin(value);
            const [hours, minutes] = String(value).split(':').map(Number);
            return hours * 60 + minutes;
          };
          return toMin(a.startTime) - toMin(b.startTime);
        });

        orderedSchoolLessons.forEach((lesson, displayIndex) => {
          if (displayIndex > 0) {
            const breakInterval = this.getBreakBetweenLessons(
              orderedSchoolLessons[displayIndex - 1],
              lesson
            );
            if (breakInterval) {
              html += `
                <div class="lesson-break-row" role="note" aria-label="Перемена ${breakInterval.durationMinutes} минут">
                  <span class="lesson-break-label">${breakInterval.durationMinutes >= 30 ? '⌛ Окно' : '🏃 Перемена'} ${breakInterval.durationMinutes} минут</span>
                  <span class="lesson-break-time">${breakInterval.startTime} – ${breakInterval.endTime}</span>
                </div>
              `;
            }
          }
          const index = lessons.indexOf(lesson);
          const isCanceled = !!lesson.isCanceled;
          const isExtra = !!lesson.isExtra || lesson.lessonNumber >= 8;

          html += `
            <div class="lesson-card ${isCanceled ? 'lesson-canceled' : ''} ${isExtra ? 'lesson-extra' : ''}">
              <div class="lesson-num-badge">${lesson.lessonNumber || (index + 1)}</div>
              <div class="lesson-main-info">
                <div class="lesson-title-row">
                  <span class="lesson-subject ${isCanceled ? 'line-through' : ''}">${lesson.subject}</span>
                  ${lesson.lessonNumber === 8 ? '<span class="badge badge-purple">8-й урок</span>' : ''}
                  ${lesson.lessonNumber === 7 ? '<span class="badge badge-info">7-й урок</span>' : ''}
                  ${lesson.isExtra && lesson.lessonNumber < 7 ? '<span class="badge badge-accent">Факультатив</span>' : ''}
                  ${lesson.isClassHour ? '<span class="badge badge-info">Классный час</span>' : ''}
                  ${lesson.isExtra && lesson.lessonNumber === 8 ? '<span class="badge badge-purple">Дополнительная математика</span>' : ''}
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

      // 2. Внешкольные занятия (кружки, репетиторы, секции)
      if (afterSchoolActivities.length > 0) {
        html += `
          <div style="margin-top: 1.5rem; margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: space-between;">
            <h4 style="font-size: 1rem; color: #475569;">🎯 Внешкольные занятия (секции, кружки, репетиторы)</h4>
            <span class="badge badge-muted">После школы</span>
          </div>
        `;

        afterSchoolActivities.forEach((act) => {
          const index = lessons.indexOf(act);
          const isCanceled = !!act.isCanceled;

          html += `
            <div class="lesson-card" style="border-left: 4px solid #10b981; background: #f0fdf4;">
              <div class="lesson-num-badge" style="background: #10b981; color: white;">★</div>
              <div class="lesson-main-info">
                <div class="lesson-title-row">
                  <span class="lesson-subject ${isCanceled ? 'line-through' : ''}">${act.subject}</span>
                  <span class="badge badge-success">Вне школы</span>
                  ${isCanceled ? '<span class="badge badge-muted">Отменено</span>' : ''}
                </div>
                <div class="lesson-meta-row text-muted">
                  <span>⏰ ${act.startTime} – ${act.endTime}</span>
                  ${act.room ? `<span>📍 Место: ${act.room}</span>` : ''}
                  ${act.notes ? `<span>📝 ${act.notes}</span>` : ''}
                </div>
              </div>
              <div class="lesson-actions">
                <button class="btn-icon" title="${isCanceled ? 'Восстановить' : 'Отменить'}" onclick="SchoolManager.toggleCancelLesson(${index})">
                  ${isCanceled ? '↩️' : '🚫'}
                </button>
                <button class="btn-icon" title="Редактировать" onclick="SchoolManager.openEditLessonModal(${index})">
                  ✏️
                </button>
                <button class="btn-icon text-danger" title="Удалить" onclick="SchoolManager.deleteLesson(${index})">
                  🗑️
                </button>
              </div>
            </div>
          `;
        });
      }
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
    if (!confirm('Удалить это занятие из расписания?')) return;
    const timetable = await this.db.getSchoolTimetable();
    const dayData = timetable.find(t => t.dayOfWeek === this.currentDayTab);
    if (!dayData || !dayData.lessons[index]) return;

    dayData.lessons.splice(index, 1);
    await this.db.saveDayTimetable(this.currentDayTab, dayData.lessons);

    const todayStr = this.getTodayString();
    await AIPlanner.autoReplan(todayStr, this.db, 'Удаление занятия из расписания');

    this.render();
    if (window.App && typeof window.App.refreshCurrentView === 'function') window.App.refreshCurrentView();
  },

  openAddLessonModal() {
    this.showLessonModal(null);
  },

  openAddLesson7Modal() {
    this.showLessonModal({
      lessonNumber: 7,
      subject: '7-й урок / Факультатив',
      startTime: '13:55',
      endTime: '14:40',
      isExtra: true,
      isAfterSchool: false
    });
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
          <h3>${isEdit ? 'Редактировать занятие' : 'Добавить занятие'}</h3>
          <button class="modal-close-btn" onclick="document.getElementById('${modalId}').remove()">&times;</button>
        </div>
        <form id="lesson-form" onsubmit="SchoolManager.handleLessonFormSubmit(event, ${editIndex})">
          <div class="form-group">
            <label>Предмет / Название занятия *</label>
            <input type="text" id="lesson-subject-input" class="form-control" required value="${lessonData ? lessonData.subject : ''}" placeholder="Алгебра (профиль) или Секция плавания">
          </div>

          <div class="form-row">
            <div class="form-group col">
              <label>Номер урока (1–10)</label>
              <input type="number" id="lesson-num-input" class="form-control" min="1" max="10" value="${lessonData ? (lessonData.lessonNumber || 1) : 1}">
            </div>
            <div class="form-group col">
              <label>Кабинет / Место</label>
              <input type="text" id="lesson-room-input" class="form-control" value="${lessonData ? (lessonData.room || '') : ''}" placeholder="204 или Бассейн">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group col">
              <label>Время начала *</label>
              <input type="time" id="lesson-start-input" class="form-control" required value="${lessonData ? lessonData.startTime : defaultStartTime}">
            </div>
            <div class="form-group col">
              <label>Время окончания *</label>
              <input type="time" id="lesson-end-input" class="form-control" required value="${lessonData ? lessonData.endTime : defaultEndTime}">
            </div>
          </div>

          <div class="form-group">
            <label>Заметки / ДЗ к уроку</label>
            <input type="text" id="lesson-notes-input" class="form-control" value="${lessonData ? (lessonData.notes || '') : ''}" placeholder="Параграф 14, номера 3-5">
          </div>

          <div class="form-checkbox-row">
            <label class="checkbox-label">
              <input type="checkbox" id="lesson-extra-input" ${lessonData && lessonData.isExtra ? 'checked' : ''}>
              <span>Факультатив / 8-й урок (в рамках школьного дня)</span>
            </label>
          </div>

          <div class="form-checkbox-row">
            <label class="checkbox-label">
              <input type="checkbox" id="lesson-afterschool-input" ${lessonData && lessonData.isAfterSchool ? 'checked' : ''}>
              <span>Внешкольное занятие (кружок, спортсекция, репетитор после школы)</span>
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
      isAfterSchool: document.getElementById('lesson-afterschool-input').checked,
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

    const todayStr = this.getTodayString();
    await AIPlanner.autoReplan(todayStr, this.db, 'Редактирование расписания уроков');

    this.render();
    if (window.App && typeof window.App.refreshCurrentView === 'function') window.App.refreshCurrentView();
  },

  // ==========================================
  // МОДАЛЬНОЕ ОКНО ВЫБОРА ШАБЛОНА С ПРЕВЬЮ
  // ==========================================
  openTemplateModal() {
    const modalId = 'template-selector-modal';
    let modal = document.getElementById(modalId);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      modal.className = 'modal-backdrop';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-card modal-card-lg">
        <div class="modal-header">
          <h3>Выбор шаблона школьного расписания</h3>
          <button class="modal-close-btn" onclick="document.getElementById('${modalId}').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <p class="text-muted">Выберите базовый шаблон для быстрой настройки. Вы сможете отредактировать любые уроки после применения.</p>
          
          <div class="templates-grid" style="display: grid; gap: 1rem; margin-top: 1rem;">
            <div class="template-choice-card" style="border: 2px solid #e2e8f0; border-radius: 8px; padding: 1rem; cursor: pointer;" onclick="SchoolManager.previewTemplate('6day')">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <h4>📅 10 класс: 6-дневка (с 8-ми уроками во Вт и Чт)</h4>
                <span class="badge badge-accent">Рекомендуемый</span>
              </div>
              <p class="text-muted" style="margin: 0.5rem 0;">Понедельник–Суббота. Вт/Чт уроки до 15:30 (профильный практикум и IT-олимпиады). Суббота до 12:40.</p>
              <button class="btn btn-sm btn-outline-primary" onclick="SchoolManager.applyTemplate('6day'); event.stopPropagation();">Применить этот шаблон</button>
            </div>

            <div class="template-choice-card" style="border: 2px solid #e2e8f0; border-radius: 8px; padding: 1rem; cursor: pointer;" onclick="SchoolManager.previewTemplate('5day')">
              <h4>📅 10 класс: 5-дневка (Пн–Пт, без субботы)</h4>
              <p class="text-muted" style="margin: 0.5rem 0;">Понедельник–Пятница по 6–7 уроков. Суббота и воскресенье — выходные дни для подготовки и отдыха.</p>
              <button class="btn btn-sm btn-outline-primary" onclick="SchoolManager.applyTemplate('5day'); event.stopPropagation();">Применить этот шаблон</button>
            </div>

            <div class="template-choice-card" style="border: 2px solid #e2e8f0; border-radius: 8px; padding: 1rem; cursor: pointer;" onclick="SchoolManager.previewTemplate('empty')">
              <h4>📝 Чистый лист (пустое расписание)</h4>
              <p class="text-muted" style="margin: 0.5rem 0;">Очистить все дни недели и вручную внести только свои реальные уроки.</p>
              <button class="btn btn-sm btn-outline-danger" onclick="SchoolManager.applyTemplate('empty'); event.stopPropagation();">Очистить всё и начать с нуля</button>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('${modalId}').remove()">Отмена</button>
        </div>
      </div>
    `;
  },

  async applyTemplate(type) {
    if (!confirm('Вы уверены, что хотите применить этот шаблон? Текущие уроки будут заменены выбранным шаблоном с сохранением резервной копии.')) {
      return;
    }

    // Сохраняем бэкап настроек перед заменой
    await this.db.exportAllData();

    if (type === '6day') {
      await this.db.seedRealisticSchoolTimetable();
      this.db.saveSettings({ schoolTimetableConfirmed: false, schoolTimetableOrigin: 'template_6day' });
    } else if (type === '5day') {
      await this.db.seedRealisticSchoolTimetable();
      // Очищаем субботу
      await this.db.saveDayTimetable(6, []);
      this.db.saveSettings({ schoolTimetableConfirmed: false, schoolTimetableOrigin: 'template_5day' });
    } else if (type === 'empty') {
      for (let d = 1; d <= 6; d++) {
        await this.db.saveDayTimetable(d, []);
      }
      this.db.saveSettings({ schoolTimetableConfirmed: true, schoolTimetableOrigin: 'user_empty' });
    }

    const modal = document.getElementById('template-selector-modal');
    if (modal) modal.remove();

    const todayStr = this.getTodayString();
    await AIPlanner.autoReplan(todayStr, this.db, 'Смена шаблона школьного расписания');

    this.render();
    if (window.App && typeof window.App.refreshCurrentView === 'function') window.App.refreshCurrentView();
    alert('Шаблон успешно применён! Проверьте и при необходимости скорректируйте уроки.');
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SchoolManager;
}
if (typeof globalThis !== 'undefined') {
  globalThis.SchoolManager = SchoolManager;
}
