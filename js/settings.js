/**
 * LifeOS — Модуль настроек (settings.js)
 * Управление параметрами сна, защищённых блоков, расчётом намаза ясту (Актаныш),
 * уведомлениями Windows, ИИ-интеграцией, экспортом и импортом данных.
 * Безопасность: отсутствие открытого хранения API-ключей.
 * Интеграция с TimeUtils (Europe/Moscow).
 */

const SettingsManager = {
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

  render() {
    const container = document.getElementById('settings-content');
    if (!container) return;

    const s = this.db.getSettings();
    const notifStatus = (typeof NotificationsManager !== 'undefined' && NotificationsManager.getPermissionStatus)
      ? NotificationsManager.getPermissionStatus()
      : 'unsupported';

    const todayStr = this.getTodayString();
    const yastuCalc = PrayerManager.calculateYastu(todayStr, s);

    const notifStatusBadges = {
      granted: '<span class="badge badge-success">Разрешено в Windows</span>',
      denied: '<span class="badge badge-danger">Заблокировано браузером</span>',
      default: '<span class="badge badge-warning">Требуется запрос</span>',
      unsupported: '<span class="badge badge-muted">Не поддерживается</span>'
    };

    let html = `
      <div class="settings-grid">
        <!-- БЛОК 1: РЕЖИМ ДНЯ И ЗАЩИЩЁННЫЕ БЛОКИ -->
        <div class="section-card">
          <div class="section-card-header">
            <div>
              <h3>Режим дня и защищённые интервалы</h3>
              <p class="text-muted">Планировщик ни при каких обстоятельствах не сокращает эти интервалы.</p>
            </div>
          </div>

          <form onsubmit="SettingsManager.saveRoutineSettings(event)">
            <div class="form-row">
              <div class="form-group col">
                <label>Время подъёма</label>
                <input type="time" id="set-wake-time" class="form-control" value="${s.wakeTime || '06:00'}" required>
              </div>
              <div class="form-group col">
                <label>Время отхода ко сну (отбой)</label>
                <input type="time" id="set-sleep-start" class="form-control" value="${s.sleepStart || '21:30'}" required>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group col">
                <label>Игры на ПК (минут ежедневно)</label>
                <input type="number" id="set-game-min" class="form-control" min="30" max="120" value="${s.gameMinutes || 60}" required>
                <small class="text-muted">Запланированный блок, не сокращается из-за уроков</small>
              </div>
              <div class="form-group col">
                <label>Спорт / Разминка (минут)</label>
                <input type="number" id="set-sport-min" class="form-control" min="15" max="60" value="${s.sportMinutes || 25}" required>
                <small class="text-muted">Двигательная активность для осанки и здоровья</small>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group col">
                <label>Ужин с родителями / Семья (минут)</label>
                <input type="number" id="set-family-min" class="form-control" min="15" max="90" value="${s.familyMinutes || 30}" required>
              </div>
              <div class="form-group col">
                <label>Отдых без ПК перед сном (минут)</label>
                <input type="number" id="set-rest-min" class="form-control" min="20" max="90" value="${s.offlineRestMinutes || 45}" required>
              </div>
            </div>

            <div class="form-group">
              <label>Режим автопланирования расписания</label>
              <select id="set-active-mode" class="form-control">
                <option value="auto" ${s.activeMode === 'auto' ? 'selected' : ''}>🤖 Автоматическое определение (рекомендуется)</option>
                <option value="normal" ${s.activeMode === 'normal' ? 'selected' : ''}>Обычный режим (сбалансированный)</option>
                <option value="loaded" ${s.activeMode === 'loaded' ? 'selected' : ''}>Загруженный режим (фокус на уроках и ДЗ)</option>
                <option value="competitive" ${s.activeMode === 'competitive' ? 'selected' : ''}>Соревновательный режим (фокус на хакатоне / проектах)</option>
              </select>
            </div>

            <button type="submit" class="btn btn-primary btn-sm">Сохранить режим дня</button>
          </form>
        </div>

        <!-- БЛОК 2: НАМАЗ ЯСТУ (АКТАНЫШ, ТАТАРСТАН) -->
        <div class="section-card">
          <div class="section-card-header">
            <div>
              <h3>Намаз ясту (Иша) — Актаныш, Татарстан</h3>
              <p class="text-muted">Расчёт времени захода солнца и ночной молитвы для координат села Актаныш.</p>
            </div>
            <div class="prayer-status-chip">
              Сегодня: <strong>${yastuCalc.time}</strong> (${yastuCalc.duration} мин)
            </div>
          </div>

          <form onsubmit="SettingsManager.savePrayerSettings(event)">
            <div class="form-group">
              <label>Местоположение</label>
              <input type="text" id="set-prayer-city" class="form-control" value="${s.prayerCity || 'Актаныш, Республика Татарстан'}" required>
            </div>

            <div class="form-row">
              <div class="form-group col">
                <label>Широта (Latitude)</label>
                <input type="number" step="0.001" id="set-prayer-lat" class="form-control" value="${s.prayerLat || s.latitude || 55.725}" required>
              </div>
              <div class="form-group col">
                <label>Долгота (Longitude)</label>
                <input type="number" step="0.001" id="set-prayer-lng" class="form-control" value="${s.prayerLng || s.longitude || 54.080}" required>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group col">
                <label>Метод расчёта времени</label>
                <select id="set-prayer-method" class="form-control">
                  <option value="DUM_RT" ${(s.prayerMethod || s.method) === 'DUM_RT' ? 'selected' : ''}>ДУМ РТ (угол 15°)</option>
                  <option value="INTERVAL_90" ${(s.prayerMethod || s.method) === 'INTERVAL_90' ? 'selected' : ''}>Интервал 90 мин после захода солнца</option>
                </select>
              </div>
              <div class="form-group col">
                <label>Длительность блока молитвы (мин)</label>
                <input type="number" id="set-prayer-duration" class="form-control" min="10" max="60" value="${s.prayerDuration || s.durationMinutes || 20}" required>
              </div>
            </div>

            <div class="form-group">
              <label>Ручное время Ясту (оставьте пустым для авторасчёта)</label>
              <input type="time" id="set-prayer-manual" class="form-control" value="${s.prayerManualTime || s.manualTime || ''}" placeholder="Например 17:35">
              <small class="text-muted">Если в мечети Актаныша установлено фиксированное расписание, укажите его здесь.</small>
            </div>

            <button type="submit" class="btn btn-primary btn-sm">Сохранить настройки намаза</button>
          </form>
        </div>

        <!-- БЛОК 3: УВЕДОМЛЕНИЯ WINDOWS -->
        <div class="section-card">
          <div class="section-card-header">
            <div>
              <h3>Системные уведомления рабочего стола</h3>
              <p class="text-muted">Всплывающие уведомления в Windows через Web Notifications API при открытой вкладке браузера.</p>
            </div>
            <div>${notifStatusBadges[notifStatus] || ''}</div>
          </div>

          <div class="notif-actions-bar">
            ${notifStatus !== 'granted' ? `
              <button class="btn btn-primary btn-sm" onclick="SettingsManager.requestNotifPermission()">
                🔔 Запросить разрешение Windows
              </button>
            ` : ''}
            <button class="btn btn-secondary btn-sm" onclick="SettingsManager.testNotification()">
              🚀 Отправить тестовое уведомление
            </button>
          </div>

          <form onsubmit="SettingsManager.saveNotifSettings(event)" style="margin-top: 1.5rem;">
            <div class="form-group">
              <label>Предупреждать до начала события за:</label>
              <select id="set-notif-advance" class="form-control">
                <option value="5" ${s.notificationAdvance === 5 ? 'selected' : ''}>За 5 минут</option>
                <option value="10" ${s.notificationAdvance === 10 ? 'selected' : ''}>За 10 минут (рекомендуется)</option>
                <option value="15" ${s.notificationAdvance === 15 ? 'selected' : ''}>За 15 минут</option>
              </select>
            </div>

            <div class="form-checkbox-row">
              <label class="checkbox-label">
                <input type="checkbox" id="set-notif-start" ${s.notificationStart !== false ? 'checked' : ''}>
                <span>Уведомление ровно в момент начала задачи</span>
              </label>
            </div>

            <div class="form-checkbox-row">
              <label class="checkbox-label">
                <input type="checkbox" id="set-notif-end" ${s.notificationEnd !== false ? 'checked' : ''}>
                <span>Предупреждение за 5 минут до окончания текущей задачи</span>
              </label>
            </div>

            <div class="form-checkbox-row">
              <label class="checkbox-label">
                <input type="checkbox" id="set-notif-prayer" ${s.notificationPrayer !== false ? 'checked' : ''}>
                <span>Особое напоминание о наступлении времени намаза ясту</span>
              </label>
            </div>

            <div class="form-checkbox-row">
              <label class="checkbox-label">
                <input type="checkbox" id="set-notif-sound" ${s.notificationSound !== false ? 'checked' : ''}>
                <span>Звуковой сигнал при уведомлении (Web Audio Chime)</span>
              </label>
            </div>

            <button type="submit" class="btn btn-primary btn-sm">Сохранить настройки уведомлений</button>
          </form>
        </div>

        <!-- БЛОК 4: ИИ-ИНТЕГРАЦИЯ (БЕЗОПАСНЫЙ СЕРВЕРНЫЙ ЭНДПОИНТ) -->
        <div class="section-card">
          <div class="section-card-header">
            <div>
              <h3>ИИ-Планировщик и интеграция</h3>
              <p class="text-muted">По умолчанию LifeOS работает на 100% автономном локальном алгоритме. Секретные ключи не сохраняются в браузере.</p>
            </div>
          </div>

          <form onsubmit="SettingsManager.saveAiSettings(event)">
            <div class="form-group">
              <label>URL защищённого прокси-эндпоинта (Cloudflare Worker / Backend API)</label>
              <input type="url" id="set-ai-endpoint" class="form-control" value="${s.aiEndpoint || ''}" placeholder="https://my-lifeos-worker.username.workers.dev/plan">
              <small class="text-muted">Если поле пустое, расписание рассчитывается встроенным детерминированным планировщиком без внешних запросов.</small>
            </div>

            <button type="submit" class="btn btn-primary btn-sm">Сохранить эндпоинт ИИ</button>
          </form>
        </div>

        <!-- БЛОК 5: ДЕМО-РЕЖИМ И ОЧИСТКА ДАННЫХ -->
        <div class="section-card">
          <div class="section-card-header">
            <div>
              <h3>Демо-режим и управление начальным состоянием</h3>
              <p class="text-muted">Чистый старт с 0 решённых задач или тестовый демонстрационный режим.</p>
            </div>
          </div>

          <div class="backup-actions-grid">
            <div class="backup-action-box">
              <h4>✨ Демонстрационный режим</h4>
              <p class="text-muted">Загрузить примеры домашних заданий, уроков и проектной деятельности для ознакомления.</p>
              <button class="btn btn-secondary" onclick="SettingsManager.loadDemoData()">
                Загрузить демо-данные
              </button>
            </div>

            <div class="backup-action-box backup-danger-box">
              <h4 class="text-danger">🧹 Начать с чистого листа</h4>
              <p class="text-muted">Очистить все вымышленные показатели, сбросить прогресс ЕГЭ и олимпиад в 0 с сохранением автоматического бэкапа.</p>
              <button class="btn btn-outline-danger" onclick="SettingsManager.cleanToZeroState()">
                Очистить демо и начать с нуля
              </button>
            </div>
          </div>
        </div>

        <!-- БЛОК 6: РЕЗЕРВНОЕ КОПИРОВАНИЕ И ЭКСПОРТ/ИМПОРТ -->
        <div class="section-card">
          <div class="section-card-header">
            <div>
              <h3>Резервное копирование и перенос данных</h3>
              <p class="text-muted">Полный экспорт всех ваших задач, расписаний и истории в JSON-файл.</p>
            </div>
          </div>

          <div class="backup-actions-grid">
            <div class="backup-action-box">
              <h4>Экспорт данных</h4>
              <p class="text-muted">Скачать резервную копию всех настроек, расписаний, ДЗ и тем ЕГЭ.</p>
              <button class="btn btn-primary" onclick="SettingsManager.exportData()">
                📥 Экспортировать JSON
              </button>
            </div>

            <div class="backup-action-box">
              <h4>Импорт данных</h4>
              <p class="text-muted">Восстановить состояние из сохранённого JSON-файла.</p>
              <input type="file" id="import-file-input" accept=".json" style="display: none;" onchange="SettingsManager.handleFileImport(event)">
              <button class="btn btn-secondary" onclick="document.getElementById('import-file-input').click()">
                📤 Выбрать файл для импорта
              </button>
            </div>

            <div class="backup-action-box backup-danger-box">
              <h4 class="text-danger">Заводской сброс</h4>
              <p class="text-muted">Полный сброс базы данных к начальному чистому состоянию.</p>
              <button class="btn btn-outline-danger" onclick="SettingsManager.resetDefaults()">
                ⚠️ Сбросить всё
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  },

  async saveRoutineSettings(e) {
    e.preventDefault();
    const newSettings = {
      wakeTime: document.getElementById('set-wake-time').value,
      sleepStart: document.getElementById('set-sleep-start').value,
      gameMinutes: Number(document.getElementById('set-game-min').value) || 60,
      sportMinutes: Number(document.getElementById('set-sport-min').value) || 25,
      familyMinutes: Number(document.getElementById('set-family-min').value) || 30,
      offlineRestMinutes: Number(document.getElementById('set-rest-min').value) || 45,
      activeMode: document.getElementById('set-active-mode').value
    };

    this.db.saveSettings(newSettings);
    const todayStr = this.getTodayString();
    await AIPlanner.autoReplan(todayStr, this.db, 'Изменение режима дня в настройках');

    alert('Настройки режима дня сохранены! Расписание обновлено.');
    this.render();
    if (window.App && typeof window.App.refreshCurrentView === 'function') window.App.refreshCurrentView();
  },

  async savePrayerSettings(e) {
    e.preventDefault();
    const lat = Number(document.getElementById('set-prayer-lat').value) || 55.725;
    const lng = Number(document.getElementById('set-prayer-lng').value) || 54.080;
    const duration = Number(document.getElementById('set-prayer-duration').value) || 20;
    const method = document.getElementById('set-prayer-method').value;
    const manualTime = document.getElementById('set-prayer-manual').value.trim();

    const newSettings = {
      prayerCity: document.getElementById('set-prayer-city').value.trim(),
      prayerLat: lat,
      latitude: lat,
      prayerLng: lng,
      longitude: lng,
      prayerMethod: method,
      method: method,
      prayerDuration: duration,
      durationMinutes: duration,
      prayerManualTime: manualTime,
      manualTime: manualTime
    };

    this.db.saveSettings(newSettings);
    const todayStr = this.getTodayString();
    await AIPlanner.autoReplan(todayStr, this.db, 'Изменение настроек намаза ясту');

    alert('Настройки намаза ясту сохранены!');
    this.render();
    if (window.App && typeof window.App.refreshCurrentView === 'function') window.App.refreshCurrentView();
  },

  saveNotifSettings(e) {
    e.preventDefault();
    const newSettings = {
      notificationAdvance: Number(document.getElementById('set-notif-advance').value) || 10,
      notificationStart: document.getElementById('set-notif-start').checked,
      notificationEnd: document.getElementById('set-notif-end').checked,
      notificationPrayer: document.getElementById('set-notif-prayer').checked,
      notificationSound: document.getElementById('set-notif-sound').checked
    };

    this.db.saveSettings(newSettings);
    alert('Настройки уведомлений успешно сохранены!');
    this.render();
  },

  saveAiSettings(e) {
    e.preventDefault();
    const endpoint = document.getElementById('set-ai-endpoint').value.trim();
    this.db.saveSettings({ aiEndpoint: endpoint });
    alert('Параметры ИИ-интеграции сохранены!');
    this.render();
  },

  async requestNotifPermission() {
    if (typeof NotificationsManager !== 'undefined' && NotificationsManager.requestPermission) {
      const status = await NotificationsManager.requestPermission();
      if (status === 'granted') {
        NotificationsManager.sendTestNotification();
      }
    }
    this.render();
  },

  testNotification() {
    if (typeof NotificationsManager !== 'undefined' && NotificationsManager.sendTestNotification) {
      const res = NotificationsManager.sendTestNotification();
      if (res && !res.success) {
        alert(res.message);
      }
    } else {
      alert('Модуль уведомлений не загружен.');
    }
  },

  async loadDemoData() {
    if (!confirm('Загрузить демонстрационные данные? Это добавит примеры ДЗ, олимпиад и задач для ознакомления.')) {
      return;
    }
    await this.db.loadDemoData();
    const todayStr = this.getTodayString();
    await AIPlanner.autoReplan(todayStr, this.db, 'Загрузка демонстрационных данных');
    alert('Демо-данные успешно загружены!');
    window.location.reload();
  },

  async cleanToZeroState() {
    if (!confirm('Вы уверены? Перед очисткой система автоматически создаст и скачает резервную копию всех текущих данных.')) {
      return;
    }
    await this.exportData();
    await this.db.cleanToZeroState();
    const todayStr = this.getTodayString();
    await AIPlanner.autoReplan(todayStr, this.db, 'Очистка до нулевого начального состояния');
    alert('Все демонстрационные данные удалены. База чистая: прогресс 0, реальные результаты вносите самостоятельно.');
    window.location.reload();
  },

  async exportData() {
    const jsonStr = await this.db.exportAllData();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const todayStr = this.getTodayString();
    a.href = url;
    a.download = `lifeos-backup-${todayStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  async handleFileImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!confirm('Вы уверены, что хотите импортировать данные? Все текущие задачи и расписание будут заменены данными из файла.')) {
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        await this.db.importAllData(event.target.result);
        alert('Данные успешно импортированы!');
        window.location.reload();
      } catch (err) {
        alert('Ошибка при импорте файла: ' + err.message);
      }
    };
    reader.readAsText(file);
  },

  async resetDefaults() {
    if (!confirm('ВНИМАНИЕ! Это действие сбросит все задачи, расписание и прогресс к начальным значениям по умолчанию. Продолжить?')) {
      return;
    }
    if (!confirm('Подтвердите сброс ещё раз. Все несохранённые изменения будут удалены.')) {
      return;
    }

    await this.db.resetToDefaults();
    alert('Данные успешно сброшены до начальных настроек.');
    window.location.reload();
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SettingsManager;
}
if (typeof globalThis !== 'undefined') {
  globalThis.SettingsManager = SettingsManager;
}
