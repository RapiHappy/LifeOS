/**
 * LifeOS — ЕГЭ-тренер
 * Локальная диагностика, адаптивная недельная тема и короткие ежедневные уроки.
 * Все результаты хранятся только в localStorage браузера.
 */
const EgeTutor = {
  storageKey: "lifeos_ege_tutor_v1",
  subjectNames: { math: "Профильная математика", informatics: "Информатика", russian: "Русский язык" },

  questions: [
    { id:"m1", subject:"math", topic:"Уравнения", tag:"algebra", q:"Реши уравнение: 3x + 5 = 20.", options:["3","5","7","15"], answer:1, explain:"3x = 20 − 5 = 15, поэтому x = 15 / 3 = 5." },
    { id:"m2", subject:"math", topic:"Квадратные уравнения", tag:"quadratic", q:"Найди корни уравнения x² − 7x + 12 = 0.", options:["1 и 12","2 и 6","3 и 4","Корней нет"], answer:2, explain:"D = 49 − 48 = 1. Корни: (7 − 1)/2 = 3 и (7 + 1)/2 = 4." },
    { id:"m3", subject:"math", topic:"Степени", tag:"powers", q:"Чему равен x, если 2ˣ = 64?", options:["4","5","6","8"], answer:2, explain:"64 = 2⁶, значит x = 6." },
    { id:"m4", subject:"math", topic:"Логарифмы", tag:"logarithms", q:"Вычисли log₃ 27.", options:["2","3","4","9"], answer:1, explain:"Логарифм спрашивает, в какую степень возвести 3, чтобы получить 27. Так как 3³ = 27, ответ 3." },
    { id:"m5", subject:"math", topic:"Статистика: медиана", tag:"statistics", q:"Найди медиану набора: 3, 9, 2, 7, 5.", options:["3","5","7","9"], answer:1, explain:"Сначала упорядочим числа: 2, 3, 5, 7, 9. Среднее по порядку число — 5." },
    { id:"m6", subject:"math", topic:"Статистика: среднее", tag:"statistics", q:"Найди среднее арифметическое чисел 4, 6, 8 и 10.", options:["6","7","7,5","8"], answer:1, explain:"Складываем числа и делим на их количество: (4 + 6 + 8 + 10) / 4 = 28 / 4 = 7." },
    { id:"m7", subject:"math", topic:"Теория вероятностей", tag:"probability", q:"В коробке 3 красных и 2 синих шара. Какова вероятность случайно достать синий шар?", options:["1/5","2/5","3/5","1/2"], answer:1, explain:"Всего 5 шаров, благоприятных исходов 2. Вероятность равна 2/5." },
    { id:"m8", subject:"math", topic:"Геометрия: теорема Пифагора", tag:"geometry", q:"Катеты прямоугольного треугольника равны 6 и 8. Чему равна гипотенуза?", options:["9","10","12","14"], answer:1, explain:"По теореме Пифагора c² = 6² + 8² = 36 + 64 = 100, значит c = 10." },
    { id:"m9", subject:"math", topic:"Геометрия: площадь", tag:"geometry", q:"Основание треугольника равно 8, высота к нему — 5. Найди площадь.", options:["13","20","30","40"], answer:1, explain:"Площадь треугольника равна половине произведения основания на высоту: 8 × 5 / 2 = 20." },
    { id:"m10", subject:"math", topic:"Стереометрия: объём", tag:"geometry", q:"Найди объём куба с ребром 3.", options:["9","18","27","36"], answer:2, explain:"Объём куба V = a³. При a = 3 получаем 3³ = 27." },

    { id:"i1", subject:"informatics", topic:"Двоичная система счисления", tag:"binary", q:"Переведи число 10110₂ в десятичную систему.", options:["18","20","22","24"], answer:2, explain:"10110₂ = 1·16 + 0·8 + 1·4 + 1·2 + 0·1 = 22." },
    { id:"i2", subject:"informatics", topic:"Циклы Python", tag:"python", q:"Какое значение будет у s после цикла for i in range(1, 5): s += i, если изначально s = 0?", options:["9","10","15","5"], answer:1, explain:"range(1, 5) перебирает 1, 2, 3, 4. Сумма равна 1 + 2 + 3 + 4 = 10." },
    { id:"i3", subject:"informatics", topic:"Логические выражения", tag:"logic", q:"A = 0, B = 1. Чему равно (A or B) and not A?", options:["0","1","Невозможно определить","Ошибка"], answer:1, explain:"A or B = 1. not A = 1. Тогда 1 and 1 = 1." },
    { id:"i4", subject:"informatics", topic:"Целочисленное деление", tag:"python", q:"Чему равны 17 // 5 и 17 % 5 соответственно?", options:["3 и 2","2 и 3","3 и 1","4 и 2"], answer:0, explain:"17 // 5 — целая часть частного, это 3. Остаток 17 % 5 равен 2." },
    { id:"i5", subject:"informatics", topic:"Сортировка списков Python", tag:"python", q:"Что выведет код: a = [4, 1, 3]; a.sort(); print(a[0])?", options:["4","3","1","[1, 3, 4]"], answer:2, explain:"sort() сортирует список по возрастанию. Первый элемент отсортированного списка — 1." },

    { id:"r1", subject:"russian", topic:"Орфоэпия: ударения", tag:"russian_orthoepy", q:"В каком слове ударение поставлено правильно?", options:["звонИт","звОнит","звонИтЬ","звонитО"], answer:0, explain:"Нормативное ударение: звонИт." },
    { id:"r2", subject:"russian", topic:"Паронимы", tag:"russian_lexis", q:"Выбери нормативное сочетание.", options:["Одеть пальто","Надеть пальто","Надеть ребёнка","Одеть шапку на себя"], answer:1, explain:"Надеть можно одежду на себя; одеть — кого-либо, например одеть ребёнка." },
    { id:"r3", subject:"russian", topic:"Грамматические нормы", tag:"russian_grammar", q:"Выбери правильную форму числительного: «располагать ... рублями».", options:["пятьсот","пятистами","пятьюстами","пятьюста"], answer:2, explain:"В творительном падеже составное числительное 500 имеет форму «пятьюстами»." },
    { id:"r4", subject:"russian", topic:"Правописание Н и НН", tag:"russian_spelling", q:"В каком словосочетании слово написано верно?", options:["кожанный ремень","кожаный ремень","кожаныйй ремень","кожаннный ремень"], answer:1, explain:"В суффиксах -ан-/-ян-/-ин- обычно пишется одна Н. В слове «кожаный» суффикс -ан-, поэтому одна Н." },
    { id:"r5", subject:"russian", topic:"Пунктуация", tag:"russian_punctuation", q:"В каком предложении запятая поставлена правильно?", options:["Когда стемнело мы вернулись домой.","Когда стемнело, мы вернулись домой.","Когда, стемнело мы вернулись домой.","Когда стемнело мы, вернулись домой."], answer:1, explain:"Придаточная часть «Когда стемнело» отделяется от главной запятой." }
  ],

  lessons: {
    algebra: {
      subject:"math", title:"Алгебра: линейные уравнения", time:20,
      theory:"Чтобы решить линейное уравнение, переноси слагаемые с неизвестным в одну сторону, числа — в другую. При переносе через знак равенства знак меняется.",
      example:"3x + 2 = 11 → 3x = 9 → x = 3.",
      task:"Реши уравнение 4x − 7 = 9.",
      options:["2","3","4","5"], answer:2,
      explain:"Прибавляем 7 к обеим частям: 4x = 16. Делим на 4: x = 4.",
      tags:["algebra"]
    },
    quadratic: {
      subject:"math", title:"Квадратные уравнения: дискриминант", time:25,
      theory:"Для ax² + bx + c = 0 вычисли D = b² − 4ac. Если D больше нуля, есть два корня: (−b ± √D)/(2a).",
      example:"x² − 5x + 6 = 0: D = 25 − 24 = 1; корни 2 и 3.",
      task:"Найди корни x² − 7x + 12 = 0.",
      options:["1 и 12","2 и 6","3 и 4","4 и 5"], answer:2,
      explain:"D = 49 − 48 = 1. Корни: (7 − 1)/2 = 3 и (7 + 1)/2 = 4.",
      tags:["quadratic"]
    },
    powers: {
      subject:"math", title:"Степени: умножение степеней", time:20,
      theory:"При умножении степеней с одинаковым основанием показатели складываются: aᵐ · aⁿ = aᵐ⁺ⁿ.",
      example:"2³ · 2² = 2⁵, потому что 3 + 2 = 5.",
      task:"Упрости выражение 3² · 3³.",
      options:["3⁵","3⁶","3⁹","3¹"], answer:0,
      explain:"Основание одинаковое, поэтому показатели складываем: 2 + 3 = 5. Получается 3⁵.",
      tags:["powers"]
    },
    geometry: {
      subject:"math", title:"Геометрия: теорема Пифагора", time:25,
      theory:"В прямоугольном треугольнике квадрат гипотенузы равен сумме квадратов катетов. Гипотенуза — сторона напротив прямого угла, она самая длинная.",
      example:"Например, если катеты 3 и 4, то c² = 3² + 4² = 25, поэтому гипотенуза равна 5.",
      task:"Катеты прямоугольного треугольника равны 5 и 12. Чему равна гипотенуза?",
      options:["11","12","13","17"], answer:2,
      explain:"5² + 12² = 25 + 144 = 169, а √169 = 13.",
      tags:["geometry"]
    },
    statistics: {
      subject:"math", title:"Статистика: медиана и среднее", time:25,
      theory:"Среднее арифметическое — сумма всех значений, делённая на их количество. Медиана — центральное значение упорядоченного набора. Сначала всегда располагай числа по возрастанию.",
      example:"Для набора 2, 4, 4, 8, 12 медиана равна 4, а среднее арифметическое равно 6.",
      task:"Найди медиану набора 1, 9, 4, 7, 3.",
      options:["3","4","7","9"], answer:1,
      explain:"Упорядочиваем: 1, 3, 4, 7, 9. Центральное число — 4.",
      tags:["statistics"]
    },
    probability: {
      subject:"math", title:"Теория вероятностей: простые события", time:25,
      theory:"Если все исходы равновозможны, вероятность события равна отношению числа благоприятных исходов к общему числу исходов. Значение вероятности находится от 0 до 1.",
      example:"В мешке 2 белых и 3 чёрных шара. Вероятность достать белый шар равна 2/5.",
      task:"В коробке 4 зелёных и 6 жёлтых шаров. Какова вероятность достать зелёный?",
      options:["1/5","2/5","3/5","3/4"], answer:1,
      explain:"Всего 10 шаров, зелёных 4. Вероятность 4/10 = 2/5.",
      tags:["probability"]
    },
    logarithms: {
      subject:"math", title:"Логарифмы: смысл записи", time:20,
      theory:"Логарифм отвечает на вопрос: в какую степень нужно возвести основание, чтобы получить число под логарифмом. Это обратное действие к возведению в степень.",
      example:"log₂ 8 = 3, потому что 2³ = 8.",
      task:"Вычисли log₃ 81.",
      options:["3","4","9","27"], answer:1,
      explain:"3⁴ = 81, значит log₃ 81 = 4.",
      tags:["logarithms"]
    },
    python: {
      subject:"informatics", title:"Python: цикл for и range", time:25,
      theory:"Цикл for повторяет действия для каждого значения последовательности. range(a, b) выдаёт целые числа от a включительно до b не включительно.",
      example:"range(1, 4) перебирает 1, 2, 3. Число 4 в цикл не входит.",
      task:"Чему равна сумма чисел, которые перебирает range(2, 6)?",
      options:["10","14","15","20"], answer:1,
      explain:"range(2, 6) перебирает 2, 3, 4, 5. Сумма: 2 + 3 + 4 + 5 = 14.",
      tags:["python"]
    },
    binary: {
      subject:"informatics", title:"Информатика: перевод из двоичной системы", time:20,
      theory:"В двоичной записи разряды справа налево соответствуют степеням двойки: 1, 2, 4, 8, 16 и так далее. Складываются только разряды, где стоит 1.",
      example:"101₂ = 4 + 0 + 1 = 5.",
      task:"Переведи 1101₂ в десятичную систему.",
      options:["11","12","13","14"], answer:2,
      explain:"1101₂ = 8 + 4 + 0 + 1 = 13.",
      tags:["binary"]
    },
    russian: {
      subject:"russian", title:"Русский язык: придаточная часть и запятая", time:20,
      theory:"Придаточная часть сложноподчинённого предложения отделяется от главной запятой. Часто она начинается союзом или союзным словом: когда, потому что, если, который.",
      example:"Когда закончился урок, ученики вышли из класса.",
      task:"Выбери предложение с правильной пунктуацией.",
      options:["Если будет время я повторю тему.","Если будет время, я повторю тему.","Если, будет время я повторю тему.","Если будет, время я повторю тему."], answer:1,
      explain:"Придаточная часть «Если будет время» заканчивается перед главной частью, поэтому после неё нужна запятая.",
      tags:["russian_punctuation"]
    }
  },

  schedule: {
    1:["geometry","logarithms","algebra","quadratic","powers"], 2:["python","binary"], 3:["russian"],
    4:["statistics","probability"], 5:["python","binary"], 6:["geometry","probability"], 0:["review"]
  },

  readState() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? JSON.parse(raw) : { diagnostic:null, session:null, daily:{}, lessonStats:{} };
    } catch (error) {
      return { diagnostic:null, session:null, daily:{}, lessonStats:{} };
    }
  },

  writeState(state) {
    try { localStorage.setItem(this.storageKey, JSON.stringify(state)); }
    catch (error) { console.error("Не удалось сохранить прогресс ЕГЭ:", error); }
  },

  today() {
    if (typeof TimeUtils !== "undefined" && TimeUtils.getTodayStr) return TimeUtils.getTodayStr();
    return new Date().toISOString().slice(0,10);
  },

  escape(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];
    });
  },

  getDayNumber() {
    return new Date(this.today() + "T12:00:00").getDay();
  },

  startDiagnostic() {
    const state = this.readState();
    state.session = { index:0, answers:{} };
    this.writeState(state);
    this.render();
  },

  answerDiagnostic(optionIndex) {
    const state = this.readState();
    if (!state.session) return;
    const question = this.questions[state.session.index];
    if (!question) return;
    state.session.answers[question.id] = optionIndex;
    this.writeState(state);
    this.render();
  },

  nextDiagnostic() {
    const state = this.readState();
    if (!state.session) return;
    if (state.session.index < this.questions.length - 1) {
      state.session.index += 1;
      this.writeState(state);
      this.render();
      return;
    }
    const answers = state.session.answers || {};
    const topicMap = {};
    const subjectMap = {};
    this.questions.forEach(function (q) {
      const ok = answers[q.id] === q.answer;
      if (!topicMap[q.tag]) topicMap[q.tag] = { total:0, correct:0, label:q.topic, subject:q.subject };
      topicMap[q.tag].total += 1;
      if (ok) topicMap[q.tag].correct += 1;
      if (!subjectMap[q.subject]) subjectMap[q.subject] = { total:0, correct:0 };
      subjectMap[q.subject].total += 1;
      if (ok) subjectMap[q.subject].correct += 1;
    });
    state.diagnostic = { completedAt:new Date().toISOString(), answers:answers, topics:topicMap, subjects:subjectMap, total:this.questions.length };
    state.session = null;
    this.writeState(state);
    this.render();
  },

  getTopicAccuracy(tags) {
    const state = this.readState();
    const diagnostic = state.diagnostic;
    let total = 0;
    let correct = 0;
    tags.forEach(function (tag) {
      const initial = diagnostic && diagnostic.topics ? diagnostic.topics[tag] : null;
      const daily = state.lessonStats ? state.lessonStats[tag] : null;
      if (initial) {
        total += Number(initial.total) || 0;
        correct += Number(initial.correct) || 0;
      }
      if (daily) {
        total += Number(daily.attempts) || 0;
        correct += Number(daily.correct) || 0;
      }
    });
    return total > 0 ? Math.round(correct / total * 100) : null;
  },

  getLessonForToday() {
    const day = this.getDayNumber();
    const choices = this.schedule[day] || this.schedule[0];
    const state = this.readState();
    if (choices[0] === "review") {
      const ranked = Object.keys(this.lessons).map((id) => {
        const lesson = this.lessons[id];
        return { id:id, score:this.getTopicAccuracy(lesson.tags) };
      }).filter(function (item) { return item.score !== null; });
      ranked.sort(function (a,b) { return a.score - b.score; });
      if (ranked.length) return this.lessons[ranked[0].id];
      return this.lessons.geometry;
    }
    let best = choices[0];
    let bestScore = this.getTopicAccuracy(this.lessons[best].tags);
    choices.slice(1).forEach((id) => {
      const score = this.getTopicAccuracy(this.lessons[id].tags);
      if (score !== null && (bestScore === null || score < bestScore)) {
        best = id;
        bestScore = score;
      }
    });
    return this.lessons[best];
  },

  renderTodayCard() {
    const state = this.readState();
    const lesson = this.getLessonForToday();
    const done = !!(state.daily && state.daily[this.today()] && state.daily[this.today()].done);
    const status = done ? "Тема за сегодня пройдена" : "Сегодняшняя тема уже ждёт тебя";
    return `<div class="ege-today-card"><div><span class="ege-eyebrow">ЕГЭ • ТЕМА НА СЕГОДНЯ</span><h3>${this.escape(lesson.title)}</h3><p>${status} • ${lesson.time} минут</p></div><button class="btn btn-primary" onclick="App.navigateTo('ege')">${done ? "Повторить тему" : "Открыть тему"}</button></div>`;
  }

  init() { this.render(); },

  render() {
    const root = document.getElementById("ege-content");
    if (!root) return;
    const state = this.readState();
    if (state.session) {
      state.session = null;
      this.writeState(state);
    }
    this.renderDashboard(root, state);
  }

  renderWelcome(root) {
    this.renderDashboard(root, this.readState());
  }

  renderQuestion(root, state) {
    const session = state.session;
    const index = session.index;
    const q = this.questions[index];
    const selected = session.answers[q.id];
    const answered = selected !== undefined;
    const progress = Math.round((index + 1) / this.questions.length * 100);
    const options = q.options.map((option, i) => {
      const cls = answered ? (i === q.answer ? " is-correct" : (i === selected ? " is-wrong" : "")) : "";
      return '<button class="ege-option' + cls + '" ' + (answered ? "disabled" : "") + ' onclick="EgeTutor.answerDiagnostic(' + i + ')"><span class="ege-option-letter">' + String.fromCharCode(65+i) + '</span><span>' + this.escape(option) + '</span></button>';
    }).join("");
    const feedback = answered ? '<div class="ege-feedback ' + (selected === q.answer ? "success" : "error") + '"><strong>' + (selected === q.answer ? "Верно" : "Пока ошибка") + '.</strong> ' + this.escape(q.explain) + '</div><button class="btn btn-primary" onclick="EgeTutor.nextDiagnostic()">' + (index === this.questions.length - 1 ? "Завершить диагностику" : "Следующий вопрос") + '</button>' : '<p class="ege-muted">Выбери один ответ. После выбора появится объяснение.</p>';
    root.innerHTML = '<div class="ege-page"><div class="ege-topline"><span>Диагностика знаний</span><strong>' + (index+1) + ' / ' + this.questions.length + '</strong></div><div class="ege-progress"><span style="width:' + progress + '%"></span></div><div class="ege-question-card"><span class="ege-eyebrow">' + this.subjectNames[q.subject] + ' • ' + this.escape(q.topic) + '</span><h2>' + this.escape(q.q) + '</h2><div class="ege-options">' + options + '</div>' + feedback + '</div><button class="ege-link-button" onclick="EgeTutor.exitDiagnostic()">Прервать тест</button></div>';
  },

  exitDiagnostic() {
    if (!confirm("Прервать тест? Текущая попытка будет сброшена. Чтобы продолжить позже, просто закрой или обнови страницу — ответы сохраняются автоматически.")) return;
    const state = this.readState();
    state.session = null;
    this.writeState(state);
    this.render();
  },

  renderDashboard(root, state) {
    const lesson = this.getLessonForToday();
    const today = this.today();
    const todaysLog = state.daily && state.daily[today];
    const lessonDone = !!(todaysLog && todaysLog.done);
    const lessonAnswered = todaysLog && todaysLog.answered !== undefined;
    const options = lesson.options.map((option, index) =>
      '<button class="ege-option" onclick="EgeTutor.answerLesson(' + index + ')"><span class="ege-option-letter">' +
      String.fromCharCode(65 + index) + '</span><span>' + this.escape(option) + '</span></button>'
    ).join("");
    let lessonAction = '<div class="ege-options">' + options + '</div>';
    if (lessonAnswered) {
      const correct = todaysLog.answered === lesson.answer;
      lessonAction =
        '<div class="ege-feedback ' + (correct ? "success" : "error") + '"><strong>' +
        (correct ? "Верно" : "Разберём ошибку") + '.</strong> ' + this.escape(lesson.explain) +
        '</div><button class="btn btn-secondary" onclick="EgeTutor.markLessonDone()">' +
        (lessonDone ? "Тема пройдена" : "Отметить тему изученной") + '</button>';
    }
    const subject = this.subjectNames[lesson.subject] || "ЕГЭ";
    const weekPlan = [
      ["Пн", "Математика — геометрия"],
      ["Вт", "Информатика — Python"],
      ["Ср", "Русский язык"],
      ["Чт", "Математика — статистика и вероятность"],
      ["Пт", "Информатика — системы счисления"],
      ["Сб", "Математика — геометрия"],
      ["Вс", "Повторение темы недели"]
    ].map(function (item) {
      return '<li><b>' + item[0] + '</b><span>' + item[1] + '</span></li>';
    }).join("");
    root.innerHTML =
      '<div class="ege-page">' +
        '<div class="ege-dashboard-head"><div><span class="ege-eyebrow">ТВОЯ ПОДГОТОВКА К ЕГЭ</span>' +
        '<h2>Тема на сегодня</h2><p>Одна тема в день. Прочитай объяснение, разбери пример и реши задание.</p></div></div>' +
        '<section class="ege-lesson-panel">' +
          '<div class="ege-lesson-heading"><div><span class="ege-eyebrow">' + this.escape(subject.toUpperCase()) +
          ' • ' + lesson.time + ' МИНУТ</span><h3>' + this.escape(lesson.title) +
          '</h3></div><span class="ege-day-state">' + (lessonDone ? "Пройдено" : "На сегодня") + '</span></div>' +
          '<h4>Что нужно понять</h4><p>' + this.escape(lesson.theory) + '</p>' +
          '<div class="ege-example"><strong>Пример:</strong> ' + this.escape(lesson.example) + '</div>' +
          '<h4>Проверь себя</h4><p>' + this.escape(lesson.task) + '</p>' + lessonAction +
        '</section>' +
        '<section class="ege-panel ege-week-panel"><h3>Расписание тем на неделю</h3><ul class="ege-week-list">' +
        weekPlan + '</ul></section>' +
      '</div>';
  }

  answerLesson(optionIndex) {
    const state = this.readState();
    const lesson = this.getLessonForToday();
    state.daily = state.daily || {};
    state.daily[this.today()] = { topic:lesson.title, answered:optionIndex, done:false, date:this.today() };
    this.writeState(state);
    this.render();
  },

  markLessonDone() {
    const state = this.readState();
    state.daily = state.daily || {};
    if (!state.daily[this.today()] || state.daily[this.today()].done) return;
    state.daily[this.today()].done = true;
    state.daily[this.today()].completedAt = new Date().toISOString();
    state.lessonStats = state.lessonStats || {};
    const id = Object.keys(this.lessons).find((key) => this.lessons[key].title === state.daily[this.today()].topic);
    if (id) {
      const stats = state.lessonStats[id] || {attempts:0,correct:0};
      stats.attempts += 1;
      if (state.daily[this.today()].answered === this.lessons[id].answer) stats.correct += 1;
      state.lessonStats[id] = stats;
    }
    this.writeState(state);
    this.render();
  }
};

if (typeof globalThis !== "undefined") globalThis.EgeTutor = EgeTutor;
if (typeof module !== "undefined" && module.exports) module.exports = EgeTutor;
