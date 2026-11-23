/**
 * LifeOS v1.1 — Comprehensive Automated Test Suite
 * Tests all core modules: TimeUtils, PrayerManager, Scheduler, Database, AIPlanner
 */

const assert = require('assert');

// In-memory IndexedDB mock for Node.js testing
function createMockIndexedDB() {
  const stores = {};

  return {
    open(name, version) {
      const request = {
        result: null,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null
      };

      setTimeout(() => {
        const db = {
          objectStoreNames: {
            contains(storeName) {
              return !!stores[storeName];
            }
          },
          createObjectStore(storeName, options = {}) {
            if (!stores[storeName]) {
              stores[storeName] = {
                keyPath: options.keyPath || 'id',
                data: new Map(),
                indexes: {}
              };
            }
            return {
              createIndex(idxName, keyPath) {
                stores[storeName].indexes[idxName] = keyPath;
              }
            };
          },
          transaction(storeNames, mode) {
            const tx = {
              oncomplete: null,
              onerror: null,
              objectStore(storeName) {
                const s = stores[storeName];
                if (!s) throw new Error(`Store ${storeName} not found`);

                return {
                  get(key) {
                    const req = { result: null, onsuccess: null, onerror: null };
                    setTimeout(() => {
                      req.result = s.data.has(key) ? JSON.parse(JSON.stringify(s.data.get(key))) : undefined;
                      if (req.onsuccess) req.onsuccess({ target: req });
                    }, 0);
                    return req;
                  },
                  getAll() {
                    const req = { result: [], onsuccess: null, onerror: null };
                    setTimeout(() => {
                      req.result = Array.from(s.data.values()).map(v => JSON.parse(JSON.stringify(v)));
                      if (req.onsuccess) req.onsuccess({ target: req });
                    }, 0);
                    return req;
                  },
                  put(item) {
                    const req = { result: null, onsuccess: null, onerror: null };
                    setTimeout(() => {
                      const key = item[s.keyPath];
                      s.data.set(key, JSON.parse(JSON.stringify(item)));
                      req.result = key;
                      if (req.onsuccess) req.onsuccess({ target: req });
                    }, 0);
                    return req;
                  },
                  delete(key) {
                    const req = { result: null, onsuccess: null, onerror: null };
                    setTimeout(() => {
                      s.data.delete(key);
                      if (req.onsuccess) req.onsuccess({ target: req });
                    }, 0);
                    return req;
                  },
                  clear() {
                    const req = { result: null, onsuccess: null, onerror: null };
                    setTimeout(() => {
                      s.data.clear();
                      if (req.onsuccess) req.onsuccess({ target: req });
                    }, 0);
                    return req;
                  }
                };
              }
            };
            return tx;
          }
        };

        request.result = db;

        // Upgrade
        if (request.onupgradeneeded) {
          request.onupgradeneeded({ target: { result: db } });
        }

        // Success
        if (request.onsuccess) {
          request.onsuccess({ target: { result: db } });
        }
      }, 0);

      return request;
    }
  };
}

// Global mocks for browser environment
globalThis.window = {
  localStorage: {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; },
    clear() { this._data = {}; }
  }
};
globalThis.localStorage = globalThis.window.localStorage;
globalThis.indexedDB = createMockIndexedDB();

// Load modules
const TimeUtils = require('../js/time.js');
globalThis.TimeUtils = TimeUtils;

const PrayerManager = require('../js/prayer.js');
globalThis.PrayerManager = PrayerManager;

const Scheduler = require('../js/scheduler.js');
globalThis.Scheduler = Scheduler;

const Database = require('../js/database.js');
globalThis.Database = Database;

const AIPlanner = require('../js/ai-planner.js');
globalThis.AIPlanner = AIPlanner;

let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function asyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.stack || err.message}`);
  }
}

async function runAllTests() {
  console.log('\n======================================================');
  console.log('--- 1. TimeUtils Tests (Europe/Moscow Timezone) ---');
  console.log('======================================================');

  test('TimeUtils returns valid YYYY-MM-DD Moscow date string', () => {
    const today = TimeUtils.getTodayStr();
    assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
  });

  test('TimeUtils timeToMin and minToTime roundtrip', () => {
    assert.strictEqual(TimeUtils.timeToMin('00:00'), 0);
    assert.strictEqual(TimeUtils.timeToMin('12:30'), 750);
    assert.strictEqual(TimeUtils.timeToMin('21:30'), 1290);
    assert.strictEqual(TimeUtils.minToTime(0), '00:00');
    assert.strictEqual(TimeUtils.minToTime(750), '12:30');
    assert.strictEqual(TimeUtils.minToTime(1290), '21:30');
  });

  test('TimeUtils addDays and diffDays calculations', () => {
    assert.strictEqual(TimeUtils.addDays('2026-11-23', 1), '2026-11-24');
    assert.strictEqual(TimeUtils.addDays('2026-11-23', 7), '2026-11-30');
    assert.strictEqual(TimeUtils.addDays('2026-11-30', 1), '2026-12-01');
    assert.strictEqual(TimeUtils.diffDays('2026-11-23', '2026-11-27'), 4);
    assert.strictEqual(TimeUtils.diffDays('2026-11-27', '2026-11-23'), -4);
  });

  test('TimeUtils getDayOfWeek returns 1 for Monday to 7 for Sunday', () => {
    // 2026-11-23 is Monday
    assert.strictEqual(TimeUtils.getDayOfWeek('2026-11-23'), 1);
    // 2026-11-24 is Tuesday
    assert.strictEqual(TimeUtils.getDayOfWeek('2026-11-24'), 2);
    // 2026-11-29 is Sunday
    assert.strictEqual(TimeUtils.getDayOfWeek('2026-11-29'), 7);
  });

  test('TimeUtils Moscow timezone pinning at midnight edge', () => {
    // Simulating UTC timestamp at 21:30 UTC on Nov 23 => In Moscow (UTC+3) it is 00:30 on Nov 24
    const edgeUtc = new Date(Date.UTC(2026, 10, 23, 21, 30, 0));
    const dStr = TimeUtils.formatDateISO(edgeUtc);
    assert.strictEqual(dStr, '2026-11-24', 'Should be Nov 24 in Moscow when UTC is Nov 23 21:30');
  });

  console.log('\n======================================================');
  console.log('--- 2. PrayerManager Tests ---');
  console.log('======================================================');

  test('PrayerManager normalizeSettings maps both naming conventions', () => {
    const s1 = { prayerLat: 55.725, prayerLng: 54.08, prayerDuration: 25, prayerManualTime: '17:40' };
    const n1 = PrayerManager.normalizeSettings(s1);
    assert.strictEqual(n1.latitude, 55.725);
    assert.strictEqual(n1.longitude, 54.08);
    assert.strictEqual(n1.durationMinutes, 25);
    assert.strictEqual(n1.manualTime, '17:40');

    const s2 = { latitude: 55.7, longitude: 54.0, durationMinutes: 15, manualTime: '18:00' };
    const n2 = PrayerManager.normalizeSettings(s2);
    assert.strictEqual(n2.latitude, 55.7);
    assert.strictEqual(n2.longitude, 54.0);
    assert.strictEqual(n2.durationMinutes, 15);
    assert.strictEqual(n2.manualTime, '18:00');
  });

  test('PrayerManager manual override returns fixed time', () => {
    const s = { prayerManualTime: '17:15', prayerDuration: 25 };
    const res = PrayerManager.calculateYastu('2026-11-23', s);
    assert.strictEqual(res.time, '17:15');
    assert.strictEqual(res.duration, 25);
    assert.strictEqual(res.isManual, true);
  });

  test('PrayerManager astronomical calculation for Aktanysh produces valid time', () => {
    const s = { prayerCity: 'Актаныш', prayerLat: 55.725, prayerLng: 54.08, prayerMethod: 'DUM_RT', prayerDuration: 20 };
    const res = PrayerManager.calculateYastu('2026-11-23', s);
    assert.match(res.time, /^\d{2}:\d{2}$/);
    assert.strictEqual(res.duration, 20);
    assert.strictEqual(res.isManual, false);
    const mins = TimeUtils.timeToMin(res.time);
    assert.ok(mins >= 960 && mins <= 1080, `Yastu time ${res.time} should be in evening range (16:00 - 18:00)`);
  });

  test('PrayerManager getYastuScheduleBlock creates protected block', () => {
    const s = { prayerManualTime: '17:00', prayerDuration: 20 };
    const block = PrayerManager.getYastuScheduleBlock('2026-11-23', s);
    assert.strictEqual(block.startTime, '17:00');
    assert.strictEqual(block.endTime, '17:20');
    assert.strictEqual(block.isProtected, true);
    assert.strictEqual(block.category, 'prayer');
  });

  console.log('\n======================================================');
  console.log('--- 3. Database Tests (Clean 0-State & Demo Mode) ---');
  console.log('======================================================');

  await asyncTest('Database initializes with clean 0-state metrics', async () => {
    await Database.init();
    const topics = await Database.getEgeTopics();
    assert.ok(topics.length > 0, 'Should seed EGE topics list');

    let totalSolved = 0;
    let totalCorrect = 0;
    let mastered = 0;
    topics.forEach(t => {
      totalSolved += (t.solvedCount || 0);
      totalCorrect += (t.correctCount || 0);
      if (t.status === 'mastered') mastered++;
      assert.deepStrictEqual(t.mistakes, [], `Mistakes in topic ${t.code} must be empty`);
    });

    assert.strictEqual(totalSolved, 0, 'Total solved EGE tasks must start at 0');
    assert.strictEqual(totalCorrect, 0, 'Total correct EGE tasks must start at 0');
    assert.strictEqual(mastered, 0, 'Mastered topics count must start at 0');

    const hw = await Database.getAllHomework();
    assert.strictEqual(hw.length, 0, 'Homework must start empty in clean state');

    const oly = await Database.getOlympiads();
    oly.forEach(o => {
      assert.strictEqual(o.solvedCount || 0, 0, `Olympiad ${o.title} solvedCount must start at 0`);
    });

    const projects = await Database.getProjects();
    const miro = projects.find(p => p.title.includes('Миросборка'));
    assert.ok(miro, '«Миросборка» project must exist');
    assert.strictEqual(miro.deadline, '2026-11-27', 'Hackathon deadline must be 2026-11-27');
    miro.stages.forEach(st => {
      assert.strictEqual(st.done, false, `Stage ${st.name} must start with done: false`);
    });
  });

  await asyncTest('Database hasLegacyDemoData correctly detects clean state', async () => {
    const isLegacy = await Database.hasLegacyDemoData();
    assert.strictEqual(isLegacy, false, 'Clean state must not be flagged as legacy demo data');
  });

  await asyncTest('Database Demo Mode can load and clean data', async () => {
    await Database.loadDemoData();
    assert.strictEqual(Database.getSettings().isDemoMode, true, 'isDemoMode must be true after loadDemoData');
    const demoHw = await Database.getAllHomework();
    assert.ok(demoHw.length > 0, 'Demo homework should be loaded');

    // Now clean to zero state
    await Database.cleanToZeroState();
    assert.strictEqual(Database.getSettings().isDemoMode, false, 'isDemoMode must be false after cleanToZeroState');
    const cleanedHw = await Database.getAllHomework();
    assert.strictEqual(cleanedHw.length, 0, 'Homework should be empty after cleanToZeroState');
  });

  console.log('\n======================================================');
  console.log('--- 4. Scheduler Tests (Packing, Task Splitting, Integrity) ---');
  console.log('======================================================');

  await asyncTest('Scheduler generates schedule without overlaps or negative durations', async () => {
    const planMon = await Scheduler.generateDailySchedule('2026-11-23', Database);
    assert.ok(planMon.tasks.length > 0, 'Plan must contain tasks');

    const integrityMon = Scheduler.verifyScheduleIntegrity(planMon);
    assert.strictEqual(integrityMon.valid, true, `Monday schedule must be valid: ${integrityMon.errors.join(', ')}`);
    assert.strictEqual(planMon.has8thLesson, false, 'Monday has no 8th lesson');
  });

  await asyncTest('Scheduler handles Tuesday 8th lesson (up to 15:30) correctly', async () => {
    const planTue = await Scheduler.generateDailySchedule('2026-11-24', Database);
    assert.strictEqual(planTue.has8thLesson, true, 'Tuesday must have 8th lesson');
    assert.strictEqual(planTue.schoolEndTime, '15:30', 'Tuesday school end time must be 15:30');

    const integrityTue = Scheduler.verifyScheduleIntegrity(planTue);
    assert.strictEqual(integrityTue.valid, true, `Tuesday schedule must be valid: ${integrityTue.errors.join(', ')}`);

    const commute = planTue.tasks.find(t => t.title.includes('Возвращение домой'));
    assert.ok(commute, 'Commute and lunch task must be present');
    assert.ok(TimeUtils.timeToMin(commute.startTime) >= TimeUtils.timeToMin('15:30'), 'Commute cannot start before school ends');
  });

  await asyncTest('Scheduler strictly protects all mandatory blocks', async () => {
    const plan = await Scheduler.generateDailySchedule('2026-11-23', Database);
    const tasks = plan.tasks;

    // Check Sleep
    const sleep = tasks.find(t => t.category === 'sleep');
    assert.ok(sleep, 'Sleep block must be present');
    assert.strictEqual(sleep.startTime, '21:30');
    assert.strictEqual(sleep.durationMinutes, 510, 'Sleep must be 8.5 hours (510 min)');

    // Check Gaming
    const games = tasks.find(t => t.category === 'gaming');
    assert.ok(games, 'Gaming block must be present');
    assert.strictEqual(games.durationMinutes, 60, 'Gaming must be exactly 60 minutes');

    // Check Sport
    const sport = tasks.find(t => t.category === 'sport');
    assert.ok(sport, 'Sport block must be present');
    assert.strictEqual(sport.durationMinutes, 25, 'Sport must be 25 minutes');

    // Check Family Dinner
    const family = tasks.find(t => t.category === 'family');
    assert.ok(family, 'Family dinner block must be present');
    assert.strictEqual(family.durationMinutes, 30, 'Family dinner must be 30 minutes');

    // Check Yastu Prayer
    const yastu = tasks.find(t => t.category === 'prayer');
    assert.ok(yastu, 'Yastu prayer block must be present');
    assert.strictEqual(yastu.isProtected, true, 'Yastu block must be protected');

    // Check Offline Rest
    const rest = tasks.find(t => t.category === 'rest');
    assert.ok(rest, 'Offline rest block must be present');
    assert.strictEqual(rest.durationMinutes, 45, 'Offline rest must be 45 minutes');
  });

  await asyncTest('Scheduler task splitting bug test: Large tasks split into parts without losing minutes', async () => {
    await Database.addHomework({
      subject: 'Профильная математика',
      dueDate: '2026-11-24',
      title: 'Большой тренировочный вариант ЕГЭ Часть 2',
      estimatedMinutes: 90,
      priority: 'critical',
      required: true
    });

    await Database.addHomework({
      subject: 'Информатика',
      dueDate: '2026-11-24',
      title: 'Практикум программирования КЕГЭ',
      estimatedMinutes: 90,
      priority: 'high',
      required: true
    });

    const plan = await Scheduler.generateDailySchedule('2026-11-23', Database);
    const integrity = Scheduler.verifyScheduleIntegrity(plan);
    assert.strictEqual(integrity.valid, true, `Split schedule integrity: ${integrity.errors.join(', ')}`);

    const mathTasks = plan.tasks.filter(t => t.category === 'homework' && (t.title.includes('Профильная математика') || (t.subtitle && t.subtitle.includes('Большой тренировочный вариант'))));
    assert.ok(mathTasks.length > 0, 'Math homework tasks should be scheduled');

    const totalScheduledMathMins = mathTasks.reduce((sum, t) => sum + t.durationMinutes, 0);
    const unallocatedMath = plan.unallocatedTasks.find(u => u.title.includes('Профильная математика') || (u.subtitle && u.subtitle.includes('Большой тренировочный вариант')));
    const unallocatedMins = unallocatedMath ? unallocatedMath.remainingMinutes : 0;

    assert.strictEqual(totalScheduledMathMins + unallocatedMins, 90, 'Zero minutes lost: scheduled + unallocated == 90');

    // Clean up homework
    const hwList = await Database.getAllHomework();
    for (const h of hwList) {
      await Database.deleteHomework(h.id);
    }
  });

  console.log('\n======================================================');
  console.log('--- 5. AIPlanner Tests (Honest Fallback, Replan & Rollback) ---');
  console.log('======================================================');

  await asyncTest('AIPlanner autoReplan uses local deterministic scheduler honestly', async () => {
    const res = await AIPlanner.autoReplan('2026-11-23', Database, 'Unit test trigger');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.source, 'local', 'Must identify as local planner when external endpoint is not set');
    assert.ok(res.explanation.includes('Локальный планировщик LifeOS (автономно)'), 'Explanation must accurately identify local source');
  });

  await asyncTest('Scheduler backup and rollback', async () => {
    const plan1 = await Scheduler.generateDailySchedule('2026-11-23', Database);
    await Scheduler.applyScheduleWithBackup('2026-11-23', plan1, Database, 'Step 1');

    const rollbackRes = await Scheduler.rollbackLastReplan('2026-11-23', Database);
    assert.strictEqual(rollbackRes.success, true, 'Rollback should succeed');
  });

  await asyncTest('Scheduler handles Thursday 8th lesson correctly', async () => {
    // 2026-11-26 is Thursday (dayOfWeek 4, has 8th lesson)
    const planThu = await Scheduler.generateDailySchedule('2026-11-26', Database);
    assert.strictEqual(planThu.has8thLesson, true, 'Thursday must have 8th lesson');
    assert.strictEqual(planThu.schoolEndTime, '15:30', 'Thursday school end time must be 15:30');
    const integrityThu = Scheduler.verifyScheduleIntegrity(planThu);
    assert.strictEqual(integrityThu.valid, true);
  });

  await asyncTest('Scheduler handles Sunday (day 7) with no school', async () => {
    // 2026-11-29 is Sunday
    const planSun = await Scheduler.generateDailySchedule('2026-11-29', Database);
    assert.strictEqual(planSun.has8thLesson, false);
    const integritySun = Scheduler.verifyScheduleIntegrity(planSun);
    assert.strictEqual(integritySun.valid, true);
    // No lesson tasks on Sunday
    const lessonTasks = planSun.tasks.filter(t => t.id.startsWith('lesson_'));
    assert.strictEqual(lessonTasks.length, 0, 'No school lessons on Sunday');
  });

  await asyncTest('Database export and import data roundtrip', async () => {
    const exportedJson = await Database.exportAllData();
    assert.ok(typeof exportedJson === 'string' && exportedJson.length > 50);
    const parsed = JSON.parse(exportedJson);
    assert.strictEqual(parsed.version, 1.1);
    assert.ok(Array.isArray(parsed.ege_topics));
    assert.ok(Array.isArray(parsed.school_timetable));

    // Import back
    await Database.importAllData(exportedJson);
    const importedTopics = await Database.getEgeTopics();
    assert.strictEqual(importedTopics.length, parsed.ege_topics.length);
  });

  console.log('\n======================================================');
  console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
  console.log('======================================================\n');

  if (totalTests !== passedTests) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
