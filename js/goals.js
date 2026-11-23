/**
 * LifeOS — Модуль «Цели» (goals.js)
 * Подготовка к ЕГЭ (Профильная математика обе части, Информатика, Русский язык),
 * Олимпиады и Проекты (включая «Миросборка» и Хакатон 27 ноября 2026).
 */

const GoalsManager = {
  currentTab: 'ege', // 'ege' | 'olympiads' | 'projects'
  currentEgeSubject: 'math', // 'math' | 'informatics' | 'russian'

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
            📚 Подготовка к ЕГЭ
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
    const topics = await this.db.getEgeTopics(this.currentEgeSubject);

    // Подсчет метрик по предмету
    const totalTopics = topics.length;
    const masteredCount = topics.filter(t => t.status === 'mastered').length;
    const inProgressCount = topics.filter(t => t.status === 'in_progress').length;
    const progressPercent = totalTopics > 0 ? Math.round((masteredCount / totalTopics) * 100) : 0;

    let totalSolved = 0;
    let totalCorrect = 0;
    topics.forEach(t => {
      totalSolved += (t.solvedCount || 0);
      totalCorrect += (t.correctCount || 0);
    });
    const accuracy = totalSolved > 0 ? Math.round((totalCorrect / totalSolved) * 100) : 0;

    const subjectNames = {
      math: 'Профильная математика (Части 1 и 2)',
      informatics: 'Информатика (КЕГЭ)',
      russian: 'Русский язык'
    };

    let html = `
      <!-- Переключатель предметов ЕГЭ -->
      <div class="ege-subject-bar">
        <button class="subject-tab-btn ${this.currentEgeSubject === 'math' ? 'active' : ''}" onclick="GoalsManager.setEgeSubject('math')">
          📐 Профильная математика
        </button>
        <button class="subject-tab-btn ${this.currentEgeSubject === 'informatics' ? 'active' : ''}" onclick="GoalsManager.setEgeSubject('informatics')">
          💻 Информатика
        </button>
        <button class="subject-tab-btn ${this.currentEgeSubject === 'russian' ? 'active' : ''}" onclick="GoalsManager.setEgeSubject('russian')">
          📖 Русский язык
        </button>
      </div>

      <!-- Статистика по предмету -->
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
          <div class="metric-value">${totalSolved}</div>
          <div class="metric-label">Решено задач всего</div>
        </div>
        <div class="metric-card">
          <div class="metric-value ${accuracy >= 80 ? 'text-success' : ''}">${accuracy}%</div>
          <div class="metric-label">Точность верных решений</div>
        </div>
      </div>

      <div class="section-card">
        <div class="section-card-header">
          <div>
            <h3>${subjectNames[this.currentEgeSubject]}</h3>
            <p class="text-muted">Отмечайте реальные результаты тренировочных вариантов и отработанные темы. Никаких случайных цифр.</p>
          </div>
        </div>

        <div class="ege-topics-list">
    `;

    // Группировка для математики (Часть 1 и Часть 2)
    const part1 = topics.filter(t => t.part === 1);
    const part2 = topics.filter(t => t.part === 2);

    const renderTopicCard = (topic) => {
      const statusLabels = {
        not_started: 'Не начато',
        in_progress: 'В процессе',
        mastered: 'Освоено'
      };
      const statusClasses = {
        not_started: 'badge-muted',
        in_progress: 'badge-warning',
        mastered: 'badge-success'
      };

      const hasMistakes = topic.mistakes && topic.mistakes.length > 0;

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
      html += `
        <h4 class="ege-part-title">Часть 1 (Задания 1–12, базовые задачи с кратким ответом)</h4>
        <div class="topics-grid">${part1.map(renderTopicCard).join('')}</div>

        <h4 class="ege-part-title" style="margin-top: 2rem;">Часть 2 (Задания 13–19, углубленные задачи с развернутым решением)</h4>
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

    topic.solvedCount = (topic.solvedCount || 0) + 1;
    if (isCorrect) {
      topic.correctCount = (topic.correctCount || 0) + 1;
    }

    await this.db.updateEgeTopic(topic);

    // Логируем в статистику
    await this.db.logActivity({
      category: 'ege',
      title: `ЕГЭ ${topic.subject}: ${topic.code} (${isCorrect ? 'верно' : 'ошибка'})`,
      durationMinutes: 10,
      date: new Date().toISOString().split('T')[0]
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

      modal.innerHTML = `
        <div class="modal-card">
          <div class="modal-header">
            <h3>Зафиксировать ошибку в теме ${topic.code}</h3>
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
              <input type="date" id="review-date-input" class="form-control" value="${new Date(Date.now() + 3*24*60*60*1000).toISOString().split('T')[0]}">
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
    const olympiads = await this.db.getOlympiads();

    let html = `
      <div class="section-card">
        <div class="section-card-header">
          <div>
            <h3>Олимпиадное движение</h3>
            <p class="text-muted">Подготовка к ВсОШ и перечневым олимпиадам. Планировщик резервирует 2 блока подготовки в неделю.</p>
          </div>
          <button class="btn btn-primary btn-sm" onclick="GoalsManager.openAddOlympiadModal()">+ Добавить олимпиаду</button>
        </div>

        <div class="olympiads-grid">
    `;

    if (olympiads.length === 0) {
      html += `
        <div class="empty-state">
          <p>Пока нет добавленных олимпиад.</p>
        </div>
      `;
    } else {
      const today = new Date();
      olympiads.forEach(oly => {
        let diffDays = null;
        if (oly.date) {
          const olyDate = new Date(oly.date);
          diffDays = Math.ceil((olyDate - today) / (1000 * 60 * 60 * 24));
        }

        const solved = oly.solvedCount || 0;
        const target = oly.prepTasksCount || 50;
        const percent = Math.min(100, Math.round((solved / target) * 100));

        html += `
          <div class="goal-item-card">
            <div class="goal-item-header">
              <span class="badge badge-purple">${oly.subject || 'Предмет'}</span>
              ${diffDays !== null ? `<span class="badge ${diffDays <= 7 ? 'badge-danger' : 'badge-info'}">Дней осталось: ${diffDays}</span>` : ''}
            </div>
            <h4>${oly.title}</h4>
            <div class="goal-meta text-muted">
              <span>Этап: <strong>${oly.stage || 'Муниципальный'}</strong></span>
              <span>Дата: <strong>${oly.date || 'Не указана'}</strong></span>
              <span>Цель: <strong>${oly.targetPrize || 'Призёр'}</strong></span>
            </div>
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
              <button class="btn btn-sm btn-icon" title="Удалить" onclick="GoalsManager.deleteOlympiad('${oly.id}')">🗑️</button>
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

  async incrementOlySolved(id) {
    const oly = await this.db.get('olympiads', id);
    if (!oly) return;
    oly.solvedCount = (oly.solvedCount || 0) + 1;
    await this.db.saveOlympiad(oly);

    // Логируем активность
    await this.db.logActivity({
      category: 'olympiad',
      title: `Олимпиада: ${oly.title} (+1 задача)`,
      durationMinutes: 20,
      date: new Date().toISOString().split('T')[0]
    });

    this.render();
  },

  async deleteOlympiad(id) {
    if (!confirm('Удалить эту олимпиаду?')) return;
    await this.db.deleteOlympiad(id);
    this.render();
  },

  openAddOlympiadModal() {
    const modalId = 'oly-modal';
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
          <h3>Добавить олимпиаду</h3>
          <button class="modal-close-btn" onclick="document.getElementById('${modalId}').remove()">&times;</button>
        </div>
        <form onsubmit="GoalsManager.handleOlySubmit(event)">
          <div class="form-group">
            <label>Название олимпиады *</label>
            <input type="text" id="oly-title" class="form-control" required placeholder="ВсОШ по математике">
          </div>
          <div class="form-row">
            <div class="form-group col">
              <label>Предмет *</label>
              <input type="text" id="oly-subject" class="form-control" required value="Математика">
            </div>
            <div class="form-group col">
              <label>Этап</label>
              <input type="text" id="oly-stage" class="form-control" value="Муниципальный этап">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group col">
              <label>Дата проведения *</label>
              <input type="date" id="oly-date" class="form-control" required value="${new Date(Date.now() + 14*24*60*60*1000).toISOString().split('T')[0]}">
            </div>
            <div class="form-group col">
              <label>План задач для подготовки</label>
              <input type="number" id="oly-tasks-plan" class="form-control" value="30">
            </div>
          </div>
          <div class="form-group">
            <label>Целевой результат</label>
            <input type="text" id="oly-prize" class="form-control" value="Призёр">
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('${modalId}').remove()">Отмена</button>
            <button type="submit" class="btn btn-primary">Добавить</button>
          </div>
        </form>
      </div>
    `;
  },

  async handleOlySubmit(e) {
    e.preventDefault();
    const newOly = {
      title: document.getElementById('oly-title').value.trim(),
      subject: document.getElementById('oly-subject').value.trim(),
      stage: document.getElementById('oly-stage').value.trim(),
      date: document.getElementById('oly-date').value,
      prepTasksCount: Number(document.getElementById('oly-tasks-plan').value) || 30,
      solvedCount: 0,
      targetPrize: document.getElementById('oly-prize').value.trim(),
      status: 'active'
    };

    await this.db.saveOlympiad(newOly);
    const modal = document.getElementById('oly-modal');
    if (modal) modal.remove();
    this.render();
  },

  // ==========================================
  // РАЗДЕЛ ПРОЕКТЫ И ХАКАТОНЫ
  // ==========================================
  async renderProjectsSection() {
    const projects = await this.db.getProjects();
    const today = new Date();

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
          const d = new Date(p.deadline);
          diffDays = Math.ceil((d - today) / (1000 * 60 * 60 * 24));
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
                  <span class="badge ${diffDays <= 5 ? 'badge-danger' : 'badge-purple'}">
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
    await this.db.logActivity({
      category: 'project',
      title: `Разработка: ${p.title}`,
      durationMinutes: 40,
      date: new Date().toISOString().split('T')[0]
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
    // Перепланирование текущего дня под новый приоритетный проект
    const todayStr = new Date().toISOString().split('T')[0];
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
        { name: 'Проектирование и архитектура', done: false },
        { name: 'Разработка прототипа', done: false },
        { name: 'Тестирование и отладка', done: false },
        { name: 'Презентация и защита', done: false }
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

    const todayStr = new Date().toISOString().split('T')[0];
    await AIPlanner.autoReplan(todayStr, this.db, 'Добавление нового проекта');

    this.render();
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GoalsManager;
}
