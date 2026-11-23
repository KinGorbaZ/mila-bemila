// Builds compact word graphs (DAWG) + tile sets from the raw open word lists.
// Usage: node tools/build-dict.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const raw = path.join(here, 'raw');
const out = path.join(here, '..', 'data');
fs.mkdirSync(out, { recursive: true });

const MIN = 2, MAX = 15;

const finals = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const normHe = w => w.replace(/[ךםןףץ]/g, ch => finals[ch]);
const normFr = w => w.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

// Everyday words: dictionary words that people actually use, by how often they occur in
// film subtitles (FrequencyWords, CC-BY-SA 4.0). The opponent and the hints play only these.
function commonWords(file, norm, words, minCount) {
  const dictSet = new Set(words);
  const count = new Map();
  for (const line of fs.readFileSync(path.join(raw, file), 'utf8').split(/\r?\n/)) {
    const sp = line.lastIndexOf(' ');
    if (sp < 0) continue;
    const w = norm(line.slice(0, sp));
    if (dictSet.has(w)) count.set(w, (count.get(w) || 0) + +line.slice(sp + 1));
  }
  return [...count].filter(([, n]) => n >= minCount).map(([w]) => w);
}

function hebrewWords() {
  const lines = fs.readFileSync(path.join(raw, 'he_IL.dic'), 'utf8').split(/\r?\n/);
  const set = new Set();
  for (const line of lines) {
    const i = line.indexOf('/');
    if (i < 0) continue; // unflagged entries are prefix particles, not words
    const w = normHe(line.slice(0, i));
    if (w.length < MIN || w.length > MAX) continue;
    if (!/^[א-ת]+$/.test(w)) continue;
    set.add(w);
  }
  return [...set];
}

function frenchWords() {
  const list = JSON.parse(fs.readFileSync(path.join(raw, 'package', 'index.json'), 'utf8'));
  const set = new Set();
  for (let w of list) {
    w = normFr(w);
    if (w.length < MIN || w.length > MAX) continue;
    if (!/^[A-Z]+$/.test(w)) continue;
    set.add(w);
  }
  return [...set];
}

// ---- minimal DAWG (Daciuk et al., sorted insertion) ----
function buildDawg(words, alphabet) {
  const code = new Map([...alphabet].map((ch, i) => [ch, i + 1]));
  const enc = words.map(w => Uint8Array.from(w, ch => code.get(ch)));
  enc.sort((a, b) => {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
  });

  let nextId = 0;
  const newNode = () => ({ id: nextId++, final: false, keys: [], kids: [] });
  const root = newNode();
  const register = new Map();
  const sig = n => (n.final ? '1' : '0') + n.keys.map((k, i) => k + ':' + n.kids[i].id).join(',');

  function replaceOrRegister(node) {
    const last = node.kids.length - 1;
    const child = node.kids[last];
    if (child.kids.length) replaceOrRegister(child);
    const s = sig(child);
    const found = register.get(s);
    if (found) node.kids[last] = found; else register.set(s, child);
  }

  let prev = new Uint8Array(0);
  for (const w of enc) {
    let i = 0;
    const n = Math.min(w.length, prev.length);
    while (i < n && w[i] === prev[i]) i++;
    let node = root;
    for (let j = 0; j < i; j++) node = node.kids[node.keys.indexOf(w[j])];
    if (node.kids.length) replaceOrRegister(node);
    for (let j = i; j < w.length; j++) {
      const k = newNode();
      node.keys.push(w[j]); node.kids.push(k);
      node = k;
    }
    node.final = true;
    prev = w;
  }
  if (root.kids.length) replaceOrRegister(root);

  // serialize: each node = run of edges; edge = next<<10 | last<<9 | eow<<8 | letter
  const offset = new Map();
  const order = [];
  let total = 1; // edge 0 is a dummy so that next=0 means "no children"
  (function visit(n) {
    if (offset.has(n) || !n.kids.length) return;
    offset.set(n, total); order.push(n); total += n.kids.length;
    for (const k of n.kids) visit(k);
  })(root);
  if (total >= 1 << 22) throw new Error('too many edges');
  const data = new Uint32Array(total);
  for (const n of order) {
    let p = offset.get(n);
    n.kids.forEach((k, i) => {
      const next = k.kids.length ? offset.get(k) : 0;
      data[p++] = ((next << 10) | (i === n.kids.length - 1 ? 0x200 : 0) | (k.final ? 0x100 : 0) | n.keys[i]) >>> 0;
    });
  }
  return data;
}

// ---- tile set derived from how often each letter occurs in the word list ----
function tileSet(words, alphabet, tiles = 98) {
  const freq = new Map([...alphabet].map(ch => [ch, 0]));
  let sum = 0;
  for (const w of words) for (const ch of w) { freq.set(ch, freq.get(ch) + 1); sum++; }
  const f = [...alphabet].map(ch => freq.get(ch) / sum);
  const counts = f.map(x => Math.max(1, Math.round(x * tiles)));
  // nudge the most common letters until the total is exact
  const byFreq = f.map((x, i) => i).sort((a, b) => f[b] - f[a]);
  let diff = tiles - counts.reduce((a, b) => a + b, 0), i = 0;
  while (diff !== 0) {
    const k = byFreq[i++ % byFreq.length];
    if (diff > 0) { counts[k]++; diff--; } else if (counts[k] > 1) { counts[k]--; diff++; }
  }
  const values = f.map(x => x >= 0.06 ? 1 : x >= 0.04 ? 2 : x >= 0.025 ? 3 : x >= 0.015 ? 4 : x >= 0.01 ? 5 : x >= 0.005 ? 8 : 10);
  return { counts, values };
}

const langs = {
  he: { alphabet: 'אבגדהוזחטיכלמנסעפצקרשת', words: hebrewWords(), freq: 'he_full.txt', norm: normHe },
  fr: { alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', words: frenchWords(), freq: 'fr_full.txt', norm: normFr },
};

const MIN_COUNT = +(process.env.MIN_COUNT || 8);
for (const [id, { alphabet, words, freq, norm }] of Object.entries(langs)) {
  const common = commonWords(freq, norm, words, MIN_COUNT);
  const cd = buildDawg(common, alphabet);
  fs.writeFileSync(path.join(out, `${id}.common.dawg`), Buffer.from(cd.buffer));
  console.log(id, 'common words', common.length, 'bytes', cd.byteLength, 'sample', common.slice(-8).join(' '));
  const dawg = buildDawg(words, alphabet);
  fs.writeFileSync(path.join(out, `${id}.dawg`), Buffer.from(dawg.buffer));
  const meta = { alphabet, blanks: 2, words: words.length, ...tileSet(words, alphabet) };
  fs.writeFileSync(path.join(out, `${id}.json`), JSON.stringify(meta));
  console.log(id, 'words', words.length, 'edges', dawg.length, 'bytes', dawg.byteLength);
  console.log(' ', [...alphabet].map((ch, i) => `${ch}${meta.counts[i]}/${meta.values[i]}`).join(' '));
}
