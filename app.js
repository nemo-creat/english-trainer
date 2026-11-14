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
      train: (s && s.train) || {},     // прогресс тренажёров слов: id -> {ok, bad, last}
      weak: (s && s.weak) || {}        // слабые места: 'r:<глава>' или 'w:<слово>' -> {k, ch, w, bad, ok, last, ex}
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

  /* ---------- диагностика ошибок: слово или правило ---------- */
  var SETS = {
    be: ['am', 'is', 'are', 'was', 'were', 'be', 'been'],
    aux: ['do', 'does', 'did'],
    art: ['a', 'an', 'the'],
    prep: ['in', 'on', 'at', 'for', 'as', 'of', 'with', 'by', 'from', 'about'],
    cmp: ['more', 'most', 'than'],
    conj: ['and', 'because', 'when', 'but', 'or', 'to'],
    will: ['will']
  };
  function setOf(w) {
    for (var k in SETS) if (SETS[k].indexOf(w) !== -1) return k;
    return null;
  }

  function expand(s) {
    var t = norm(s);
    t = t.replace(/\bwon't\b/g, 'will not').replace(/\bcan't\b/g, 'can not')
      .replace(/\b(\w+)n't\b/g, '$1 not')
      .replace(/\bi'm\b/g, 'i am').replace(/\b(\w+)'re\b/g, '$1 are').replace(/\b(\w+)'ll\b/g, '$1 will')
      .replace(/\b(he|she|it|that|there|what)'s\b/g, '$1 is').replace(/\b(\w+)'ve\b/g, '$1 have');
    return t.split(' ').filter(Boolean);
  }

  function stem(w) {
    var s = w;
    if (s.length > 4 && /(ies|ied)$/.test(s)) s = s.slice(0, -3) + 'y';
    else s = s.replace(/(ing|est|er|ed|es|s|d)$/, '');
    if (s.length >= 3 && /(.)\1$/.test(s)) s = s.slice(0, -1);
    return s.replace(/e$/, '');
  }
  function suffixKind(w) {
    if (/ing$/.test(w)) return 'ing';
    if (/ed$/.test(w)) return 'ed';
    if (/(est|er)$/.test(w)) return 'er';
    if (/(ies|es|s)$/.test(w)) return 's';
    return '';
  }
  function sameStem(a, b) { return a !== b && a.length >= 3 && b.length >= 3 && stem(a) === stem(b); }

  var INFL = {
    s: [2, 'окончание -s: нужно с he / she / it и для нескольких предметов'],
    ed: [4, 'прошедшее время: глагол + -ed'],
    ing: [3, 'форма -ing: am / is / are + глагол-ing'],
    er: [9, 'сравнение: короткое слово + -er, длинное: more + слово']
  };
  var CTX_AFTER = { do: [6, 'после do / does глагол без окончаний'], does: [6, 'после do / does глагол без окончаний'],
    did: [6, 'после did глагол в обычной форме'], will: [5, 'после will глагол без окончаний'],
    to: [10, 'после to глагол без окончаний'] };

  function pairIssue(g, w, prevW, known, auxCtx) {
    if (sameStem(g, w)) {
      var kw = suffixKind(w), kg = suffixKind(g);
      var ctxw = prevW === 'to' ? 'to' : auxCtx;
      if (!kw && ctxw && CTX_AFTER[ctxw]) return { t: 'rule', ch: CTX_AFTER[ctxw][0], note: CTX_AFTER[ctxw][1], got: g, want: w };
      var k = kw || kg;
      if (k && INFL[k]) return { t: 'rule', ch: INFL[k][0], note: INFL[k][1], got: g, want: w };
    }
    var sg = setOf(g), sw = setOf(w);
    if (sg && sw && (sg === sw || (sg === 'conj' || sw === 'conj'))) return fnIssue(sw, w, g);
    if (sg && sw) return fnIssue(sw, w, g);
    var maxLen = Math.max(g.length, w.length);
    if (Math.min(g.length, w.length) >= 3 && lev(g, w) <= (maxLen >= 7 ? 2 : 1)) {
      return known && known[g] ? { t: 'word', got: g, want: w } : { t: 'spell', got: g, want: w };
    }
    return { t: 'word', got: g, want: w };
  }

  // ошибка со служебным словом (артикль, предлог, am/is/are, do/does/did, will, and/because/to)
  function fnIssue(set, w, g, ctx) {
    var x = w || g;
    if (set === 'be') {
      if (/^(was|were)$/.test(x) || /^(was|were)$/.test(g || '')) return { t: 'rule', ch: 4, note: 'прошедшее время от «быть»: was / were', got: g || '', want: w || '' };
      if (ctx === 'ing') return { t: 'rule', ch: 3, note: 'перед -ing нужен am / is / are; с простым глаголом он не нужен', got: g || '', want: w || '' };
      return { t: 'rule', ch: 1, note: 'глагол «быть»: am / is / are', got: g || '', want: w || '' };
    }
    if (set === 'aux') return { t: 'rule', ch: 6, note: 'do / does / did в вопросах и отрицании', got: g || '', want: w || '' };
    if (set === 'art') return { t: 'rule', ch: 8, note: 'артикли a / an / the', got: g || '', want: w || '' };
    if (set === 'prep') return { t: 'rule', ch: 11, note: 'предлог', got: g || '', want: w || '' };
    if (set === 'cmp') return { t: 'rule', ch: 9, note: 'сравнение прилагательных', got: g || '', want: w || '' };
    if (set === 'will') return { t: 'rule', ch: 5, note: 'будущее: will + глагол', got: g || '', want: w || '' };
    return { t: 'rule', ch: 10, note: 'связки: and / because / when / to', got: g || '', want: w || '' };
  }

  // Разбор ответа по словам. Возвращает {issues:[{t:'rule'|'spell'|'word', ch?, note?, got, want}], target}
  function diagnose(given, targets, known) {
    var g = expand(given), best = null;
    targets.forEach(function (t) {
      var w = expand(t);
      var ops = alignOps(g, w);
      if (!best || ops.cost < best.cost) best = { cost: ops.cost, ops: ops.list, target: t, w: w };
    });
    if (!best) return { issues: [], target: '' };
    var issues = [];
    var auxCtx = best.w.filter(function (x) { return x === 'do' || x === 'does' || x === 'did' || x === 'will'; })[0] || '';
    var sortedEq = g.slice().sort().join(' ') === best.w.slice().sort().join(' ');
    if (sortedEq && g.join(' ') !== best.w.join(' ')) {
      return { issues: [{ t: 'rule', ch: 1, note: 'порядок слов: кто → что делает → что', got: g.join(' '), want: best.w.join(' ') }], target: best.target };
    }
    best.ops.forEach(function (o) {
      if (o.op === 's') issues.push(pairIssue(o.g, o.w, o.pw, known, auxCtx));
      else if (o.op === 'i') { // лишнее слово в ответе
        var s = setOf(o.g);
        if (s === 'be' && o.g === 'am') issues.push({ t: 'rule', ch: 3, note: 'I\'m + простой глагол — ошибка: для привычки просто I + глагол', got: o.g, want: '' });
        else if (s === 'be' && !/^(was|were)$/.test(o.g)) issues.push({ t: 'rule', ch: 1, note: 'лишний is / are: два глагола подряд ставить нельзя', got: o.g, want: '' });
        else if (s) issues.push(fnIssue(s, '', o.g, ''));
        else issues.push({ t: 'word', got: o.g, want: '', note: 'лишнее слово «' + o.g + '»' });
      } else if (o.op === 'd') { // слово пропущено
        var s2 = setOf(o.w);
        if (s2) issues.push(fnIssue(s2, o.w, '', /ing$/.test(o.nw || '') ? 'ing' : ''));
        else issues.push({ t: 'word', got: '', want: o.w, note: 'пропущено слово «' + o.w + '»' });
      }
    });
    return { issues: issues, target: best.target };
  }

  function alignOps(g, w) {
    var n = g.length, m = w.length, D = [], i, j;
    function sub(a, b) {
      if (a === b) return 0;
      if (sameStem(a, b) || lev(a, b) <= Math.max(1, Math.floor(Math.max(a.length, b.length) / 4))) return 0.4;
      var sa = setOf(a);
      if (sa && sa === setOf(b)) return 0.6;
      return 1.6;
    }
    for (i = 0; i <= n; i++) { D[i] = []; for (j = 0; j <= m; j++) D[i][j] = 0; }
    for (i = 1; i <= n; i++) D[i][0] = i;
    for (j = 1; j <= m; j++) D[0][j] = j;
    for (i = 1; i <= n; i++) for (j = 1; j <= m; j++) {
      D[i][j] = Math.min(D[i - 1][j - 1] + sub(g[i - 1], w[j - 1]), D[i - 1][j] + 1, D[i][j - 1] + 1);
    }
    var list = [];
    i = n; j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && Math.abs(D[i][j] - (D[i - 1][j - 1] + sub(g[i - 1], w[j - 1]))) < 1e-9) {
        if (g[i - 1] !== w[j - 1]) list.push({ op: 's', g: g[i - 1], w: w[j - 1], pw: w[j - 2] || '', nw: w[j] || '' });
        i--; j--;
      } else if (i > 0 && Math.abs(D[i][j] - (D[i - 1][j] + 1)) < 1e-9) {
        list.push({ op: 'i', g: g[i - 1], nw: g[i] || '' }); i--;
      } else {
        list.push({ op: 'd', w: w[j - 1], nw: w[j] || '' }); j--;
      }
    }
    list.reverse();
    return { cost: D[n][m], list: list };
  }

  // ключ «слабого места»: правило по главе или слово
  function issueKey(is) {
    if (is.t === 'rule') return 'r:' + is.ch;
    var w = (is.want || '').toLowerCase();
    return w ? 'w:' + w : null;
  }
  function weakScore(e) { return e.bad * 2 - e.ok; }
  function noteIssuesTo(weak, issues, day) {
    var done = {};
    (issues || []).forEach(function (is) {
      var key = issueKey(is);
      if (!key) return;
      if (done[key]) return;
      done[key] = 1;
      var e = weak[key] || (weak[key] = { k: is.t === 'rule' ? 'r' : 'w', ch: is.ch, w: is.t === 'rule' ? undefined : is.want, bad: 0, ok: 0, last: day, ex: [] });
      e.bad++; e.last = day;
      var ex = is.got || is.want ? { got: is.got || '', want: is.want || '', t: is.t } : null;
      if (ex) { e.ex.push(ex); if (e.ex.length > 3) e.ex.shift(); }
    });
  }
  function noteOkTo(weak, key) {
    var e = weak[key];
    if (e) e.ok = Math.min(e.ok + 1, e.bad * 2); // счёт не уходит ниже нуля: новая ошибка сразу вернёт тему в слабые
  }
  function weakList(weak) {
    return Object.keys(weak || {}).map(function (k) { var e = weak[k]; return { key: k, e: e, score: weakScore(e) }; })
      .filter(function (x) { return x.score > 0; })
      .sort(function (a, b) { return b.score - a.score || b.e.last.localeCompare(a.e.last); });
  }

  var pure = {
    shuffle: shuffle, pickWeighted: pickWeighted, makeChoices: makeChoices, makeTiles: makeTiles,
    checkBuild: checkBuild, chapterStats: chapterStats,
    diagnose: diagnose, noteIssuesTo: noteIssuesTo, noteOkTo: noteOkTo, weakList: weakList, issueKey: issueKey, expand: expand, stem: stem,
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
    var weakN = weakList(state.weak).length;
    if (weakN) h += '<button class="btn" data-act="tstart" data-kind="weak">🎯 Слабые места: ' + weakN + ' — отработать</button>';
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
      h += diagHTML(r.diag && r.diag.issues);
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
    var res = session.result;
    var isWord = item.card.type === 'word' || item.card.type === 'phrase';
    if (res && res.diag && (rating === 'again' || res.status === 'close')) noteIssues(res.diag.issues);
    else if (rating === 'again' && isWord) noteIssues([wordIssue(item.card)]);
    else if (isWord && rating !== 'again') noteOk('w:' + item.card.en.toLowerCase());
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
    var diag = null;
    if (status !== 'ok') {
      diag = diagnose(text, targets, known());
      if (!diag.issues.length) diag.issues = [wordIssue(card)];
    }
    session.step = 'result';
    session.result = { status: status, given: text.trim(), diag: diag };
    render();
  }

  /* ---------- слабые места: учёт и показ ---------- */
  var knownCache = null;
  function known() {
    var n = cards.length + (drillData.drills || []).length;
    if (knownCache && knownCache.n === n) return knownCache.map;
    var map = {};
    function add(s) { expand(String(s || '')).forEach(function (w) { map[w] = 1; }); }
    cards.forEach(function (c) { add(c.en); add(c.ex); add(c.text); add(c.answer); });
    (drillData.drills || []).forEach(function (d) { add(d.q); add(d.answer); (d.options || []).forEach(add); });
    knownCache = { n: n, map: map };
    return map;
  }
  function chName(ch) { return drillData.chapters && drillData.chapters[ch] ? drillData.chapters[ch] : ''; }

  function issueText(is) {
    if (is.t === 'rule') return '📐 Правило · гл. ' + is.ch + (chName(is.ch) ? ' «' + chName(is.ch) + '»' : '') + (is.note ? ': ' + is.note : '');
    if (is.t === 'spell') return '🔤 Написание слова: ' + is.got + ' → ' + is.want;
    if (is.note) return '📖 ' + is.note;
    if (is.got && is.want) return '📖 Другое слово: ' + is.got + ' → ' + is.want;
    return '📖 Слово: ' + (is.want || is.got);
  }
  function diagHTML(issues) {
    if (!issues || !issues.length) return '';
    var hasRule = issues.some(function (i) { return i.t === 'rule'; });
    var hasWord = issues.some(function (i) { return i.t !== 'rule'; });
    var head = hasRule && hasWord ? 'Ошибки и в правиле, и в слове' : hasRule ? 'Ошибка в правиле' : 'Ошибка в слове';
    return '<div class="diag"><div class="diag-h">' + head + '</div>' +
      issues.map(function (i) { return '<div class="diag-i">' + esc(issueText(i)) + '</div>'; }).join('') + '</div>';
  }

  function saveState() { saveJSON(LS.progress, state); }
  function noteIssues(issues) {
    noteIssuesTo(state.weak, issues, today());
    saveState();
  }
  function noteOk(key) {
    if (!key) return;
    noteOkTo(state.weak, key);
    saveState();
  }
  function wordIssue(card) {
    var en = card.en || card.answer;
    return { t: 'word', want: en, got: '', note: 'Слово: ' + en + (card.ru ? ' = ' + card.ru : '') };
  }

  /* ---------- тренажёры ---------- */
  var WORD_KINDS = [
    { kind: 'en2ru', icon: '🇬🇧', title: 'Выбери перевод', sub: 'слово по-английски → выбери русский перевод' },
    { kind: 'ru2en', icon: '🇷🇺', title: 'Выбери слово', sub: 'слово по-русски → выбери английское' },
    { kind: 'assemble', icon: '🔤', title: 'Собери слово или фразу', sub: 'из букв и слов по русской подсказке' },
    { kind: 'typeword', icon: '⌨️', title: 'Напиши слово', sub: 'русское слово → напиши по-английски (проверка написания)' },
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
    } else if (kind === 'typeword') {
      it.kind = 'type'; it.ru = c.ru; it.alts = c.alts || []; it.prompt = 'Напиши по-английски';
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

  // Сессия по слабым местам: самые проблемные правила (по главам) + самые проблемные слова
  function buildWeakItems() {
    var wl = weakList(state.weak), items = [];
    var rules = wl.filter(function (x) { return x.e.k === 'r'; }).slice(0, 3);
    var words = wl.filter(function (x) { return x.e.k === 'w'; }).slice(0, 5);
    var pool = wordPool();
    rules.forEach(function (x) {
      var list = (drillData.drills || []).filter(function (d) { return d.ch === x.e.ch && (d.cat || 'rule') === 'rule'; });
      pickWeighted(list, state.drills, 4).forEach(function (d) { items.push(drillItem(d)); });
    });
    words.forEach(function (x) {
      var w = x.e.w;
      var dl = (drillData.drills || []).filter(function (d) {
        return (d.cat === 'spell' || d.cat === 'word') && expand(d.answer).indexOf(w) !== -1;
      });
      var card = pool.filter(function (c) { return c.en.toLowerCase() === w; })[0] ||
        pool.filter(function (c) { return expand(c.en).indexOf(w) !== -1; })[0] ||
        pool.filter(function (c) { return stem(c.en.toLowerCase()) === stem(w); })[0];
      if (dl.length) items.push(drillItem(pickWeighted(dl, state.drills, 1)[0]));
      if (card) items.push(wordItem('typeword', card, pool));
    });
    return shuffle(items).slice(0, 14);
  }

  function startTraining(kind, ch) {
    var items = [], list;
    if (kind === 'weak') {
      items = buildWeakItems();
      if (!items.length) { toast(weakList(state.weak).length ? 'Для этих слабых мест пока нет упражнений' : 'Слабых мест пока нет 👍'); return; }
    } else if (kind === 'rules' || kind === 'mistakes' || kind === 'chapter') {
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

  function diagForItem(it, ok, given) {
    if (ok) return null;
    var d = it.d, issues = [];
    if (it.store === 'drills') {
      var cat = d.cat || 'rule';
      if (it.kind === 'choice') {
        issues = cat === 'rule' ? [{ t: 'rule', ch: d.ch, note: '', got: given, want: it.answer }]
          : [{ t: cat, got: given, want: it.answer }];
      } else if (given) {
        issues = diagnose(given, [it.answer].concat(it.alts || []), known()).issues;
      }
      if (!issues.length) issues = cat === 'rule' ? [{ t: 'rule', ch: d.ch, note: '', got: '', want: '' }] : [{ t: cat, got: '', want: it.answer }];
    } else {
      var c = it.card;
      if (it.kind === 'build' || it.kind === 'type') {
        if (given) issues = diagnose(given, [c.en].concat(c.alts || []), known()).issues;
      }
      if (!issues.length) issues = [wordIssue(c)];
    }
    return issues;
  }

  function finishItem(it, ok, given, idx) {
    it.result = { ok: ok, given: given, idx: idx };
    it.diag = diagForItem(it, ok, given);
    if (!it.counted) {
      if (!ok) noteIssues(it.diag);
      else noteOk(it.store === 'drills' ? ((it.d.cat || 'rule') === 'rule' ? 'r:' + it.d.ch : 'w:' + String(it.answer).toLowerCase())
        : 'w:' + it.card.en.toLowerCase());
    }
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
          if (okp) noteOk('w:' + p.en.toLowerCase()); else noteIssues([wordIssue(p)]);
          record({ id: p.id, store: 'train', card: p, origKind: 'en2ru', kind: 'choice', diag: okp ? null : [wordIssue(p)] }, okp);
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

  function weakPanelHTML() {
    var wl = weakList(state.weak);
    if (!wl.length) return '';
    var rules = wl.filter(function (x) { return x.e.k === 'r'; }).slice(0, 4);
    var words = wl.filter(function (x) { return x.e.k === 'w'; }).slice(0, 6);
    var h = '<div class="panel"><h2>🎯 Слабые места</h2><p class="muted small">Собрано из твоих ошибок. Каждый верный ответ уменьшает счёт.</p>';
    if (rules.length) {
      h += '<div class="small muted" style="margin:8px 0 4px">В правилах:</div>';
      rules.forEach(function (x) {
        var last = x.e.ex && x.e.ex.length ? x.e.ex[x.e.ex.length - 1] : null;
        h += '<div class="list-item"><div class="line"><div class="en">📐 Глава ' + x.e.ch + ' · ' + esc(chName(x.e.ch)) + '</div>' +
          '<span class="chip">ошибок: ' + x.e.bad + '</span></div>' +
          (last && (last.got || last.want) ? '<div class="small muted">' + esc(last.got || '—') + ' → ' + esc(last.want || '—') + '</div>' : '') + '</div>';
      });
    }
    if (words.length) {
      h += '<div class="small muted" style="margin:10px 0 4px">В словах:</div><div>';
      words.forEach(function (x) {
        h += '<span class="chip wchip">' + (x.e.ex && x.e.ex.length && x.e.ex[x.e.ex.length - 1].t === 'spell' ? '🔤 ' : '📖 ') + esc(x.e.w) + ' · ' + x.e.bad + '</span>';
      });
      h += '</div>';
    }
    h += '<button class="btn primary" style="margin-top:14px" data-act="tstart" data-kind="weak">Отработать слабые места</button></div>';
    return h;
  }

  function trainHTML() {
    var h = '<div class="topbar"><button class="icon-btn" data-act="home" aria-label="Назад">←</button>' +
      '<div style="flex:1"><h1>Тренажёры</h1><div class="muted small">Отдельно от карточек: прогресс карточек не меняется</div></div></div>';

    h += weakPanelHTML();
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
    if (!r.ok) h += diagHTML(it.diag);
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
          (it.diag ? it.diag.map(function (i) { return '<div class="small diag-i">' + esc(issueText(i)) + '</div>'; }).join('') : '') +
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
      case 'idk': session.step = 'result'; session.result = { status: 'skip', given: '', diag: { issues: [wordIssue(session.queue[0].card)] } }; render(); break;
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
