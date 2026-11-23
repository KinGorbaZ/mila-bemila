// Game rules, scoring and move generation. No DOM here: runs in the browser and in Node tests.

export const N = 15;
export const CENTER = 7 * N + 7;
export const RACK = 7;
export const ALL_TILES_BONUS = 50;

// ---- board bonuses: our own 8-way symmetric layout ----
// 0 plain, 1 double letter, 2 triple letter, 3 double word, 4 triple word
export const BONUS = (() => {
  const b = new Uint8Array(N * N);
  const seed = {
    4: [[0, 3]],
    3: [[1, 1], [2, 5], [4, 4], [7, 7]],
    2: [[0, 7], [2, 2], [5, 5], [1, 6]],
    1: [[0, 0], [1, 4], [3, 3], [3, 7], [6, 6], [5, 7]],
  };
  for (const [kind, cells] of Object.entries(seed)) {
    for (const [r, c] of cells) {
      for (const [a, d] of [[r, c], [c, r]]) {
        for (const rr of [a, N - 1 - a]) for (const cc of [d, N - 1 - d]) b[rr * N + cc] = +kind;
      }
    }
  }
  return b;
})();

// ---- dictionary ----
export class Dict {
  constructor(buffer, meta) {
    this.d = new Uint32Array(buffer);
    this.alphabet = [...meta.alphabet];
    this.size = this.alphabet.length;
    this.values = [0, ...meta.values]; // index 0 = blank
    this.counts = [meta.blanks, ...meta.counts];
    this.code = new Map(this.alphabet.map((ch, i) => [ch, i + 1]));
    this.allMask = (1 << (this.size + 1)) - 2;
    this.root = 1;
  }
  // edge for `letter` in the sibling run starting at `node`, or 0
  edge(node, letter) {
    if (!node) return 0;
    const d = this.d;
    for (let e = node; ; e++) {
      const v = d[e];
      if ((v & 0xff) === letter) return e;
      if (v & 0x200) return 0;
    }
  }
  has(codes) {
    let node = this.root, e = 0;
    for (const l of codes) {
      e = this.edge(node, l);
      if (!e) return false;
      node = this.d[e] >>> 10;
    }
    return e !== 0 && (this.d[e] & 0x100) !== 0;
  }
  encode(word) { return Array.from(word, ch => this.code.get(ch)); }
  decode(codes) { return Array.from(codes, c => this.alphabet[c - 1]).join(''); }
  countWords() {
    const memo = new Map();
    const count = node => {
      if (!node) return 0;
      if (memo.has(node)) return memo.get(node);
      let total = 0;
      for (let e = node; ; e++) {
        const v = this.d[e];
        if (v & 0x100) total++;
        total += count(v >>> 10);
        if (v & 0x200) break;
      }
      memo.set(node, total);
      return total;
    };
    return count(this.root);
  }
}

// ---- bag ----
export function makeBag(dict, size = 100, rnd = Math.random) {
  const full = dict.counts.reduce((a, b) => a + b, 0);
  const bag = [];
  dict.counts.forEach((n, letter) => {
    // shorter games use a proportionally smaller bag, but keep at least one of each letter
    const k = letter === 0 ? (size >= 80 ? n : 1) : Math.max(1, Math.round(n * size / full));
    for (let i = 0; i < k; i++) bag.push(letter);
  });
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

// ---- board ----
// letters[i]: 0 empty, else letter code. blank[i]: 1 when the tile is a joker (scores 0).
export function emptyBoard() {
  return { letters: new Uint8Array(N * N), blank: new Uint8Array(N * N) };
}

// placements: [{ pos, letter, blank }] -> { ok, score, words, error, bad }
export function evaluate(dict, board, placements) {
  if (!placements.length) return { ok: false, error: 'empty' };
  const L = board.letters;
  const placed = new Map();
  for (const p of placements) {
    if (L[p.pos] || placed.has(p.pos)) return { ok: false, error: 'occupied' };
    placed.set(p.pos, p);
  }
  const rows = new Set(placements.map(p => Math.floor(p.pos / N)));
  const cols = new Set(placements.map(p => p.pos % N));
  if (rows.size > 1 && cols.size > 1) return { ok: false, error: 'line' };

  const at = pos => placed.has(pos) ? placed.get(pos).letter : L[pos];
  const boardEmpty = !L.some(Boolean);

  // collects the whole word through `pos` along `step` (1 = across, N = down)
  const wordThrough = (pos, step) => {
    const inLine = (a, b) => step === N ? true : Math.floor(a / N) === Math.floor(b / N);
    let start = pos;
    while (start - step >= 0 && inLine(start - step, pos) && at(start - step)) start -= step;
    const cells = [];
    for (let q = start; q < N * N && inLine(q, pos) && at(q); q += step) cells.push(q);
    return cells;
  };
  const scoreWord = cells => {
    let sum = 0, mult = 1;
    for (const q of cells) {
      const p = placed.get(q);
      let v = p ? (p.blank ? 0 : dict.values[p.letter]) : (board.blank[q] ? 0 : dict.values[L[q]]);
      if (p) {
        const b = BONUS[q];
        if (b === 1) v *= 2; else if (b === 2) v *= 3; else if (b === 3) mult *= 2; else if (b === 4) mult *= 3;
      }
      sum += v;
    }
    return sum * mult;
  };

  // main direction: for a single tile pick whichever direction forms a word
  let step = rows.size === 1 ? 1 : N;
  if (placements.length === 1 && wordThrough(placements[0].pos, 1).length < 2) step = N;
  const main = wordThrough(placements[0].pos, step);
  for (const p of placements) if (!main.includes(p.pos)) return { ok: false, error: 'gap' };
  if (main.length < 2) return { ok: false, error: boardEmpty ? 'short' : 'connect' };

  const words = [main];
  const cross = step === 1 ? N : 1;
  for (const p of placements) {
    const w = wordThrough(p.pos, cross);
    if (w.length > 1) words.push(w);
  }
  if (boardEmpty) {
    if (!placed.has(CENTER)) return { ok: false, error: 'center' };
  } else {
    const touches = main.length > placements.length || words.length > 1;
    if (!touches) return { ok: false, error: 'connect' };
  }

  const texts = words.map(cells => cells.map(at));
  const bad = texts.filter(t => !dict.has(t)).map(t => dict.decode(t));
  if (bad.length) return { ok: false, error: 'word', bad };

  let score = words.reduce((s, w) => s + scoreWord(w), 0);
  if (placements.length === RACK) score += ALL_TILES_BONUS;
  return { ok: true, score, words: texts.map(t => dict.decode(t)) };
}

export function applyMove(board, placements) {
  for (const p of placements) {
    board.letters[p.pos] = p.letter;
    board.blank[p.pos] = p.blank ? 1 : 0;
  }
}

// ---- move generation (anchors + cross-checks over the word graph) ----
// rack: array of letter codes (0 = joker). Returns [{ placements, score, words }]
export function generateMoves(dict, board, rack) {
  const moves = [];
  const seen = new Set();
  const counts = new Uint8Array(dict.size + 1);
  for (const t of rack) counts[t]++;
  const d = dict.d;
  const boardEmpty = !board.letters.some(Boolean);

  for (const down of [false, true]) {
    const idx = down ? (r, c) => c * N + r : (r, c) => r * N + c;
    const get = (r, c) => board.letters[idx(r, c)];

    for (let r = 0; r < N; r++) {
      // cross-check mask + anchors for this line
      const mask = new Int32Array(N);
      const anchor = new Uint8Array(N);
      let any = false;
      for (let c = 0; c < N; c++) {
        if (get(r, c)) continue;
        let top = r; while (top > 0 && get(top - 1, c)) top--;
        let bot = r; while (bot < N - 1 && get(bot + 1, c)) bot++;
        if (top === r && bot === r) {
          mask[c] = dict.allMask;
        } else {
          let node = dict.root, ok = true;
          for (let q = top; q < r; q++) {
            const e = dict.edge(node, get(q, c));
            if (!e) { ok = false; break; }
            node = d[e] >>> 10;
          }
          if (ok && node) {
            for (let e = node; ; e++) {
              const v = d[e];
              let n2 = v >>> 10, fin = (v & 0x100) !== 0, good = true;
              for (let q = r + 1; q <= bot; q++) {
                const e2 = dict.edge(n2, get(q, c));
                if (!e2) { good = false; break; }
                fin = (d[e2] & 0x100) !== 0; n2 = d[e2] >>> 10;
              }
              if (good && fin) mask[c] |= 1 << (v & 0xff);
              if (v & 0x200) break;
            }
          }
        }
        const adjacent = top !== r || bot !== r || (c > 0 && get(r, c - 1)) || (c < N - 1 && get(r, c + 1));
        if (adjacent || (boardEmpty && idx(r, c) === CENTER)) { anchor[c] = 1; any = true; }
      }
      if (!any) continue;

      const placed = []; // {c, letter, blank}
      const record = () => {
        const placements = placed.map(p => ({ pos: idx(r, p.c), letter: p.letter, blank: p.blank }));
        const key = placements.map(p => p.pos * 64 + p.letter + (p.blank ? 32 : 0)).sort((a, b) => a - b).join(',');
        if (seen.has(key)) return;
        seen.add(key);
        const res = evaluate(dict, board, placements);
        if (res.ok) moves.push({ placements, score: res.score, words: res.words });
      };

      const extendRight = (node, c, eow, anchorCol) => {
        if (c < N && !get(r, c)) {
          if (eow && c > anchorCol && placed.length) record();
          if (!node) return;
          for (let e = node; ; e++) {
            const v = d[e], l = v & 0xff;
            if (mask[c] & (1 << l)) {
              const useBlank = counts[l] === 0;
              if (!useBlank || counts[0] > 0) {
                counts[useBlank ? 0 : l]--;
                placed.push({ c, letter: l, blank: useBlank });
                extendRight(v >>> 10, c + 1, (v & 0x100) !== 0, anchorCol);
                placed.pop();
                counts[useBlank ? 0 : l]++;
              }
            }
            if (v & 0x200) break;
          }
        } else if (c < N) {
          const e = dict.edge(node, get(r, c));
          if (e) extendRight(d[e] >>> 10, c + 1, (d[e] & 0x100) !== 0, anchorCol);
        } else if (eow && placed.length) {
          record();
        }
      };

      // builds every rack-only prefix of length <= limit that ends just left of the anchor
      const leftPart = (node, limit, anchorCol, len) => {
        extendRight(node, anchorCol, false, anchorCol);
        if (limit === 0 || !node) return;
        for (let e = node; ; e++) {
          const v = d[e], l = v & 0xff;
          const useBlank = counts[l] === 0;
          if ((!useBlank || counts[0] > 0) && (v >>> 10)) {
            counts[useBlank ? 0 : l]--;
            // shift the prefix one cell left and append
            for (const p of placed) p.c--;
            placed.push({ c: anchorCol - 1, letter: l, blank: useBlank });
            leftPart(v >>> 10, limit - 1, anchorCol, len + 1);
            placed.pop();
            for (const p of placed) p.c++;
            counts[useBlank ? 0 : l]++;
          }
          if (v & 0x200) break;
        }
      };

      for (let c = 0; c < N; c++) {
        if (!anchor[c]) continue;
        if (c > 0 && get(r, c - 1)) {
          let s = c - 1; while (s > 0 && get(r, s - 1)) s--;
          let node = dict.root, ok = true;
          for (let q = s; q < c; q++) {
            const e = dict.edge(node, get(r, q));
            if (!e) { ok = false; break; }
            node = d[e] >>> 10;
          }
          if (ok) extendRight(node, c, false, c);
        } else {
          let limit = 0;
          for (let q = c - 1; q >= 0 && !anchor[q] && !get(r, q); q--) limit++;
          leftPart(dict.root, Math.min(limit, rack.length - 1), c, 0);
        }
      }
    }
  }
  return moves;
}

// ---- opponent ----
// skill 0..1: how close to the best available score the opponent aims.
export function chooseMove(moves, skill, rnd = Math.random) {
  if (!moves.length) return null;
  let best = 0;
  for (const m of moves) if (m.score > best) best = m.score;
  const aim = Math.max(2, best * Math.min(1, Math.max(0.1, skill + (rnd() - 0.5) * 0.2)));
  let gap = Infinity;
  for (const m of moves) gap = Math.min(gap, Math.abs(m.score - aim));
  const pool = moves.filter(m => Math.abs(m.score - aim) <= gap + 1);
  return pool[Math.floor(rnd() * pool.length)];
}

export function rackValue(dict, rack) {
  return rack.reduce((s, t) => s + dict.values[t], 0);
}
