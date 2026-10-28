// Line Clear. The line is a shelf and a wall inside the well; the corner past
// the hinge is sealed, so rows below the shelf are shorter.
(() => {
'use strict';
const { clamp, fmt } = IC;
const ctx = IC.ctx;
const COLS = 10, HID = 3;
// In the app the seven pieces take the seven colours of the test card it opens on, flat.
const COLORS = IC.APP
  ? { I: '#00c6c6', O: '#c6c600', T: '#c600c6', S: '#00c600', Z: '#c60000', J: '#2828d8', L: '#c6c6c6' }
  : { I: '#5ac8fa', O: '#ffcc00', T: '#af52de', S: '#34c759', Z: '#ff3b30', J: '#0a84ff', L: '#ff9500' };
const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};
// Rotation states 0, R, 2, L as cell lists, made by turning the matrix clockwise.
const ROT = {};
for (const [k, m0] of Object.entries(SHAPES)) {
  ROT[k] = [];
  let m = m0;
  for (let r = 0; r < 4; r++) {
    const cells = [];
    m.forEach((row, y) => row.forEach((v, x) => { if (v) cells.push([x, y]); }));
    ROT[k].push(cells);
    const n = m.length;
    m = m.map((row, y) => row.map((_, x) => m[n - 1 - x][y]));
  }
}
// SRS wall kicks, with y flipped to point down.
const KICK_JLSTZ = {
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]], '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};
const KICK_I = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]], '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]], '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]], '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]], '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};
const LOCK = 0.5, MAX_RESETS = 15, DAS = 0.16, ARR = 0.045, CLEAR_T = 0.16;

let S = null, B = null;      // run state, board geometry
const keys = { left: false, right: false, down: false, das: 0, dir: 0 };
const touch = { id: null, ax: 0, ay: 0, sx: 0, sy: 0, t: 0, moved: false, rows: 0 };

// ---------- geometry ----------
function layout() {
  const L = IC.Lo, U = L.U, e = IC.FRAMED ? { t: 0, r: 0, b: 0, l: 0 } : IC.safe;
  const scr = { x: L.sx + e.l, y: L.sy + e.t, r: L.sx + L.sw - e.r, b: L.sy + L.sh - e.b };
  const std = L.std;
  const J = std ? L.J : [L.sx + L.sw / 2, L.sy + L.sh * 0.6];
  const fit = (top) => {
    let s = Math.floor(Math.min((scr.b - 4 - top) / 20, (scr.r - scr.x - 8) / COLS));
    for (; s > 8; s--) {
      const above = Math.floor((J[1] - top) / s), below = Math.floor((scr.b - 2 - J[1]) / s);
      let cj = 5;
      const ok = (c) => J[0] - c * s >= scr.x + 2 && J[0] + (COLS - c) * s <= scr.r - 2;
      if (!ok(cj)) { cj = [4, 6, 3, 7, 2, 8].find(ok); if (cj == null) continue; }
      if (above >= 8 && below >= 3 && above + below >= 16) return { s, above, below, cj };
    }
    return null;
  };
  let top = scr.y + 6, g = fit(top);
  const hudRight = scr.x + 230;
  if (!g || J[0] - g.cj * g.s < hudRight) { top = scr.y + 48; g = fit(top) || g; }
  if (!g) g = { s: 12, above: 12, below: 6, cj: 5 };
  const { s, above, below, cj } = g;
  B = {
    s, cj, rh: above, rows: above + below, x0: J[0] - cj * s, y0: J[1] - above * s, std,
    sealed: { x: J[0], y: J[1], w: (COLS - cj) * s, h: below * s },
  };
}

// A cell can hold a block unless it's in the sealed corner past the line.
const valid = (c, r) => c >= 0 && c < COLS && r >= -HID && r < B.rows && !(B.std && r >= B.rh && c >= B.cj);

function emptyBoard() {
  return Array.from({ length: B.rows + HID }, () => new Array(COLS).fill(null));
}
const get = (st, c, r) => st.grid[r + HID][c];
const set = (st, c, r, v) => { st.grid[r + HID][c] = v; };

function fits(st, k, rot, x, y) {
  for (const [cx, cy] of ROT[k][rot]) {
    const c = x + cx, r = y + cy;
    if (!valid(c, r) || get(st, c, r)) return false;
  }
  return true;
}

// ---------- pieces ----------
function refill(st) {
  const bag = Object.keys(SHAPES);
  for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(IC.rnd(st.rng) * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  st.queue.push(...bag);
}
function spawn(st, k) {
  if (!k) { if (st.queue.length < 7) refill(st); k = st.queue.shift(); }
  const x = k === 'O' ? 4 : 3, y = -2;
  st.p = { k, rot: 0, x, y, lock: 0, resets: 0, lowest: y };
  st.held = false;
  if (!fits(st, k, 0, x, y)) { st.over = true; return; }
  if (fits(st, k, 0, x, y + 1)) st.p.y++;
}

function grounded(st) { const p = st.p; return !fits(st, p.k, p.rot, p.x, p.y + 1); }
function touched(st) {
  const p = st.p;
  if (grounded(st) && p.resets < MAX_RESETS) { p.lock = 0; p.resets++; }
}
function shift(st, dx) {
  const p = st.p;
  if (!p || st.clearing || !fits(st, p.k, p.rot, p.x + dx, p.y)) return false;
  p.x += dx;
  touched(st);
  IC.tone(220, 200, 0.02, 'square', 0.012);
  return true;
}
function rotate(st, dir) {
  const p = st.p;
  if (!p || st.clearing || p.k === 'O') return false;
  const to = (p.rot + dir + 4) % 4, table = p.k === 'I' ? KICK_I : KICK_JLSTZ;
  for (const [dx, dy] of table[`${p.rot}>${to}`]) {
    if (fits(st, p.k, to, p.x + dx, p.y + dy)) {
      p.x += dx; p.y += dy; p.rot = to;
      touched(st);
      IC.tone(520, 640, 0.03, 'triangle', 0.02);
      return true;
    }
  }
  return false;
}
function softDrop(st) {
  const p = st.p;
  if (!p || st.clearing || !fits(st, p.k, p.rot, p.x, p.y + 1)) return false;
  p.y++;
  st.score += 1;
  return true;
}
function hardDrop(st) {
  const p = st.p;
  if (!p || st.clearing) return;
  let n = 0;
  while (fits(st, p.k, p.rot, p.x, p.y + 1)) { p.y++; n++; }
  st.score += 2 * n;
  st.flash = { k: p.k, rot: p.rot, x: p.x, y: p.y, t: 0.12 };
  lock(st);
}
function hold(st) {
  if (!st.p || st.held || st.clearing) return;
  const k = st.p.k;
  if (st.hold) spawn(st, st.hold); else spawn(st);
  st.hold = k;
  st.held = true;
  IC.tone(440, 330, 0.06, 'triangle', 0.025);
}

function lock(st) {
  const p = st.p;
  let above = true;
  for (const [cx, cy] of ROT[p.k][p.rot]) {
    set(st, p.x + cx, p.y + cy, p.k);
    if (p.y + cy >= 0) above = false;
  }
  st.p = null;
  IC.haptic('light');
  IC.tone(160, 120, 0.05, 'square', 0.02);
  if (above) { st.over = true; return; }
  st.chain = 0;
  st.locked = 0;
  findClears(st);
  if (!st.clearing) spawn(st);
}

function full(st, r) {
  let any = false;
  for (let c = 0; c < COLS; c++) {
    if (!valid(c, r)) continue;
    any = true;
    if (!get(st, c, r)) return false;
  }
  return any;
}
function findClears(st) {
  const rows = [];
  for (let r = -HID; r < B.rows; r++) if (full(st, r)) rows.push(r);
  if (rows.length) { st.clearing = { rows, t: CLEAR_T }; IC.haptic(rows.length > 1 ? 'heavy' : 'medium'); IC.tone(660 + st.chain * 220, 990 + st.chain * 220, 0.12, 'triangle', 0.035); }
  else st.clearing = null;
}
// Remove a row: in each column that reaches it, everything above drops one.
function clearRow(st, r) {
  for (let c = 0; c < COLS; c++) {
    if (!valid(c, r)) continue;
    let k = r;
    while (valid(c, k - 1)) { set(st, c, k, get(st, c, k - 1)); k--; }
    set(st, c, k, null);
  }
}
function applyClears(st) {
  const rows = st.clearing.rows;
  for (const r of rows) clearRow(st, r);
  st.chain++;
  st.locked += rows.length;
  st.lines += rows.length;
  const pts = [0, 100, 300, 500, 800][Math.min(4, rows.length)];
  st.score += pts * st.level + (st.chain > 1 ? 200 * (st.chain - 1) * st.level : 0);
  if (st.chain > 1) st.toast = { text: `Chain x${st.chain}`, t: 1 };
  else if (rows.length >= 2) st.toast = { text: ['', '', 'Double', 'Triple', 'Four lines'][Math.min(4, rows.length)], t: 1 };
  st.level = 1 + Math.floor(st.lines / 10);
  // dropping the left side can finish a row above the shelf: keep going
  findClears(st);
  if (!st.clearing) spawn(st);
}

const gravity = (lv) => Math.pow(Math.max(0.05, 0.8 - (lv - 1) * 0.007), lv - 1);

function fresh(seed) {
  const st = { grid: emptyBoard(), queue: [], rng: { s: seed | 0 }, p: null, hold: null, held: false, score: 0, lines: 0, level: 1, fall: 0, clearing: null, chain: 0, over: false, toast: null, flash: null, overT: 0 };
  refill(st);
  spawn(st);
  return st;
}

function step(st, dt) {
  if (st.over) return;
  if (st.toast) { st.toast.t -= dt; if (st.toast.t <= 0) st.toast = null; }
  if (st.flash) { st.flash.t -= dt; if (st.flash.t <= 0) st.flash = null; }
  if (st.clearing) {
    st.clearing.t -= dt;
    if (st.clearing.t <= 0) applyClears(st);
    return;
  }
  const p = st.p;
  if (!p) return;
  const g = gravity(st.level) * (keys.down ? 0.05 : 1);
  st.fall += dt;
  while (st.fall >= g) {
    st.fall -= g;
    if (fits(st, p.k, p.rot, p.x, p.y + 1)) {
      p.y++;
      if (keys.down) st.score += 1;
      if (p.y > p.lowest) { p.lowest = p.y; p.resets = 0; }
      p.lock = 0;
    } else break;
  }
  if (grounded(st)) {
    p.lock += dt;
    if (p.lock >= LOCK) lock(st);
  }
}

// ---------- autopilot (tests and screenshots) ----------
function evaluate(st) {
  let holes = 0, agg = 0, bump = 0, prev = null;
  for (let c = 0; c < COLS; c++) {
    let h = 0, seen = false;
    for (let r = 0; r < B.rows; r++) {
      if (!valid(c, r)) continue;
      if (get(st, c, r)) { if (!seen) { h = B.rows - r; seen = true; } }
      else if (seen) holes++;
    }
    agg += h;
    if (prev != null) bump += Math.abs(h - prev);
    prev = h;
  }
  return -0.51 * agg - 0.36 * holes * 2 - 0.18 * bump;
}
function botMove(st) {
  const p = st.p;
  if (!p) return;
  let best = null;
  for (let rot = 0; rot < (p.k === 'O' ? 1 : 4); rot++) {
    for (let x = -3; x < COLS; x++) {
      let y = p.y;
      if (!fits(st, p.k, rot, x, y)) continue;
      while (fits(st, p.k, rot, x, y + 1)) y++;
      const cells = ROT[p.k][rot].map(([cx, cy]) => [x + cx, y + cy]);
      cells.forEach(([c, r]) => set(st, c, r, p.k));
      let lines = 0;
      for (let r = -HID; r < B.rows; r++) if (full(st, r)) lines++;
      const v = evaluate(st) + 0.76 * lines * 3;
      cells.forEach(([c, r]) => set(st, c, r, null));
      if (!best || v > best.v) best = { v, rot, x };
    }
  }
  if (best) { p.rot = best.rot; p.x = best.x; hardDrop(st); }
}

// ---------- drawing ----------
function cellRect(c, r) { return [B.x0 + c * B.s, B.y0 + r * B.s]; }
function block(x, y, s, color, alpha = 1, ghost = false) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (IC.APP && !ghost) {
    const pad = Math.max(0.5, s * 0.04), edge = Math.max(1, s * 0.09);
    ctx.fillStyle = color;
    ctx.fillRect(x + pad, y + pad, s - 2 * pad, s - 2 * pad);
    ctx.fillStyle = shade(color, -0.3);
    ctx.fillRect(x + pad, y + s - pad - edge, s - 2 * pad, edge);
    ctx.restore();
    return;
  }
  const pad = Math.max(1, s * 0.06), rad = IC.APP ? s * 0.04 : s * 0.22;
  IC.rrect(ctx, x + pad, y + pad, s - 2 * pad, s - 2 * pad, rad);
  if (ghost) {
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, s * 0.07); ctx.stroke();
  } else {
    const gr = ctx.createLinearGradient(0, y, 0, y + s);
    gr.addColorStop(0, color); gr.addColorStop(1, shade(color, -0.22));
    ctx.fillStyle = gr; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    IC.rrect(ctx, x + pad * 2.2, y + pad * 2, s - pad * 4.4, (s - 2 * pad) * 0.32, rad * 0.6);
    ctx.fill();
  }
  ctx.restore();
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => clamp(Math.round(v + (k < 0 ? v * k : (255 - v) * k)), 0, 255);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function drawMini(k, cx, cy, s) {
  const cells = ROT[k][0];
  const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
  const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
  for (const [x, y] of cells) block(cx + (x - Math.min(...xs) - w / 2) * s, cy + (y - Math.min(...ys) - h / 2) * s, s, COLORS[k]);
}

function drawBoard() {
  const s = B.s, st = S;
  // the playable well: full width above the shelf, left of the hinge below it
  ctx.save();
  ctx.fillStyle = 'rgba(8,8,26,0.58)';
  ctx.fillRect(B.x0, B.y0, COLS * s, B.rh * s);
  ctx.fillRect(B.x0, B.y0 + B.rh * s, (B.std ? B.cj : COLS) * s, (B.rows - B.rh) * s);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < COLS; c++) {
    const bottom = B.std && c >= B.cj ? B.rh : B.rows;
    ctx.moveTo(B.x0 + c * s, B.y0); ctx.lineTo(B.x0 + c * s, B.y0 + bottom * s);
  }
  for (let r = 1; r < B.rows; r++) {
    const w = B.std && r > B.rh ? B.cj : COLS;
    ctx.moveTo(B.x0, B.y0 + r * s); ctx.lineTo(B.x0 + w * s, B.y0 + r * s);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.strokeRect(B.x0 - 0.5, B.y0 - 0.5, COLS * s + 1, B.rows * s + 1);
  // the sealed corner, hatched
  if (B.std) {
    const z = B.sealed;
    ctx.save();
    ctx.beginPath(); ctx.rect(z.x, z.y, z.w, z.h); ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(z.x, z.y, z.w, z.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    for (let d = -z.h; d < z.w; d += s * 0.5) { ctx.moveTo(z.x + d, z.y + z.h); ctx.lineTo(z.x + d + z.h, z.y); }
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  if (!st) return;
  const clearing = st.clearing ? st.clearing.rows : [];
  for (let r = 0; r < B.rows; r++) {
    for (let c = 0; c < COLS; c++) {
      const k = get(st, c, r);
      if (!k) continue;
      const [x, y] = cellRect(c, r);
      block(x, y, s, clearing.includes(r) && Math.floor(IC.clock * 30) % 2 ? '#ffffff' : COLORS[k]);
    }
  }
  const p = st.p;
  if (p && IC.state === 'play') {
    let gy = p.y;
    while (fits(st, p.k, p.rot, p.x, gy + 1)) gy++;
    for (const [cx, cy] of ROT[p.k][p.rot]) {
      if (gy + cy >= 0) { const [x, y] = cellRect(p.x + cx, gy + cy); block(x, y, s, COLORS[p.k], 0.45, true); }
    }
    for (const [cx, cy] of ROT[p.k][p.rot]) {
      if (p.y + cy >= 0) { const [x, y] = cellRect(p.x + cx, p.y + cy); block(x, y, s, COLORS[p.k]); }
    }
  }
  if (st.flash) {
    const f = st.flash;
    for (const [cx, cy] of ROT[f.k][f.rot]) {
      if (f.y + cy < 0) continue;
      const [x, y] = cellRect(f.x + cx, f.y + cy);
      ctx.fillStyle = `rgba(255,255,255,${f.t * 3})`;
      ctx.fillRect(x, y, s, s);
    }
  }
  // the line takes a bow after every clear: it's still there
  if (st.clearing) IC.glowAlong(0, IC.Lo.total, 'rgba(120,255,180,0.5)', 1.6, 0.5 + 0.5 * Math.sin(IC.clock * 40));
}

// Next, hold and the count live in the sealed corner, since blocks can't.
function drawSide() {
  const st = S, s = B.s;
  let z = B.sealed;
  if (!B.std || z.w < s * 3 || z.h < s * 3.5) z = { x: B.x0 + COLS * s + s * 0.6, y: B.y0 + s, w: s * 4, h: B.rh * s };
  const ms = Math.min(s * 0.5, z.w / 6, z.h / 12);
  const lab = clamp(s * 0.42, 10, 15);
  z = Object.assign({}, z, { y: z.y + (B.std ? IC.Lo.dbl * IC.Lo.U + 2 : 0) });
  const colL = z.x + z.w * 0.3, colR = z.x + z.w * 0.72;
  IC.text('Next', colR, z.y + lab * 1.2, lab, { alpha: 0.65 });
  st.queue.slice(0, 3).forEach((k, i) => drawMini(k, colR, z.y + lab * 2.4 + ms * 1.4 + i * ms * 2.9, ms));
  IC.text('Hold', colL, z.y + lab * 1.2, lab, { alpha: 0.65 });
  if (st.hold) drawMini(st.hold, colL, z.y + lab * 2.4 + ms * 1.4, ms);
  IC.text(`Level ${st.level}`, colL, z.y + lab * 2.4 + ms * 4.2, lab * 0.95, { alpha: 0.8 });
  IC.text(`${fmt(st.lines)} lines`, colL, z.y + lab * 2.4 + ms * 4.2 + lab * 1.4, lab * 0.95, { alpha: 0.8 });
  if (st.toast) IC.text(st.toast.text, B.x0 + COLS * s / 2, B.y0 + B.rh * s * 0.35, clamp(s * 0.9, 16, 30), { weight: 800, alpha: Math.min(1, st.toast.t * 2), color: '#7dffb8' });
}

// ---------- input ----------
function down(p) {
  if (touch.id !== null) return;
  Object.assign(touch, { id: p.id, ax: p.x, ay: p.y, sx: p.x, sy: p.y, t: p.t, moved: false, rows: 0 });
}
function move(p) {
  if (p.id !== touch.id || !S || S.over) return;
  const stepX = B.s * 0.85, stepY = B.s * 0.9;
  while (p.x - touch.ax >= stepX) { shift(S, 1); touch.ax += stepX; touch.moved = true; }
  while (touch.ax - p.x >= stepX) { shift(S, -1); touch.ax -= stepX; touch.moved = true; }
  // dragging down drops it a row at a time, but only once the drag is clearly downward
  if (p.y - touch.sy > B.s * 1.2 && Math.abs(p.y - touch.sy) > Math.abs(p.x - touch.sx) * 1.5) {
    while (p.y - touch.ay >= stepY) { if (softDrop(S)) touch.rows++; touch.ay += stepY; touch.moved = true; }
  } else if (p.y < touch.ay) touch.ay = p.y;
}
function up(p) {
  if (p.id !== touch.id) return;
  touch.id = null;
  if (!S || S.over) return;
  const dt = p.t - touch.t, dx = p.x - touch.sx, dy = p.y - touch.sy;
  const fast = dt < 260 && Math.abs(dy) > B.s * 2.2 && Math.abs(dy) > Math.abs(dx) * 1.6;
  if (fast && dy > 0) hardDrop(S);
  else if (fast && dy < 0) hold(S);
  else if (!touch.moved && Math.hypot(dx, dy) < 12 && dt < 350) rotate(S, 1);
}
function key(k, isDown) {
  if (!S) return false;
  if (k === 'ArrowLeft' || k === 'ArrowRight') {
    const d = k === 'ArrowLeft' ? -1 : 1;
    if (isDown && keys.dir !== d) { keys.dir = d; keys.das = 0; shift(S, d); }
    else if (!isDown && keys.dir === d) keys.dir = 0;
    return true;
  }
  if (k === 'ArrowDown') { keys.down = isDown; return true; }
  if (!isDown) return false;
  if (k === 'ArrowUp' || k === 'x' || k === 'X') { rotate(S, 1); return true; }
  if (k === 'z' || k === 'Z') { rotate(S, -1); return true; }
  if (k === ' ') { hardDrop(S); return true; }
  if (k === 'c' || k === 'C' || k === 'Shift') { hold(S); return true; }
  return false;
}

// ---------- tests ----------
function selftest(n) {
  layout();
  const problems = [];
  // clearing a row under the shelf drops the left side only
  let st = fresh(1);
  st.grid = emptyBoard(); st.p = null;
  const rb = B.rows - 1;
  for (let c = 0; c < B.cj; c++) set(st, c, rb, 'T');
  set(st, 1, rb - 1, 'S');
  set(st, B.cj + 1, B.rh - 1, 'Z');          // resting on the line
  findClears(st);
  if (!st.clearing || st.clearing.rows.join() !== String(rb)) problems.push('lower row not detected');
  else { applyClears(st); if (get(st, 1, rb) !== 'S') problems.push('left side did not drop'); if (get(st, B.cj + 1, B.rh - 1) !== 'Z') problems.push('block on the shelf moved'); }
  // an upper row needs every column, and drops everything above it
  st = fresh(2); st.grid = emptyBoard(); st.p = null;
  for (let c = 0; c < COLS; c++) set(st, c, B.rh - 1, 'I');
  set(st, 7, B.rh - 2, 'O');
  findClears(st);
  if (!st.clearing) problems.push('upper row not detected');
  else { st.queue = ['T', 'T', 'T', 'T', 'T', 'T', 'T']; applyClears(st); if (get(st, 7, B.rh - 1) !== 'O') problems.push('upper drop wrong'); }
  // nothing can ever be placed in the sealed corner
  if (B.std && valid(B.cj, B.rh)) problems.push('sealed cell is valid');
  // SRS: a T can spin into a T slot next to the wall
  // long autopilot games, checking the board never holds a block where it can't be
  let pieces = 0, lines = 0, games = 0;
  for (let gm = 0; gm < n; gm++) {
    st = fresh(100 + gm);
    games++;
    let guard = 0;
    while (!st.over && guard++ < 4000) {
      if (st.p && !st.clearing) { botMove(st); pieces++; }
      else step(st, 0.05);
      for (let r = -HID; r < B.rows; r++) for (let c = 0; c < COLS; c++) if (!valid(c, r) && get(st, c, r)) problems.push(`block in sealed cell ${c},${r}`);
      if (problems.length > 10) break;
    }
    lines += st.lines;
  }
  return { games, pieces, lines, grid: `${COLS}x${B.rows} shelf row ${B.rh} hinge col ${B.cj} cell ${B.s}`, problems: problems.slice(0, 10) };
}

IC.register({
  id: 'blocks',
  name: 'Line Clear',
  label: 'Line Clear',
  unit: 'pts',
  how: 'Clear every line except that one. Drag to move, tap to rotate, flick down to drop, flick up to hold.',
  howKeys: 'Clear every line except that one. Arrows move, up rotates, space drops, C holds.',
  icon(g, s) {
    IC.iconBg(g, s, '#1b1f3f', '#0b0d1f');
    const c = s * 0.16, x0 = s * 0.12, y0 = s * 0.2;
    const put = (cx, cy, col) => {
      g.fillStyle = col;
      IC.rrect(g, x0 + cx * c + c * 0.07, y0 + cy * c + c * 0.07, c * 0.86, c * 0.86, c * 0.22);
      g.fill();
    };
    [[0, 4, '#5ac8fa'], [1, 4, '#5ac8fa'], [0, 3, '#ffcc00'], [1, 3, '#ffcc00'], [2, 4, '#ff9500'], [2, 3, '#ff9500'],
      [3, 2, '#af52de'], [4, 2, '#af52de'], [4, 1, '#af52de'], [5, 2, '#af52de'], [3, 0, '#34c759'], [2, 0, '#34c759'], [2, -1, '#34c759']].forEach(([a, b, col]) => put(a, b, col));
    IC.iconLine(g, [[x0 + 3 * c, s * 1.1], [x0 + 3 * c, y0 + 3 * c], [s * 1.1, y0 + 3 * c]], s * 0.035);
  },
  layout,
  // mid-game the grid keeps its shape; only the cell size and position follow the line
  relayout() {
    if (!S || !B) { layout(); return; }
    const keep = { rows: B.rows, rh: B.rh, cj: B.cj };
    layout();
    if (B.rows === keep.rows && B.rh === keep.rh && B.cj === keep.cj) return;
    const L = IC.Lo, e = IC.FRAMED ? { t: 0, b: 0, l: 0, r: 0 } : IC.safe;
    const J = B.std ? L.J : [L.sx + L.sw / 2, L.sy + L.sh * 0.6];
    const s = Math.max(6, Math.floor(Math.min((J[1] - L.sy - e.t - 4) / keep.rh, (L.sy + L.sh - e.b - 2 - J[1]) / (keep.rows - keep.rh), (J[0] - L.sx - e.l - 2) / keep.cj, (L.sx + L.sw - e.r - 2 - J[0]) / (COLS - keep.cj))));
    Object.assign(B, keep, { s, x0: J[0] - keep.cj * s, y0: J[1] - keep.rh * s, sealed: { x: J[0], y: J[1], w: (COLS - keep.cj) * s, h: (keep.rows - keep.rh) * s } });
  },
  reset() { layout(); S = null; },
  start() {
    layout();
    S = fresh((Math.random() * 1e9) | 0);
    Object.assign(keys, { left: false, right: false, down: false, das: 0, dir: 0 });
    touch.id = null;
  },
  update(dt) {
    if (!S || IC.state !== 'play') return;
    if (keys.dir) {
      keys.das += dt;
      if (keys.das >= DAS) { while (keys.das >= DAS + ARR) { shift(S, keys.dir); keys.das -= ARR; } }
    }
    if (IC.BOT && S.p && !S.clearing) botMove(S);
    step(S, dt);
    if (S.over && !S.sent) {
      S.sent = true;
      IC.tone(330, 80, 0.8, 'sawtooth', 0.03);
      IC.end({ why: 'Topped out.', score: S.score, unit: 'pts', extra: `${fmt(S.lines)} line${S.lines === 1 ? '' : 's'}, level ${S.level}`, delay: 0.4 });
    }
  },
  render() {
    if (!B) layout();
    drawBoard();
    IC.drawLine();
    if (S) drawSide();
  },
  down, move, up, key,
  hud() { return S ? { main: `${fmt(S.score)}`, sub: `${fmt(S.lines)} lines` } : { main: '', sub: '' }; },
  panelRect() {
    if (!B) return null;
    return { x: B.x0, y: B.y0, w: COLS * B.s, h: B.rh * B.s };
  },
  share: (r) => `I scored ${fmt(r.score)} in Line Clear. The green line is still there.`,
  selftest,
});
})();
