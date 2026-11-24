/**
 * LifeOS — Модуль «Цели» (goals.js v1.1.1)
 * Подготовка к ЕГЭ (Профильная математика 1-19, Информатика 1-27, Русский язык 1-27 ФИПИ 2026/2027).
 * Раздельный учёт изучения теории, решения задач и работы над ошибками.
 * Олимпиадное движение: полное CRUD, защита от неподтверждённых событий.
 * Проекты и Хакатоны (включая «Миросборка» 27 ноября).
 * Интеграция с TimeUtils (Europe/Moscow).
 */

const GoalsManager = {
  currentTab: 'ege', // 'ege' | 'olympiads' | 'projects'
  currentEgeSubject: 'math', // 'math' | 'informatics' | 'russian'

  getTimeLib() {
    return (typeof TimeUtils !== 'undefined') ? TimeUtils : (typeof globalThis !== 'undefined' && globalThis.TimeUtils ? globalThis.TimeUtils : null);
  },

  getTodayString() {
    const t = this.getTimeLib();
    return t ? t.getTodayStr() : new Date().toISOString().split('T')[0];
  },

  init(db) {
    this.db = db;
    this.render();
  },

  setTab(tab) {
    this.currentTab = tab;
    this.render();
  },

  setEgeSubject(subject) {
    this.currentEgeSubject = subject;
    this.render();
  },

  async render() {
    const container = document.getElementById('goals-content');
    if (!container) return;

    let html = `
      <!-- Главная навигация раздела Цели -->
      <div class="goals-nav-bar">
        <div class="filter-pills">
          <button class="pill-btn ${this.currentTab === 'ege' ? 'active' : ''}" onclick="GoalsManager.setTab('ege')">
            📚 Подготовка к ЕГЭ (ФИПИ 2026/2027)
          </button>
          <button class="pill-btn ${this.currentTab === 'olympiads' ? 'active' : ''}" onclick="GoalsManager.setTab('olympiads')">
            🏆 Олимпиады
          </button>
          <button class="pill-btn ${this.currentTab === 'projects' ? 'active' : ''}" onclick="GoalsManager.setTab('projects')">
            🚀 Проекты и Хакатоны
          </button>
        </div>
      </div>
    `;

    if (this.currentTab === 'ege') {
      html += await this.renderEgeSection();
    } else if (this.currentTab === 'olympiads') {
      html += await this.renderOlympiadsSection();
    } else if (this.currentTab === 'projects') {
      html += await this.renderProjectsSection();
    }

    container.innerHTML = html;
  },

  // ==========================================
  // РАЗДЕЛ ЕГЭ
  // ==========================================
  async renderEgeSection() {
    const allTopics = await this.db.getEgeTopics();
    const topics = allTopics.filter(t => t.subject === this.currentEgeSubject);

    // Подсчет метрик по каждому из трёх предметов отдельно
    const mathTopics = allTopics.filter(t => t.subject === 'math');
    const infTopics = allTopics.filter(t => t.subject === 'informatics');
    const rusTopics = allTopics.filter(t => t.subject === 'russian');

    const getSubjectStats = (list) => {
      const total = list.length;
      const mastered = list.filter(t => t.status === 'mastered').length;
      const theory = list.filter(t => !!t.theoryStudied).length;
      const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
      return { total, mastered, theory, pct };
    };

    const mathStats = getSubjectStats(mathTopics);
    const infStats = getSubjectStats(infTopics);
    const rusStats = getSubjectStats(rusTopics);

    // Текущий предмет
    const totalTopics = topics.length;
    const masteredCount = topics.filter(t => t.status === 'mastered').length;
    const inProgressCount = topics.filter(t => t.status === 'in_progress').length;
    const theoryStudiedCount = topics.filter(t => !!t.theoryStudied).length;
    const progressPercent = totalTopics > 0 ? Math.round((masteredCount / totalTopics) * 100) : 0;

    let totalSolved = 0;
    let totalCorrect = 0;
    topics.forEach(t => {
      totalSolved += (Number(t.solvedCount) || 0);
      totalCorrect += (Number(t.correctCount) || 0);
    });
    const accuracy = totalSolved > 0 ? Math.round((totalCorrect / totalSolved) * 100) : 0;

    const subjectNames = {
      math: 'Профильная математика (Задания №1–19)',
      informatics: 'Информатика КЕГЭ (Задания №1–27)',
      russian: 'Русский язык (Задания №1–27)'
    };

    let html = `
      <!-- Карточки общего прогресса по 3 предметам -->
      <div class="metrics-grid" style="margin-bottom: 1rem;">
        <div class="metric-card ${this.currentEgeSubject === 'math' ? 'metric-card-accent' : ''}" style="cursor: pointer;" onclick="GoalsManager.setEgeSubject('math')">
          <div style="font-weight: 600; margin-bottom: 4px;">📐 Профильная математика</div>
          <div class="metric-value" style="font-size: 1.5rem;">${mathStats.pct}%</div>
          <div class="metric-label">${mathStats.mastered}/${mathStats.total} тем • Теория: ${mathStats.theory}</div>
          <div class="progress-bar-bg" style="margin-top: 6px;"><div class="progress-bar-fill" style="width: ${mathStats.pct}%;"></div></div>
        </div>

        <div class="metric-card ${this.currentEgeSubject === 'informatics' ? 'metric-card-accent' : ''}" style="cursor: pointer;" onclick="GoalsManager.setEgeSubject('informatics')">
          <div style="font-weight: 600; margin-bottom: 4px;">💻 Информатика (КЕГЭ)</div>
          <div class="metric-value" style="font-size: 1.5rem;">${infStats.pct}%</div>
          <div class="metric-label">${infStats.mastered}/${infStats.total} тем • Теория: ${infStats.theory}</div>
          <div class="progress-bar-bg" style="margin-top: 6px;"><div class="progress-bar-fill" style="width: ${infStats.pct}%;"></div></div>
        </div>

        <div class="metric-card ${this.currentEgeSubject === 'russian' ? 'metric-card-accent' : ''}" style="cursor: pointer;" onclick="GoalsManager.setEgeSubject('russian')">
          <div style="font-weight: 600; margin-bottom: 4px;">📖 Русский язык</div>
          <div class="metric-value" style="font-size: 1.5rem;">${rusStats.pct}%</div>
          <div class="metric-label">${rusStats.mastered}/${rusStats.total} тем • Теория: ${rusStats.theory}</div>
          <div class="progress-bar-bg" style="margin-top: 6px;"><div class="progress-bar-fill" style="width: ${rusStats.pct}%;"></div></div>
        </div>
      </div>

      <!-- Детальные метрики выбранного предмета -->
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-value">${progressPercent}%</div>
          <div class="metric-label">Освоение кодификатора</div>
          <div class="progress-bar-bg" style="margin-top: 8px;">
            <div class="progress-bar-fill" style="width: ${progressPercent}%;"></div>
          </div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${masteredCount} / ${totalTopics}</div>
          <div class="metric-label">Тем освоено (${inProgressCount} в работе)</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${theoryStudiedCount} / ${totalTopics}</div>
          <div class="metric-label">Теория пройдена</div>
        </div>
        <div class="metric-card">
          <div class="metric-value ${accuracy >= 80 ? 'text-success' : ''}">${accuracy}%</div>
          <div class="metric-label">Точность (${totalSolved} решено)</div>
        </div>
      </div>

      <div class="section-card">
        <div class="section-card-header">
          <div>
            <h3>${subjectNames[this.currentEgeSubject]}</h3>
            <p class="text-muted">Официальный кодификатор ФИПИ (2026/2027). Отмечайте изучение теории, правильные ответы и фиксируйте ошибки для повторения.</p>
          </div>
          <span class="badge badge-light-outline">ФИПИ 2026/2027</span>
        </div>

        <div class="ege-topics-list">
    `;

    const renderTopicCard = (topic) => {
      const hasMistakes = topic.mistakes && topic.mistakes.length > 0;
      const isTheoryDone = !!topic.theoryStudied;

      return `
        <div class="topic-card status-${topic.status}">
          <div class="topic-header-row">
            <span class="topic-code">${topic.code}</span>
            <span class="topic-title">${topic.title}</span>
            <div class="topic-status-dropdown">
              <select class="form-control form-control-sm select-status" onchange="GoalsManager.updateTopicStatus('${topic.id}', this.value)">
                <option value="not_started" ${topic.status === 'not_started' ? 'selected' : ''}>Не начато</option>
                <option value="in_progress" ${topic.status === 'in_progress' ? 'selected' : ''}>В процессе</option>
                <option value="mastered" ${topic.status === 'mastered' ? 'selected' : ''}>Освоено</option>
              </select>
            </div>
          </div>

          <div style="margin: 0.5rem 0; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
            <label class="checkbox-label" style="font-size: 0.85rem; cursor: pointer;">
              <input type="checkbox" ${isTheoryDone ? 'checked' : ''} onchange="GoalsManager.toggleTheory('${topic.id}')">
              <span>📖 Теория изучена</span>
            </label>
            <span class="text-muted" style="font-size: 0.8rem;">${topic.fipiSource || 'ФИПИ 2026/2027'}</span>
          </div>

          <div class="topic-meta-row text-muted">
            <span>Решено: <strong>${topic.solvedCount || 0}</strong></span>
            <span>Верно: <strong>${topic.correctCount || 0}</strong></span>
            ${topic.solvedCount > 0 ? `<span>Точность: <strong>${Math.round(((topic.correctCount || 0) / topic.solvedCount) * 100)}%</strong></span>` : ''}
            ${topic.plannedReviewDate ? `<span>🔄 Повторение: ${topic.plannedReviewDate}</span>` : ''}
          </div>

          ${hasMistakes ? `
            <div class="topic-mistakes-box">
              <span class="mistakes-label">⚠️ Зафиксированные ошибки:</span>
              <ul>
                ${topic.mistakes.map(m => `<li>${m}</li>`).join('')}
              </ul>
            </div>
          ` : ''}

          <div class="topic-actions-row">
            <button class="btn btn-sm btn-outline-success" onclick="GoalsManager.recordSolved('${topic.id}', true)">
              +1 Верно
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="GoalsManager.recordSolved('${topic.id}', false)">
              +1 С ошибкой
            </button>
            <button class="btn btn-sm btn-secondary" onclick="GoalsManager.openMistakeModal('${topic.id}')">
              📝 Записать ошибку
            </button>
          </div>
        </div>
      `;
    };

    if (this.currentEgeSubject === 'math') {
      const part1 = topics.filter(t => t.part === 1);
      const part2 = topics.filter(t => t.part === 2);
      html += `
        <h4 class="ege-part-title">Часть 1 (Задания №1–12, базовые задачи с кратким ответом)</h4>
        <div class="topics-grid">${part1.map(renderTopicCard).join('')}</div>

        <h4 class="ege-part-title" style="margin-top: 2rem;">Часть 2 (Задания №13–19, углубленные задачи с развернутым решением)</h4>
        <div class="topics-grid">${part2.map(renderTopicCard).join('')}</div>
      `;
    } else if (this.currentEgeSubject === 'russian') {
      const part1 = topics.filter(t => t.part === 1 || t.code !== '№27');
      const part2 = topics.filter(t => t.part === 2 || t.code === '№27');
      html += `
        <h4 class="ege-part-title">Часть 1 (Задания №1–26, тестовая часть: орфография, пунктуация, грамматика)</h4>
        <div class="topics-grid">${part1.map(renderTopicCard).join('')}</div>

        <h4 class="ege-part-title" style="margin-top: 2rem;">Часть 2 (Задание №27, развёрнутое сочинение-рассуждение)</h4>
        <div class="topics-grid">${part2.map(renderTopicCard).join('')}</div>
      `;
    } else {
      html += `<div class="topics-grid">${topics.map(renderTopicCard).join('')}</div>`;
    }

    html += `
        </div>
      </div>
    `;

    return html;
  },

  async toggleTheory(id) {
    const topic = await this.db.get('ege_topics', id);
    if (!topic) return;
    topic.theoryStudied = !topic.theoryStudied;
    await this.db.updateEgeTopic(topic);
    this.render();
  },

  async updateTopicStatus(id, newStatus) {
    const topic = await this.db.get('ege_topics', id);
    if (!topic) return;
    topic.status = newStatus;
    await this.db.updateEgeTopic(topic);
    this.render();
  },

  async recordSolved(id, isCorrect) {
    const topic = await this.db.get('ege_topics', id);
    if (!topic) return;

    topic.solvedCount = (Number(topic.solvedCount) || 0) + 1;
    if (isCorrect) {
      topic.correctCount = (Number(topic.correctCount) || 0) + 1;
    }

    await this.db.updateEgeTopic(topic);

    const todayStr = this.getTodayString();
    await this.db.logActivity({
      category: 'ege',
      title: `ЕГЭ ${topic.subject}: ${topic.code} (${isCorrect ? 'верно' : 'ошибка'})`,
      durationMinutes: 10,
      date: todayStr
    });

    this.render();
  },

  openMistakeModal(id) {
    this.db.get('ege_topics', id).then(topic => {
      if (!topic) return;
      const modalId = 'mistake-modal';
      let modal = document.getElementById(modalId);
      if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal-backdrop';
        document.body.appendChild(modal);
      }

      const timeLib = this.getTimeLib();
      const defaultReviewDate = timeLib ? timeLib.addDays(this.getTodayString(), 3) : new Date(Date.now() + 3*24*60*60*1000).toISOString().split('T')[0];

      modal.innerHTML = `
        <div class="modal-card">
          <div class="modal-header">
            <h3>Зафиксировать ошибку в задании ${topic.code}</h3>
            <button class="modal-close-btn" onclick="document.getElementById('${modalId}').remove()">&times;</button>
          </div>
          <div class="modal-body">
            <p><strong>${topic.title}</strong></p>
            <div class="form-group" style="margin-top: 1rem;">
              <label>Описание допущенной ошибки / ловушки:</label>
              <textarea id="mistake-text-input" class="form-control" rows="3" placeholder="Например: Забыл учесть ОДЗ логарифма при раскрытии квадрата"></textarea>
            </div>
            <div class="form-group">
              <label>Дата следующего повторения этой темы:</label>
              <input type="date" id="review-date-input" class="form-control" value="${defaultReviewDate}">
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('${modalId}').remove()">Отмена</button>
            <button type="button" class="btn btn-primary" onclick="GoalsManager.saveMistake('${topic.id}')">Сохранить</button>
          </div>
        </div>
      `;
    });
  },

  async saveMistake(id) {
    const topic = await this.db.get('ege_topics', id);
    if (!topic) return;

    const text = document.getElementById('mistake-text-input').value.trim();
    const reviewDate = document.getElementById('review-date-input').value;

    if (text) {
      if (!topic.mistakes) topic.mistakes = [];
      topic.mistakes.push(text);
    }
    if (reviewDate) {
      topic.plannedReviewDate = reviewDate;
    }

    await this.db.updateEgeTopic(topic);
    const modal = document.getElementById('mistake-modal');
    if (modal) modal.remove();
    this.render();
  },

  // ==========================================
  // РАЗДЕЛ ОЛИМПИАДЫ
  // ==========================================
  async renderOlympiadsSection() {
    const allOlys = await this.db.getOlympiads();
    const userOlys = allOlys.filter(o => !o.isTemplate && o.isConfirmed !== false);
    const templates = this.db.getOlympiadTemplates ? this.db.getOlympiadTemplates() : [];

    const todayStr = this.getTodayString();
    const timeLib = this.getTimeLib();

    let html = `
      <div class="section-card">
        <div class="section-card-header">
          <div>
            <h3>Олимпиадное движение</h3>
            <p class="text-muted">Подготовка к ВсОШ и перечневым олимпиадам. Никаких вымышленных дат — добавляйте реальные подтверждённые события.</p>
          </div>
          <button class="btn btn-primary btn-sm" onclick="GoalsManager.openAddOlympiadModal()">+ Добавить олимпиаду</button>
        </div>

        <div class="olympiads-grid">
    `;

    if (userOlys.length === 0) {
      html += `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <p>В вашем календаре пока нет подтверждённых олимпиад.</p>
          <button class="btn btn-primary btn-sm" onclick="GoalsManager.openAddOlympiadModal()">+ Добавить моё первое событие</button>
        </div>
      `;
    } else {
      userOlys.forEach(oly => {
        let diffDays = null;
        if (oly.date) {
          diffDays = timeLib ? timeLib.diffDays(todayStr, oly.date) : Math.ceil((new Date(oly.date) - new Date()) / (1000 * 60 * 60 * 24));
        }

        const solved = Number(oly.solvedCount) || 0;
        const target = Number(oly.prepTasksCount) || 30;
        const percent = target > 0 ? Math.min(100, Math.round((solved / target) * 100)) : 0;

        html += `
          <div class="goal-item-card">
            <div class="goal-item-header">
              <span class="badge badge-purple">${oly.subject || 'Предмет'}</span>
              ${diffDays !== null ? `<span class="badge ${diffDays <= 7 && diffDays >= 0 ? 'badge-danger' : 'badge-info'}">${diffDays >= 0 ? `Дней осталось: ${diffDays}` : 'Прошла'}</span>` : ''}
            </div>
            <h4>${oly.title}</h4>
            <div class="goal-meta text-muted">
              <span>Этап: <strong>${oly.stage || 'Муниципальный'}</strong></span>
              <span>Дата: <strong>${oly.date || 'Не указана'} ${oly.time ? `(${oly.time})` : ''}</strong></span>
              ${oly.location ? `<span>📍 Формат: ${oly.location}</span>` : ''}
              <span>Цель: <strong>${oly.targetPrize || 'Призёр'}</strong></span>
            </div>
            ${oly.sourceUrl ? `
              <div style="margin: 0.25rem 0;">
                <a href="${oly.sourceUrl}" target="_blank" rel="noopener" style="font-size: 0.85rem; color: #4f46e5; text-decoration: underline;">Официальный регламент ↗</a>
              </div>
            ` : ''}
            ${oly.notes ? `<p class="goal-notes text-muted">${oly.notes}</p>` : ''}

            <div class="progress-box">
              <div class="progress-labels">
                <span>Решено олимпиадных задач:</span>
                <strong>${solved} / ${target} (${percent}%)</strong>
              </div>
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width: ${percent}%;"></div>
              </div>
            </div>

            <div class="goal-card-actions">
              <button class="btn btn-sm btn-outline-primary" onclick="GoalsManager.incrementOlySolved('${oly.id}')">+1 Задача решена</button>
              <button class="btn btn-sm btn-icon" title="Редактировать" onclick="GoalsManager.openEditOlympiadModal('${oly.id}')">✏️</button>
              <button class="btn btn-sm btn-icon text-danger" title="Удалить" onclick="GoalsManager.deleteOlympiad('${oly.id}')">🗑️</button>
            </div>
          </div>
        `;
      });
    }

    html += `
        </div>
      </div>

      <!-- Блок рекомендуемых шаблонов олимпиад -->
      <div class="section-card" style="margin-top: 1.5rem; background: #f8fafc;">
        <div class="section-card-header">
          <div>
            <h4>💡 Популярные олимпиады для 10 класса (шаблоны)</h4>
            <p class="text-muted" style="font-size: 0.85rem;">Ориентировочные даты ВсОШ. Выберите олимпиаду и подтвердите реальную дату проведения в вашей школе перед добавлением в активный план.</p>
          </div>
        </div>
        <div class="olympiads-grid">
          ${templates.map(tpl => `
            <div class="goal-item-card" style="background: white; border-style: dashed;">
              <div class="goal-item-header">
                <span class="badge badge-purple">${tpl.subject}</span>
                <span class="badge badge-warning">⚡ Требует подтверждения</span>
              </div>
              <h4>${tpl.title}</h4>
              <p class="text-muted" style="font-size: 0.85rem;">${tpl.notes}</p>
              <div style="margin-top: 0.5rem;">
                <button class="btn btn-sm btn-outline-primary" onclick="GoalsManager.openAddFromTemplateModal('${tpl.id}')">
                  + Добавить и подтвердить дату
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    return html;
  },

  async incrementOlySolved(id) {
    const oly = await this.db.get('olympiads', id);
    if (!oly) return;
    oly.solvedCount = (Number(oly.solvedCount) || 0) + 1;
    await this.db.saveOlympiad(oly);

    const todayStr = this.getTodayString();
    await this.db.logActivity({
      category: 'olympiad',
      title: `Олимпиада: ${oly.title} (+1 задача)`,
      durationMinutes: 20,
      date: todayStr
    });

    this.render();
  },

  async deleteOlympiad(id) {
    if (!confirm('Удалить эту олимпиаду?')) return;
    await this.db.deleteOlympiad(id);
    this.render();
  },

  openAddOlympiadModal() {
    this.showOlympiadModal(null);
  },

  openAddFromTemplateModal(templateId) {
    const templates = this.db.getOlympiadTemplates ? this.db.getOlympiadTemplates() : [];
    const tpl = templates.find(t => t.id === templateId);
    if (!tpl) return;
    this.showOlympiadModal({
      title: tpl.title,
      subject: tpl.subject,
      stage: tpl.stage,
      date: tpl.date,
      time: tpl.time || '10:00',
      location: tpl.location || 'Базовая школа',
      sourceUrl: tpl.sourceUrl || '',
      prepTasksCount: tpl.prepTasksCount || 30,
      targetPrize: tpl.targetPrize || 'Призёр'
    });
  },

  async openEditOlympiadModal(id) {
    const oly = await this.db.get('olympiads', id);
    if (!oly) return;
    this.showOlympiadModal(oly, id);
  },

  showOlympiadModal(olyData, editId = null) {
    const isEdit = editId !== null;
    const modalId = 'oly-modal';
    let modal = document.getElementById(modalId);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      modal.className = 'modal-backdrop';
      document.body.appendChild(modal);
    }

    const timeLib = this.getTimeLib();
    const defaultOlyDate = timeLib ? timeLib.addDays(this.getTodayString(), 14) : new Date(Date.now() + 14*24*60*60*1000).toISOString().split('T')[0];

    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <h3>${isEdit ? 'Редактировать олимпиаду' : 'Добавить подтверждённую олимпиаду'}</h3>
          <button class="modal-close-btn" onclick="document.getElementById('${modalId}').remove()">&times;</button>
        </div>
        <form onsubmit="GoalsManager.handleOlySubmit(event, '${editId || ''}')">
          <div class="form-group">
            <label>Название олимпиады *</label>
            <input type="text" id="oly-title" class="form-control" required value="${olyData ? olyData.title : ''}" placeholder="ВсОШ по математике (Муниципальный этап)">
          </div>

          <div class="form-row">
            <div class="form-group col">
              <label>Предмет *</label>
              <input type="text" id="oly-subject" class="form-control" required value="${olyData ? olyData.subject : 'Математика'}">
            </div>
            <div class="form-group col">
              <label>Этап</label>
              <input type="text" id="oly-stage" class="form-control" value="${olyData ? olyData.stage : 'Муниципальный этап'}">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group col">
              <label>Дата проведения *</label>
              <input type="date" id="oly-date" class="form-control" required value="${olyData ? olyData.date : defaultOlyDate}">
            </div>
            <div class="form-group col">
              <label>Время начала</label>
              <input type="time" id="oly-time" class="form-control" value="${olyData ? (olyData.time || '10:00') : '10:00'}">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group col">
              <label>Место / Формат проведения</label>
              <input type="text" id="oly-location" class="form-control" value="${olyData ? (olyData.location || '') : ''}" placeholder="Очно в школе №2 или Онлайн">
            </div>
            <div class="form-group col">
              <label>Ссылка на источник / регламент</label>
              <input type="url" id="oly-url" class="form-control" value="${olyData ? (olyData.sourceUrl || '') : ''}" placeholder="https://vos.olimpiada.ru/">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group col">
              <label>Целевой результат</label>
              <input type="text" id="oly-prize" class="form-control" value="${olyData ? (olyData.targetPrize || 'Призёр') : 'Призёр'}">
            </div>
            <div class="form-group col">
              <label>План задач для подготовки</label>
              <input type="number" id="oly-tasks-plan" class="form-control" value="${olyData ? (olyData.prepTasksCount || 30) : 30}">
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('${modalId}').remove()">Отмена</button>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Сохранить изменения' : 'Подтвердить и добавить'}</button>
          </div>
        </form>
      </div>
    `;
  },

  async handleOlySubmit(e, editId) {
    e.preventDefault();

    const olyData = {
      title: document.getElementById('oly-title').value.trim(),
      subject: document.getElementById('oly-subject').value.trim(),
      stage: document.getElementById('oly-stage').value.trim(),
      date: document.getElementById('oly-date').value,
      time: document.getElementById('oly-time').value,
      location: document.getElementById('oly-location').value.trim(),
      sourceUrl: document.getElementById('oly-url').value.trim(),
      targetPrize: document.getElementById('oly-prize').value.trim(),
      prepTasksCount: Number(document.getElementById('oly-tasks-plan').value) || 30,
      status: 'active',
      isConfirmed: true,
      isTemplate: false
    };

    if (editId) {
      const existing = await this.db.get('olympiads', editId);
      const merged = { ...existing, ...olyData };
      await this.db.saveOlympiad(merged);
    } else {
      olyData.solvedCount = 0;
      await this.db.saveOlympiad(olyData);
    }

    const modal = document.getElementById('oly-modal');
    if (modal) modal.remove();
    this.render();
  },

  // ==========================================
  // РАЗДЕЛ ПРОЕКТЫ И ХАКАТОНЫ
  // ==========================================
  async renderProjectsSection() {
    const projects = await this.db.getProjects();
    const todayStr = this.getTodayString();
    const timeLib = this.getTimeLib();

    let html = `
      <div class="section-card">
        <div class="section-card-header">
          <div>
            <h3>Проекты и Хакатоны</h3>
            <p class="text-muted">Активный приоритетный проект: <strong>«Миросборка»</strong>. Ближайший хакатон — <strong>27 ноября 2026 года</strong>.</p>
          </div>
          <button class="btn btn-primary btn-sm" onclick="GoalsManager.openAddProjectModal()">+ Новый проект</button>
        </div>

        <div class="projects-list">
    `;

    if (projects.length === 0) {
      html += `<div class="empty-state"><p>Проекты не добавлены.</p></div>`;
    } else {
      projects.forEach(p => {
        let diffDays = null;
        if (p.deadline) {
          diffDays = timeLib ? timeLib.diffDays(todayStr, p.deadline) : Math.ceil((new Date(p.deadline) - new Date()) / (1000 * 60 * 60 * 24));
        }

        const stages = p.stages || [];
        const completedStages = stages.filter(s => s.done).length;
        const stagePercent = stages.length > 0 ? Math.round((completedStages / stages.length) * 100) : 0;

        html += `
          <div class="project-card ${p.isMain ? 'project-main-card' : ''}">
            <div class="project-header">
              <div class="project-title-area">
                ${p.isMain ? '<span class="badge badge-accent">🔥 Главный проект</span>' : ''}
                <h4>${p.title}</h4>
              </div>
              <div class="project-deadline-badge">
                ${diffDays !== null ? `
                  <span class="badge ${diffDays <= 5 && diffDays >= 0 ? 'badge-danger' : 'badge-purple'}">
                    Дедлайн: ${p.deadline} (${diffDays >= 0 ? `осталось ${diffDays} дн.` : 'дедлайн прошёл!'})
                  </span>
                ` : ''}
              </div>
            </div>

            <p class="project-desc text-muted">${p.description || ''}</p>

            <!-- Этапы разработки -->
            <div class="project-stages-box">
              <div class="stages-header">
                <strong>Этапы проекта (${completedStages}/${stages.length}):</strong>
                <span>${stagePercent}%</span>
              </div>
              <div class="progress-bar-bg" style="margin-bottom: 12px;">
                <div class="progress-bar-fill" style="width: ${stagePercent}%;"></div>
              </div>
              <div class="stages-checklist">
                ${stages.map((st, sIdx) => `
                  <label class="checkbox-label stage-item">
                    <input type="checkbox" ${st.done ? 'checked' : ''} onchange="GoalsManager.toggleStage('${p.id}', ${sIdx})">
                    <span class="${st.done ? 'line-through text-muted' : ''}">${st.name}</span>
                  </label>
                `).join('')}
              </div>
            </div>

            <!-- Задачи чек-листа -->
            <div class="project-subtasks-box">
              <strong>Текущие задачи:</strong>
              <div class="subtasks-list">
                ${(p.tasks || []).map((tsk, tIdx) => `
                  <label class="checkbox-label">
                    <input type="checkbox" ${tsk.done ? 'checked' : ''} onchange="GoalsManager.toggleProjectTask('${p.id}', ${tIdx})">
                    <span class="${tsk.done ? 'line-through text-muted' : ''}">${tsk.text}</span>
                  </label>
                `).join('')}
              </div>
              <div class="add-subtask-row">
                <input type="text" id="new-subtask-input-${p.id}" class="form-control form-control-sm" placeholder="Добавить подзадачу...">
                <button class="btn btn-sm btn-secondary" onclick="GoalsManager.addSubtask('${p.id}')">Добавить</button>
              </div>
            </div>

            <div class="project-card-footer">
              <button class="btn btn-sm btn-outline-primary" onclick="GoalsManager.logProjectWork('${p.id}')">
                ⏱️ Зафиксировать 40 мин работы
              </button>
              ${!p.isMain ? `<button class="btn btn-sm btn-secondary" onclick="GoalsManager.makeMainProject('${p.id}')">Сделать главным</button>` : ''}
              <button class="btn btn-sm btn-icon text-danger" title="Удалить" onclick="GoalsManager.deleteProject('${p.id}')">🗑️</button>
            </div>
          </div>
        `;
      });
    }

    html += `
        </div>
      </div>
    `;

    return html;
  },

  async toggleStage(projectId, stageIndex) {
    const p = await this.db.get('projects', projectId);
    if (!p || !p.stages || !p.stages[stageIndex]) return;
    p.stages[stageIndex].done = !p.stages[stageIndex].done;
    await this.db.saveProject(p);
    this.render();
  },

  async toggleProjectTask(projectId, taskIndex) {
    const p = await this.db.get('projects', projectId);
    if (!p || !p.tasks || !p.tasks[taskIndex]) return;
    p.tasks[taskIndex].done = !p.tasks[taskIndex].done;
    await this.db.saveProject(p);
    this.render();
  },

  async addSubtask(projectId) {
    const input = document.getElementById(`new-subtask-input-${projectId}`);
    if (!input || !input.value.trim()) return;
    const p = await this.db.get('projects', projectId);
    if (!p) return;
    if (!p.tasks) p.tasks = [];
    p.tasks.push({ id: 'pt_' + Date.now(), text: input.value.trim(), done: false });
    await this.db.saveProject(p);
    this.render();
  },

  async logProjectWork(projectId) {
    const p = await this.db.get('projects', projectId);
    if (!p) return;
    const todayStr = this.getTodayString();
    await this.db.logActivity({
      category: 'project',
      title: `Разработка: ${p.title}`,
      durationMinutes: 40,
      date: todayStr
    });
    alert(`Зафиксировано 40 минут продуктивной работы над проектом «${p.title}»! Данные учтены в статистике.`);
  },

  async makeMainProject(projectId) {
    const projects = await this.db.getProjects();
    for (const pr of projects) {
      pr.isMain = (pr.id === projectId);
      pr.priority = pr.isMain ? 'active' : 'secondary';
      await this.db.saveProject(pr);
    }
    const todayStr = this.getTodayString();
    await AIPlanner.autoReplan(todayStr, this.db, 'Смена главного проекта');
    this.render();
  },

  async deleteProject(projectId) {
    if (!confirm('Удалить проект?')) return;
    await this.db.deleteProject(projectId);
    this.render();
  },

  openAddProjectModal() {
    const modalId = 'project-modal';
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
          <h3>Новый проект / Хакатон</h3>
          <button class="modal-close-btn" onclick="document.getElementById('${modalId}').remove()">&times;</button>
        </div>
        <form onsubmit="GoalsManager.handleProjectSubmit(event)">
          <div class="form-group">
            <label>Название проекта *</label>
            <input type="text" id="proj-title" class="form-control" required placeholder="Например: Миросборка">
          </div>
          <div class="form-group">
            <label>Описание / Цель</label>
            <textarea id="proj-desc" class="form-control" rows="2" placeholder="Краткое описание функционала и задач"></textarea>
          </div>
          <div class="form-group">
            <label>Дедлайн (дата хакатона или релиза) *</label>
            <input type="date" id="proj-deadline" class="form-control" required value="2026-11-27">
          </div>
          <div class="form-checkbox-row">
            <label class="checkbox-label">
              <input type="checkbox" id="proj-is-main">
              <span>Сделать текущим главным проектом (активирует Соревновательный режим)</span>
            </label>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('${modalId}').remove()">Отмена</button>
            <button type="submit" class="btn btn-primary">Создать проект</button>
          </div>
        </form>
      </div>
    `;
  },

  async handleProjectSubmit(e) {
    e.preventDefault();
    const isMain = document.getElementById('proj-is-main').checked;

    const newProj = {
      title: document.getElementById('proj-title').value.trim(),
      description: document.getElementById('proj-desc').value.trim(),
      deadline: document.getElementById('proj-deadline').value,
      isMain: isMain,
      priority: isMain ? 'active' : 'secondary',
      status: 'in_progress',
      stages: [
        { name: 'Проектирование системной архитектуры', done: false },
        { name: 'Разработка прототипа ядра', done: false },
        { name: 'Сборка клиентского интерфейса и тестирование', done: false },
        { name: 'Финальная полировка, питч и демонстрация', done: false }
      ],
      tasks: [
        { id: 'pt_init', text: 'Первичное планирование архитектуры', done: false }
      ]
    };

    if (isMain) {
      const all = await this.db.getProjects();
      for (const p of all) {
        p.isMain = false;
        p.priority = 'secondary';
        await this.db.saveProject(p);
      }
    }

    await this.db.saveProject(newProj);
    const modal = document.getElementById('project-modal');
    if (modal) modal.remove();

    const todayStr = this.getTodayString();
    await AIPlanner.autoReplan(todayStr, this.db, 'Добавление нового проекта');

    this.render();
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GoalsManager;
}
if (typeof globalThis !== 'undefined') {
  globalThis.GoalsManager = GoalsManager;
}
