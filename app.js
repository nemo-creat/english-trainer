'use strict';
/* English Trainer — карточки с интервальными повторами. Данные: cards.json, прогресс: localStorage. */
(function () {
  var INTERVALS = [0, 1, 3, 7, 14, 30]; // дней до следующего показа по ступеням (stage)
  var MAX_AGAIN = 3;                    // сколько раз за сессию возвращаем ошибочную карточку
  var LS = { progress: 'et_progress_v1', cards: 'et_cards_v1', settings: 'et_settings_v1', drills: 'et_drills_v1' };

  /* ---------- чистые функции (экспортируются для тестов) ---------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return fmtDate(new Date()); }
  function addDays(ds, n) {
    var p = ds.split('-').map(Number);
    return fmtDate(new Date(p[0], p[1] - 1, p[2] + n));
  }
  function daysBetween(a, b) {
    var pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 864e5);
  }

  function applyRating(rec, rating, day) {
    var r = Object.assign({ stage: 0, due: day, lapses: 0, reps: 0, first: day }, rec || {});
    r.reps += 1;
    r.last = day;
    var top = INTERVALS.length - 1;
    if (rating === 'again') {
      r.stage = 0;
      r.lapses += 1;
      r.due = day;
    } else {
      r.stage = Math.min(top, r.stage + (rating === 'easy' ? 2 : 1));
      r.due = addDays(day, INTERVALS[r.stage]);
    }
    return r;
  }

  function norm(s) {
    return String(s).toLowerCase()
      .replace(/[’‘`]/g, "'")
      .replace(/[.,!?;:"“”()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function lev(a, b) {
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  // 'ok' | 'close' (опечатка в одном слове) | 'bad' | 'empty'
  function checkText(input, targets, allowTypo) {
    var g = norm(input);
    if (!g) return 'empty';
    var list = [];
    targets.forEach(function (t) {
      var n = norm(t);
      list.push(n);
      if (n.indexOf('to ') === 0) list.push(n.slice(3));
    });
    if (list.indexOf(g) !== -1) return 'ok';
    if (allowTypo) {
      for (var i = 0; i < list.length; i++) {
        var t = list[i];
        if (t.length >= 6 && t.indexOf(' ') === -1 && g.indexOf(' ') === -1 && lev(g, t) <= 1) return 'close';
      }
    }
    return 'bad';
  }

  function wordDiff(target, heard) {
    var t = norm(target).split(' ').filter(Boolean);
    var pool = norm(heard).split(' ').filter(Boolean);
    var missing = [];
    t.forEach(function (w) {
      var i = pool.indexOf(w);
      if (i >= 0) pool.splice(i, 1); else missing.push(w);
    });
    return { missing: missing, score: t.length ? (t.length - missing.length) / t.length : 0 };
  }

  function hash(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function streak(days, day) {
    var n = 0;
    var d = days[day] ? day : addDays(day, -1);
    while (days[d]) { n++; d = addDays(d, -1); }
    return n;
  }

  function buildQueue(cards, state, day, newLimit) {
    var rec = function (c) { return state.cards[c.id]; };
    var newToday = cards.filter(function (c) { return rec(c) && rec(c).first === day; }).length;
    var due = cards.filter(function (c) { return rec(c) && rec(c).due <= day; });
    due.sort(function (a, b) {
      return rec(a).due.localeCompare(rec(b).due) || rec(a).stage - rec(b).stage;
    });
    var room = Math.max(0, newLimit - newToday);
    var pool = cards.filter(function (c) { return !rec(c); });
    return { due: due, fresh: pool.slice(0, room), newToday: newToday, newLeft: pool.length };
  }

  function modeFor(card, rec, day, ttsOk) {
    if (card.type === 'rule') return 'flash';
    if (card.type === 'cloze') return 'cloze';
    if (!rec) return 'learn';
    if (rec.stage === 0) return 'flash';
    if (rec.stage >= 3 && ttsOk && hash(card.id + day) % 2 === 0) return 'listen';
    return 'type';
  }

  function normalizeState(s) {
    return {
      v: 1,
      cards: (s && s.cards) || {},
      days: (s && s.days) || {},
      extra: (s && s.extra) || {},
      drills: (s && s.drills) || {},   // прогресс упражнений по правилам: id -> {ok, bad, last}
      train: (s && s.train) || {}      // прогресс тренажёров слов: id -> {ok, bad, last}
    };
  }

  /* ---------- тренажёры: чистые функции ---------- */
  function shuffle(arr, rng) {
    rng = rng || Math.random;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Выбор n элементов: сначала те, где больше ошибок и меньше верных ответов, новые тоже в приоритете
  function pickWeighted(items, prog, n, rng) {
    rng = rng || Math.random;
    var scored = items.map(function (it) {
      var r = prog && prog[it.id];
      var score = r ? (r.bad * 2 - r.ok * 0.7) : 1.5;
      return { it: it, s: score + rng() * 2 };
    });
    scored.sort(function (a, b) { return b.s - a.s; });
    return scored.slice(0, n).map(function (x) { return x.it; });
  }

  // 4 варианта ответа: верный + 3 неверных из pool (без повторов текста)
  function makeChoices(card, pool, field, rng) {
    var right = card[field];
    var same = pool.filter(function (c) { return c.id !== card.id && c.type === card.type && c[field] !== right; });
    var others = same.length >= 3 ? same : pool.filter(function (c) { return c.id !== card.id && c[field] !== right; });
    var seen = {}; seen[right] = 1;
    var wrong = [];
    shuffle(others, rng).forEach(function (c) {
      if (wrong.length < 3 && !seen[c[field]]) { seen[c[field]] = 1; wrong.push(c[field]); }
    });
    return shuffle([right].concat(wrong), rng);
  }

  // Плитки для сборки: слова предложения (+ лишние) или буквы слова. Порядок не должен совпадать с верным.
  function makeTiles(answer, extra, byLetters, rng) {
    var base = byLetters ? answer.toLowerCase().split('') : answer.split(/\s+/);
    var tiles = base.concat(extra || []);
    var out = shuffle(tiles, rng);
    for (var k = 0; k < 6 && tiles.length > 1 && out.join(' ') === base.join(' '); k++) out = shuffle(tiles, rng);
    return out;
  }

  function checkBuild(tokens, answer, byLetters) {
    var joined = tokens.join(byLetters ? '' : ' ');
    return checkText(joined, [answer], false) === 'ok';
  }

  function chapterStats(drills, prog) {
    var res = {};
    drills.forEach(function (d) {
      var s = res[d.ch] || (res[d.ch] = { total: 0, seen: 0, ok: 0, bad: 0 });
      s.total++;
      var r = prog && prog[d.id];
      if (r) { s.seen++; s.ok += r.ok; s.bad += r.bad; }
    });
    return res;
  }

  var pure = {
    shuffle: shuffle, pickWeighted: pickWeighted, makeChoices: makeChoices, makeTiles: makeTiles,
    checkBuild: checkBuild, chapterStats: chapterStats,
    INTERVALS: INTERVALS, addDays: addDays, daysBetween: daysBetween, applyRating: applyRating,
    norm: norm, lev: lev, checkText: checkText, wordDiff: wordDiff, streak: streak,
    buildQueue: buildQueue, modeFor: modeFor, normalizeState: normalizeState, fmtDate: fmtDate
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = pure;
  if (typeof document === 'undefined') return;

  /* ---------- состояние приложения ---------- */
  var root = document.getElementById('app');
  var cards = [];
  var meta = {};
  var state = normalizeState(loadJSON(LS.progress, null));
  var settings = Object.assign({ newPerDay: 10, rate: 0.9 }, loadJSON(LS.settings, {}));
  var view = 'home';
  var session = null;
  var libQuery = '';
  var drillData = { chapters: {}, drills: [] };
  var ts = null; // сессия тренажёра

  function loadJSON(key, fallback) {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      return v === null || v === undefined ? fallback : v;
    } catch (e) { return fallback; }
  }
  function saveJSON(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); }
    catch (e) { toast('Не удалось сохранить прогресс в браузере'); }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escBr(s) { return esc(s).replace(/\n/g, '<br>'); }

  var toastTimer;
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  /* ---------- озвучка и распознавание речи ---------- */
  var ttsOk = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  var voice = null;
  function pickVoice() {
    if (!ttsOk) return;
    var vs = speechSynthesis.getVoices();
    voice = vs.filter(function (v) { return /^en[-_]US/i.test(v.lang); })[0] ||
            vs.filter(function (v) { return /^en/i.test(v.lang); })[0] || null;
  }
  if (ttsOk) {
    pickVoice();
    if (speechSynthesis.addEventListener) speechSynthesis.addEventListener('voiceschanged', pickVoice);
  }
  function speak(text, rate) {
    if (!ttsOk || !text) return;
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      if (voice) u.voice = voice;
      u.rate = rate || settings.rate;
      speechSynthesis.speak(u);
    } catch (e) { /* озвучка необязательна */ }
  }
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  function sayText(card) {
    if (card.type === 'cloze') return card.text.replace('___', card.answer);
    if (card.type === 'rule') return '';
    return card.en;
  }

  /* ---------- загрузка карточек ---------- */
  function loadCards() {
    return fetch('cards.json', { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.cards)) throw new Error('bad cards.json');
        saveJSON(LS.cards, data);
        return data;
      })
      .catch(function (err) {
        var cached = loadJSON(LS.cards, null);
        if (cached && Array.isArray(cached.cards)) return cached;
        throw err;
      });
  }

  function loadDrills() {
    return fetch('drills.json', { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.drills)) throw new Error('bad drills.json');
        saveJSON(LS.drills, data);
        return data;
      })
      .catch(function () {
        var cached = loadJSON(LS.drills, null);
        return cached && Array.isArray(cached.drills) ? cached : { chapters: {}, drills: [] };
      });
  }

  /* ---------- шаблоны ---------- */
  function speakBtn(text, slow) {
    if (!ttsOk || !text) return '';
    return '<button class="icon-btn" data-act="' + (slow ? 'slow' : 'speak') + '" data-text="' + esc(text) +
      '" aria-label="' + (slow ? 'Медленно' : 'Озвучить') + '">' + (slow ? '🐢' : '🔊') + '</button>';
  }
  function micBtn(target) {
    if (!SR) return '';
    return '<button class="btn small ghost" data-act="say" data-text="' + esc(target) + '">🎤 Повтори вслух</button>' +
      '<div id="say-result" class="small muted"></div>';
  }
  function stageDots(stage) {
    var s = '';
    for (var i = 1; i < INTERVALS.length; i++) s += i <= stage ? '●' : '○';
    return s;
  }
  function dueLabel(rec, day) {
    if (!rec) return 'новая';
    var d = daysBetween(day, rec.due);
    if (d <= 0) return 'сегодня';
    if (d === 1) return 'завтра';
    return 'через ' + d + ' дн.';
  }

  function answerBlock(card) {
    var h = '';
    if (card.type === 'rule') {
      h += '<div class="ru">' + escBr(card.back) + '</div>';
    } else if (card.type === 'cloze') {
      var full = card.text.replace('___', card.answer);
      h += '<div class="line"><div class="big">' + esc(full) + '</div>' + speakBtn(full) + '</div>';
      if (card.ru) h += '<div class="ru muted">' + esc(card.ru) + '</div>';
    } else {
      h += '<div class="line"><div class="big">' + esc(card.en) + '</div><div>' + speakBtn(card.en) + '</div></div>';
      h += '<div class="ru">' + esc(card.ru) + '</div>';
      if (card.ex) {
        h += '<div class="ex"><div class="line"><div>' + esc(card.ex) + '</div>' + speakBtn(card.ex) + '</div>' +
          (card.exRu ? '<div class="muted small">' + esc(card.exRu) + '</div>' : '') + '</div>';
      }
    }
    if (card.note) h += '<div class="note">' + escBr(card.note) + '</div>';
    return h;
  }

  function homeHTML() {
    var day = today();
    var limit = settings.newPerDay + (state.extra[day] || 0);
    var plan = buildQueue(cards, state, day, limit);
    var total = plan.due.length + plan.fresh.length;
    var learned = cards.filter(function (c) { return state.cards[c.id] && state.cards[c.id].stage >= 3; }).length;
    var st = streak(state.days, day);
    var h = '<div class="topbar"><div><h1>English Trainer</h1><div class="muted small">Слова и фразы из наших занятий</div></div>' +
      '<div class="badge">🔥 ' + st + '</div></div>';

    h += '<div class="panel"><div class="stats">' +
      '<div class="stat"><b>' + plan.due.length + '</b><span>повторить</span></div>' +
      '<div class="stat"><b>' + plan.fresh.length + '</b><span>новых сегодня</span></div>' +
      '<div class="stat"><b>' + learned + '/' + cards.length + '</b><span>выучено</span></div></div></div>';

    if (total > 0) {
      h += '<button class="btn primary" data-act="start">Начать · ' + total + ' карточек</button>';
    } else {
      var nextDue = '';
      Object.keys(state.cards).forEach(function (id) {
        var d = state.cards[id].due;
        if (d > day && (!nextDue || d < nextDue)) nextDue = d;
      });
      h += '<div class="panel center"><h2>На сегодня всё ✅</h2><p class="muted">' +
        (nextDue ? 'Следующее повторение: ' + dueLabel({ due: nextDue }, day) + '.' : 'Новых карточек пока нет — продолжим на занятии.') +
        '</p></div>';
    }
    h += '<div class="stack" style="margin-top:12px">';
    if (plan.newLeft - plan.fresh.length > 0) {
      h += '<button class="btn ghost" data-act="extra">+ Ещё 10 новых (' + (plan.newLeft - plan.fresh.length) + ' осталось)</button>';
    }
    h += '<button class="btn" data-act="train">🏋️ Тренажёры: правила и слова</button>';
    h += '<div class="row"><button class="btn" data-act="library">Все карточки</button>' +
      '<button class="btn" data-act="settings">Настройки</button></div></div>';
    h += '<p class="muted small center" style="margin-top:18px">Карточки обновлены: ' + esc(meta.updated || '—') + '</p>';
    return h;
  }

  function sessionHTML() {
    var item = session.queue[0];
    if (!item) return doneHTML();
    var card = item.card, mode = item.mode;
    var pct = Math.round((session.done / session.total) * 100);
    var h = '<div class="topbar"><button class="icon-btn" data-act="home" aria-label="Выйти">✕</button>' +
      '<div class="progress"><i style="width:' + pct + '%"></i></div>' +
      '<div class="badge">' + session.done + '/' + session.total + '</div></div>';

    var asking = session.step === 'ask';
    h += '<div class="panel">';

    if (mode === 'learn') {
      h += '<div class="tag">Новое</div>' + answerBlock(card) + '<div class="stack" style="margin-top:14px">' + micBtn(card.en) + '</div></div>';
      h += '<div class="row"><button class="btn" data-act="rate" data-rating="easy">Уже знаю</button>' +
        '<button class="btn primary" data-act="rate" data-rating="good">Запомню</button></div>';
      return h;
    }

    if (mode === 'flash') {
      if (card.type === 'rule') {
        h += '<div class="tag">Правило</div><div class="big">' + escBr(card.front) + '</div>';
      } else {
        h += '<div class="tag">Вспомни перевод</div><div class="line"><div class="big">' + esc(card.en) + '</div>' + speakBtn(card.en) + '</div>';
      }
      if (asking) {
        h += '</div><button class="btn primary" data-act="reveal">Показать ответ</button>';
      } else {
        h += '<hr style="border:0;border-top:1px solid var(--line);margin:14px 0">';
        if (card.type === 'rule') {
          h += '<div class="ru">' + escBr(card.back) + '</div>' + (card.note ? '<div class="note">' + escBr(card.note) + '</div>' : '');
        } else {
          h += '<div class="ru">' + esc(card.ru) + '</div>';
          if (card.ex) h += '<div class="ex"><div class="line"><div>' + esc(card.ex) + '</div>' + speakBtn(card.ex) + '</div>' +
            (card.exRu ? '<div class="muted small">' + esc(card.exRu) + '</div>' : '') + '</div>';
          if (card.note) h += '<div class="note">' + escBr(card.note) + '</div>';
          h += '<div class="stack" style="margin-top:12px">' + micBtn(card.en) + '</div>';
        }
        h += '</div><div class="row"><button class="btn bad" data-act="rate" data-rating="again">Не помню</button>' +
          '<button class="btn good" data-act="rate" data-rating="good">Помню</button>' +
          '<button class="btn" data-act="rate" data-rating="easy">Легко</button></div>';
      }
      return h;
    }

    // type / listen / cloze — ввод ответа
    if (mode === 'type') {
      h += '<div class="tag">Напиши по-английски</div><div class="ru" style="margin-top:0">' + esc(card.ru) + '</div>';
    } else if (mode === 'listen') {
      h += '<div class="tag">Послушай и напиши</div><div class="row" style="margin-top:6px">' +
        speakBtn(card.en) + speakBtn(card.en, true) + '</div>';
    } else if (mode === 'cloze') {
      var parts = card.text.split('___');
      h += '<div class="tag">Вставь слово</div><div class="big">' + esc(parts[0]) + '<span class="blank"></span>' + esc(parts.slice(1).join('___')) + '</div>';
      if (card.hint) h += '<div class="muted" style="margin-top:6px">' + esc(card.hint) + '</div>';
      if (card.ru) h += '<div class="muted small">' + esc(card.ru) + '</div>';
    }

    if (asking) {
      h += '<form data-form="answer" style="margin-top:14px"><input type="text" id="ans" autocomplete="off" autocapitalize="off" ' +
        'autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="Твой ответ">' +
        '<button class="btn primary" type="submit" style="margin-top:10px">Проверить</button></form>' +
        '<button class="btn ghost small" data-act="idk" style="margin-top:8px">Не знаю</button></div>';
    } else {
      var r = session.result;
      var msg = r.status === 'ok' ? '✅ Верно!' :
        r.status === 'close' ? '🟡 Почти — следи за написанием: <b>' + esc(mode === 'cloze' ? card.answer : card.en) + '</b>' :
        r.status === 'skip' ? 'Правильный ответ:' :
        '❌ Нужно: <b>' + esc(mode === 'cloze' ? card.answer : card.en) + '</b>';
      h += '<div class="res ' + (r.status === 'close' ? 'close' : r.status === 'ok' ? 'ok' : 'bad') + '" style="margin-top:14px">' + msg +
        (r.given ? '<div class="small muted" style="font-weight:400">Ты написал: ' + esc(r.given) + '</div>' : '') + '</div>';
      h += answerBlock(card) + '</div>';
      if (r.status === 'ok' || r.status === 'close') {
        h += '<div class="row"><button class="btn good" data-act="rate" data-rating="good">Дальше</button>' +
          '<button class="btn" data-act="rate" data-rating="easy">Было легко</button></div>';
      } else {
        h += '<div class="stack"><button class="btn bad" data-act="rate" data-rating="again">Дальше (повторим)</button>' +
          (r.status === 'bad' ? '<button class="btn ghost small" data-act="rate" data-rating="good">Я был прав (синоним)</button>' : '') + '</div>';
      }
    }
    return h;
  }

  function doneHTML() {
    var day = today();
    var tomorrow = addDays(day, 1);
    var tomorrowCount = cards.filter(function (c) { var r = state.cards[c.id]; return r && r.due <= tomorrow; }).length;
    var s = session.stats;
    return '<div class="panel center" style="margin-top:30px"><div style="font-size:54px">🎉</div><h2>Сессия закончена</h2>' +
      '<p class="muted">Верно: ' + (s.good + s.easy) + ' · Ошибок: ' + s.again + '</p>' +
      '<p class="muted">Завтра к повторению: ' + tomorrowCount + '</p></div>' +
      '<button class="btn primary" data-act="home">На главную</button>';
  }

  function libraryHTML() {
    var day = today();
    var q = norm(libQuery);
    var list = cards.filter(function (c) {
      if (!q) return true;
      var hay = norm([c.en, c.ru, c.front, c.back, c.text, c.answer].join(' '));
      return hay.indexOf(q) !== -1;
    });
    var h = '<div class="topbar"><button class="icon-btn" data-act="home" aria-label="Назад">←</button><h2 style="margin:0">Все карточки</h2><div class="badge">' + list.length + '</div></div>';
    h += '<input type="search" id="lib-q" placeholder="Поиск" value="' + esc(libQuery) + '" autocomplete="off" autocapitalize="off">';
    h += '<div class="panel" style="margin-top:12px">';
    list.forEach(function (c) {
      var rec = state.cards[c.id];
      var title = c.type === 'rule' ? c.front : c.type === 'cloze' ? c.text.replace('___', '[' + c.answer + ']') : c.en;
      var sub = c.type === 'rule' ? c.back : c.ru || '';
      h += '<div class="list-item"><div class="line"><div class="en">' + esc(title) + '<span class="chip">' + esc(c.type) + '</span></div>' +
        '<div class="small muted">' + esc(dueLabel(rec, day)) + '</div></div>' +
        '<div class="muted small">' + esc(String(sub).replace(/\n/g, ' ')) + '</div>' +
        '<div class="dots">' + stageDots(rec ? rec.stage : 0) + '</div></div>';
    });
    if (!list.length) h += '<p class="muted center">Ничего не найдено</p>';
    return h + '</div>';
  }

  function settingsHTML() {
    var h = '<div class="topbar"><button class="icon-btn" data-act="home" aria-label="Назад">←</button><h2 style="margin:0">Настройки</h2><span></span></div>';
    h += '<div class="panel"><label class="field" for="set-new">Новых карточек в день</label><select id="set-new">';
    [5, 10, 15, 20].forEach(function (n) {
      h += '<option value="' + n + '"' + (settings.newPerDay === n ? ' selected' : '') + '>' + n + '</option>';
    });
    h += '</select>';
    if (ttsOk) {
      h += '<label class="field" for="set-rate">Скорость озвучки: <span id="rate-val">' + settings.rate.toFixed(2) + '</span></label>' +
        '<input type="range" id="set-rate" min="0.5" max="1.2" step="0.05" value="' + settings.rate + '">' +
        '<button class="btn small ghost" data-act="speak" data-text="Hello! Nice to meet you." style="margin-top:8px">🔊 Проверить голос</button>';
    } else {
      h += '<p class="muted small" style="margin-top:12px">Озвучка в этом браузере недоступна.</p>';
    }
    h += '</div>';
    h += '<div class="panel"><h2>Прогресс</h2><p class="muted small">Прогресс хранится в браузере телефона. Если очистить данные Chrome, он пропадёт — сохраняй копию.</p>' +
      '<div class="stack"><button class="btn" data-act="export">Сохранить копию прогресса</button>' +
      '<label class="btn" style="cursor:pointer">Загрузить копию<input type="file" id="imp" accept="application/json,.json" hidden></label>' +
      '<button class="btn ghost" data-act="reload">Проверить новые карточки</button>' +
      '<button class="btn bad small" data-act="reset">Сбросить весь прогресс</button></div></div>';
    h += '<p class="muted small center">Карточек: ' + cards.length + ' · обновлено ' + esc(meta.updated || '—') + '</p>';
    return h;
  }

  /* ---------- отрисовка ---------- */
  function render() {
    if (view === 'home') root.innerHTML = homeHTML();
    else if (view === 'session') { root.innerHTML = sessionHTML(); afterSessionRender(); }
    else if (view === 'library') root.innerHTML = libraryHTML();
    else if (view === 'settings') root.innerHTML = settingsHTML();
    else if (view === 'train') root.innerHTML = trainHTML();
    else if (view === 'tsession') { root.innerHTML = tsessionHTML(); afterTsessionRender(); }
    try { window.scrollTo(0, 0); } catch (e) { /* не критично */ }
  }

  function afterSessionRender() {
    var item = session.queue[0];
    if (!item) return;
    var inp = document.getElementById('ans');
    if (inp) setTimeout(function () { inp.focus(); }, 60);
    if (item.mode === 'listen' && session.step === 'ask') setTimeout(function () { speak(item.card.en); }, 200);
    if (item.mode === 'learn') setTimeout(function () { speak(item.card.en); }, 200);
  }

  /* ---------- сессия ---------- */
  function startSession() {
    var day = today();
    var limit = settings.newPerDay + (state.extra[day] || 0);
    var plan = buildQueue(cards, state, day, limit);
    var items = plan.due.concat(plan.fresh).map(function (c) {
      return { card: c, mode: modeFor(c, state.cards[c.id], day, ttsOk), tries: 0 };
    });
    if (!items.length) return;
    session = { queue: items, total: items.length, done: 0, step: 'ask', result: null, stats: { good: 0, easy: 0, again: 0 } };
    view = 'session';
    render();
  }

  function rate(rating) {
    var item = session.queue.shift();
    var day = today();
    state.cards[item.card.id] = applyRating(state.cards[item.card.id], rating, day);
    state.days[day] = (state.days[day] || 0) + 1;
    saveJSON(LS.progress, state);
    session.stats[rating]++;
    if (rating === 'again' && item.tries < MAX_AGAIN) {
      item.tries++;
      session.queue.splice(Math.min(3, session.queue.length), 0, item);
    } else {
      session.done++;
    }
    session.step = 'ask';
    session.result = null;
    render();
  }

  function submitAnswer(text) {
    var item = session.queue[0];
    var card = item.card;
    var targets = item.mode === 'cloze' ? [card.answer].concat(card.alts || []) : [card.en].concat(card.alts || []);
    var status = checkText(text, targets, item.mode !== 'cloze' && card.type === 'word');
    if (status === 'empty') { toast('Напиши ответ или нажми «Не знаю»'); return; }
    session.step = 'result';
    session.result = { status: status, given: text.trim() };
    render();
  }

  /* ---------- тренажёры ---------- */
  var WORD_KINDS = [
    { kind: 'en2ru', icon: '🇬🇧', title: 'Выбери перевод', sub: 'слово по-английски → выбери русский перевод' },
    { kind: 'ru2en', icon: '🇷🇺', title: 'Выбери слово', sub: 'слово по-русски → выбери английское' },
    { kind: 'assemble', icon: '🔤', title: 'Собери слово или фразу', sub: 'из букв и слов по русской подсказке' },
    { kind: 'listen', icon: '🎧', title: 'Аудио-квиз', sub: 'послушай и выбери, что услышал', needTts: true },
    { kind: 'pairs', icon: '🔗', title: 'Пары', sub: 'найди перевод для каждого слова' }
  ];

  function wordPool() {
    return cards.filter(function (c) { return (c.type === 'word' || c.type === 'phrase') && c.en && c.ru; });
  }
  // Тренируем слова, которые ты уже видел в приложении; если их мало — берём все
  function wordSource() {
    var all = wordPool();
    var seen = all.filter(function (c) { return state.cards[c.id]; });
    return seen.length >= 8 ? seen : all;
  }
  function chapterLabel(ch) {
    return 'Глава ' + ch + (drillData.chapters && drillData.chapters[ch] ? ' · ' + drillData.chapters[ch] : '');
  }

  function drillItem(d) {
    var it = {
      id: d.id, store: 'drills', kind: d.type, d: d, tag: chapterLabel(d.ch), mine: !!d.mine,
      q: d.q, prompt: d.prompt, ru: d.ru, answer: d.answer, alts: d.alts || [], why: d.why
    };
    if (d.type === 'choice') it.options = shuffle(d.options);
    if (d.type === 'build') { it.tiles = makeTiles(d.answer, d.extra, false); it.picked = []; it.byLetters = false; }
    return it;
  }

  function assembleOk(c) {
    return /^[a-z]+$/i.test(c.en) ? (c.en.length >= 4 && c.en.length <= 12) : (c.en.split(/\s+/).length >= 2 && c.en.split(/\s+/).length <= 8);
  }

  function wordItem(kind, c, pool) {
    var it = { id: c.id, store: 'train', kind: 'choice', origKind: kind, card: c, tag: 'Слова', answer: c.en };
    if (kind === 'en2ru') {
      it.q = c.en; it.speak = c.en; it.prompt = 'Выбери перевод'; it.answer = c.ru; it.options = makeChoices(c, pool, 'ru');
    } else if (kind === 'ru2en') {
      it.q = c.ru; it.prompt = 'Выбери по-английски'; it.options = makeChoices(c, pool, 'en');
    } else if (kind === 'listen') {
      it.q = '🔊'; it.speak = c.en; it.autoSpeak = true; it.prompt = 'Послушай и выбери, что услышал'; it.options = makeChoices(c, pool, 'en');
    } else if (kind === 'assemble') {
      it.kind = 'build'; it.ru = c.ru;
      it.byLetters = /^[a-z]+$/i.test(c.en);
      it.tiles = makeTiles(c.en, [], it.byLetters); it.picked = [];
      it.prompt = it.byLetters ? 'Собери слово из букв' : 'Собери фразу из слов';
    }
    return it;
  }

  function pairsItem(group) {
    return {
      kind: 'pairs', store: 'train', tag: 'Слова', pairs: group,
      left: shuffle(group), right: shuffle(group), matched: {}, bad: {}, sel: null, flash: null, id: 'pairs'
    };
  }

  function startTraining(kind, ch) {
    var items = [], list;
    if (kind === 'rules' || kind === 'mistakes' || kind === 'chapter') {
      list = drillData.drills;
      if (kind === 'mistakes') list = list.filter(function (d) { return d.mine; });
      if (kind === 'chapter') list = list.filter(function (d) { return String(d.ch) === String(ch); });
      items = pickWeighted(list, state.drills, 10).map(drillItem);
    } else {
      var src = wordSource(), pool = wordPool();
      if (kind === 'assemble') src = src.filter(assembleOk);
      if (kind === 'pairs') {
        var pk = pickWeighted(src, state.train, 12);
        for (var i = 0; i < pk.length; i += 6) if (pk.length - i >= 3) items.push(pairsItem(pk.slice(i, i + 6)));
      } else {
        items = pickWeighted(src, state.train, 10).map(function (c) { return wordItem(kind, c, pool); });
      }
    }
    if (!items.length) { toast('Пока нет материала для этого тренажёра'); return; }
    ts = { kind: kind, ch: ch, items: items, total: items.length, done: 0, step: 'ask', stats: { ok: 0, bad: 0 }, wrong: [] };
    view = 'tsession';
    render();
  }

  function record(it, ok) {
    if (it.counted) return;
    it.counted = true;
    var day = today();
    var store = state[it.store];
    var r = store[it.id] || (store[it.id] = { ok: 0, bad: 0, last: day });
    if (ok) r.ok++; else r.bad++;
    r.last = day;
    state.days[day] = (state.days[day] || 0) + 1;
    saveJSON(LS.progress, state);
    if (ok) ts.stats.ok++; else { ts.stats.bad++; ts.wrong.push(it); }
  }

  function finishItem(it, ok, given, idx) {
    it.result = { ok: ok, given: given, idx: idx };
    record(it, ok);
    ts.step = 'result';
    render();
  }

  function tPick(i) {
    var it = ts && ts.items[0];
    if (!it || ts.step !== 'ask' || it.kind !== 'choice') return;
    finishItem(it, it.options[i] === it.answer, it.options[i], i);
  }
  function tTypeSubmit(text) {
    var it = ts && ts.items[0];
    if (!it || ts.step !== 'ask') return;
    var status = checkText(text, [it.answer].concat(it.alts || []), false);
    if (status === 'empty') { toast('Напиши ответ или нажми «Не знаю»'); return; }
    finishItem(it, status === 'ok', text.trim());
  }
  function tTile(i) {
    var it = ts && ts.items[0];
    if (!it || ts.step !== 'ask' || it.kind !== 'build') return;
    if (it.picked.indexOf(i) === -1) it.picked.push(i);
    render();
  }
  function tUntile(pos) {
    var it = ts && ts.items[0];
    if (!it || ts.step !== 'ask' || it.kind !== 'build') return;
    it.picked.splice(pos, 1);
    render();
  }
  function tokensOf(it) { return it.picked.map(function (i) { return it.tiles[i]; }); }
  function tCheckBuild() {
    var it = ts && ts.items[0];
    if (!it || ts.step !== 'ask' || it.kind !== 'build') return;
    if (!it.picked.length) { toast('Нажимай на слова внизу, чтобы собрать ответ'); return; }
    var toks = tokensOf(it);
    finishItem(it, checkBuild(toks, it.answer, it.byLetters) || (it.alts || []).some(function (a) { return checkBuild(toks, a, it.byLetters); }),
      toks.join(it.byLetters ? '' : ' '));
  }
  function tGiveUp() {
    var it = ts && ts.items[0];
    if (!it || ts.step !== 'ask') return;
    finishItem(it, false, '');
  }
  function tNext() {
    if (!ts) return;
    ts.items.shift();
    ts.done++;
    ts.step = 'ask';
    render();
  }
  function tRetry() {
    if (!ts || !ts.wrong.length) return;
    var pool = wordPool();
    var items = ts.wrong.map(function (it) {
      if (it.store === 'drills') return drillItem(it.d);
      return wordItem(it.origKind === 'assemble' && !assembleOk(it.card) ? 'en2ru' : (it.origKind || 'en2ru'), it.card, pool);
    });
    ts = { kind: ts.kind, ch: ts.ch, items: items, total: items.length, done: 0, step: 'ask', stats: { ok: 0, bad: 0 }, wrong: [] };
    render();
  }

  function tPair(side, id) {
    var it = ts && ts.items[0];
    if (!it || it.kind !== 'pairs' || it.flash || it.matched[id]) return;
    if (!it.sel || it.sel.side === side) { it.sel = { side: side, id: id }; render(); return; }
    var other = it.sel;
    it.sel = null;
    if (other.id === id) {
      it.matched[id] = true;
      var c = it.pairs.filter(function (p) { return p.id === id; })[0];
      if (c) speak(c.en);
      if (Object.keys(it.matched).length === it.pairs.length) {
        it.pairs.forEach(function (p) {
          var okp = !it.bad[p.id];
          record({ id: p.id, store: 'train', card: p, origKind: 'en2ru', kind: 'choice' }, okp);
        });
        ts.step = 'result';
        it.result = { ok: Object.keys(it.bad).length === 0 };
      }
      render();
    } else {
      it.bad[id] = 1; it.bad[other.id] = 1;
      it.flash = { a: other.side + ':' + other.id, b: side + ':' + id };
      render();
      setTimeout(function () { if (ts && ts.items[0] === it) { it.flash = null; render(); } }, 650);
    }
  }

  function trainHTML() {
    var h = '<div class="topbar"><button class="icon-btn" data-act="home" aria-label="Назад">←</button>' +
      '<div style="flex:1"><h1>Тренажёры</h1><div class="muted small">Отдельно от карточек: прогресс карточек не меняется</div></div></div>';

    var drills = drillData.drills || [];
    var cs = chapterStats(drills, state.drills);
    var mineCount = drills.filter(function (d) { return d.mine; }).length;
    h += '<div class="panel"><h2>Правила</h2>';
    if (!drills.length) {
      h += '<p class="muted">Упражнения пока не загрузились. Открой приложение с интернетом один раз.</p></div>';
    } else {
      h += '<div class="stack"><button class="btn primary" data-act="tstart" data-kind="rules">Смешанная тренировка · 10 упражнений</button>' +
        '<button class="btn" data-act="tstart" data-kind="mistakes">Мои ошибки с занятий · ' + mineCount + '</button></div>' +
        '<p class="muted small" style="margin:14px 0 6px">По главам учебника:</p><div class="stack">';
      Object.keys(drillData.chapters || {}).sort(function (a, b) { return a - b; }).forEach(function (k) {
        var s = cs[k];
        if (!s) return;
        var acc = (s.ok + s.bad) ? Math.round(s.ok / (s.ok + s.bad) * 100) + '%' : 'новое';
        h += '<button class="btn split" data-act="tstart" data-kind="chapter" data-ch="' + esc(k) + '"><span>' + k + '. ' +
          esc(drillData.chapters[k]) + '</span><span class="chip">' + s.total + ' упр. · ' + acc + '</span></button>';
      });
      h += '</div></div>';
    }

    var src = wordSource(), all = wordPool();
    h += '<div class="panel"><h2>Слова</h2><p class="muted small">Берём слова, которые ты уже видел в приложении (' +
      src.length + ' из ' + all.length + '). Чаще попадаются те, где были ошибки.</p><div class="stack">';
    WORD_KINDS.forEach(function (k) {
      if (k.needTts && !ttsOk) return;
      h += '<button class="btn split" data-act="tstart" data-kind="' + k.kind + '"><span>' + k.icon + ' ' + esc(k.title) +
        '</span></button><div class="muted small" style="margin-top:-4px">' + esc(k.sub) + '</div>';
    });
    h += '</div></div>';
    return h;
  }

  function resultBlock(it) {
    var r = it.result, h = '';
    h += '<div class="res ' + (r.ok ? 'ok' : 'bad') + '" style="margin-top:14px">' +
      (r.ok ? '✅ Верно!' : '❌ Верный ответ: <b>' + esc(it.answer) + '</b>') +
      (!r.ok && r.given ? '<div class="small muted" style="font-weight:400">Ты ответил: ' + esc(r.given) + '</div>' : '') + '</div>';
    if (it.why) h += '<div class="note" style="margin-top:0">' + esc(it.why) + '</div>';
    if (it.card) h += answerBlock(it.card);
    return h;
  }

  function tsessionHTML() {
    var it = ts.items[0];
    if (!it) return tdoneHTML();
    var asking = ts.step === 'ask';
    var pct = Math.round((ts.done / ts.total) * 100);
    var h = '<div class="topbar"><button class="icon-btn" data-act="train" aria-label="Выйти">✕</button>' +
      '<div class="progress"><i style="width:' + pct + '%"></i></div>' +
      '<div class="badge">' + ts.done + '/' + ts.total + '</div></div>';

    if (it.kind === 'pairs') {
      h += '<div class="panel"><div class="tag">Найди пары</div><p class="muted small">Нажми слово слева, потом его перевод справа.</p><div class="pairs"><div class="stack">';
      it.left.forEach(function (p) {
        var cls = 'btn small pair' + (it.matched[p.id] ? ' done' : '') + (it.sel && it.sel.side === 'en' && it.sel.id === p.id ? ' sel' : '') +
          (it.flash && it.flash.a === 'en:' + p.id || it.flash && it.flash.b === 'en:' + p.id ? ' flash' : '');
        h += '<button class="' + cls + '" data-act="tpair" data-side="en" data-id="' + esc(p.id) + '">' + esc(p.en) + '</button>';
      });
      h += '</div><div class="stack">';
      it.right.forEach(function (p) {
        var cls = 'btn small pair' + (it.matched[p.id] ? ' done' : '') + (it.sel && it.sel.side === 'ru' && it.sel.id === p.id ? ' sel' : '') +
          (it.flash && it.flash.a === 'ru:' + p.id || it.flash && it.flash.b === 'ru:' + p.id ? ' flash' : '');
        h += '<button class="' + cls + '" data-act="tpair" data-side="ru" data-id="' + esc(p.id) + '">' + esc(p.ru) + '</button>';
      });
      h += '</div></div></div>';
      if (!asking) {
        h += '<div class="res ' + (it.result.ok ? 'ok' : 'close') + '">' + (it.result.ok ? '✅ Все пары без ошибок!' : '🟡 Все пары найдены. Ошибки запомнил — эти слова будут попадаться чаще.') +
          '</div><button class="btn primary" data-act="tnext">Дальше</button>';
      }
      return h;
    }

    h += '<div class="panel"><div class="tag">' + esc(it.tag) + '</div>' + (it.mine ? '<div><span class="chip" style="margin-left:0">из твоих ошибок</span></div>' : '');

    if (it.kind === 'choice') {
      h += '<div class="muted" style="margin-top:4px">' + esc(it.prompt || 'Выбери правильный вариант') + '</div>';
      if (it.q) {
        var parts = it.q.split('___');
        h += '<div class="line" style="margin-top:8px"><div class="big">' + (parts.length > 1
          ? esc(parts[0]) + '<span class="blank"></span>' + esc(parts.slice(1).join('___')) : esc(it.q)) + '</div>' + speakBtn(it.speak) + '</div>';
      }
      h += '<div class="stack" style="margin-top:14px">';
      it.options.forEach(function (o, i) {
        var cls = 'btn opt';
        if (!asking) {
          if (o === it.answer) cls += ' ok';
          else if (it.result.idx === i) cls += ' bad';
        }
        h += '<button class="' + cls + '" data-act="tpick" data-i="' + i + '"' + (asking ? '' : ' disabled') + '>' +
          (o === '—' ? '— (артикль не нужен)' : esc(o)) + '</button>';
      });
      h += '</div>';
      if (!asking) h += resultBlock(it);
      h += '</div>';
    } else if (it.kind === 'type') {
      h += '<div class="muted" style="margin-top:4px">' + esc(it.prompt || 'Переведи на английский') + '</div>' +
        '<div class="ru" style="margin-top:6px">' + esc(it.ru) + '</div>';
      if (asking) {
        h += '<form data-form="tanswer" style="margin-top:14px"><input type="text" id="tans" autocomplete="off" autocapitalize="off" ' +
          'autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="Твой ответ">' +
          '<button class="btn primary" type="submit" style="margin-top:10px">Проверить</button></form>' +
          '<button class="btn ghost small" data-act="tidk" style="margin-top:8px">Не знаю</button></div>';
      } else {
        h += resultBlock(it) + '</div>';
      }
    } else if (it.kind === 'build') {
      h += '<div class="muted" style="margin-top:4px">' + esc(it.prompt || 'Собери предложение') + '</div>' +
        '<div class="ru" style="margin-top:6px">' + esc(it.ru) + '</div>';
      h += '<div class="ans-line' + (it.byLetters ? ' letters' : '') + '">';
      if (!it.picked.length && asking) h += '<span class="muted small">Здесь появится твой ответ</span>';
      it.picked.forEach(function (ti, pos) {
        h += '<button class="tile on" data-act="tuntile" data-i="' + pos + '"' + (asking ? '' : ' disabled') + '>' + esc(it.tiles[ti]) + '</button>';
      });
      h += '</div>';
      if (asking) {
        h += '<div class="tiles' + (it.byLetters ? ' letters' : '') + '">';
        it.tiles.forEach(function (t, i) {
          h += '<button class="tile' + (it.picked.indexOf(i) !== -1 ? ' used' : '') + '" data-act="ttile" data-i="' + i + '">' + esc(t) + '</button>';
        });
        h += '</div><div class="stack" style="margin-top:14px"><button class="btn primary" data-act="tcheck">Проверить</button>' +
          '<button class="btn ghost small" data-act="tidk">Не знаю</button></div></div>';
      } else {
        h += resultBlock(it) + '</div>';
      }
    }

    if (!asking) h += '<button class="btn primary" data-act="tnext">Дальше</button>';
    return h;
  }

  function tdoneHTML() {
    var s = ts.stats, n = s.ok + s.bad;
    var h = '<div class="panel center" style="margin-top:20px"><div style="font-size:54px">' + (s.bad === 0 ? '🏆' : '💪') + '</div>' +
      '<h2>Готово: ' + s.ok + ' из ' + n + '</h2><p class="muted">' +
      (s.bad === 0 ? 'Без ошибок. Так держать!' : 'Ошибки ниже: разберём и повторим.') + '</p></div>';
    if (ts.wrong.length) {
      h += '<div class="panel"><h2>Над чем поработать</h2>';
      ts.wrong.forEach(function (it) {
        var left = it.store === 'drills' ? (it.q || it.ru || '') : (it.card ? it.card.en + ' — ' + it.card.ru : '');
        h += '<div class="list-item"><div class="small muted">' + esc(left) + '</div><div class="en">' + esc(it.answer || (it.card && it.card.en) || '') + '</div>' +
          (it.why ? '<div class="small muted">' + esc(it.why) + '</div>' : '') + '</div>';
      });
      h += '</div>';
    }
    h += '<div class="stack">' + (ts.wrong.length ? '<button class="btn good" data-act="tretry">Повторить ошибки · ' + ts.wrong.length + '</button>' : '') +
      '<button class="btn primary" data-act="tstart" data-kind="' + esc(ts.kind) + '" data-ch="' + esc(ts.ch || '') + '">Ещё раз</button>' +
      '<button class="btn" data-act="train">В меню тренажёров</button></div>';
    return h;
  }

  function afterTsessionRender() {
    var it = ts && ts.items[0];
    if (!it) return;
    var inp = document.getElementById('tans');
    if (inp) setTimeout(function () { inp.focus(); }, 60);
    if (it.autoSpeak && ts.step === 'ask') setTimeout(function () { speak(it.speak); }, 200);
  }

  /* ---------- события ---------- */
  root.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    switch (act) {
      case 'start': startSession(); break;
      case 'extra':
        state.extra[today()] = (state.extra[today()] || 0) + 10;
        saveJSON(LS.progress, state);
        render();
        break;
      case 'home': view = 'home'; session = null; ts = null; render(); break;
      case 'train': view = 'train'; ts = null; render(); break;
      case 'tstart': startTraining(el.getAttribute('data-kind'), el.getAttribute('data-ch')); break;
      case 'tpick': tPick(parseInt(el.getAttribute('data-i'), 10)); break;
      case 'ttile': tTile(parseInt(el.getAttribute('data-i'), 10)); break;
      case 'tuntile': tUntile(parseInt(el.getAttribute('data-i'), 10)); break;
      case 'tcheck': tCheckBuild(); break;
      case 'tidk': tGiveUp(); break;
      case 'tnext': tNext(); break;
      case 'tretry': tRetry(); break;
      case 'tpair': tPair(el.getAttribute('data-side'), el.getAttribute('data-id')); break;
      case 'library': view = 'library'; render(); break;
      case 'settings': view = 'settings'; render(); break;
      case 'reveal': session.step = 'result'; render(); break;
      case 'rate': rate(el.getAttribute('data-rating')); break;
      case 'idk': session.step = 'result'; session.result = { status: 'skip', given: '' }; render(); break;
      case 'speak': speak(el.getAttribute('data-text')); break;
      case 'slow': speak(el.getAttribute('data-text'), 0.6); break;
      case 'say': startListening(el.getAttribute('data-text')); break;
      case 'export': exportProgress(); break;
      case 'reload':
        loadCards().then(function (d) { cards = d.cards; meta = d; toast('Карточек: ' + cards.length); render(); })
          .catch(function () { toast('Нет связи — остались старые карточки'); });
        break;
      case 'reset':
        if (window.confirm('Сбросить весь прогресс? Это нельзя отменить.')) {
          state = normalizeState(null);
          saveJSON(LS.progress, state);
          toast('Прогресс сброшен');
          render();
        }
        break;
    }
  });

  root.addEventListener('submit', function (e) {
    var tform = e.target.closest('[data-form="tanswer"]');
    if (tform) { e.preventDefault(); tTypeSubmit(document.getElementById('tans').value); return; }
    var form = e.target.closest('[data-form="answer"]');
    if (!form) return;
    e.preventDefault();
    submitAnswer(document.getElementById('ans').value);
  });

  root.addEventListener('input', function (e) {
    if (e.target.id === 'lib-q') {
      libQuery = e.target.value;
      var pos = e.target.selectionStart;
      render();
      var inp = document.getElementById('lib-q');
      if (inp) { inp.focus(); try { inp.setSelectionRange(pos, pos); } catch (err) { /* ok */ } }
    } else if (e.target.id === 'set-rate') {
      settings.rate = parseFloat(e.target.value);
      saveJSON(LS.settings, settings);
      var v = document.getElementById('rate-val');
      if (v) v.textContent = settings.rate.toFixed(2);
    }
  });

  root.addEventListener('change', function (e) {
    if (e.target.id === 'set-new') {
      settings.newPerDay = parseInt(e.target.value, 10);
      saveJSON(LS.settings, settings);
      toast('Сохранено');
    } else if (e.target.id === 'imp') {
      importProgress(e.target.files && e.target.files[0]);
    }
  });

  /* ---------- распознавание речи ---------- */
  function startListening(target) {
    var out = document.getElementById('say-result');
    if (!SR) return;
    var rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    if (out) out.textContent = '🎙 Говори…';
    rec.onresult = function (ev) {
      var alts = Array.prototype.map.call(ev.results[0], function (a) { return a.transcript; });
      var best = alts[0], bestDiff = wordDiff(target, alts[0]);
      alts.forEach(function (a) { var d = wordDiff(target, a); if (d.missing.length < bestDiff.missing.length) { best = a; bestDiff = d; } });
      if (!out) return;
      out.textContent = bestDiff.missing.length === 0
        ? '✅ Отлично! Услышал: «' + best + '»'
        : 'Услышал: «' + best + '». Не расслышал: ' + bestDiff.missing.join(', ');
    };
    rec.onerror = function (ev) {
      if (out) out.textContent = ev.error === 'not-allowed' ? 'Нет доступа к микрофону — разреши в настройках сайта.' : 'Не получилось распознать (' + ev.error + ').';
    };
    try { rec.start(); } catch (err) { if (out) out.textContent = 'Микрофон занят, попробуй ещё раз.'; }
  }

  /* ---------- экспорт / импорт ---------- */
  function exportProgress() {
    var blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'english-trainer-progress-' + today() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
    toast('Копия сохранена в «Загрузки»');
  }

  function importProgress(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!data || typeof data.cards !== 'object') throw new Error('format');
        state = normalizeState(data);
        saveJSON(LS.progress, state);
        toast('Прогресс загружен');
        view = 'home';
        render();
      } catch (e) { toast('Файл не подходит'); }
    };
    reader.readAsText(file);
  }

  /* ---------- запуск ---------- */
  loadDrills().then(function (d) { drillData = d; if (view === 'train') render(); });
  loadCards()
    .then(function (data) { cards = data.cards; meta = data; render(); })
    .catch(function () {
      root.innerHTML = '<div class="panel center"><h2>Нет карточек</h2><p class="muted">Не удалось загрузить cards.json. Открой приложение с интернетом один раз.</p></div>';
    });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* офлайн-режим необязателен */ }); });
  }
})();
