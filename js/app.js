import { Dict, N, CENTER, RACK, BONUS, emptyBoard, evaluate, applyMove, generateMoves, chooseMove, makeBag, rackValue } from './engine.js?v=7';
import { STAGES, PER_TIER, stage, starsFor, TEXT, pretty } from './content.js?v=7';

const VERSION = 7;

const $ = sel => document.querySelector(sel);
// Visible text is drawn by CSS from data-t instead of living in the page as text,
// so a browser's automatic page translation has nothing to rewrite.
const txt = (e, s) => { e.dataset.t = s; return e; };
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) txt(e, text);
  return e;
};
const store = {
  get(k, fallback) { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: play without saving */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* same */ } },
};

let lang = store.get('mbm.lang', (navigator.language || '').startsWith('fr') ? 'fr' : 'he');
let T = TEXT[lang];
const dicts = {};
const commons = {};      // everyday words only: what the opponent and the hints play

// The full dictionary accepts rare inflections; the computer should not play them.
// Keep moves made of everyday words, relaxing only if nothing else is possible.
function everydayMoves(moves) {
  const c = commons[lang];
  const known = w => c.has(c.encode(w));
  const strict = moves.filter(m => m.words.every(known));
  if (strict.length) return strict;
  const loose = moves.filter(m => m.words.every(w => w.length < 3 || known(w)));
  return loose.length ? loose : moves;
}
let dict = null;
let game = null;          // saved state of the current game
let pending = [];         // tiles laid this turn: { idx (in rack), pos, letter, blank }
let selected = -1;        // rack index picked by tap
let busy = false;
let playerName = store.get('mbm.name', '');
const me = () => playerName || T.you;
const opponent = i => T.opponents[i % T.opponents.length];

// ---------- install as an app ----------
let installEvent = null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function fillInstall(box) {
  box.replaceChildren();
  if (standalone()) return;
  if (installEvent) {
    const b = el('button', '', T.install);
    b.onclick = async () => {
      const ev = installEvent;
      ev.prompt();
      await ev.userChoice;
      installEvent = null;
      fillInstall(box);
    };
    box.append(b);
  } else {
    box.append(el('p', '', /iphone|ipad|ipod/i.test(navigator.userAgent) ? T.installIos : T.installAndroid));
  }
}
function installRow() {
  const box = el('div', 'install');
  box.id = 'install';
  fillInstall(box);
  return box;
}
const refreshInstall = () => { const b = $('#install'); if (b) fillInstall(b); };
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; refreshInstall(); });
window.addEventListener('appinstalled', () => { installEvent = null; refreshInstall(); });

const progress = () => store.get('mbm.stars.' + lang, []);
const savedGame = () => store.get('mbm.game.' + lang, null);

async function loadDict(id) {
  if (!dicts[id]) {
    const [buf, meta, everyday] = await Promise.all([
      fetch(`data/${id}.dawg?v=${VERSION}`).then(r => r.arrayBuffer()),
      fetch(`data/${id}.json?v=${VERSION}`).then(r => r.json()),
      fetch(`data/${id}.common.dawg?v=${VERSION}`).then(r => r.arrayBuffer()),
    ]);
    dicts[id] = new Dict(buf, meta);
    commons[id] = new Dict(everyday, meta);
  }
  return dicts[id];
}

// ---------- home ----------
function tile(letter, value, cls = '') {
  const t = el('span', 'tile ' + cls);
  t.append(el('b', '', letter));
  if (value) t.append(el('i', '', value));
  return t;
}

function openHome(cls) {
  document.documentElement.lang = lang;
  document.documentElement.dir = T.dir;
  $('#game').hidden = true;
  const home = $('#home');
  home.hidden = false;
  home.className = cls;
  home.replaceChildren();
  const head = el('header', 'hero');
  const word = el('h1', 'hero-word');
  word.setAttribute('aria-label', T.title);
  for (const ch of T.title) word.append(ch === ' ' ? el('span', 'gap') : tile(ch, ''));
  head.append(word, el('p', 'tagline', T.tagline));
  home.append(head);
  return [home, head];
}

function langSwitch(then) {
  const sw = el('button', 'lang-switch', T.switchTo);
  sw.lang = lang === 'he' ? 'fr' : 'he';
  sw.onclick = () => { lang = lang === 'he' ? 'fr' : 'he'; T = TEXT[lang]; store.set('mbm.lang', lang); then(); };
  return sw;
}

function renderWelcome() {
  const [home, head] = openHome('welcome');
  head.append(langSwitch(renderWelcome));
  const form = el('form', 'name-form');
  const label = el('label', '', T.welcomeAsk);
  label.htmlFor = 'name';
  const input = el('input');
  input.id = 'name'; input.type = 'text'; input.maxLength = 14; input.autocomplete = 'given-name';
  input.placeholder = T.namePlaceholder; input.value = playerName;
  const go = el('button', 'start', T.start);
  go.type = 'submit';
  form.onsubmit = e => {
    e.preventDefault();
    playerName = input.value.trim();
    store.set('mbm.name', playerName);
    store.set('mbm.welcomed', true);
    store.set('mbm.lang', lang);
    renderHome();
  };
  form.append(label, input, go);
  home.append(form, installRow(), el('p', 'credits', 'v' + VERSION));
  window.scrollTo(0, 0);
}

function renderHome() {
  const [home, head] = openHome('');
  head.append(langSwitch(renderHome));
  const hello = el('div', 'hello');
  hello.append(el('span', '', T.hello(me())));
  const change = el('button', '', T.changeName);
  change.onclick = renderWelcome;
  hello.append(change);
  home.append(hello, installRow());

  const stars = progress();
  const saved = savedGame();
  if (saved && !saved.over) {
    const b = el('button', 'resume', T.resume(saved.stage + 1));
    b.onclick = () => startStage(saved.stage, true);
    home.append(b);
  }

  for (let t = 0; t < STAGES / PER_TIER; t++) {
    const sec = el('section', 'tier tier-' + t);
    sec.append(el('h2', '', T.tiers[t]), el('p', 'tier-note', T.tierNote(stage(t * PER_TIER).bag)));
    const grid = el('div', 'stages');
    for (let i = t * PER_TIER; i < (t + 1) * PER_TIER; i++) {
      const open = i === 0 || stars[i - 1] > 0;
      const b = el('button', 'stage' + (open ? '' : ' locked') + (stars[i] ? ' won' : '') + (open && !stars[i] ? ' current' : ''));
      b.append(el('span', 'num', i + 1), el('span', 'who', opponent(i)));
      const st = el('span', 'stars');
      st.setAttribute('aria-label', `${stars[i] || 0}/3`);
      for (let s = 0; s < 3; s++) st.append(el('span', s < (stars[i] || 0) ? 'on' : '', '★'));
      b.append(st);
      if (open) b.onclick = () => startStage(i, false);
      else { b.setAttribute('aria-disabled', 'true'); b.onclick = () => toast(T.locked); }
      grid.append(b);
    }
    sec.append(grid);
    home.append(sec);
  }
  home.append(el('p', 'credits', T.credits + ' v' + VERSION));
  const cur = home.querySelector('.stage.current');
  if (cur && stars.some(Boolean)) cur.scrollIntoView({ block: 'center' }); else window.scrollTo(0, 0);
}

// ---------- game state ----------
function newGame(i) {
  const s = stage(i);
  const bag = makeBag(dict, s.bag);
  const board = emptyBoard();
  return {
    stage: i,
    letters: Array.from(board.letters), blank: Array.from(board.blank),
    bag, racks: [bag.splice(0, RACK), bag.splice(0, RACK)],
    scores: [0, 0], turn: 0, idle: 0, hints: s.hints, over: false,
    last: [], log: [], msg: '',
  };
}
const boardOf = g => ({ letters: Uint8Array.from(g.letters), blank: Uint8Array.from(g.blank) });
const save = () => store.set('mbm.game.' + lang, game);

async function startStage(i, resume) {
  toast(T.loading, true);
  dict = await loadDict(lang);
  hideToast();
  const saved = savedGame();
  game = resume && saved && saved.stage === i && !saved.over ? saved : newGame(i);
  pending = []; selected = -1; busy = false;
  $('#home').hidden = true;
  $('#game').hidden = false;
  if (!game.msg) game.msg = T.yourTurn;
  save();
  renderGame();
  window.scrollTo(0, 0);
  if (game.turn === 1 && !game.over) opponentTurn();
}

const oppName = () => opponent(game.stage);
const letterOf = code => dict.alphabet[code - 1];

function commit(who, placements, res) {
  const g = game;
  const board = boardOf(g);
  applyMove(board, placements);
  g.letters = Array.from(board.letters); g.blank = Array.from(board.blank);
  const rack = g.racks[who];
  for (const p of placements) rack.splice(rack.indexOf(p.blank ? 0 : p.letter), 1);
  rack.push(...g.bag.splice(0, RACK - rack.length));
  g.scores[who] += res.score;
  g.idle = 0;
  g.last = placements.map(p => p.pos);
  const words = res.words.map(w => pretty(lang, w));
  g.log.push({ who, words, score: res.score });
  g.msg = who === 0 ? T.youPlayed(words.join(', '), res.score) : T.played(oppName(), words.join(', '), res.score);
  if (!rack.length && !g.bag.length) return finish(who);
  g.turn = 1 - who;
}

function idleTurn(who, msg) {
  game.idle++;
  game.msg = msg;
  game.last = [];
  if (game.idle >= 4) return finish(-1);
  game.turn = 1 - who;
}

function finish(wentOut) {
  const g = game;
  const left = g.racks.map(r => rackValue(dict, r));
  if (wentOut >= 0) { g.scores[wentOut] += left[1 - wentOut]; g.scores[1 - wentOut] -= left[1 - wentOut]; }
  else { g.scores[0] -= left[0]; g.scores[1] -= left[1]; }
  g.over = true;
  g.stars = starsFor(g.scores[0] - g.scores[1]);
  const stars = progress();
  if (g.stars > (stars[g.stage] || 0)) { stars[g.stage] = g.stars; store.set('mbm.stars.' + lang, stars); }
}

// ---------- rendering ----------
function renderGame() {
  const g = game;
  const board = $('#board');
  board.dir = T.dir;
  board.replaceChildren();
  const pend = new Map(pending.map(p => [p.pos, p]));
  for (let pos = 0; pos < N * N; pos++) {
    const c = el('div', 'cell b' + BONUS[pos]);
    c.dataset.pos = pos;
    const p = pend.get(pos);
    if (g.letters[pos]) {
      const isBlank = g.blank[pos];
      c.append(tile(letterOf(g.letters[pos]), isBlank ? '' : dict.values[g.letters[pos]],
        (isBlank ? 'joker ' : '') + (g.last.includes(pos) ? 'fresh' : '')));
    } else if (p) {
      const t = tile(letterOf(p.letter), p.blank ? '' : dict.values[p.letter], 'pending' + (p.blank ? ' joker' : ''));
      t.dataset.idx = p.idx;
      c.append(t);
    } else if (pos === CENTER) {
      c.append(el('span', 'mark star', '★'));
    } else if (BONUS[pos]) {
      c.append(el('span', 'mark', T.bonusShort[BONUS[pos]]));
    }
    board.append(c);
  }

  txt($('#you-name'), me());
  txt($('#opp-name'), oppName());
  txt($('#you-score'), g.scores[0]);
  txt($('#opp-score'), g.scores[1]);
  $('#you').classList.toggle('turn', g.turn === 0 && !g.over);
  $('#opp').classList.toggle('turn', g.turn === 1 && !g.over);
  txt($('#bag'), T.bag(g.bag.length));
  txt($('#stage-no'), g.stage + 1);
  $('#back').setAttribute('aria-label', T.back);
  txt($('#msg'), g.msg);

  const rack = $('#rack');
  rack.replaceChildren();
  const used = new Set(pending.map(p => p.idx));
  g.racks[0].forEach((code, idx) => {
    if (used.has(idx)) { rack.append(el('span', 'slot')); return; }
    const t = tile(code ? letterOf(code) : '', code ? dict.values[code] : '', 'rack-tile' + (code ? '' : ' joker') + (idx === selected ? ' selected' : ''));
    t.dataset.idx = idx;
    rack.append(t);
  });

  const res = pending.length ? evaluate(dict, boardOf(g), pending) : null;
  const mine = g.turn === 0 && !g.over && !busy;
  const set = (id, label, on) => { const b = $(id); txt(b, label); b.disabled = !on; };
  set('#play', res && res.ok ? T.playScore(res.score) : T.play, mine && pending.length > 0);
  $('#play').classList.toggle('ready', !!(res && res.ok));
  set('#recall', T.recall, mine && pending.length > 0);
  set('#shuffle', T.shuffle, mine);
  set('#swap', T.swap, mine);
  set('#pass', T.pass, mine);
  set('#hint', T.hint(g.hints), mine);
  txt($('#words'), T.wordsBtn);
  $('#legend').replaceChildren(...[1, 2, 3, 4].map(k => {
    const s = el('span', 'key b' + k);
    s.append(el('span', 'sw'), el('span', '', T.bonus[k]));
    return s;
  }));

  if (g.over) showResult();
}

// ---------- player actions ----------
function placeTile(idx, pos) {
  if (game.turn !== 0 || game.over || busy) return;
  if (game.letters[pos]) return;
  const existing = pending.find(p => p.pos === pos);
  if (existing && existing.idx !== idx) return;
  const code = game.racks[0][idx];
  const done = (letter, blank) => {
    pending = pending.filter(p => p.idx !== idx);
    pending.push({ idx, pos, letter, blank });
    selected = -1;
    renderGame();
  };
  const moving = pending.find(p => p.idx === idx);
  if (code === 0 && !moving) pickLetter(letter => done(letter, true));
  else if (code === 0) done(moving.letter, true);
  else done(code, false);
}

function unplace(idx) {
  pending = pending.filter(p => p.idx !== idx);
  renderGame();
}

function play() {
  const res = evaluate(dict, boardOf(game), pending);
  if (!res.ok) {
    toast(res.error === 'word' ? T.err.word(res.bad.map(w => pretty(lang, w)).join(', ')) : T.err[res.error]);
    return;
  }
  commit(0, pending.map(({ pos, letter, blank }) => ({ pos, letter, blank })), res);
  pending = []; selected = -1;
  afterPlayerTurn();
}

function afterPlayerTurn() {
  save();
  renderGame();
  if (!game.over && game.turn === 1) opponentTurn();
}

function opponentTurn() {
  busy = true;
  txt($('#msg'), T.thinking(oppName()));
  renderGame();
  txt($('#msg'), T.thinking(oppName()));
  setTimeout(() => {
    const moves = everydayMoves(generateMoves(dict, boardOf(game), game.racks[1]));
    const m = chooseMove(moves, stage(game.stage).skill);
    if (m) {
      commit(1, m.placements, m);
    } else if (game.bag.length >= RACK) {
      const rack = game.racks[1];
      game.bag.push(...rack.splice(0, rack.length));
      shuffleArray(game.bag);
      rack.push(...game.bag.splice(0, RACK));
      idleTurn(1, T.swapped(oppName()));
    } else {
      idleTurn(1, T.passed(oppName()));
    }
    busy = false;
    save();
    renderGame();
  }, 900);
}

function shuffleArray(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

function hint() {
  if (game.hints <= 0) return toast(T.noHints);
  const moves = everydayMoves(generateMoves(dict, boardOf(game), game.racks[0]));
  const m = chooseMove(moves, 0.9);
  if (!m) return toast(T.noMove);
  game.hints--;
  save();
  const rack = game.racks[0].slice();
  pending = m.placements.map(p => {
    const idx = rack.indexOf(p.blank ? 0 : p.letter);
    rack[idx] = -1;
    return { idx, pos: p.pos, letter: p.letter, blank: p.blank };
  });
  selected = -1;
  renderGame();
}

// ---------- dialogs ----------
function dialog(title, body, buttons) {
  const d = $('#dialog');
  d.className = '';
  d.replaceChildren();
  if (title) d.append(el('h2', '', title));
  if (body) d.append(body);
  const row = el('div', 'dialog-actions');
  for (const [label, fn, cls] of buttons) {
    const b = el('button', cls || '', label);
    b.onclick = () => { d.close(); fn && fn(); };
    row.append(b);
  }
  d.append(row);
  d.showModal();
  return d;
}

function pickLetter(cb) {
  const grid = el('div', 'letters');
  const d = dialog(T.jokerTitle, grid, [[T.cancel, null]]);
  dict.alphabet.forEach((ch, i) => {
    const b = el('button', 'tile', '');
    b.append(el('b', '', ch));
    b.onclick = () => { d.close(); cb(i + 1); };
    grid.append(b);
  });
}

function swapDialog() {
  if (game.bag.length < RACK) return toast(T.swapFew);
  pending = []; selected = -1; renderGame();
  const chosen = new Set();
  const grid = el('div', 'letters swap');
  game.racks[0].forEach((code, idx) => {
    const b = el('button', 'tile' + (code ? '' : ' joker'), '');
    b.append(el('b', '', code ? letterOf(code) : ''));
    if (code) b.append(el('i', '', dict.values[code]));
    b.onclick = () => { chosen.has(idx) ? chosen.delete(idx) : chosen.add(idx); b.classList.toggle('selected'); };
    grid.append(b);
  });
  dialog(T.swapTitle, grid, [[T.cancel, null], [T.swapDo, () => {
    if (!chosen.size) return;
    const rack = game.racks[0];
    const out = [...chosen].sort((a, b) => b - a).map(i => rack.splice(i, 1)[0]);
    rack.push(...game.bag.splice(0, out.length));
    game.bag.push(...out);
    shuffleArray(game.bag);
    idleTurn(0, T.yourTurn);
    afterPlayerTurn();
  }, 'primary']]);
}

function wordsDialog() {
  const list = el('ul', 'wordlog');
  for (const entry of game.log) {
    const li = el('li', entry.who ? 'theirs' : 'mine');
    li.append(el('span', 'who', entry.who ? oppName() : me()));
    const ws = el('span', 'ws');
    for (const w of entry.words) {
      const a = el('a', '', w);
      a.href = T.lookupUrl(w); a.target = '_blank'; a.rel = 'noopener'; a.title = T.lookup;
      ws.append(a);
    }
    li.append(ws, el('span', 'pts', entry.score));
    list.append(li);
  }
  dialog(T.wordsTitle, list, [[T.close, null]]);
}

function showResult() {
  if ($('#dialog').open) return;
  const g = game;
  const diff = g.scores[0] - g.scores[1];
  const body = el('div', 'result');
  const st = el('div', 'stars big');
  for (let s = 0; s < 3; s++) st.append(el('span', s < g.stars ? 'on' : '', '★'));
  body.append(st, el('p', '', T.finalScore(me(), g.scores[0], oppName(), g.scores[1])));
  const buttons = [[T.toStages, () => { store.del('mbm.game.' + lang); renderHome(); }]];
  buttons.push([T.again, () => startStage(g.stage, false)]);
  if (diff > 0 && g.stage < STAGES - 1) buttons.push([T.next, () => startStage(g.stage + 1, false), 'primary']);
  const d = dialog(diff > 0 ? T.win : diff < 0 ? T.lose : T.tie, body, buttons);
  d.classList.toggle('won', diff > 0);
  d.addEventListener('cancel', e => e.preventDefault(), { once: true });
}

let toastTimer;
function toast(text, sticky) {
  const t = $('#toast');
  txt(t, text);
  t.classList.add('show');
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(hideToast, 2600);
}
function hideToast() { $('#toast').classList.remove('show'); }

// ---------- pointer input: tap or drag ----------
let drag = null;
const LIFT = 52; // px the dragged tile floats above the finger, so the finger does not hide it
const cellUnder = e => {
  const under = document.elementFromPoint(e.clientX, e.clientY - LIFT);
  return under && under.closest('.cell');
};
const markTarget = cell => {
  document.querySelectorAll('.cell.target').forEach(c => c.classList.remove('target'));
  if (cell && !cell.querySelector('.tile')) cell.classList.add('target');
};
document.addEventListener('pointerdown', e => {
  const t = e.target.closest('.rack-tile, .tile.pending');
  if (!t || !$('#game').contains(t) || busy || game.turn !== 0 || game.over) return;
  drag = { idx: +t.dataset.idx, x: e.clientX, y: e.clientY, src: t, ghost: null, fromBoard: t.classList.contains('pending') };
});
document.addEventListener('pointermove', e => {
  if (!drag) return;
  if (!drag.ghost) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
    drag.ghost = drag.src.cloneNode(true);
    drag.ghost.classList.add('ghost');
    drag.ghost.classList.remove('selected');
    document.body.append(drag.ghost);
    drag.src.classList.add('lifted');
  }
  drag.ghost.style.left = e.clientX + 'px';
  drag.ghost.style.top = e.clientY - LIFT + 'px';
  markTarget(cellUnder(e));
});
const endDrag = e => {
  if (!drag) return;
  const d = drag; drag = null;
  if (!d.ghost) return; // a tap: handled by click
  d.ghost.remove();
  d.src.classList.remove('lifted');
  suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
  markTarget(null);
  const cell = cellUnder(e);
  if (cell) placeTile(d.idx, +cell.dataset.pos);
  else if (d.fromBoard) unplace(d.idx);
  else renderGame();
};
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', () => { if (drag && drag.ghost) drag.ghost.remove(); drag = null; markTarget(null); if (game) renderGame(); });

let suppressClick = false;
$('#game').addEventListener('click', e => {
  if (suppressClick || busy || !game || game.over || game.turn !== 0) return;
  const rackTile = e.target.closest('.rack-tile');
  if (rackTile) { const i = +rackTile.dataset.idx; selected = selected === i ? -1 : i; return renderGame(); }
  const pend = e.target.closest('.tile.pending');
  if (pend) return unplace(+pend.dataset.idx);
  const cell = e.target.closest('.cell');
  if (cell && selected >= 0) placeTile(selected, +cell.dataset.pos);
});

$('#play').onclick = play;
$('#recall').onclick = () => { pending = []; selected = -1; renderGame(); };
$('#shuffle').onclick = () => {
  // keep laid tiles pointing at the same letters after the reorder
  const rack = game.racks[0];
  const order = rack.map((_, i) => i); shuffleArray(order);
  game.racks[0] = order.map(i => rack[i]);
  pending = pending.map(p => ({ ...p, idx: order.indexOf(p.idx) }));
  selected = -1; save(); renderGame();
};
$('#swap').onclick = swapDialog;
$('#pass').onclick = () => dialog(T.passAsk, null, [[T.cancel, null], [T.passDo, () => {
  pending = []; selected = -1; idleTurn(0, T.yourTurn); afterPlayerTurn();
}, 'primary']]);
$('#hint').onclick = hint;
$('#words').onclick = wordsDialog;
$('#back').onclick = () => { toast(T.quitAsk); renderHome(); };

if (store.get('mbm.welcomed', false)) renderHome(); else renderWelcome();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  // when a new version takes over, reload once so the page is never stuck on old files
  const had = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (had && !reloaded) { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js').then(reg => reg.update()).catch(() => {});
}
