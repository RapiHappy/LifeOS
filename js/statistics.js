/**
 * LifeOS — Модуль статистики и аналитики (statistics.js)
 * Расчёт реальных показателей успеваемости, времени и прогресса.
 * Графики строятся на чистом HTML5 Canvas без сторонних библиотек.
 * Никаких фиктивных данных — при отсутствии данных выводится сообщение «Пока недостаточно данных».
 * Интеграция с TimeUtils (Europe/Moscow).
 */

const StatisticsManager = {
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

  async render() {
    const container = document.getElementById('statistics-content');
    if (!container) return;

    const allHw = await this.db.getAllHomework();
    const activityLogs = await this.db.getActivityLogs();
    const egeTopics = await this.db.getEgeTopics();
    const olympiads = await this.db.getOlympiads();
    const scheduleDays = await this.db.getAll('schedule_days');

    const todayStr = this.getTodayString();

    // 1. Выполненные задания за последние 7 дней
    const completedHw = allHw.filter(h => h.status === 'completed');
    const overdueHw = allHw.filter(h => h.status !== 'completed' && h.dueDate < todayStr);

    // Подсчет среднего времени ДЗ (факт)
    let totalActualHwMins = 0;
    let actualHwCount = 0;
    completedHw.forEach(h => {
      if (h.actualMinutes) {
        totalActualHwMins += h.actualMinutes;
        actualHwCount++;
      }
    });
    const avgHwMins = actualHwCount > 0 ? Math.round(totalActualHwMins / actualHwCount) : 0;

    // Время подготовки к ЕГЭ, проектов, игр из логов активности
    let egeMinutes = 0;
    let projectMinutes = 0;
    let gamingMinutes = 0;
    let olySolvedTotal = 0;

    olympiads.forEach(o => {
      olySolvedTotal += (o.solvedCount || 0);
    });

    activityLogs.forEach(log => {
      const dur = Number(log.durationMinutes) || 0;
      if (log.category === 'ege') egeMinutes += dur;
      if (log.category === 'project') projectMinutes += dur;
      if (log.category === 'gaming') gamingMinutes += dur;
    });

    // Расчет процента выполнения недели по расписанию
    let totalScheduledTasks = 0;
    let completedScheduledTasks = 0;
    scheduleDays.forEach(day => {
      if (day.tasks && Array.isArray(day.tasks)) {
        day.tasks.forEach(t => {
          totalScheduledTasks++;
          if (t.status === 'completed') completedScheduledTasks++;
        });
      }
    });
    const weekCompletionPercent = totalScheduledTasks > 0 ? Math.round((completedScheduledTasks / totalScheduledTasks) * 100) : 0;

    const formatHoursMins = (m) => {
      const h = Math.floor(m / 60);
      const rem = m % 60;
      if (h === 0) return `${rem} мин`;
      return `${h}ч ${rem}м`;
    };

    let html = `
      <!-- Карточки KPI показателей -->
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-value">${completedHw.length}</div>
          <div class="metric-label">Выполненных ДЗ</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${weekCompletionPercent > 0 ? weekCompletionPercent + '%' : '—'}</div>
          <div class="metric-label">Выполнение плана недели</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${formatHoursMins(egeMinutes)}</div>
          <div class="metric-label">Подготовка к ЕГЭ</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${olySolvedTotal}</div>
          <div class="metric-label">Олимпиадных задач</div>
        </div>
      </div>

      <div class="metrics-grid" style="margin-top: 1rem;">
        <div class="metric-card">
          <div class="metric-value">${formatHoursMins(projectMinutes)}</div>
          <div class="metric-label">Время на проекты («Миросборка»)</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${formatHoursMins(gamingMinutes)}</div>
          <div class="metric-label">Время игр на ПК</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${avgHwMins > 0 ? avgHwMins + ' мин' : '—'}</div>
          <div class="metric-label">Средняя длительность ДЗ</div>
        </div>
        <div class="metric-card ${overdueHw.length > 0 ? 'metric-card-danger' : ''}">
          <div class="metric-value">${overdueHw.length}</div>
          <div class="metric-label">Просроченных задач</div>
        </div>
      </div>

      <!-- Сетка с графиками -->
      <div class="charts-grid">
        <div class="chart-card">
          <div class="chart-card-header">
            <h4>Выполнение плана по дням (последние 7 дней)</h4>
          </div>
          <div class="chart-wrapper">
            <canvas id="chart-daily-completion" width="500" height="260"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-card-header">
            <h4>Распределение продуктивного времени</h4>
          </div>
          <div class="chart-wrapper">
            <canvas id="chart-time-distribution" width="500" height="260"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-card-header">
            <h4>Прогресс по предметам ЕГЭ (освоение тем)</h4>
          </div>
          <div class="chart-wrapper">
            <canvas id="chart-ege-progress" width="500" height="260"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-card-header">
            <h4>Динамика домашних заданий (план vs факт)</h4>
          </div>
          <div class="chart-wrapper">
            <canvas id="chart-hw-dynamics" width="500" height="260"></canvas>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Рендеринг Canvas графиков
    setTimeout(() => {
      this.renderCharts(scheduleDays, activityLogs, egeTopics, completedHw);
    }, 50);
  },

  /**
   * Отрисовка всех графиков на чистом Canvas
   */
  renderCharts(scheduleDays, activityLogs, egeTopics, completedHw) {
    this.drawDailyChart('chart-daily-completion', scheduleDays);
    this.drawTimeDistribution('chart-time-distribution', activityLogs);
    this.drawEgeProgress('chart-ege-progress', egeTopics);
    this.drawHwDynamics('chart-hw-dynamics', completedHw);
  },

  drawEmptyPlaceholder(ctx, width, height, text = 'Пока недостаточно данных') {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, height / 2);
  },

  // 1. График выполнения по дням (столбцы)
  drawDailyChart(canvasId, scheduleDays) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    const timeLib = this.getTimeLib();
    const todayStr = this.getTodayString();

    // Собираем последние 7 дней
    const daysData = [];
    const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    for (let i = 6; i >= 0; i--) {
      const dStr = timeLib ? timeLib.addDays(todayStr, -i) : new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      const dow = timeLib ? timeLib.getDayOfWeek(dStr) : (new Date(dStr).getDay() || 7);
      const dayShort = dayNames[dow % 7];

      const record = scheduleDays.find(s => s.date === dStr);
      let total = 0;
      let completed = 0;
      if (record && record.tasks) {
        total = record.tasks.length;
        completed = record.tasks.filter(t => t.status === 'completed').length;
      }
      daysData.push({ date: dStr, label: dayShort, total, completed });
    }

    const hasAnyData = daysData.some(d => d.total > 0);
    if (!hasAnyData) {
      this.drawEmptyPlaceholder(ctx, w, h);
      return;
    }

    ctx.clearRect(0, 0, w, h);
    const padX = 40;
    const padY = 30;
    const chartW = w - padX * 2;
    const chartH = h - padY * 2;
    const colW = chartW / daysData.length;

    // Сетка
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    for (let p = 0; p <= 100; p += 25) {
      const y = h - padY - (chartH * (p / 100));
      ctx.beginPath();
      ctx.moveTo(padX, y);
      ctx.lineTo(w - padX, y);
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(`${p}%`, padX - 8, y + 3);
    }

    // Столбики
    daysData.forEach((d, i) => {
      const percent = d.total > 0 ? (d.completed / d.total) : 0;
      const barHeight = Math.max(4, chartH * percent);
      const x = padX + i * colW + (colW - 32) / 2;
      const y = h - padY - barHeight;

      // Фон столбика
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, h - padY - chartH, 32, chartH, [4, 4, 0, 0]);
      } else {
        ctx.rect(x, h - padY - chartH, 32, chartH);
      }
      ctx.fill();

      // Заполненный прогресс
      if (d.total > 0) {
        ctx.fillStyle = '#4f46e5';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(x, y, 32, barHeight, [4, 4, 0, 0]);
        } else {
          ctx.rect(x, y, 32, barHeight);
        }
        ctx.fill();
      }

      // Подпись дня
      ctx.fillStyle = '#64748b';
      ctx.font = '12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(d.label, x + 16, h - padY + 16);
    });
  },

  // 2. Распределение времени по категориям (круговая диаграмма)
  drawTimeDistribution(canvasId, activityLogs) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    const categories = {
      homework: { label: 'Домашка', minutes: 0, color: '#3b82f6' },
      ege: { label: 'ЕГЭ', minutes: 0, color: '#10b981' },
      project: { label: 'Проекты', minutes: 0, color: '#8b5cf6' },
      olympiad: { label: 'Олимпиады', minutes: 0, color: '#f59e0b' },
      gaming: { label: 'Игры на ПК', minutes: 0, color: '#ec4899' },
      sport: { label: 'Спорт', minutes: 0, color: '#14b8a6' }
    };

    activityLogs.forEach(l => {
      const dur = Number(l.durationMinutes) || 0;
      if (categories[l.category]) {
        categories[l.category].minutes += dur;
      }
    });

    const totalMin = Object.values(categories).reduce((sum, c) => sum + c.minutes, 0);
    if (totalMin === 0) {
      this.drawEmptyPlaceholder(ctx, w, h);
      return;
    }

    ctx.clearRect(0, 0, w, h);
    const cx = w * 0.38;
    const cy = h / 2;
    const rOuter = 85;
    const rInner = 50;

    let startAngle = -Math.PI / 2;
    Object.values(categories).forEach(c => {
      if (c.minutes === 0) return;
      const sliceAngle = (c.minutes / totalMin) * 2 * Math.PI;

      ctx.beginPath();
      ctx.arc(cx, cy, rOuter, startAngle, startAngle + sliceAngle);
      ctx.arc(cx, cy, rInner, startAngle + sliceAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = c.color;
      ctx.fill();

      startAngle += sliceAngle;
    });

    // Легенда справа
    const legendX = w * 0.65;
    let legendY = 40;
    Object.values(categories).forEach(c => {
      if (c.minutes === 0) return;
      ctx.fillStyle = c.color;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(legendX, legendY, 12, 12, 3);
      } else {
        ctx.rect(legendX, legendY, 12, 12);
      }
      ctx.fill();

      ctx.fillStyle = '#334155';
      ctx.font = '12px system-ui';
      ctx.textAlign = 'left';
      const pct = Math.round((c.minutes / totalMin) * 100);
      ctx.fillText(`${c.label} (${pct}%)`, legendX + 20, legendY + 10);

      legendY += 24;
    });
  },

  // 3. Прогресс по предметам ЕГЭ (столбчатый график)
  drawEgeProgress(canvasId, egeTopics) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    const subjects = [
      { key: 'math', name: 'Математика' },
      { key: 'informatics', name: 'Информатика' },
      { key: 'russian', name: 'Русский язык' }
    ];

    const data = subjects.map(s => {
      const tops = egeTopics.filter(t => t.subject === s.key);
      const mastered = tops.filter(t => t.status === 'mastered').length;
      const inProgress = tops.filter(t => t.status === 'in_progress').length;
      return {
        name: s.name,
        total: tops.length,
        mastered,
        inProgress,
        percent: tops.length > 0 ? Math.round((mastered / tops.length) * 100) : 0
      };
    });

    const hasData = data.some(d => d.total > 0);
    if (!hasData) {
      this.drawEmptyPlaceholder(ctx, w, h);
      return;
    }

    ctx.clearRect(0, 0, w, h);
    const startY = 40;
    const barH = 26;
    const gap = 55;
    const barMaxW = w - 180;

    data.forEach((item, idx) => {
      const y = startY + idx * gap;

      // Название предмета
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 13px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(item.name, 25, y + 18);

      // Фон полосы
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(135, y, barMaxW, barH, 4);
      } else {
        ctx.rect(135, y, barMaxW, barH);
      }
      ctx.fill();

      // Заполненный прогресс
      const fillW = Math.max(6, barMaxW * (item.percent / 100));
      ctx.fillStyle = item.percent > 70 ? '#10b981' : (item.percent > 40 ? '#4f46e5' : '#f59e0b');
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(135, y, fillW, barH, 4);
      } else {
        ctx.rect(135, y, fillW, barH);
      }
      ctx.fill();

      // Процент и количество
      ctx.fillStyle = '#64748b';
      ctx.font = '12px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(`${item.percent}% (${item.mastered}/${item.total})`, 135 + barMaxW + 10, y + 18);
    });
  },

  // 4. Динамика домашних заданий (план vs факт)
  drawHwDynamics(canvasId, completedHw) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    const recent = completedHw.filter(h => h.actualMinutes).slice(-6);

    if (recent.length === 0) {
      this.drawEmptyPlaceholder(ctx, w, h, 'Пока недостаточно данных по фактически выполненным заданиям');
      return;
    }

    ctx.clearRect(0, 0, w, h);
    const padX = 40;
    const padY = 40;
    const chartW = w - padX * 2;
    const chartH = h - padY * 2;
    const itemW = chartW / recent.length;

    const maxVal = Math.max(60, ...recent.map(r => Math.max(r.estimatedMinutes || 30, r.actualMinutes || 30)));

    // Сетка
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    for (let v = 0; v <= maxVal; v += 20) {
      const y = h - padY - (chartH * (v / maxVal));
      ctx.beginPath();
      ctx.moveTo(padX, y);
      ctx.lineTo(w - padX, y);
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(`${v}м`, padX - 8, y + 3);
    }

    // Легенда
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(w - 180, 12, 10, 10);
    ctx.fillStyle = '#64748b';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText('План', w - 165, 21);

    ctx.fillStyle = '#10b981';
    ctx.fillRect(w - 110, 12, 10, 10);
    ctx.fillStyle = '#64748b';
    ctx.fillText('Факт', w - 95, 21);

    // Столбики
    recent.forEach((item, i) => {
      const est = item.estimatedMinutes || 30;
      const act = item.actualMinutes || 30;

      const estH = chartH * (est / maxVal);
      const actH = chartH * (act / maxVal);

      const groupX = padX + i * itemW + (itemW - 36) / 2;

      // План (серый)
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(groupX, h - padY - estH, 16, estH, [3, 3, 0, 0]);
      } else {
        ctx.rect(groupX, h - padY - estH, 16, estH);
      }
      ctx.fill();

      // Факт (зеленый)
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(groupX + 18, h - padY - actH, 16, actH, [3, 3, 0, 0]);
      } else {
        ctx.rect(groupX + 18, h - padY - actH, 16, actH);
      }
      ctx.fill();

      // Подпись предмета снизу
      ctx.fillStyle = '#64748b';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      const shortSubject = (item.subject || '').substring(0, 7);
      ctx.fillText(shortSubject, groupX + 17, h - padY + 16);
    });
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = StatisticsManager;
}
if (typeof globalThis !== 'undefined') {
  globalThis.StatisticsManager = StatisticsManager;
}
