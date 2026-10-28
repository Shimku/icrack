// Pinball: the line is part of the table. The hinge line is the wall beside
// the right flipper. The line across is a trampoline shelf that throws the ball
// back into play, and the plunger ball sits on it. The corner sealed off below
// the shelf is where the score display goes.
(() => {
'use strict';
const { clamp, fmt } = IC;
const ctx = IC.ctx;
const SUB = 10;                         // physics substeps per game step
const FL_REST = (28 * Math.PI) / 180, FL_UP = (26 * Math.PI) / 180;
const W_UP = 26, W_DOWN = 14;

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
  const seg = (a, b, kind = 'wall', ex = {}) => segs.push(Object.assign({ a, b, kind }, ex));
  const arc = (cx, cy, r, a0, a1, n) => {
    for (let i = 0; i < n; i++) {
      const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n;
      seg([cx + Math.cos(t0) * r, cy + Math.sin(t0) * r], [cx + Math.cos(t1) * r, cy + Math.sin(t1) * r]);
    }
  };
  // outline: left wall, rounded top corners, the wing's right wall down to the line
  const cr = Math.min(cw, colH) * 0.2, cr2 = Math.max(laneW * 1.8, Math.min(ww, wh) * 0.22);
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
  // top lanes D U O, near the top of the left column
  // top lanes sit below the Home button and score
  const cx = left + cw / 2, lane = Math.min(cw, colH * 0.7) * 0.22, ly = top + Math.max(cr * 0.55, 3 * rb, 46), lh = 3.2 * rb;
  const lanes = [-1, 0, 1].map((i) => ({ x: cx + i * lane, y: ly + lh * 0.55, lit: false, ch: 'DUO'[i + 1] }));
  for (const i of [-1.5, -0.5, 0.5, 1.5]) seg([cx + i * lane, ly], [cx + i * lane, ly + lh], 'post', { e: 0.4 });
  // bumpers: three in the column, two in the wing
  const br = clamp(Math.min(cw, colH) * 0.085, rb * 1.6, rb * 3.4);
  const upTop = ly + lh + br * 1.6, upBot = Math.min(py - 0.64 * lw - br, J[1] + (bot - J[1]) * 0.15);
  const midY = (upTop + upBot) / 2;
  // over the flippers, so none sit above the apron
  const bx = xl + lw / 2, bs = Math.min(lane * 1.05, lw * 0.3);
  // a triangle of three when there's height for it, otherwise two side by side
  const bumpers = upBot - upTop >= br * 2.6
    ? [
      { x: bx - bs, y: upTop + (upBot - upTop) * 0.2, r: br },
      { x: bx + bs, y: upTop + (upBot - upTop) * 0.2, r: br },
      { x: bx, y: Math.min(upBot, Math.max(midY, upTop + br * 2.6)), r: br },
    ]
    : [
      { x: bx - bs, y: Math.min(midY, upBot), r: br },
      { x: bx + bs, y: Math.min(midY, upBot), r: br },
    ];
  const wingW = ww - laneW;
  if (wingW > br * 4 && wh > br * 5) {
    const wr = clamp(Math.min(wingW, wh) * 0.09, rb * 1.6, br);
    // high in the wing, above where the trampoline throws the ball, so they feed it back
    // out instead of keeping it up there
    bumpers.push({ x: J[0] + wingW * 0.36, y: top + wh * 0.34, r: wr }, { x: J[0] + wingW * 0.7, y: top + wh * 0.2, r: wr });
  }
  bumpers.forEach((b, i) => { b.flash = 0; b.color = ['#ff375f', '#0a84ff', '#ffd60a', '#30d158', '#bf5af2'][i % 5]; });
  T = {
    left, right, top, bot, J, cw, colH, ww, wh, lw, rb, laneW, fl, py, g, V, segs, slings, lanes, bumpers, lh, ly, apron,
    flips: [
      { p: pL, side: 1, a: FL_REST, w: 0, rest: FL_REST, up: -FL_UP },
      { p: pR, side: -1, a: Math.PI - FL_REST, w: 0, rest: Math.PI - FL_REST, up: Math.PI + FL_UP },
    ],
    plungeAt: [right - laneW / 2, J[1] - rb - IC.Lo.lineHalf * IC.Lo.U - 0.5],
    shelfMin: Math.sqrt(2 * g * wh * 0.45),
    sealed: { x: J[0], y: J[1], w: right - J[0], h: bot - J[1] },
  };
}

// ---------- run ----------
function fresh() {
  return { score: 0, mult: 1, ball: 1, balls: 3, b: null, plunge: 0, save: 0, saved: false, shelfFlash: 0, msg: null, stuck: 0, over: false, overT: 0, hits: 0, airT: 0 };
}
function serve(st) {
  st.b = { x: T.plungeAt[0], y: T.plungeAt[1], vx: 0, vy: 0, lane: true };
  st.plunge = 0;
  st.saved = false;
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
    // trampoline: always throws the ball back up, nudged towards the hinge
    // each bounce carries it about one wing-height back towards the hinge
    b.vy = -Math.max(Math.abs(b.vy) * 0.85, T.shelfMin);
    b.vx = Math.min(b.vx * 0.3, 0) - T.shelfMin * 0.5;
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
  add(st, 100);
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
  const h = dt / SUB, vmax = T.V * 3;
  for (let i = 0; i < SUB; i++) {
    stepFlippers(h);
    b.vy += T.g * h;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > vmax) { b.vx *= vmax / sp; b.vy *= vmax / sp; }
    b.x += b.vx * h; b.y += b.vy * h;
    for (const s of T.segs) collideSeg(st, b, s);
    for (const k of T.bumpers) collideBumper(st, b, k);
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
        st.msg = { text: `DUO lit. Multiplier x${st.mult}`, t: 1.6 };
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

function step(st, dt) {
  if (st.over) return;
  if (st.save > 0) st.save -= dt;
  if (st.shelfFlash > 0) st.shelfFlash -= dt;
  if (st.msg) { st.msg.t -= dt; if (st.msg.t <= 0) st.msg = null; }
  for (const k of T.bumpers) { if (k.flash > 0) k.flash -= dt; if (k.cool > 0) k.cool -= dt; }
  if (T.slingCool > 0) T.slingCool -= dt;
  for (const s of T.segs) { if (s.flash > 0) s.flash -= dt; if (s.cool > 0) s.cool -= dt; }
  if (st.b && st.b.lane) stepFlippers(dt);
  physics(st, dt);
  if (st.b && !st.b.lane) st.airT += dt;
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
function rail(a, b, w, color = 'rgba(220,225,240,0.85)') {
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = w + 2; ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
}
function drawTable() {
  const L = IC.Lo, rb = T.rb;
  // dim the playfield so the ball reads, but leave the sealed corner as it is
  ctx.save();
  ctx.fillStyle = 'rgba(6,6,22,0.38)';
  ctx.beginPath();
  ctx.rect(L.sx, L.sy, T.J[0] - L.sx, L.sh);
  ctx.rect(T.J[0], L.sy, L.sx + L.sw - T.J[0], T.J[1] - L.sy);
  ctx.fill();
  if (T.apron) {
    // the apron is solid plastic, with Speck printed on it
    const a = T.apron, gr = ctx.createLinearGradient(0, a[0][1], 0, a[2][1]);
    gr.addColorStop(0, 'rgba(60,30,90,0.9)'); gr.addColorStop(1, 'rgba(25,12,40,0.95)');
    ctx.beginPath(); a.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    ctx.fillStyle = gr; ctx.fill();
    const w = a[1][0] - a[0][0], low = Math.min(a[2][1], L.sy + L.sh);
    if (w > T.rb * 10) {
      ctx.globalAlpha = 0.35;
      IC.speckIcon(ctx, a[0][0] + w * 0.4, (a[1][1] + low) / 2, Math.min(w * 0.12, (low - a[1][1]) * 0.25));
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
  ctx.lineCap = 'round';
  for (const s of T.segs) {
    if (IC.Lo.std && (s.kind === 'shelf' || s.line || (s.kind === 'wall' && s.a[1] === T.J[1] && s.b[1] === T.J[1]))) continue;
    if (s.kind === 'sling') continue;
    rail(s.a, s.b, Math.max(2, rb * 0.35), s.kind === 'post' ? 'rgba(255,255,255,0.7)' : 'rgba(205,210,230,0.75)');
  }
  // slingshots
  for (const [a, b, c] of T.slings) {
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath();
    ctx.fillStyle = 'rgba(255,55,95,0.35)'; ctx.fill();
  }
  for (const s of T.segs) if (s.kind === 'sling') rail(s.a, s.b, Math.max(2.5, rb * 0.5), s.flash > 0 ? '#ffffff' : '#ff8aa6');
  // lanes
  for (const ln of T.lanes) {
    IC.text(ln.ch, ln.x, ln.y + T.lh * 0.15, clamp(rb * 1.5, 10, 20), { weight: 800, color: ln.lit ? '#7dffb8' : 'rgba(255,255,255,0.35)', shadow: ln.lit });
  }
  // bumpers
  for (const k of T.bumpers) {
    ctx.save();
    if (k.flash > 0) { ctx.shadowColor = k.color; ctx.shadowBlur = k.r * 1.5; }
    ctx.beginPath(); ctx.arc(k.x, k.y, k.r, 0, Math.PI * 2);
    ctx.fillStyle = k.flash > 0 ? '#ffffff' : k.color; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(k.x, k.y, k.r * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
    ctx.beginPath(); ctx.arc(k.x, k.y, k.r * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
    ctx.restore();
  }
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
    ctx.fillStyle = '#f5f5f7'; ctx.fill();
    ctx.strokeStyle = '#ff375f'; ctx.lineWidth = Math.max(1.5, rb * 0.22); ctx.stroke();
    ctx.beginPath(); ctx.arc(f.p[0], f.p[1], r0 * 0.35, 0, Math.PI * 2); ctx.fillStyle = '#8e8e93'; ctx.fill();
  }
}

function drawBall(b) {
  const r = T.rb;
  const gr = ctx.createRadialGradient(b.x - r * 0.35, b.y - r * 0.4, r * 0.1, b.x, b.y, r);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#c7c9d1'); gr.addColorStop(1, '#5d6070');
  ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
  ctx.fillStyle = gr; ctx.fill();
}

// The sealed corner becomes the score display.
function drawDisplay(st) {
  const z = T.sealed;
  if (z.w < 60 || z.h < 40) return;
  const pad = Math.min(z.w, z.h) * 0.12;
  const x = z.x + pad, y = z.y + pad, w = z.w - pad * 2 - (IC.FRAMED ? 0 : IC.safe.r), h = Math.min(z.h - pad * 2 - (IC.FRAMED ? 0 : IC.safe.b), w * 0.5);
  if (w < 40 || h < 24) return;
  ctx.save();
  IC.rrect(ctx, x, y, w, h, Math.min(12, h * 0.15));
  ctx.fillStyle = 'rgba(20,6,0,0.75)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,140,40,0.35)'; ctx.lineWidth = 1; ctx.stroke();
  const big = Math.min(h * 0.36, w / 7);
  const line1 = st && st.msg ? st.msg.text : 'iCRACK PINBALL';
  ctx.restore();
  IC.text(fmt(st ? st.score : 0), x + w / 2, y + h * 0.44, big, { weight: 800, color: '#ff9f2e', shadow: false });
  IC.text(line1, x + w / 2, y + h * 0.8, Math.min(big * 0.36, w / (line1.length * 0.62)), { weight: 700, color: '#ffb35c', shadow: false, alpha: 0.9 });
}

function drawPlunger(st) {
  const b = st && st.b;
  if (!b || !b.lane || IC.state !== 'play') return;
  const x = T.right - T.laneW / 2, y0 = T.J[1] - T.rb * 2.4, hgt = T.rb * 6 * Math.max(0.15, st.plunge || 0.15);
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(x - T.laneW * 0.18, y0 - T.rb * 6, T.laneW * 0.36, T.rb * 6);
  ctx.fillStyle = st.plunge > 0.85 ? '#ff375f' : '#30d158';
  ctx.fillRect(x - T.laneW * 0.18, y0 - hgt, T.laneW * 0.36, hgt);
  ctx.restore();
  const tx = Math.max(T.J[0] + T.ww * 0.35, T.right - T.laneW - 60);
  IC.text(IC.FRAMED ? 'Hold space' : 'Hold to launch', tx, T.J[1] - T.rb * 3, clamp(T.rb * 1.3, 11, 16), { alpha: 0.6 + 0.4 * Math.sin(IC.clock * 5), align: 'right' });
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
function selftest(n) {
  build();
  const problems = [];
  let balls = 0, time = 0, hits = 0, maxSpeed = 0, escapes = 0;
  for (let gm = 0; gm < n; gm++) {
    const st = fresh();
    serve(st);
    let t = 0, lastBall = 1;
    while (!st.over && t < 600) {
      bot(st, IC.STEP);
      step(st, IC.STEP);
      t += IC.STEP;
      const b = st.b;
      if (b) {
        if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) { problems.push('NaN ball'); break; }
        maxSpeed = Math.max(maxSpeed, Math.hypot(b.vx, b.vy) / T.V);
        // never outside the walls, never inside the sealed corner
        if (b.x < T.left - T.rb || b.x > T.right + T.rb || b.y < T.top - T.rb) { escapes++; b.lane = true; }
        if (b.x > T.J[0] + T.rb && b.y > T.J[1] + T.rb && b.y < T.bot) { escapes++; b.lane = true; }
      }
      if (st.ball !== lastBall) lastBall = st.ball;
    }
    balls += st.ball; time += t; hits += st.hits;
    if (t >= 600) problems.push('game never ended');
  }
  return { games: n, avgBallSeconds: +(time / balls).toFixed(1), bumperHitsPerGame: +(hits / n).toFixed(1), maxSpeedV: +maxSpeed.toFixed(2), escapes, rb: +T.rb.toFixed(1), flipper: +T.fl.toFixed(0), problems };
}

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
    if (!S || IC.state !== 'play') { stepFlippers(dt); return; }
    if (IC.BOT) bot(S, dt);
    step(S, dt);
    if (S.over && !S.sent) {
      S.sent = true;
      IC.end({ why: 'Drained.', score: S.score, unit: 'pts', extra: `${fmt(S.hits)} bumper hits`, delay: 0.6 });
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
  share: (r) => `I scored ${fmt(r.score)} on a pinball table made out of my Duo's green line.`,
  selftest,
});
})();
