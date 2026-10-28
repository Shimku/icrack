// Pinball. Hinge line = wall, line across = trampoline, sealed corner = score.
// Four tables share that frame; each has its own look and one piece of its own:
// Genius Bar $1,000 drop targets, a Teardown spudger spinner, a beach crab.
(() => {
'use strict';
const { clamp, fmt } = IC;
const ctx = IC.ctx;
const SUB = 10;                         // physics substeps per game step
const FL_REST = (28 * Math.PI) / 180, FL_UP = (26 * Math.PI) / 180;
const W_UP = 26, W_DOWN = 14;

const TABLES = {
  neon: {
    name: 'Neon', word: 'DUO', drain: 'Drained.', display: 'iCRACK PINBALL', light: false,
    rail: 'rgba(205,210,230,0.75)', post: 'rgba(255,255,255,0.7)', sling: 'rgba(255,55,95,0.35)', slingEdge: '#ff8aa6',
    flip: '#f5f5f7', flipEdge: '#ff375f', lane: 'rgba(255,255,255,0.35)', laneLit: '#7dffb8', text: '#fff',
    disp: { bg: 'rgba(20,6,0,0.75)', edge: 'rgba(255,140,40,0.35)', fg: '#ff9f2e', fg2: '#ffb35c' },
    apron: ['rgba(60,30,90,0.9)', 'rgba(25,12,40,0.95)'],
  },
  genius: {
    name: 'Genius Bar', word: 'BAR', drain: 'Out of warranty.', display: 'GENIUS BAR', light: true,
    rail: 'rgba(255,255,255,0.92)', post: '#ffffff', sling: 'rgba(0,113,227,0.3)', slingEdge: '#0071e3',
    flip: '#ffffff', flipEdge: '#0071e3', lane: 'rgba(60,35,10,0.35)', laneLit: '#0071e3', text: '#2a1a08',
    disp: { bg: 'rgba(8,8,10,0.92)', edge: 'rgba(255,255,255,0.25)', fg: '#f5f5f7', fg2: '#4da3ff' },
    apron: ['rgba(245,245,247,0.95)', 'rgba(222,222,228,0.97)'],
  },
  bench: {
    name: 'Teardown', word: 'FIX', drain: 'Lost a screw.', display: 'TEARDOWN', light: false,
    rail: 'rgba(225,230,238,0.85)', post: '#e8edf5', sling: 'rgba(255,159,10,0.32)', slingEdge: '#ff9f0a',
    flip: '#1c1c1e', flipEdge: '#ff9f0a', lane: 'rgba(255,255,255,0.45)', laneLit: '#ffd60a', text: '#fff',
    disp: { bg: '#a7b796', edge: 'rgba(0,0,0,0.5)', fg: '#16210f', fg2: '#2d3d22' },
    apron: ['rgba(14,48,92,0.96)', 'rgba(9,32,64,0.98)'],
  },
  beach: {
    name: 'Beach', word: 'SUN', drain: 'Washed out.', display: 'BEACH', light: true,
    rail: 'rgba(255,255,255,0.9)', post: '#ffffff', sling: 'rgba(255,99,71,0.35)', slingEdge: '#ff6347',
    flip: '#ffffff', flipEdge: '#ff6347', lane: 'rgba(255,255,255,0.85)', laneLit: '#ffd60a', text: '#3b2408',
    disp: { bg: 'rgba(6,58,84,0.95)', edge: 'rgba(255,255,255,0.3)', fg: '#ffe08a', fg2: '#ffffff' },
    apron: ['rgba(214,170,104,0.96)', 'rgba(190,146,84,0.98)'],
  },
};
const ORDER = ['neon', 'genius', 'bench', 'beach'];
let TB = TABLES.neon, tbId = 'neon';
function pick(id) {
  if (!TABLES[id]) id = 'neon';
  tbId = id; TB = TABLES[id];
}
pick(IC.params.get('table') || IC.store.pinTable || 'neon');

let T = null;     // table
let S = null;     // run
const held = { l: false, r: false, plunge: false };
const touches = new Map();

// ---------- table ----------
function build() {
  const L = IC.Lo, e = IC.FRAMED ? { t: 0, r: 0, b: 0, l: 0 } : IC.safe;
  const left = L.sx + e.l + 2, right = L.sx + L.sw - e.r - 2, top = L.sy + e.t + 2, bot = L.sy + L.sh - e.b;
  const J = L.std ? L.J : [L.sx + L.sw * 0.49, L.sy + L.sh * 0.6];
  const cw = J[0] - left, colH = bot - top, ww = right - J[0], wh = J[1] - top;
  const lw = Math.min(cw, colH * 0.52);
  const rb = clamp(lw * 0.042, 5, 13);
  const laneW = rb * 2.7;
  const xr = J[0], xl = J[0] - lw;
  const fl = (0.8 * lw - 5.2 * rb) / (2 * Math.cos(FL_REST));
  const py = bot - 2.2 * rb - fl * Math.sin(FL_REST);
  const pL = [xl + 0.1 * lw, py], pR = [xr - 0.1 * lw, py];
  // gravity follows the flipper area, so a good shot clears a tall table as well as a wide one
  const Lref = Math.min(colH, lw * 2), g = 3.0 * Lref, V = Math.sqrt(2 * g * Lref);
  const segs = [];
  const seg = (a, b, kind = 'wall', ex = {}) => { const s = Object.assign({ a, b, kind }, ex); segs.push(s); return s; };
  const arc = (cx, cy, r, a0, a1, n) => {
    for (let i = 0; i < n; i++) {
      const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n;
      seg([cx + Math.cos(t0) * r, cy + Math.sin(t0) * r], [cx + Math.cos(t1) * r, cy + Math.sin(t1) * r]);
    }
  };
  // outline: left wall, rounded top corners, the wing's right wall down to the line
  // each table has its own corner: square for the store, round for the beach
  const crK = { neon: 0.2, genius: 0.1, bench: 0.14, beach: 0.3 }[tbId];
  const cr = Math.min(cw, colH) * crK, cr2 = Math.max(laneW * 1.8, Math.min(ww, wh) * 0.22);
  const yG = py - 0.34 * lw;
  seg([left, bot + 60], [left, top + cr]);
  arc(left + cr, top + cr, cr, Math.PI, Math.PI * 1.5, 8);
  seg([left + cr, top], [right - cr2, top]);
  arc(right - cr2, top + cr2, cr2, -Math.PI / 2, 0, 8);
  seg([right, top + cr2], [right, J[1]]);
  // plunger lane: its inner wall stops short of the top so the ball rides the curve out
  const laneTop = top + cr2 + 2.6 * rb;
  seg([right - laneW, J[1]], [right - laneW, laneTop], 'wall', { e: 0.3 });
  // the line: shelf, lane floor, hinge wall
  seg([J[0], J[1]], [right - laneW, J[1]], 'shelf');
  seg([right - laneW, J[1]], [right, J[1]], 'wall', { e: 0.1 });
  seg([J[0], J[1]], [J[0], bot + 60], 'wall', { line: true });
  // lower section: if the column is wider than the flippers, a sloped apron feeds them
  let apron = null;
  if (xl - left > rb * 2) {
    const yTop = Math.max(top + colH * 0.38, yG - (xl - left) * 0.9);
    seg([left, yTop], [xl, yG]);
    apron = [[left, yTop], [xl, yG], [xl, bot + 60], [left, bot + 60]];
  }
  seg([xl, yG], pL);
  seg([xr, yG], pR);
  // slingshots: the face toward the middle kicks
  const sling = (sx) => {
    const x0 = sx > 0 ? xl : xr, d = sx;
    const tTop = [x0 + d * 0.13 * lw, py - 0.58 * lw], tBot = [x0 + d * 0.13 * lw, py - 0.24 * lw], tTip = [x0 + d * 0.3 * lw, py - 0.15 * lw];
    seg(tTop, tBot, 'wall', { e: 0.3 });
    seg(tBot, tTip, 'wall', { e: 0.3 });
    seg(tTip, tTop, 'sling');
    return [tTop, tBot, tTip];
  };
  const slings = [sling(1), sling(-1)];
  // top lanes, near the top of the left column, below the Home button and score.
  // Neon and Beach have them in the middle, the Genius Bar towards the hinge,
  // the Teardown bench towards the left wall.
  const lane = Math.min(cw, colH * 0.7) * 0.22, ly = top + Math.max(cr * 0.55, 3 * rb, 46), lh = 3.2 * rb;
  const arcX = (y) => (y < top + cr ? left + cr - Math.sqrt(Math.max(0, cr * cr - (top + cr - y) ** 2)) : left);
  const cxMin = arcX(ly) + rb * 2.6 + 1.5 * lane, cxMax = J[0] - rb * 2.6 - 1.5 * lane;
  const cx = clamp(left + cw * { neon: 0.5, genius: 0.68, bench: 0.3, beach: 0.5 }[tbId], cxMin, Math.max(cxMin, cxMax));
  const lanes = [-1, 0, 1].map((i) => ({ x: cx + i * lane, y: ly + lh * 0.55, lit: false, ch: TB.word[i + 1] }));
  for (const i of [-1.5, -0.5, 0.5, 1.5]) seg([cx + i * lane, ly], [cx + i * lane, ly + lh], 'post', { e: 0.4 });
  // bumpers in the column, over the flippers so none sit above the apron
  const br = clamp(Math.min(cw, colH) * 0.085, rb * 1.6, rb * 3.4);
  const upTop = ly + lh + br * 1.6, upBot = Math.min(py - 0.64 * lw - br, J[1] + (bot - J[1]) * 0.15);
  const midY = (upTop + upBot) / 2, hgt = upBot - upTop;
  const bx = xl + lw / 2, bs = Math.min(lane * 1.05, lw * 0.3);
  let bumpers;
  let chip = null;
  if (tbId === 'genius') {
    // rows of store tables: a 2 by 2 grid, or one row of three on a short column
    const r = br * 0.78;
    if (hgt >= br * 2.4) {
      const y1 = upTop + hgt * 0.1, y2 = Math.min(upBot, y1 + Math.max(r * 3, hgt * 0.6));
      bumpers = [[-1, y1], [1, y1], [-1, y2], [1, y2]].map(([sx, y]) => ({ x: bx + sx * bs * 1.1, y, r }));
    } else bumpers = [-1, 0, 1].map((sx) => ({ x: bx + sx * bs * 1.2, y: midY, r: r * 0.9 }));
  } else if (tbId === 'bench') {
    // five screws in a closed ring round a chip, like the ones holding a part
    // down: the gaps are narrower than the ball, so it can't get stuck inside
    const r = Math.min(br * 0.62, bs * 0.5), R = (2 * r + 1.6 * rb) / (2 * Math.sin(Math.PI / 5));
    // over the left flipper, not the gap, so what it kicks down lands on a flipper
    const cy = clamp(midY, upTop + R * 0.5, upBot), rx = clamp(bx - bs * 0.6, xl + R + r, xr - R - r);
    bumpers = [0, 1, 2, 3, 4].map((k) => { const a = -Math.PI / 2 + (k * Math.PI * 2) / 5; return { x: rx + Math.cos(a) * R, y: cy + Math.sin(a) * R, r }; });
    chip = { x: rx, y: cy, s: Math.max(rb, R - r) * 0.9 };
  } else if (tbId === 'beach') {
    // one small ball high and two big ones low and wide, or two big ones on a slant
    bumpers = hgt >= br * 2.6
      ? [{ x: bx, y: upTop + hgt * 0.08, r: br * 0.72 }, { x: bx - bs * 1.25, y: upBot - br * 0.1, r: br * 1.1 }, { x: bx + bs * 1.25, y: upBot - br * 0.1, r: br * 1.1 }]
      : [{ x: bx - bs * 1.15, y: upTop - br * 0.2, r: br }, { x: bx + bs * 1.15, y: upBot + br * 0.2, r: br }];
  } else {
    // a triangle of three when there's height for it, otherwise two side by side
    bumpers = hgt >= br * 2.6
      ? [
        { x: bx - bs, y: upTop + hgt * 0.2, r: br },
        { x: bx + bs, y: upTop + hgt * 0.2, r: br },
        { x: bx, y: Math.min(upBot, Math.max(midY, upTop + br * 2.6)), r: br },
      ]
      : [
        { x: bx - bs, y: Math.min(midY, upBot), r: br },
        { x: bx + bs, y: Math.min(midY, upBot), r: br },
      ];
  }
  // nothing in the column pokes past the flippers' edges, the hinge wall included
  for (const k of bumpers) k.x = clamp(k.x, xl + k.r, xr - k.r);
  // the wing, right of the hinge: high up, above where the trampoline throws the
  // ball, so they feed it back out instead of keeping it up there
  const wingW = ww - laneW;
  if (wingW > br * 4 && wh > br * 5) {
    const wr = clamp(Math.min(wingW, wh) * 0.09, rb * 1.6, br), at = (fx, fy, r = wr) => ({ x: J[0] + wingW * fx, y: top + wh * fy, r });
    if (tbId === 'genius') bumpers.push(at(0.8, 0.26));                       // the quotes take the middle
    else if (tbId === 'bench') bumpers.push(at(0.28, 0.42, wr * 0.75), at(0.5, 0.42, wr * 0.75), at(0.72, 0.42, wr * 0.75));
    else if (tbId === 'beach') bumpers.push(at(0.5, 0.36, wr * 1.25));
    else bumpers.push(at(0.36, 0.34), at(0.7, 0.2));
  }
  bumpers.forEach((b, i) => { b.flash = 0; b.rot = i * 1.3; b.color = ['#ff375f', '#0a84ff', '#ffd60a', '#30d158', '#bf5af2'][i % 5]; });

  // each table's own piece
  const targets = [];
  let spin = null, crab = null;
  if (tbId === 'genius' && wingW > rb * 14 && wh > rb * 11) {
    // three $1,000 quotes hanging across the wing, below the bumpers, above the trampoline
    // low enough that the weakest trampoline bounce (it peaks at 0.55 of the wing) reaches them
    const tw = rb * 4, gap = rb * 1.2, total = 3 * tw + 2 * gap;
    const x0 = J[0] + Math.max(rb * 3, (wingW - total) * 0.55), y = top + wh * 0.66;
    for (let i = 0; i < 3; i++) targets.push(seg([x0 + i * (tw + gap), y], [x0 + i * (tw + gap) + tw, y], 'target', { e: 0.5, down: false }));
  }
  if (tbId === 'bench') {
    // a spudger hung from the top rail just past the corner the ball comes out of,
    // where every launch is still high
    const gx = Math.max(J[0] + wingW * 0.5, right - cr2 - rb * 1.6);
    spin = { x: gx, y0: top, y1: top + Math.min(rb * 4, wh * 0.2), a: 0, w: 0, half: 0 };
  }
  if (tbId === 'beach') {
    // a crab walking up and down the line
    const r = clamp(rb * 1.7, rb * 1.3, wh * 0.12), lo = J[0] + r + rb * 2.2, hi = right - laneW - r - rb * 1.2;
    if (hi - lo > r * 4) crab = { x: (lo + hi) / 2, y: J[1] - IC.Lo.lineHalf * IC.Lo.U - r * 0.8, r, lo, hi, v: Math.max((hi - lo) * 0.2, rb * 4), dir: 1, flash: 0, cool: 0, boost: 0, walk: 0, pts: 300 };
  }
  T = {
    left, right, top, bot, J, cw, colH, ww, wh, lw, rb, laneW, fl, py, g, V, segs, slings, lanes, bumpers, lh, ly, apron,
    targets, targetsUp: 0, spin, crab, chip,
    flips: [
      { p: pL, side: 1, a: FL_REST, w: 0, rest: FL_REST, up: -FL_UP },
      { p: pR, side: -1, a: Math.PI - FL_REST, w: 0, rest: Math.PI - FL_REST, up: Math.PI + FL_UP },
    ],
    plungeAt: [right - laneW / 2, J[1] - rb - IC.Lo.lineHalf * IC.Lo.U - 0.5],
    shelfMin: Math.sqrt(2 * g * wh * 0.45),
    sealed: { x: J[0], y: J[1], w: right - J[0], h: bot - J[1] },
  };
  T.bg = paintBackground();
}

// ---------- run ----------
function fresh() {
  return { score: 0, mult: 1, ball: 1, balls: 3, b: null, plunge: 0, save: 0, saved: false, shelfFlash: 0, msg: null, stuck: 0, over: false, overT: 0, hits: 0, airT: 0, quotes: 0, drops: 0, spins: 0, pinches: 0 };
}
function serve(st) {
  st.b = { x: T.plungeAt[0], y: T.plungeAt[1], vx: 0, vy: 0, lane: true };
  st.plunge = 0;
  st.saved = false;
  st.noFlip = 0; st.shelfRun = 0;
}
function add(st, pts) { st.score += pts * st.mult; }

function launch(st) {
  const b = st.b;
  const need = Math.sqrt(2 * T.g * (T.J[1] - T.top));
  b.vy = -need * (0.95 + 0.45 * st.plunge);
  b.lane = false;
  st.plunge = 0;
  st.save = 6;
  IC.noise(0.15, 0.05, 900);
}

// ---------- physics ----------
function closest(a, b, x, y) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy || 1;
  const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / len2, 0, 1);
  return [a[0] + dx * t, a[1] + dy * t];
}

function collideSeg(st, b, s) {
  if (s.down) return;
  const r = T.rb + 1;
  const [qx, qy] = closest(s.a, s.b, b.x, b.y);
  let nx = b.x - qx, ny = b.y - qy;
  const d = Math.hypot(nx, ny);
  if (d >= r || d === 0) return;
  nx /= d; ny /= d;
  b.x = qx + nx * r; b.y = qy + ny * r;
  const vn = b.vx * nx + b.vy * ny;
  if (vn >= 0) return;
  if (s.kind === 'shelf' && ny < 0) {
    // trampoline: always throws the ball back up, nudged towards the hinge.
    // Each bounce in a row without a flipper throws it a bit further, so a
    // bumper by the hinge can't keep passing it back
    st.shelfRun = (st.shelfRun || 0) + 1;
    b.vy = -Math.max(Math.abs(b.vy) * 0.85, T.shelfMin);
    b.vx = Math.min(b.vx * 0.3, 0) - T.shelfMin * (0.5 + 0.14 * Math.min(st.shelfRun - 1, 6));
    add(st, 25);
    st.shelfFlash = 0.35;
    IC.tone(380, 760, 0.07, 'triangle', 0.035);
    return;
  }
  // a slingshot that has just fired needs a moment to recharge, like the real
  // thing; otherwise two of them can keep a ball bouncing between them forever
  if (s.kind === 'sling' && !(T.slingCool > 0) && vn < -T.V * 0.12) {
    b.vx -= vn * nx; b.vy -= vn * ny;
    b.vx += nx * T.V * 0.36; b.vy += ny * T.V * 0.36;
    add(st, 10);
    s.flash = 0.12;
    T.slingCool = 0.55;
    IC.tone(1200, 600, 0.04, 'square', 0.025);
    return;
  }
  const e = s.e ?? 0.45;
  b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
  if (s.kind === 'target') hitTarget(st, s);
}

// Genius Bar: knock down all three $1,000 quotes to decline them.
function hitTarget(st, s) {
  s.down = true;
  st.drops++;
  add(st, 500);
  IC.tone(700, 350, 0.08, 'square', 0.03);
  if (T.targets.every((q) => q.down)) {
    st.quotes++;
    add(st, 5000);
    T.targetsUp = 1.2;
    st.msg = { text: 'Quote declined', t: 1.6 };
    IC.tone(660, 660, 0.1, 'triangle', 0.04); IC.tone(880, 880, 0.1, 'triangle', 0.04, 0.1); IC.tone(1320, 1320, 0.2, 'triangle', 0.04, 0.2);
  }
}

function collideFlipper(st, b, f) {
  const tip = [f.p[0] + Math.cos(f.a) * T.fl, f.p[1] + Math.sin(f.a) * T.fl];
  const r = T.rb + T.rb * 0.55;
  const [qx, qy] = closest(f.p, tip, b.x, b.y);
  let nx = b.x - qx, ny = b.y - qy;
  const d = Math.hypot(nx, ny);
  if (d >= r || d === 0) return;
  nx /= d; ny /= d;
  b.x = qx + nx * r; b.y = qy + ny * r;
  // surface velocity of the flipper at the contact point
  const rx = qx - f.p[0], ry = qy - f.p[1];
  const fvx = -f.w * ry, fvy = f.w * rx;
  const rvx = b.vx - fvx, rvy = b.vy - fvy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return;
  st.noFlip = 0; st.shelfRun = 0;
  const e = 0.25;
  b.vx = rvx - (1 + e) * vn * nx + fvx;
  b.vy = rvy - (1 + e) * vn * ny + fvy;
}

function collideBumper(st, b, k) {
  const dx = b.x - k.x, dy = b.y - k.y, d = Math.hypot(dx, dy), r = T.rb + k.r;
  if (d >= r || d === 0) return;
  const nx = dx / d, ny = dy / d;
  b.x = k.x + nx * r; b.y = k.y + ny * r;
  if (k.cool > 0) {
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vy -= 1.6 * vn * ny; }
    return;
  }
  const sp = Math.max(Math.hypot(b.vx, b.vy) * 0.8, T.V * 0.6);
  b.vx = nx * sp; b.vy = ny * sp;
  k.flash = 0.15;
  k.cool = 0.12;
  k.rot = (k.rot || 0) + 0.9;
  add(st, k.pts || 100);
  if (k === T.crab) {
    st.pinches++;
    k.boost = 0.7;
    st.msg = { text: 'Pinched', t: 0.8 };
    IC.tone(900, 1400, 0.06, 'square', 0.03); IC.tone(1400, 900, 0.06, 'square', 0.03, 0.06);
    return;
  }
  st.hits++;
  IC.tone(520 + Math.random() * 80, 260, 0.08, 'square', 0.03);
}

function stepFlippers(dt) {
  for (const f of T.flips) {
    const on = f.side > 0 ? held.l : held.r;
    const target = on ? f.up : f.rest;
    const speed = on ? W_UP : W_DOWN;
    const diff = target - f.a;
    const stepA = Math.sign(diff) * Math.min(Math.abs(diff), speed * dt);
    f.w = dt > 0 ? stepA / dt : 0;
    f.a += stepA;
  }
}

function physics(st, dt) {
  const b = st.b;
  if (!b) return;
  if (b.lane) {
    // resting on the line in the plunger lane
    b.x = T.plungeAt[0]; b.y = T.plungeAt[1]; b.vx = b.vy = 0;
    if (held.plunge) st.plunge = Math.min(1, st.plunge + dt * 1.2);
    else if (st.plunge > 0) launch(st);
    return;
  }
  const h = dt / SUB, vmax = T.V * 3, sp = T.spin;
  for (let i = 0; i < SUB; i++) {
    stepFlippers(h);
    b.vy += T.g * h;
    const spd = Math.hypot(b.vx, b.vy);
    if (spd > vmax) { b.vx *= vmax / spd; b.vy *= vmax / spd; }
    const px = b.x;
    b.x += b.vx * h; b.y += b.vy * h;
    // through the spudger: it spins with the speed of the shot
    if (sp && (px - sp.x) * (b.x - sp.x) < 0 && b.y > sp.y0 - T.rb && b.y < sp.y1 + T.rb) sp.w = Math.min(sp.w + Math.abs(b.vx) / (T.rb * 0.9), 140);
    for (const s of T.segs) collideSeg(st, b, s);
    for (const k of T.bumpers) collideBumper(st, b, k);
    if (T.crab) collideBumper(st, b, T.crab);
    for (const f of T.flips) collideFlipper(st, b, f);
  }
  // rollover lanes
  for (const ln of T.lanes) {
    if (!ln.lit && Math.abs(b.x - ln.x) < T.rb * 1.6 && Math.abs(b.y - ln.y) < T.rb * 1.4) {
      ln.lit = true; add(st, 250);
      IC.tone(990, 1480, 0.08, 'triangle', 0.035);
      if (T.lanes.every((q) => q.lit)) {
        T.lanes.forEach((q) => { q.lit = false; });
        st.mult = Math.min(5, st.mult + 1);
        add(st, 1000);
        st.msg = { text: `${TB.word} lit. Multiplier x${st.mult}`, t: 1.6 };
        IC.tone(660, 660, 0.1, 'triangle', 0.04); IC.tone(990, 990, 0.18, 'triangle', 0.04, 0.1);
      }
    }
  }
  // a soft plunge that falls back re-arms the plunger
  if (b.x > T.right - T.laneW && b.y > T.J[1] - T.rb * 3 && Math.abs(b.vy) < T.V * 0.05) { serve(st); st.save = 0; return; }
  // stuck somewhere flat (not cradled on a flipper): a little nudge
  const cradled = T.flips.some((f) => Math.hypot(b.x - f.p[0], b.y - f.p[1]) < T.fl + T.rb * 2);
  if (!cradled && Math.hypot(b.vx, b.vy) < T.V * 0.03) { st.stuck += dt; if (st.stuck > 1.5) { b.vy = -T.V * 0.4; b.vx = (Math.random() - 0.5) * T.V * 0.3; st.stuck = 0; } }
  else st.stuck = 0;
  // loitering in one small spot for five seconds: the table gets a nudge towards the flippers
  if (!st.anchor || Math.hypot(b.x - st.anchor[0], b.y - st.anchor[1]) > T.rb * 6 || cradled) { st.anchor = [b.x, b.y]; st.loiter = 0; }
  else if ((st.loiter += dt) > 5) {
    const cx = (T.flips[0].p[0] + T.flips[1].p[0]) / 2;
    b.vx = Math.sign(cx - b.x) * T.V * 0.15; b.vy = T.V * 0.3;
    st.anchor = null;
    st.msg = { text: 'Nudge', t: 0.8 };
  }
  // twenty seconds without reaching a flipper: the table is looping it, so nudge it down
  if (st.noFlip > 20) {
    const cx = (T.flips[0].p[0] + T.flips[1].p[0]) / 2;
    b.vx = Math.sign(cx - b.x) * T.V * 0.2; b.vy = T.V * 0.35;
    st.noFlip = 0; st.loopNudges = (st.loopNudges || 0) + 1;
    st.msg = { text: 'Nudge', t: 0.8 };
  }
  // drained
  if (b.y > IC.Lo.sy + IC.Lo.sh + T.rb * 3) {
    if (st.save > 0 && !st.saved) {
      serve(st);
      st.saved = true;
      st.msg = { text: 'Ball saved', t: 1.4 };
      return;
    }
    IC.tone(300, 70, 0.6, 'sawtooth', 0.03);
    if (st.ball >= st.balls) { st.b = null; st.over = true; return; }
    st.ball++;
    st.mult = 1;
    st.msg = { text: `Ball ${st.ball} of ${st.balls}`, t: 1.4 };
    serve(st);
  }
}

// moving and spinning parts, which keep going between balls too
function stepParts(st, dt) {
  const sp = T.spin, c = T.crab;
  if (sp && sp.w > 0) {
    sp.a += sp.w * dt;
    sp.w *= Math.exp(-1.6 * dt);
    if (sp.w < 0.4) sp.w = 0;
    const half = Math.floor(sp.a / Math.PI);
    if (half > sp.half) {
      if (st && !st.over) { add(st, 25 * (half - sp.half)); st.spins += half - sp.half; }
      sp.half = half;
      IC.tone(2400, 2000, 0.015, 'square', 0.012);
    }
  }
  if (c) {
    if (c.boost > 0) c.boost -= dt;
    if (c.flash > 0) c.flash -= dt;
    if (c.cool > 0) c.cool -= dt;
    const v = c.v * (c.boost > 0 ? 2.4 : 1);
    c.x += c.dir * v * dt;
    c.walk += v * dt;
    if (c.x > c.hi) { c.x = c.hi; c.dir = -1; } else if (c.x < c.lo) { c.x = c.lo; c.dir = 1; }
  }
  if (T.targetsUp > 0 && (T.targetsUp -= dt) <= 0) T.targets.forEach((q) => { q.down = false; });
}

function step(st, dt) {
  stepParts(st, dt);
  if (st.over) return;
  if (st.save > 0) st.save -= dt;
  if (st.shelfFlash > 0) st.shelfFlash -= dt;
  if (st.msg) { st.msg.t -= dt; if (st.msg.t <= 0) st.msg = null; }
  for (const k of T.bumpers) { if (k.flash > 0) k.flash -= dt; if (k.cool > 0) k.cool -= dt; }
  if (T.slingCool > 0) T.slingCool -= dt;
  for (const s of T.segs) { if (s.flash > 0) s.flash -= dt; if (s.cool > 0) s.cool -= dt; }
  if (st.b && st.b.lane) stepFlippers(dt);
  physics(st, dt);
  if (st.b && !st.b.lane) { st.airT += dt; st.noFlip = (st.noFlip || 0) + dt; }
}

// ---------- autopilot ----------
let botHold = { l: 0, r: 0 };
function bot(st, dt) {
  const b = st.b;
  botHold.l -= dt; botHold.r -= dt;
  if (b && b.lane) { held.plunge = st.plunge < 0.5 + Math.random() * 0.3; }
  else held.plunge = false;
  // flip when the ball reaches the outer half of a flipper, as a player would
  if (b && !b.lane && b.vy > -T.V * 0.05) {
    for (const f of T.flips) {
      const dx = (b.x - f.p[0]) * f.side, dy = b.y - f.p[1];
      if (dx > T.fl * 0.4 && dx < T.fl * 1.05 && dy > -T.rb * 4 && dy < T.fl * 0.6) { if (f.side > 0) botHold.l = 0.16; else botHold.r = 0.16; }
    }
  }
  held.l = botHold.l > 0; held.r = botHold.r > 0;
}

// ---------- drawing ----------
// The playfield is the column left of the hinge plus the wing above the line.
function fieldPath(g) {
  const L = IC.Lo;
  g.beginPath();
  g.rect(L.sx, L.sy, T.J[0] - L.sx, L.sh);
  g.rect(T.J[0], L.sy, L.sx + L.sw - T.J[0], T.J[1] - L.sy);
}

// The themed tables paint their own playfield once per layout.
function paintBackground() {
  if (tbId === 'neon') return null;
  const L = IC.Lo, c = IC.makeCanvas(IC.W, IC.H), g = c.getContext('2d'), rr = IC.mulberry(11);
  g.scale(IC.DPR, IC.DPR);
  const x0 = L.sx, y0 = L.sy, w = L.sw, h = L.sh;
  // the sealed corner is the cabinet's backbox
  g.fillStyle = '#0c0c14';
  g.fillRect(T.J[0], T.J[1], x0 + w - T.J[0], y0 + h - T.J[1]);
  g.save();
  fieldPath(g);
  g.clip();
  if (tbId === 'genius') {
    // the light oak of a store table, with grain
    const gr = g.createLinearGradient(x0, y0, x0 + w * 0.3, y0 + h);
    gr.addColorStop(0, '#dcbd8f'); gr.addColorStop(1, '#c49a64');
    g.fillStyle = gr; g.fillRect(x0, y0, w, h);
    g.lineWidth = 1;
    for (let y = y0; y < y0 + h; y += 2 + rr() * 5) {
      g.strokeStyle = `rgba(120,78,34,${0.05 + rr() * 0.09})`;
      const a = rr() * 6, f = 0.004 + rr() * 0.006, amp = 1 + rr() * 3;
      g.beginPath();
      for (let x = x0; x <= x0 + w; x += 8) { const yy = y + Math.sin(x * f + a) * amp; if (x === x0) g.moveTo(x, yy); else g.lineTo(x, yy); }
      g.stroke();
    }
  } else if (tbId === 'bench') {
    // a blue anti-static mat with a grid
    const gr = g.createLinearGradient(x0, y0, x0, y0 + h);
    gr.addColorStop(0, '#1f63ad'); gr.addColorStop(1, '#164d8a');
    g.fillStyle = gr; g.fillRect(x0, y0, w, h);
    const step = Math.max(12, T.rb * 2.2);
    for (let i = 0, x = x0; x < x0 + w; x += step, i++) { g.fillStyle = i % 5 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.14)'; g.fillRect(x, y0, 1, h); }
    for (let i = 0, y = y0; y < y0 + h; y += step, i++) { g.fillStyle = i % 5 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.14)'; g.fillRect(x0, y, w, 1); }
    // ruler along the left edge
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0, y = y0; y < y0 + h; y += step / 2, i++) g.fillRect(T.left + 2, y, i % 2 ? 4 : 8, 1);
  } else if (tbId === 'beach') {
    // sand, with the sea along the top
    const gr = g.createLinearGradient(x0, y0, x0, y0 + h);
    gr.addColorStop(0, '#f1d6a0'); gr.addColorStop(1, '#ddb576');
    g.fillStyle = gr; g.fillRect(x0, y0, w, h);
    for (let i = 0; i < (w * h) / 220; i++) {
      g.fillStyle = rr() < 0.5 ? 'rgba(150,104,48,0.22)' : 'rgba(255,248,226,0.5)';
      g.fillRect(x0 + rr() * w, y0 + rr() * h, 1 + rr(), 1 + rr());
    }
    const seaY = T.top + T.colH * 0.16;
    const wave = (yy, amp, f, ph) => { for (let x = x0; x <= x0 + w + 6; x += 6) g.lineTo(x, yy + Math.sin(x * f + ph) * amp); };
    g.fillStyle = 'rgba(160,120,70,0.25)';
    g.beginPath(); g.moveTo(x0, y0); wave(seaY + T.rb * 1.4, T.rb * 0.5, 0.02, 1); g.lineTo(x0 + w, y0); g.closePath(); g.fill();
    const sea = g.createLinearGradient(x0, y0, x0, seaY);
    sea.addColorStop(0, '#0f6f9e'); sea.addColorStop(1, '#3cb4c9');
    g.fillStyle = sea;
    g.beginPath(); g.moveTo(x0, y0); wave(seaY, T.rb * 0.6, 0.025, 0); g.lineTo(x0 + w, y0); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = Math.max(2, T.rb * 0.35);
    g.beginPath(); g.moveTo(x0, seaY); wave(seaY, T.rb * 0.6, 0.025, 0); g.stroke();
  }
  g.restore();
  return c;
}

function rail(a, b, w, color = TB.rail) {
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = w + 2; ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
}

function drawBumper(k) {
  const r = k.r, lit = k.flash > 0;
  ctx.save();
  ctx.translate(k.x, k.y);
  if (lit) { ctx.shadowColor = tbId === 'neon' ? k.color : '#ffffff'; ctx.shadowBlur = r * 1.5; }
  if (tbId === 'genius') {
    // round white store tables with a blue ring
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = lit ? '#0071e3' : '#f7f7f9'; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(2, r * 0.16); ctx.strokeStyle = '#0071e3'; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = lit ? '#ffffff' : 'rgba(0,113,227,0.18)'; ctx.fill();
  } else if (tbId === 'bench') {
    // screw heads, pentalobe
    const gr = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    gr.addColorStop(0, lit ? '#ffffff' : '#f2f4f8'); gr.addColorStop(0.6, '#b8bfca'); gr.addColorStop(1, '#6f7785');
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = gr; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.stroke();
    ctx.rotate(k.rot || 0);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, q = i % 2 ? r * 0.2 : r * 0.46;
      if (i) ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q); else ctx.moveTo(Math.cos(a) * q, Math.sin(a) * q);
    }
    ctx.closePath(); ctx.fillStyle = lit ? '#ff9f0a' : '#2b2f36'; ctx.fill();
  } else if (tbId === 'beach') {
    // beach balls
    ctx.rotate(k.rot || 0);
    const cols = ['#ff3b30', '#ffffff', '#0a84ff', '#ffffff', '#ffd60a', '#ffffff'];
    cols.forEach((c, i) => {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, (i / 6) * Math.PI * 2, ((i + 1) / 6) * Math.PI * 2); ctx.closePath();
      ctx.fillStyle = c; ctx.fill();
    });
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.rotate(-(k.rot || 0));
    ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.4, r * 0.25, 0, Math.PI * 2); ctx.fillStyle = lit ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)'; ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = lit ? '#ffffff' : k.color; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
  }
  ctx.restore();
}

// Genius Bar quotes: red tags that drop flat when hit.
function drawTargets() {
  const rb = T.rb;
  for (const s of T.targets) {
    const x = s.a[0], w = s.b[0] - s.a[0], h = rb * 1.5, y = s.a[1] - h / 2;
    ctx.save();
    if (s.down) {
      ctx.globalAlpha = 0.35;
      IC.rrect(ctx, x, s.a[1] - rb * 0.2, w, rb * 0.4, rb * 0.2);
      ctx.fillStyle = '#8a1a14'; ctx.fill();
      ctx.restore();
      continue;
    }
    IC.rrect(ctx, x, y, w, h, rb * 0.35);
    const gr = ctx.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, '#ff6157'); gr.addColorStop(1, '#d82a20');
    ctx.fillStyle = gr; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(90,0,0,0.6)'; ctx.stroke();
    ctx.restore();
    const fs = Math.min(h * 0.62, w / 3.6);
    IC.text(fs >= 7 ? '$1,000' : '$', x + w / 2, s.a[1] + 0.5, fs, { weight: 800, shadow: false });
  }
}

// Teardown spudger: a flat black stick that flips over as it spins.
function drawSpinner() {
  const sp = T.spin, rb = T.rb, len = sp.y1 - sp.y0, face = Math.abs(Math.cos(sp.a));
  const w = rb * 0.9 * face + 1.5;
  ctx.save();
  IC.rrect(ctx, sp.x - w / 2, sp.y0 + rb * 0.4, w, len - rb * 0.4, Math.min(w / 2, rb * 0.3));
  ctx.fillStyle = face > 0.3 ? '#1c1c1e' : '#3a3a3e'; ctx.fill();
  ctx.fillStyle = '#ff9f0a';
  ctx.fillRect(sp.x - w / 2, sp.y1 - rb * 0.6, w, rb * 0.6);
  ctx.beginPath(); ctx.arc(sp.x, sp.y0 + rb * 0.4, rb * 0.3, 0, Math.PI * 2); ctx.fillStyle = '#d9dde4'; ctx.fill();
  ctx.restore();
}

function drawCrab() {
  const c = T.crab, r = c.r, lit = c.flash > 0, step = Math.sin(c.walk * 0.5);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.strokeStyle = '#b5300f'; ctx.lineWidth = Math.max(1.5, r * 0.14); ctx.lineCap = 'round';
  // legs
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const a = 0.35 + i * 0.32 + (i % 2 ? step : -step) * 0.12;
      ctx.beginPath(); ctx.moveTo(sx * r * 0.55, r * 0.15); ctx.lineTo(sx * r * (0.95 + i * 0.12), r * 0.2 + Math.sin(a) * r * 0.65); ctx.stroke();
    }
  }
  // claws
  for (const sx of [-1, 1]) {
    // a round pincer with a notch that opens and shuts
    const open = lit ? 0.7 : 0.3 + 0.12 * Math.sin(IC.clock * 6), na = sx > 0 ? -Math.PI / 4 : (-Math.PI * 3) / 4;
    const px = sx * r * 1.12, py = -r * 0.7;
    ctx.beginPath(); ctx.moveTo(sx * r * 0.6, -r * 0.1); ctx.lineTo(sx * r * 1.05, -r * 0.55); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, r * 0.32, na + open, na - open + Math.PI * 2); ctx.closePath();
    ctx.fillStyle = lit ? '#ffffff' : '#ff5a36'; ctx.fill();
  }
  // body
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.75, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = lit ? '#ffffff' : '#ff5a36'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(120,20,0,0.6)'; ctx.stroke();
  // eyes on stalks
  for (const sx of [-1, 1]) {
    ctx.strokeStyle = '#b5300f'; ctx.lineWidth = Math.max(1, r * 0.1);
    ctx.beginPath(); ctx.moveTo(sx * r * 0.2, -r * 0.4); ctx.lineTo(sx * r * 0.25, -r * 0.75); ctx.stroke();
    ctx.beginPath(); ctx.arc(sx * r * 0.25, -r * 0.82, r * 0.14, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(sx * r * 0.25 + c.dir * r * 0.04, -r * 0.82, r * 0.07, 0, Math.PI * 2); ctx.fillStyle = '#111'; ctx.fill();
  }
  ctx.restore();
}

function drawTable() {
  const L = IC.Lo, rb = T.rb;
  ctx.save();
  if (T.bg) ctx.drawImage(T.bg, 0, 0, IC.W, IC.H);
  else {
    // dim the playfield so the ball reads, but leave the sealed corner as it is
    ctx.fillStyle = 'rgba(6,6,22,0.38)';
    fieldPath(ctx);
    ctx.fill();
  }
  // on the light tables, a dark groove under the line keeps it readable
  if (TB.light) {
    ctx.strokeStyle = 'rgba(40,24,8,0.45)'; ctx.lineWidth = L.U * 2.6; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(L.J[0], L.J[1]); ctx.lineTo(L.aEnd[0], L.aEnd[1]); ctx.moveTo(L.J[0], L.J[1]); ctx.lineTo(L.bEnd[0], L.bEnd[1]); ctx.stroke();
  }
  if (T.apron) {
    // the apron is solid plastic, with Speck printed on it
    const a = T.apron, gr = ctx.createLinearGradient(0, a[0][1], 0, a[2][1]);
    gr.addColorStop(0, TB.apron[0]); gr.addColorStop(1, TB.apron[1]);
    ctx.beginPath(); a.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    ctx.fillStyle = gr; ctx.fill();
    const w = a[1][0] - a[0][0], low = Math.min(a[2][1], L.sy + L.sh);
    if (w > T.rb * 10) {
      const sx = a[0][0] + w * 0.4, sy = (a[1][1] + low) / 2, sr = Math.min(w * 0.12, (low - a[1][1]) * 0.25);
      ctx.globalAlpha = 0.45;
      IC.speckIcon(ctx, sx, sy, sr);
      if (tbId === 'beach') {
        // sunglasses
        ctx.fillStyle = '#111';
        for (const ex of [-0.1, 0.44]) { ctx.beginPath(); ctx.ellipse(sx + ex * sr, sy - 0.1 * sr, 0.2 * sr, 0.14 * sr, 0, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillRect(sx - 0.1 * sr, sy - 0.14 * sr, 0.54 * sr, 0.05 * sr);
      }
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
  ctx.lineCap = 'round';
  for (const s of T.segs) {
    if (IC.Lo.std && (s.kind === 'shelf' || s.line || (s.kind === 'wall' && s.a[1] === T.J[1] && s.b[1] === T.J[1]))) continue;
    if (s.kind === 'sling' || s.kind === 'target') continue;
    rail(s.a, s.b, Math.max(2, rb * 0.35), s.kind === 'post' ? TB.post : TB.rail);
  }
  // slingshots
  for (const [a, b, c] of T.slings) {
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath();
    ctx.fillStyle = TB.sling; ctx.fill();
  }
  for (const s of T.segs) if (s.kind === 'sling') rail(s.a, s.b, Math.max(2.5, rb * 0.5), s.flash > 0 ? '#ffffff' : TB.slingEdge);
  // lanes
  for (const ln of T.lanes) {
    IC.text(ln.ch, ln.x, ln.y + T.lh * 0.15, clamp(rb * 1.5, 10, 20), { weight: 800, color: ln.lit ? TB.laneLit : TB.lane, shadow: tbId === 'beach' || (ln.lit && !TB.light) });
  }
  if (T.chip) {
    // the part the screws hold down
    const c = T.chip;
    ctx.save();
    IC.rrect(ctx, c.x - c.s / 2, c.y - c.s / 2, c.s, c.s, c.s * 0.12);
    ctx.fillStyle = '#1c1f26'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,214,10,0.8)';
    for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) {
      const t = (i + 0.5) / 4 - 0.5;
      ctx.fillRect(c.x + t * c.s - 1, c.y + sd * c.s * 0.5 - (sd > 0 ? 0 : 3), 2, 3);
      ctx.fillRect(c.x + sd * c.s * 0.5 - (sd > 0 ? 0 : 3), c.y + t * c.s - 1, 3, 2);
    }
    ctx.restore();
  }
  for (const k of T.bumpers) drawBumper(k);
  if (T.targets.length) drawTargets();
  if (T.spin) drawSpinner();
  if (T.crab) drawCrab();
  // flippers
  for (const f of T.flips) {
    const tip = [f.p[0] + Math.cos(f.a) * T.fl, f.p[1] + Math.sin(f.a) * T.fl];
    const r0 = rb * 0.85, r1 = rb * 0.45, nx = -Math.sin(f.a), ny = Math.cos(f.a);
    ctx.beginPath();
    ctx.moveTo(f.p[0] + nx * r0, f.p[1] + ny * r0);
    ctx.lineTo(tip[0] + nx * r1, tip[1] + ny * r1);
    ctx.arc(tip[0], tip[1], r1, f.a + Math.PI / 2, f.a - Math.PI / 2, true);
    ctx.lineTo(f.p[0] - nx * r0, f.p[1] - ny * r0);
    ctx.arc(f.p[0], f.p[1], r0, f.a - Math.PI / 2, f.a + Math.PI / 2, true);
    ctx.closePath();
    ctx.fillStyle = TB.flip; ctx.fill();
    ctx.strokeStyle = TB.flipEdge; ctx.lineWidth = Math.max(1.5, rb * 0.22); ctx.stroke();
    ctx.beginPath(); ctx.arc(f.p[0], f.p[1], r0 * 0.35, 0, Math.PI * 2); ctx.fillStyle = '#8e8e93'; ctx.fill();
  }
}

function drawBall(b) {
  const r = T.rb;
  const gr = ctx.createRadialGradient(b.x - r * 0.35, b.y - r * 0.4, r * 0.1, b.x, b.y, r);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#c7c9d1'); gr.addColorStop(1, '#5d6070');
  ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
  ctx.fillStyle = gr; ctx.fill();
  if (TB.light) { ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke(); }
}

// The sealed corner becomes the score display.
function drawDisplay(st) {
  const z = T.sealed, D = TB.disp;
  if (z.w < 60 || z.h < 40) return;
  const pad = Math.min(z.w, z.h) * 0.12;
  const x = z.x + pad, y = z.y + pad, w = z.w - pad * 2 - (IC.FRAMED ? 0 : IC.safe.r), h = Math.min(z.h - pad * 2 - (IC.FRAMED ? 0 : IC.safe.b), w * 0.5);
  if (w < 40 || h < 24) return;
  ctx.save();
  IC.rrect(ctx, x, y, w, h, Math.min(12, h * 0.15));
  ctx.fillStyle = D.bg; ctx.fill();
  ctx.strokeStyle = D.edge; ctx.lineWidth = 1; ctx.stroke();
  const big = Math.min(h * 0.36, w / 7);
  const line1 = st && st.msg ? st.msg.text : TB.display;
  ctx.restore();
  IC.text(fmt(st ? st.score : 0), x + w / 2, y + h * 0.44, big, { weight: 800, color: D.fg, shadow: false });
  IC.text(line1, x + w / 2, y + h * 0.8, Math.min(big * 0.36, w / (line1.length * 0.62)), { weight: 700, color: D.fg2, shadow: false, alpha: 0.9 });
}

function drawPlunger(st) {
  const b = st && st.b;
  if (!b || !b.lane || IC.state !== 'play') return;
  const x = T.right - T.laneW / 2, y0 = T.J[1] - T.rb * 2.4, hgt = T.rb * 6 * Math.max(0.15, st.plunge || 0.15);
  ctx.save();
  ctx.fillStyle = TB.light ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)';
  ctx.fillRect(x - T.laneW * 0.18, y0 - T.rb * 6, T.laneW * 0.36, T.rb * 6);
  ctx.fillStyle = st.plunge > 0.85 ? '#ff375f' : '#30d158';
  ctx.fillRect(x - T.laneW * 0.18, y0 - hgt, T.laneW * 0.36, hgt);
  ctx.restore();
  const tx = Math.max(T.J[0] + T.ww * 0.35, T.right - T.laneW - 60);
  IC.text(IC.FRAMED ? 'Hold space' : 'Hold to launch', tx, T.J[1] - T.rb * 3, clamp(T.rb * 1.3, 11, 16), { alpha: 0.6 + 0.4 * Math.sin(IC.clock * 5), align: 'right', color: TB.text, shadow: !TB.light });
}

// ---------- input ----------
function sideOf(x) { return x < IC.Lo.sx + IC.Lo.sw / 2 ? 'l' : 'r'; }
function refreshTouch() {
  let l = false, r = false;
  for (const s of touches.values()) { if (s === 'l') l = true; else r = true; }
  held.l = l || keyHeld.l; held.r = r || keyHeld.r;
  held.plunge = touches.size > 0 || keyHeld.p;
}
const keyHeld = { l: false, r: false, p: false };

// ---------- tests ----------
// Every table: the ball never leaves the table or gets into the sealed corner,
// never bounces around for a minute without reaching a flipper (a trap), and
// each table's own piece gets used. Very long autopilot games are counted, not
// failed: the autopilot is still playing.
function selftest(n) {
  const keep = tbId, out = {}, problems = [];
  for (const id of ORDER) {
    pick(id);
    build();
    let balls = 0, time = 0, hits = 0, maxSpeed = 0, escapes = 0, drops = 0, quotes = 0, spins = 0, pinches = 0, long = 0, trapped = 0, loops = 0, where = null;
    for (let gm = 0; gm < n; gm++) {
      const st = fresh();
      serve(st);
      let t = 0;
      while (!st.over && t < 900) {
        bot(st, IC.STEP);
        step(st, IC.STEP);
        t += IC.STEP;
        const b = st.b;
        if (b) {
          if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) { problems.push(`${id}: NaN ball`); break; }
          maxSpeed = Math.max(maxSpeed, Math.hypot(b.vx, b.vy) / T.V);
          if (b.x < T.left - T.rb || b.x > T.right + T.rb || b.y < T.top - T.rb) { escapes++; b.lane = true; }
          if (b.x > T.J[0] + T.rb && b.y > T.J[1] + T.rb && b.y < T.bot) { escapes++; b.lane = true; }
          if (st.noFlip > 60) { trapped++; break; }
          // while a loop is building up, note where the ball spends its time
          if (st.noFlip > 12 && !where) where = { wing: 0, n: 0, y: 0, x: 0 };
          if (where && where.n < 2000 && st.noFlip > 12) { where.n++; if (b.x > T.J[0] && b.y < T.J[1]) where.wing++; where.x += (b.x - T.left) / (T.right - T.left); where.y += (b.y - T.top) / (T.bot - T.top); }
        }
      }
      loops += st.loopNudges || 0;
      balls += st.ball; time += t; hits += st.hits; drops += st.drops; quotes += st.quotes; spins += st.spins; pinches += st.pinches;
      if (t >= 900) long++;
    }
    if (escapes) problems.push(`${id}: ${escapes} escapes`);
    if (trapped) problems.push(`${id}: ball trapped away from the flippers ${trapped} times`);
    if (loops > n / 2) problems.push(`${id}: ${loops} loop nudges in ${n} games`);
    if (id === 'genius' && T.targets.length && !drops) problems.push('genius: no quote ever hit');
    if (id === 'bench' && !spins) problems.push('bench: the spudger never spun');
    if (id === 'beach' && T.crab && !pinches) problems.push('beach: the crab never got hit');
    if (where && where.n) where = { wing: +(where.wing / where.n).toFixed(2), x: +(where.x / where.n).toFixed(2), y: +(where.y / where.n).toFixed(2) };
    out[id] = { loops, where, long, ballSec: +(time / balls).toFixed(1), hits: +(hits / n).toFixed(0), maxV: +maxSpeed.toFixed(2), drops, quotes, spins, pinches, targets: T.targets.length, crab: !!T.crab, spinner: !!T.spin };
  }
  pick(keep);
  build();
  return { games: n, tables: out, rb: +T.rb.toFixed(1), problems };
}

const bestKey = () => (tbId === 'neon' ? 'pinball' : `pinball.${tbId}`);

IC.register({
  id: 'pinball',
  name: 'Pinball',
  label: 'Pinball',
  unit: 'pts',
  how: 'Tap the left or right half to flip. Hold to launch.',
  howKeys: 'Left and right arrows to flip. Hold space to launch.',
  icon(g, s) {
    IC.iconBg(g, s, '#3a1030', '#120414');
    IC.iconLine(g, [[s * 0.62, s * 1.1], [s * 0.62, s * 0.58], [s * 1.1, s * 0.58]], s * 0.035);
    const bump = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, r * 0.4, 0, Math.PI * 2); g.fill(); };
    bump(s * 0.3, s * 0.3, s * 0.09, '#ff375f'); bump(s * 0.52, s * 0.22, s * 0.07, '#0a84ff'); bump(s * 0.8, s * 0.36, s * 0.07, '#ffd60a');
    g.save();
    g.lineCap = 'round'; g.strokeStyle = '#f5f5f7'; g.lineWidth = s * 0.07;
    g.beginPath(); g.moveTo(s * 0.14, s * 0.76); g.lineTo(s * 0.3, s * 0.84); g.moveTo(s * 0.56, s * 0.76); g.lineTo(s * 0.42, s * 0.84); g.stroke();
    g.restore();
    const gr = g.createRadialGradient(s * 0.36, s * 0.55, s * 0.01, s * 0.38, s * 0.57, s * 0.06);
    gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#6d7080');
    g.fillStyle = gr; g.beginPath(); g.arc(s * 0.38, s * 0.57, s * 0.055, 0, Math.PI * 2); g.fill();
  },
  // the table picker on the title card
  titleExtra() {
    return `<div class="row">${ORDER.map((id) => `<button data-act="opt" data-v="${id}"${id === tbId ? ' class="on"' : ''}>${TABLES[id].name}</button>`).join('')}</div>`;
  },
  option(id) {
    pick(id);
    IC.store.pinTable = tbId;
    IC.save();
    build();
    S = null;
  },
  bestKey,
  hudDark: () => tbId === 'genius',          // the beach keeps white text over the sea
  layout: build,
  relayout() { build(); if (S && S.b) serve(S); },
  reset() { build(); S = null; },
  start() {
    build();
    S = fresh();
    serve(S);
    touches.clear();
    Object.assign(held, { l: false, r: false, plunge: false });
    Object.assign(keyHeld, { l: false, r: false, p: false });
  },
  leave() { touches.clear(); },
  update(dt) {
    if (!T) build();
    if (!S || IC.state !== 'play') { stepFlippers(dt); stepParts(null, dt); return; }
    if (IC.BOT) bot(S, dt);
    step(S, dt);
    if (S.over && !S.sent) {
      S.sent = true;
      const extra = tbId === 'genius' ? `${fmt(S.quotes)} quote${S.quotes === 1 ? '' : 's'} declined`
        : tbId === 'bench' ? `${fmt(S.spins)} spudger spin${S.spins === 1 ? '' : 's'}`
        : tbId === 'beach' ? `Pinched ${fmt(S.pinches)} time${S.pinches === 1 ? '' : 's'}`
        : `${fmt(S.hits)} bumper hits`;
      IC.end({ why: TB.drain, score: S.score, unit: 'pts', extra, delay: 0.6 });
    }
  },
  render() {
    if (!T) build();
    drawTable();
    if (S && S.shelfFlash > 0) IC.glowAlong(IC.Lo.LB, IC.Lo.total, 'rgba(120,255,180,0.9)', 2.4, S.shelfFlash * 2.5);
    IC.drawLine();
    drawDisplay(S);
    drawPlunger(S);
    if (S && S.b) drawBall(S.b);
  },
  down(p) { touches.set(p.id, sideOf(p.x)); refreshTouch(); },
  up(p) { touches.delete(p.id); refreshTouch(); },
  key(k, isDown) {
    if (k === 'ArrowLeft' || k === 'z' || k === 'Z' || k === 'a' || k === 'A') keyHeld.l = isDown;
    else if (k === 'ArrowRight' || k === 'm' || k === 'M' || k === 'l' || k === 'L' || k === '/') keyHeld.r = isDown;
    else if (k === ' ' || k === 'ArrowDown' || k === 'Enter') keyHeld.p = isDown;
    else return false;
    refreshTouch();
    return true;
  },
  hud() { return S ? { main: fmt(S.score), sub: `Ball ${S.ball} of ${S.balls}${S.mult > 1 ? `  x${S.mult}` : ''}` } : { main: '', sub: '' }; },
  share: (r) => (tbId === 'neon'
    ? `I scored ${fmt(r.score)} on a pinball table made out of my Duo's green line.`
    : `I scored ${fmt(r.score)} on the ${TB.name} pinball table on my Duo's green line.`),
  selftest,
});
})();
