// Chinese with Leo — логика сайта. Данные (WORD_LEVELS, GRAMMAR_LEVELS) — в js/data.js.

const CONFIG = {
  // Ссылка на бота, например "https://t.me/your_bot". Пусто — кнопки Telegram скрыты.
  telegramUrl: "https://t.me/InkPath_bot",
};

/* ============================== Данные ============================== */

const ALL_WORDS_BY_LEVEL = {};
WORD_LEVELS.forEach(lvl => { ALL_WORDS_BY_LEVEL[lvl.id] = lvl.topics.flatMap(t => t.words); });
const ALL_WORDS = WORD_LEVELS.flatMap(lvl => lvl.topics.flatMap(t => t.words.map(w => ({ ...w, level: lvl.id }))));
const ALL_WORDS_TOTAL = new Set(ALL_WORDS.map(w => w.hanzi)).size;
const GRAMMAR_TOTAL = GRAMMAR_LEVELS.reduce((n, l) => n + l.topics.length, 0);

const TONE_LABEL = { 0: "нейтральный тон", 1: "1-й тон, ровный", 2: "2-й тон, восходящий", 3: "3-й тон, падающе-восходящий", 4: "4-й тон, падающий" };
const TONE_PATH = {
  0: "M2 11 H20",
  1: "M2 11 H20",
  2: "M2 17 Q11 3 20 3",
  3: "M2 6 Q7 20 11 11 Q15 3 20 17",
  4: "M2 3 Q11 3 20 19",
};
const LEVEL_COLORS = { hsk1: "#A6332B", hsk2: "#B8933E", hsk3: "#4F6F62", hsk4: "#6B5B95" };
const LEVEL_NAMES = { hsk1: "Новичок", hsk2: "Базовый", hsk3: "Средний", hsk4: "Уверенный" };

/* ============================== Хранилище ============================== */

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  },
};

// Тот же ключ, что и в Mini App
let learned = store.get("chinese_progress", {});
const saved = store.get("cwl_state", {});

const state = {
  wordLevel: WORD_LEVELS.some(l => l.id === saved.wordLevel) ? saved.wordLevel : "hsk1",
  lessonId: saved.lessonId || 1,
  index: 0,
  flipped: false,
  grammarLevel: "basic",
  quizMode: saved.quizMode || "hz2ru",
  quizScope: saved.quizScope || "lesson",
};

function persistState() {
  store.set("cwl_state", { wordLevel: state.wordLevel, lessonId: state.lessonId, quizMode: state.quizMode, quizScope: state.quizScope });
}

function saveProgress() {
  store.set("chinese_progress", learned);
  updateSeal();
}

const learnedCount = () => Object.keys(learned).filter(k => learned[k]).length;

/* ============================== Утилиты ============================== */

const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "style") node.style.cssText = v;
    else if (k.startsWith("on")) node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

// Пиньинь без тонов, пробелов и апострофов: "xuéxí" → "xuexi"
const normPinyin = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ü/g, "u").replace(/[\s'’·-]/g, "").toLowerCase();
const normText = (s) => s.toLowerCase().replace(/ё/g, "е");

let toastTimer;
function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}

function charSizeClass(hanzi) {
  return hanzi.length >= 4 ? " xlong" : hanzi.length >= 3 ? " long" : "";
}

/* ============================== Озвучка ============================== */

function speak(text) {
  try {
    if (!("speechSynthesis" in window)) { toast("Браузер не поддерживает озвучку"); return; }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "zh-CN";
    utter.rate = 0.85;
    const voices = window.speechSynthesis.getVoices();
    const zhVoice = voices.find(v => v.lang === "zh-CN") || voices.find(v => v.lang && v.lang.startsWith("zh"));
    if (zhVoice) utter.voice = zhVoice;
    window.speechSynthesis.speak(utter);
    haptic("impact");
  } catch (e) {}
}
if ("speechSynthesis" in window) window.speechSynthesis.getVoices();

// Если сайт открыт внутри Telegram — используем его вибро-отклик
function haptic(kind) {
  try {
    const h = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback;
    if (!h) return;
    if (kind === "impact") h.impactOccurred("light");
    else h.notificationOccurred(kind);
  } catch (e) {}
}

/* ============================== Общие элементы ============================== */

function updateSeal() {
  $("sealCount").textContent = learnedCount();
  $("sealTotal").textContent = "/ " + ALL_WORDS_TOTAL;
}

function currentLevel() { return WORD_LEVELS.find(l => l.id === state.wordLevel); }
function currentTopic() {
  const topics = currentLevel().topics;
  return topics.find(t => t.id === state.lessonId) || topics[0];
}
function currentWords() { return currentTopic().words; }

function setLevel(levelId) {
  state.wordLevel = levelId;
  state.lessonId = currentLevel().topics[0].id;
  state.index = 0;
  persistState();
}

function setLesson(lessonId) {
  state.lessonId = lessonId;
  state.index = 0;
  persistState();
}

function renderSidebars() {
  const level = currentLevel();
  const topic = currentTopic();

  document.querySelectorAll("[data-level-tabs]").forEach(box => {
    box.replaceChildren(...WORD_LEVELS.map(lvl => el("button", {
      class: lvl.id === state.wordLevel ? "active" : "",
      onclick: () => { setLevel(lvl.id); rerenderStudy(); },
    }, lvl.label)));
  });

  document.querySelectorAll("[data-lesson-list]").forEach(box => {
    box.replaceChildren(...level.topics.map(t => {
      const done = t.words.filter(w => learned[w.hanzi]).length;
      return el("button", {
        class: "lesson-item" + (t.id === topic.id ? " active" : ""),
        onclick: () => { setLesson(t.id); rerenderStudy(); },
      },
        el("span", { class: "li-num" }, String(t.id)),
        el("span", { class: "li-title" }, t.title),
        el("span", { class: "li-count" + (done === t.words.length ? " done" : "") }, done + "/" + t.words.length),
      );
    }));
  });

  document.querySelectorAll("[data-lesson-select]").forEach(sel => {
    sel.replaceChildren(...level.topics.map(t => {
      const o = el("option", { value: String(t.id) }, t.id + ". " + t.title + " (" + t.words.length + ")");
      if (t.id === topic.id) o.selected = true;
      return o;
    }));
    sel.onchange = () => { setLesson(Number(sel.value)); rerenderStudy(); };
  });
}

function rerenderStudy() {
  renderSidebars();
  if (route.page === "learn") renderLearn();
  if (route.page === "quiz") { resetQuizScore(); nextQuestion(); }
}

/* ============================== Главная ============================== */

let wodWord = null;

function pickWordOfDay() {
  const d = new Date();
  const seed = d.getFullYear() * 1000 + Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
  return ALL_WORDS[(seed * 7919) % ALL_WORDS.length];
}

function renderWod(w) {
  wodWord = w;
  $("wodHanzi").textContent = w.hanzi;
  $("wodHanzi").style.fontSize = w.hanzi.length >= 3 ? "76px" : "";
  $("wodPinyin").textContent = w.pinyin;
  $("wodRu").textContent = w.ru;
  $("wodEx").textContent = w.ex || "";
  $("wodExRu").textContent = w.exRu || "";
}

function renderHome() {
  if (!wodWord) renderWod(pickWordOfDay());
  $("statWords").textContent = ALL_WORDS_TOTAL;
  $("statGrammar").textContent = GRAMMAR_TOTAL;

  const count = learnedCount();
  $("ringCount").textContent = count;
  $("ringTotal").textContent = "/ " + ALL_WORDS_TOTAL;
  const circ = 2 * Math.PI * 64;
  $("ringFg").style.strokeDashoffset = String(circ * (1 - Math.min(1, count / ALL_WORDS_TOTAL)));

  const box = $("homeLevels");
  const cont = $("continueBtn");
  box.replaceChildren(...WORD_LEVELS.map(lvl => {
    const words = ALL_WORDS_BY_LEVEL[lvl.id];
    const done = words.filter(w => learned[w.hanzi]).length;
    const color = LEVEL_COLORS[lvl.id];
    return el("button", {
      class: "level-card",
      onclick: () => { setLevel(lvl.id); location.hash = "#/learn"; },
    },
      el("span", { class: "level-badge", style: "background:" + color + "26;color:" + color }, lvl.label),
      el("div", { class: "level-info" },
        el("div", { class: "level-name" }, LEVEL_NAMES[lvl.id] || lvl.label),
        el("div", { class: "level-meta" }, lvl.topics.length + " " + plural(lvl.topics.length, "тема", "темы", "тем")),
        el("div", { class: "bar" }, el("i", { style: "width:" + Math.round(done / words.length * 100) + "%;background:" + color })),
      ),
      el("span", { class: "level-count" }, done + "/" + words.length),
    );
  }), cont);

  $("continueSub").textContent = currentLevel().label + " · " + currentTopic().title;
}

$("wodSound").onclick = () => wodWord && speak(wodWord.hanzi);
$("wodNext").onclick = () => renderWod(ALL_WORDS[Math.floor(Math.random() * ALL_WORDS.length)]);
$("continueBtn").onclick = () => { location.hash = "#/learn"; };

/* ============================== Карточки ============================== */

function currentWord() {
  const words = currentWords();
  return words[state.index % words.length];
}

function renderLearn() {
  const words = currentWords();
  const w = currentWord();
  const topic = currentTopic();

  $("learnEyebrow").textContent = currentLevel().label + " · урок " + topic.id;
  $("learnTitle").textContent = topic.title;
  const done = words.filter(x => learned[x.hanzi]).length;
  $("learnLessonStat").textContent = "выучено " + done + " из " + words.length;
  $("learnLessonBar").style.width = Math.round(done / words.length * 100) + "%";

  $("fChar").textContent = w.hanzi;
  $("fChar").className = "char hanzi" + charSizeClass(w.hanzi);
  $("fPinyin").textContent = w.pinyin;
  $("fRu").textContent = w.ru;
  $("fExHanzi").textContent = w.ex || "";
  $("fExPinyin").textContent = w.exPinyin || "";
  $("fExRu").textContent = w.exRu || "";
  $("toneLabel").textContent = TONE_LABEL[w.tone] || "";
  $("toneSvg").innerHTML = '<path d="' + (TONE_PATH[w.tone] || TONE_PATH[1]) + '" stroke="#A6332B" stroke-width="2.4" stroke-linecap="round"/>';
  $("learnedFlag").hidden = !learned[w.hanzi];

  state.flipped = false;
  $("flipInner").classList.remove("flipped");

  $("learningBtn").className = "status-btn" + (learned[w.hanzi] ? "" : " on-learning");
  $("learnedBtn").className = "status-btn" + (learned[w.hanzi] ? " on-learned" : "");
  $("counter").textContent = (state.index % words.length + 1) + " / " + words.length + " в этом уроке";
  updateSeal();
}

function flip() {
  state.flipped = !state.flipped;
  $("flipInner").classList.toggle("flipped", state.flipped);
}

function step(delta) {
  const n = currentWords().length;
  state.index = (state.index + delta + n) % n;
  renderLearn();
}

function markWord(isLearned) {
  const w = currentWord();
  learned[w.hanzi] = isLearned;
  saveProgress();
  renderSidebars();
  renderLearn();
}

$("flipCard").onclick = flip;
$("soundBtn").onclick = (e) => { e.stopPropagation(); speak(currentWord().hanzi); };
$("prevBtn").onclick = () => step(-1);
$("nextBtn").onclick = () => step(1);
$("learningBtn").onclick = () => markWord(false);
$("learnedBtn").onclick = () => { markWord(true); setTimeout(() => step(1), 250); };

/* ============================== Тест ============================== */

const quiz = { word: null, answered: false, ok: 0, all: 0, streak: 0, last: null, options: [] };

function resetQuizScore() {
  quiz.ok = quiz.all = quiz.streak = 0;
  renderScore();
}

function renderScore() {
  $("scoreOk").textContent = quiz.ok;
  $("scoreAll").textContent = quiz.all;
  $("scoreStreak").textContent = quiz.streak;
}

function quizPool() {
  return state.quizScope === "level" ? ALL_WORDS_BY_LEVEL[state.wordLevel] : currentWords();
}

function nextQuestion() {
  const pool = quizPool();
  const topic = currentTopic();
  $("quizEyebrow").textContent = currentLevel().label + (state.quizScope === "level" ? " · весь уровень" : " · урок " + topic.id);
  $("quizTitle").textContent = state.quizScope === "level" ? (LEVEL_NAMES[state.wordLevel] || "Уровень") + " — " + pool.length + " слов" : topic.title;

  // Невыученные слова выпадают чаще
  let candidates = pool.filter(w => w !== quiz.last);
  const todo = candidates.filter(w => !learned[w.hanzi]);
  if (todo.length && Math.random() < 0.7) candidates = todo;
  const w = candidates[Math.floor(Math.random() * candidates.length)] || pool[0];
  quiz.word = w;
  quiz.last = w;
  quiz.answered = false;

  const hz2ru = state.quizMode === "hz2ru";
  const prompt = $("qPrompt");
  if (hz2ru) {
    prompt.className = "q-char hanzi" + (w.hanzi.length >= 3 ? " long" : "");
    prompt.textContent = w.hanzi;
    $("qPinyin").textContent = w.pinyin;
    $("quizLabel").textContent = "Что это значит?";
  } else {
    prompt.className = "q-text";
    prompt.textContent = w.ru;
    $("qPinyin").textContent = "";
    $("quizLabel").textContent = "Как это по-китайски?";
  }
  $("quizSound").hidden = !hz2ru;

  const wrongPool = shuffle(ALL_WORDS_BY_LEVEL[state.wordLevel]);
  const wrongs = [];
  for (const x of wrongPool) {
    if (wrongs.length >= 3) break;
    if (x.hanzi === w.hanzi || x.ru === w.ru) continue;
    if (wrongs.some(y => y.hanzi === x.hanzi || y.ru === x.ru)) continue;
    wrongs.push(x);
  }
  quiz.options = shuffle([w, ...wrongs]);

  const box = $("qOptions");
  box.replaceChildren(...quiz.options.map((opt, i) => el("button", {
    class: "opt" + (hz2ru ? "" : " hz"),
    onclick: () => answer(i),
  }, el("span", { class: "k" }, String(i + 1)), hz2ru ? opt.ru : opt.hanzi)));
  $("qNext").hidden = true;
}

function answer(i) {
  if (quiz.answered) return;
  quiz.answered = true;
  const w = quiz.word;
  const chosen = quiz.options[i];
  const isCorrect = chosen === w;
  const buttons = [...$("qOptions").children];
  buttons.forEach((b, j) => {
    b.disabled = true;
    if (quiz.options[j] === w) b.classList.add("correct");
    else if (j === i) b.classList.add("wrong");
    else b.classList.add("dim");
  });

  quiz.all++;
  if (isCorrect) {
    quiz.ok++; quiz.streak++;
    learned[w.hanzi] = true;
    saveProgress();
    renderSidebars();
  } else {
    quiz.streak = 0;
  }
  renderScore();
  haptic(isCorrect ? "success" : "error");

  if (state.quizMode === "ru2hz") $("qPinyin").textContent = w.hanzi + " · " + w.pinyin;
  speak(w.hanzi);
  $("qNext").hidden = false;
  $("qNext").focus({ preventScroll: true });
}

$("qNext").onclick = nextQuestion;
$("quizSound").onclick = () => quiz.word && speak(quiz.word.hanzi);

function bindSeg(id, key, attr) {
  const seg = $(id);
  const sync = () => [...seg.children].forEach(b => b.classList.toggle("active", b.dataset[attr] === state[key]));
  seg.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state[key] = b.dataset[attr];
    persistState();
    sync();
    resetQuizScore();
    nextQuestion();
  };
  sync();
}
bindSeg("quizMode", "quizMode", "mode");
bindSeg("quizScope", "quizScope", "scope");

/* ============================== Грамматика ============================== */

function grammarLevel(id) { return GRAMMAR_LEVELS.find(l => l.id === id) || GRAMMAR_LEVELS[0]; }

function renderGrammarList() {
  $("gListView").hidden = false;
  $("gDetailView").hidden = true;
  $("gLevels").replaceChildren(...GRAMMAR_LEVELS.map(lvl => el("button", {
    class: "pill" + (lvl.id === state.grammarLevel ? " active" : ""),
    onclick: () => { location.hash = "#/grammar/" + lvl.id; },
  }, lvl.label)));
  const lvl = grammarLevel(state.grammarLevel);
  $("gList").replaceChildren(...lvl.topics.map(g => el("a", {
    class: "g-item", href: "#/grammar/" + lvl.id + "/" + g.id, style: "text-decoration:none",
  },
    el("span", { class: "g-num" }, String(g.id).padStart(2, "0")),
    el("span", { class: "g-title" }, g.title),
  )));
}

function soundBtn(text) {
  const b = el("button", { class: "sound-mini", "aria-label": "Произнести", onclick: () => speak(text) });
  b.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 9v6h4l5 4V5L8 9H4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M16.5 8.5a5 5 0 0 1 0 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  return b;
}

function renderGrammarDetail(levelId, topicId) {
  const lvl = grammarLevel(levelId);
  const idx = lvl.topics.findIndex(t => t.id === topicId);
  if (idx < 0) { renderGrammarList(); return; }
  const g = lvl.topics[idx];
  $("gListView").hidden = true;
  $("gDetailView").hidden = false;
  $("gLevelLabel").textContent = lvl.label + " · тема " + g.id + " из " + lvl.topics.length;
  $("gTitle").textContent = g.title;
  $("gExplain").textContent = g.explain;
  $("gFormula").textContent = g.formula;
  $("gExamples").replaceChildren(...g.examples.map(ex => el("div", { class: "g-example" },
    el("span", { class: "hanzi" }, ex.hanzi),
    soundBtn(ex.hanzi),
    el("span", { class: "py" }, ex.pinyin),
    el("span", { class: "tr" }, ex.ru),
  )));

  $("gPracticeQ").textContent = g.practice.q;
  let answered = false;
  const opts = $("gPracticeOpts");
  opts.replaceChildren(...g.practice.opts.map((text, i) => el("button", {
    class: "opt",
    onclick: () => {
      if (answered) return;
      answered = true;
      [...opts.children].forEach((c, j) => {
        c.disabled = true;
        if (j === g.practice.correct) c.classList.add("correct");
        else if (j === i) c.classList.add("wrong");
        else c.classList.add("dim");
      });
      haptic(i === g.practice.correct ? "success" : "error");
    },
  }, el("span", { class: "k" }, String(i + 1)), text)));

  const prev = lvl.topics[idx - 1], next = lvl.topics[idx + 1];
  $("gPrev").style.visibility = prev ? "visible" : "hidden";
  $("gNext").style.visibility = next ? "visible" : "hidden";
  if (prev) $("gPrev").href = "#/grammar/" + lvl.id + "/" + prev.id;
  if (next) $("gNext").href = "#/grammar/" + lvl.id + "/" + next.id;
  $("gBack").onclick = () => { location.hash = "#/grammar/" + lvl.id; };
  window.scrollTo({ top: 0 });
}

/* ============================== Словарь ============================== */

const dict = { query: "", level: "all", filter: "all", limit: 60 };
const DICT_INDEX = ALL_WORDS.map(w => ({ w, py: normPinyin(w.pinyin), ru: normText(w.ru) }));

function renderDictLevels() {
  const levels = [{ id: "all", label: "Все" }, ...WORD_LEVELS];
  $("dictLevels").replaceChildren(...levels.map(l => el("button", {
    class: "pill" + (dict.level === l.id ? " active" : ""),
    onclick: () => { dict.level = l.id; dict.limit = 60; renderDictLevels(); renderDict(); },
  }, l.label)));
}

function renderDict() {
  const q = dict.query.trim();
  const qPy = normPinyin(q), qRu = normText(q);
  const hasHan = /[㐀-鿿]/.test(q);

  let rows = DICT_INDEX.filter(({ w, py, ru }) => {
    if (dict.level !== "all" && w.level !== dict.level) return false;
    if (dict.filter === "done" && !learned[w.hanzi]) return false;
    if (dict.filter === "todo" && learned[w.hanzi]) return false;
    if (!q) return true;
    if (hasHan) return w.hanzi.includes(q);
    return (qPy && py.includes(qPy)) || ru.includes(qRu);
  });

  // Точные совпадения — наверх
  if (q) {
    const score = ({ w, py, ru }) => (w.hanzi === q || py === qPy || ru === qRu ? 0 : py.startsWith(qPy) || ru.startsWith(qRu) ? 1 : 2);
    rows = rows.map((r, i) => [score(r), i, r]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]);
  }

  $("dictMeta").textContent = rows.length + " " + plural(rows.length, "слово", "слова", "слов");
  const table = $("dictTable");
  if (!rows.length) {
    table.replaceChildren(el("div", { class: "empty" }, "Ничего не нашлось. Попробуй пиньинь без тонов или другое слово."));
    $("dictMore").hidden = true;
    return;
  }
  table.replaceChildren(...rows.slice(0, dict.limit).map(({ w }) => {
    const color = LEVEL_COLORS[w.level];
    const check = el("button", {
      class: "check-btn" + (learned[w.hanzi] ? " on" : ""),
      "aria-label": learned[w.hanzi] ? "Снять отметку" : "Отметить выученным",
      title: learned[w.hanzi] ? "Выучено" : "Отметить выученным",
      onclick: () => {
        learned[w.hanzi] = !learned[w.hanzi];
        saveProgress();
        check.classList.toggle("on", !!learned[w.hanzi]);
      },
    }, "✓");
    return el("div", { class: "dict-row" },
      el("span", { class: "d-hz" }, w.hanzi),
      el("span", { class: "d-py" }, w.pinyin),
      el("span", { class: "d-ru" }, w.ru, el("span", { class: "d-ex" }, w.ex ? w.ex + " — " + (w.exRu || "") : "")),
      el("span", { class: "d-lvl", style: "background:" + color + "26;color:" + color }, w.level.toUpperCase()),
      el("span", { class: "d-act" }, soundBtn(w.hanzi), check),
    );
  }));
  $("dictMore").hidden = rows.length <= dict.limit;
}

let dictTimer;
$("dictSearch").oninput = (e) => {
  clearTimeout(dictTimer);
  dictTimer = setTimeout(() => { dict.query = e.target.value; dict.limit = 60; renderDict(); }, 120);
};
$("dictMore").onclick = () => { dict.limit += 60; renderDict(); };
$("dictFilter").onclick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  dict.filter = b.dataset.f;
  dict.limit = 60;
  [...$("dictFilter").children].forEach(c => c.classList.toggle("active", c === b));
  renderDict();
};

/* ============================== Маршрутизация ============================== */

const route = { page: "home" };

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  return { page: parts[0] || "home", args: parts.slice(1) };
}

function router() {
  const { page, args } = parseHash();
  const known = ["home", "learn", "quiz", "grammar", "dict"];
  route.page = known.includes(page) ? page : "home";

  document.querySelectorAll("[data-page]").forEach(s => { s.hidden = s.dataset.page !== route.page; });
  document.querySelectorAll("[data-route]").forEach(a => a.classList.toggle("active", a.dataset.route === route.page));

  // #/learn/hsk2/3 и #/quiz/hsk2/3 — прямые ссылки на урок
  if ((route.page === "learn" || route.page === "quiz") && args[0] && WORD_LEVELS.some(l => l.id === args[0])) {
    state.wordLevel = args[0];
    const lessonId = Number(args[1]);
    state.lessonId = currentLevel().topics.some(t => t.id === lessonId) ? lessonId : currentLevel().topics[0].id;
    state.index = 0;
    persistState();
  }

  if (route.page === "home") renderHome();
  if (route.page === "learn") { renderSidebars(); renderLearn(); }
  if (route.page === "quiz") { renderSidebars(); resetQuizScore(); nextQuestion(); }
  if (route.page === "grammar") {
    if (args[0] && GRAMMAR_LEVELS.some(l => l.id === args[0])) state.grammarLevel = args[0];
    if (args[1]) renderGrammarDetail(state.grammarLevel, Number(args[1]));
    else renderGrammarList();
  }
  if (route.page === "dict") { renderDictLevels(); renderDict(); }

  const titles = { home: "Chinese with Leo — китайский с нуля до HSK4", learn: "Карточки · Chinese with Leo", quiz: "Тест · Chinese with Leo", grammar: "Грамматика · Chinese with Leo", dict: "Словарь · Chinese with Leo" };
  document.title = titles[route.page];
  if (!(route.page === "grammar" && args[1])) window.scrollTo({ top: 0 });
}

window.addEventListener("hashchange", router);

/* ============================== Клавиатура ============================== */

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "select" || tag === "textarea") return;

  if (route.page === "learn") {
    if (e.key === "ArrowRight") { step(1); e.preventDefault(); }
    else if (e.key === "ArrowLeft") { step(-1); e.preventDefault(); }
    else if (e.key === " " || e.key === "Enter") {
      if (tag === "button" && e.target.id !== "flipCard") return;
      flip(); e.preventDefault();
    }
    else if (e.key === "s" || e.key === "S" || e.key === "ы" || e.key === "Ы") speak(currentWord().hanzi);
    else if (e.key === "1") markWord(false);
    else if (e.key === "2") $("learnedBtn").click();
  } else if (route.page === "quiz") {
    const n = Number(e.key);
    if (n >= 1 && n <= quiz.options.length && !quiz.answered) answer(n - 1);
    else if (e.key === "Enter" && quiz.answered && tag !== "button") { nextQuestion(); e.preventDefault(); }
  } else if (route.page === "dict" && e.key === "/") {
    $("dictSearch").focus(); e.preventDefault();
  }
});

/* ============================== Тема, прогресс, Telegram ============================== */

$("themeBtn").onclick = () => {
  const cur = document.documentElement.getAttribute("data-theme") || "dark";
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  document.querySelector('meta[name="theme-color"]').content = next === "dark" ? "#1B1B20" : "#F4EFE4";
  try { localStorage.setItem("cwl_theme", next); } catch (e) {}
};

$("exportBtn").onclick = () => {
  const blob = new Blob([JSON.stringify({ app: "chinese-with-leo", learned }, null, 2)], { type: "application/json" });
  const a = el("a", { href: URL.createObjectURL(blob), download: "chinese-progress.json" });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Прогресс сохранён в файл");
};

$("importBtn").onclick = () => $("importFile").click();
$("importFile").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming = data.learned || data;
    if (typeof incoming !== "object" || Array.isArray(incoming)) throw new Error("bad");
    Object.entries(incoming).forEach(([k, v]) => { if (v) learned[k] = true; });
    saveProgress();
    router();
    toast("Прогресс загружен");
  } catch (err) {
    toast("Не получилось прочитать файл");
  }
  e.target.value = "";
};

$("resetBtn").onclick = () => {
  if (!confirm("Сбросить весь прогресс? Это нельзя отменить.")) return;
  learned = {};
  saveProgress();
  router();
  toast("Прогресс сброшен");
};

if (CONFIG.telegramUrl) {
  document.querySelectorAll(".tg-link").forEach(a => { a.href = CONFIG.telegramUrl; a.hidden = false; });
  document.querySelectorAll(".tg-section").forEach(s => { s.hidden = false; });
}

try {
  if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
  }
} catch (e) {}

updateSeal();
router();
