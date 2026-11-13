'use strict';
/* English Trainer — карточки с интервальными повторами. Данные: cards.json, прогресс: localStorage. */
(function () {
  var INTERVALS = [0, 1, 3, 7, 14, 30]; // дней до следующего показа по ступеням (stage)
  var MAX_AGAIN = 3;                    // сколько раз за сессию возвращаем ошибочную карточку
  var LS = { progress: 'et_progress_v1', cards: 'et_cards_v1', settings: 'et_settings_v1' };

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
      extra: (s && s.extra) || {}
    };
  }

  var pure = {
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
      case 'home': view = 'home'; session = null; render(); break;
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
  loadCards()
    .then(function (data) { cards = data.cards; meta = data; render(); })
    .catch(function () {
      root.innerHTML = '<div class="panel center"><h2>Нет карточек</h2><p class="muted">Не удалось загрузить cards.json. Открой приложение с интернетом один раз.</p></div>';
    });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* офлайн-режим необязателен */ }); });
  }
})();
