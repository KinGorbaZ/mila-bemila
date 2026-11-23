import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Dict, N, CENTER, BONUS, emptyBoard, evaluate, applyMove, generateMoves, chooseMove, makeBag } from '../js/engine.js';

const load = id => {
  const buf = fs.readFileSync(new URL(`../data/${id}.dawg`, import.meta.url));
  const meta = JSON.parse(fs.readFileSync(new URL(`../data/${id}.json`, import.meta.url), 'utf8'));
  return [new Dict(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), meta), meta];
};
const [he, heMeta] = load('he');
const [fr, frMeta] = load('fr');

// deterministic random
const rng = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

test('word graph holds exactly the words of the list', () => {
  assert.equal(he.countWords(), heMeta.words);
  assert.equal(fr.countWords(), frMeta.words);
});

test('known words are found, nonsense is not', () => {
  for (const w of ['שלומ', 'אימא', 'ילדימ', 'הולכת', 'ספר']) assert.ok(he.has(he.encode(w)), w);
  for (const w of ['שששש', 'קקא', 'ילדדד']) assert.ok(!he.has(he.encode(w)), w);
  for (const w of ['BONJOUR', 'MAISON', 'ETE', 'COEUR', 'MANGEAIENT']) assert.ok(fr.has(fr.encode(w)), w);
  for (const w of ['BONJOUUR', 'XQZ', 'MAISONN']) assert.ok(!fr.has(fr.encode(w)), w);
});

test('bonus layout is symmetric', () => {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const v = BONUS[r * N + c];
    assert.equal(BONUS[c * N + r], v);
    assert.equal(BONUS[(N - 1 - r) * N + c], v);
    assert.equal(BONUS[r * N + (N - 1 - c)], v);
  }
  assert.equal(BONUS[CENTER], 3);
});

const place = (dict, word, pos, step) => dict.encode(word).map((letter, i) => ({ pos: pos + i * step, letter, blank: false }));

test('first move must cover the centre and be a real word', () => {
  const b = emptyBoard();
  assert.equal(evaluate(fr, b, place(fr, 'MAISON', 0, 1)).error, 'center');
  assert.deepEqual(evaluate(fr, b, place(fr, 'MAISONN', CENTER - 3, 1)).bad, ['MAISONN']);
  const res = evaluate(fr, b, place(fr, 'MAISON', CENTER - 2, 1));
  assert.ok(res.ok);
  const sum = [...'MAISON'].reduce((s, ch) => s + fr.values[fr.code.get(ch)], 0);
  // row 7, cols 5..10: centre doubles the word, col 10 is not a bonus... compute from the layout
  let expect = 0, mult = 1;
  [...'MAISON'].forEach((ch, i) => {
    let v = fr.values[fr.code.get(ch)];
    const bo = BONUS[CENTER - 2 + i];
    if (bo === 1) v *= 2; if (bo === 2) v *= 3; if (bo === 3) mult *= 2; if (bo === 4) mult *= 3;
    expect += v;
  });
  assert.equal(res.score, expect * mult);
  assert.ok(res.score >= sum * 2);
});

test('later moves must connect, be in one line, and count cross words', () => {
  const b = emptyBoard();
  applyMove(b, place(fr, 'MAISON', CENTER - 2, 1));
  assert.equal(evaluate(fr, b, place(fr, 'ETE', 0, 1)).error, 'connect');
  assert.equal(evaluate(fr, b, [{ pos: 0, letter: 1, blank: false }, { pos: N + 1, letter: 1, blank: false }]).error, 'line');
  // "AMI" downward through the M of MAISON
  const mPos = CENTER - 2;
  const res = evaluate(fr, b, [
    { pos: mPos - N, letter: fr.code.get('A'), blank: false },
    { pos: mPos + N, letter: fr.code.get('I'), blank: false },
  ]);
  assert.ok(res.ok, JSON.stringify(res));
  assert.deepEqual(res.words, ['AMI']);
  // a joker scores nothing
  const joker = evaluate(fr, b, [
    { pos: mPos - N, letter: fr.code.get('A'), blank: true },
    { pos: mPos + N, letter: fr.code.get('I'), blank: true },
  ]);
  assert.ok(joker.score < res.score);
});

test('generated moves are all legal, and include the obvious ones', () => {
  for (const [dict, rackWord] of [[fr, 'MAISONS'], [he, 'תלמידימ']]) {
    const b = emptyBoard();
    const rack = dict.encode(rackWord);
    const first = generateMoves(dict, b, rack);
    assert.ok(first.length > 20, 'first-move count ' + first.length);
    assert.ok(first.some(m => m.placements.length === 7), 'finds the 7-tile play');
    for (const m of first) {
      const res = evaluate(dict, b, m.placements);
      assert.ok(res.ok && res.score === m.score);
      assert.ok(m.placements.some(p => p.pos === CENTER));
    }
  }
});

test('full self-played games stay legal and finish', () => {
  for (const [dict, seed] of [[fr, 7], [he, 11]]) {
    const rnd = rng(seed);
    const bag = makeBag(dict, 100, rnd);
    assert.equal(bag.length, 100);
    const b = emptyBoard();
    const racks = [bag.splice(0, 7), bag.splice(0, 7)];
    let turn = 0, idle = 0, plays = 0, jokerPlays = 0;
    while (idle < 4 && racks[0].length && racks[1].length) {
      const moves = generateMoves(dict, b, racks[turn]);
      const m = chooseMove(moves, 0.9, rnd);
      if (!m) { idle++; turn ^= 1; continue; }
      const res = evaluate(dict, b, m.placements);
      assert.ok(res.ok, 'illegal generated move');
      for (const p of m.placements) {
        const i = racks[turn].indexOf(p.blank ? 0 : p.letter);
        assert.ok(i >= 0, 'tile not in rack');
        racks[turn].splice(i, 1);
        if (p.blank) jokerPlays++;
      }
      applyMove(b, m.placements);
      racks[turn].push(...bag.splice(0, 7 - racks[turn].length));
      idle = 0; plays++; turn ^= 1;
    }
    assert.ok(plays > 15, 'game too short: ' + plays);
    assert.ok(b.letters.filter(Boolean).length > 60);
  }
});

test('weaker opponents score less than stronger ones', () => {
  const b = emptyBoard();
  applyMove(b, place(fr, 'MAISON', CENTER - 2, 1));
  const moves = generateMoves(fr, b, fr.encode('TRAINES'));
  const avg = skill => {
    const rnd = rng(3); let s = 0;
    for (let i = 0; i < 200; i++) s += chooseMove(moves, skill, rnd).score;
    return s / 200;
  };
  assert.ok(avg(0.25) < avg(0.6) && avg(0.6) < avg(1));
});
