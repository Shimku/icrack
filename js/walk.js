// Walk the Line: Speck, a grain of sand in your hinge, walks the defect.
//
// Bad: dead pixels open holes in the line, and $1,000 repair bills slide along it.
// Good: iFixit kits drop in now and then. Carrying one fixes the next hole or
// bill for free.
//
// Fairness rules, each one closing a way an earlier version could corner you:
// - holes keep a jump's length from the ends of the line, the corner and each other
// - bills enter from the end Speck is walking away from and lift off before
//   they reach an end, so nothing arrives just as he turns round
// - landing on a bill bounces him; a short grace window covers late taps at holes
// The selftest replays every death and searches tap timings to prove it could
// have been avoided.
(() => {
'use strict';
const { clamp, lerp, smooth, fmt, rnd } = IC;
const R = IC.SPECK_R, LEG = IC.SPECK_LEG;
const JUMP_H = 9.5, JUMP_T = 0.6;
const VJ = (4 * JUMP_H) / JUMP_T, GRAV = (2 * VJ) / JUMP_T;
const BUFFER = 0.14, COYOTE = 0.08;
const SPEED0 = 26, SPEED1 = 46, RAMP = 80;
const KIT_G = 150, KIT_H0 = 34;
const WARN = 0.75;
const STEP = IC.STEP;

let S = null;          // the run, as plain data so tests can copy and replay it
let press = false;     // a tap waiting for the next step
let ended = false;

const ramp = (t) => smooth(clamp(t / RAMP, 0, 1));
const speedAt = (t) => lerp(SPEED0, SPEED1, ramp(t));
const ends = () => IC.ends(R * 1.2);
const r01 = (st) => rnd(st.rng);
const score = (st) => Math.floor(st.dist * IC.DUO_PX_PER_U);
const live = (z) => !(z.leave > 0) && !(z.sink > 0);

function fresh(seed) {
  const L = IC.Lo, e = ends();
  const st = {
    t: 0, dist: 0, spawnT: 1.4, kitT: 0, milestone: 0, taps: 0, rng: { s: seed | 0 }, nextId: 1,
    sp: { s: clamp(L.LB + Math.min(6, L.LA * 0.1), e.lo, e.hi), dir: 1, h: 0, vh: 0, grounded: true, buffer: 0, overHole: 0, walk: 0, squash: 0 },
    hz: [], gaps: [], kit: 0, kits: 0, fixes: 0, popup: null, dead: null, deadT: 0, rideId: 0, why: '',
  };
  st.kitT = 10 + r01(st) * 6;
  return st;
}

function holeAt(st, s, tol) {
  for (const g of st.gaps) if (g.state === 'open' && s > g.s0 + tol && s < g.s0 + g.len - tol) return g;
  return null;
}

function jump(st) {
  const sp = st.sp;
  sp.grounded = false; sp.vh = VJ; sp.buffer = 0; sp.overHole = 0; sp.squash = -0.7;
  IC.tone(420, 780, 0.09, 'square', 0.03);
}

function bounce(st, h) {
  const sp = st.sp;
  sp.h = h; sp.squash = 0.6;
  sp.vh = sp.buffer > 0 ? VJ : VJ * 0.72;       // a tap just before landing gets the full jump
  sp.buffer = 0;
  IC.tone(300, 900, 0.12, 'triangle', 0.04);
}

// ---------- one step of the run ----------
function step(st, dt, tap) {
  const sp = st.sp;
  if (st.popup) { st.popup.t -= dt; if (st.popup.t <= 0) st.popup = null; }
  if (st.dead) { st.deadT += dt; stepWorld(st, dt); return; }
  st.t += dt;
  const v = speedAt(st.t), e = ends();
  if (tap) { sp.buffer = BUFFER; st.taps++; }
  sp.s += sp.dir * v * dt;
  if (sp.s >= e.hi) { sp.s = e.hi; sp.dir = -1; } else if (sp.s <= e.lo) { sp.s = e.lo; sp.dir = 1; }
  st.dist += v * dt;
  sp.walk += v * dt;
  sp.squash += (0 - sp.squash) * Math.min(1, dt * 12);
  if (sp.buffer > 0) { if (sp.grounded) jump(st); else sp.buffer -= dt; }
  if (!sp.grounded) {
    sp.vh -= GRAV * dt;
    sp.h += sp.vh * dt;
    if (sp.h <= 0) {
      sp.h = 0; sp.vh = 0; sp.grounded = true; sp.squash = 0.8;
      fxPuff(sp.s);
      if (sp.buffer > 0) jump(st);
    }
  }
  const m = Math.floor(score(st) / 10000);
  if (m > st.milestone) { st.milestone = m; IC.tone(880, 880, 0.1, 'triangle', 0.04); IC.tone(1320, 1320, 0.16, 'triangle', 0.035, 0.09); }
  stepWorld(st, dt);
  collide(st, dt);
  if (st.dead) return;
  st.spawnT -= dt;
  if (st.spawnT <= 0) st.spawnT = trySpawn(st) ? lerp(2.1, 0.95, smooth(clamp(st.t / 90, 0, 1))) * (0.8 + 0.45 * r01(st)) : 0.12;
  // the next kit is only on its way while he has none and none is about
  if (!st.kit && !st.hz.some((z) => z.kind === 'kit')) {
    st.kitT -= dt;
    if (st.kitT <= 0) st.kitT = spawnKit(st) ? 20 + r01(st) * 10 : 0.5;
  }
}

function stepWorld(st, dt) {
  const L = IC.Lo, cv = speedAt(st.t) * 0.25;
  for (const z of st.hz) {
    if (z.leave > 0) { z.leave += dt; z.h += (z.kind === 'bill' ? 22 : 45) * dt; continue; }
    if (z.sink > 0) { z.sink += dt; continue; }
    if (z.kind === 'bill') {
      z.v = cv;
      z.s += z.dir * z.v * dt;
      const toEnd = z.dir > 0 ? L.total - z.s : z.s;
      if (toEnd < 20) z.leave = dt;                    // lifted off before it reaches an end
      else if (holeAt(st, z.s, 0)) z.sink = dt;        // drops into an open hole
    } else {
      z.s += z.dir * z.v * dt;
      z.vh -= KIT_G * dt;
      z.h += z.vh * dt;
      if (z.h <= 0) {
        z.h = 0;
        if (holeAt(st, z.s, 0)) z.sink = dt; else z.vh = z.bounce;
      }
      const toEnd = z.dir > 0 ? L.total - z.s : z.s;
      if (toEnd < 16) z.leave = dt;
    }
  }
  st.hz = st.hz.filter((z) => !z.gone && !(z.leave > 0.6) && !(z.sink > 0.6));
  for (const g of st.gaps) {
    g.t += dt;
    if (g.state === 'warn' && g.t >= g.warn) { g.state = 'open'; g.t = 0; fxSparks(g); }
    else if (g.state === 'open' && g.t >= g.open) g.state = 'done';
  }
  st.gaps = st.gaps.filter((g) => g.state !== 'done');
}

function collide(st, dt) {
  const sp = st.sp;
  const hole = sp.grounded ? holeAt(st, sp.s, R * 0.5) : null;
  if (hole) {
    sp.overHole += dt;
    if (sp.overHole > COYOTE) { if (st.kit) fix(st, hole); else return die(st, 'gap'); }
  } else sp.overHole = 0;
  const falling = !sp.grounded && sp.vh < 0;
  for (const z of st.hz) {
    if (!live(z) || z.gone) continue;
    if (z.kind === 'bill') {
      const top = z.ht * 0.8;
      if (Math.abs(sp.s - z.s) >= z.w / 2 + R * 0.5 || sp.h >= top) continue;
      if (falling && sp.h > top - 1.2) { bounce(st, top); fxPuff(sp.s); continue; }
      if (st.kit) { fix(st, z); continue; }
      return die(st, 'bill', z);
    }
    const ds = Math.max(0, Math.abs(sp.s - z.s) - (z.hw - z.r));
    const dh = sp.h + LEG + R - (z.h + z.r);
    const rr = R * 0.9 + z.r;
    if (ds * ds + dh * dh < rr * rr) grab(st, z);
  }
  st.hz = st.hz.filter((z) => !z.gone);
}

function grab(st, z) {
  z.gone = true;
  st.kit = 1; st.kits++;
  st.popup = { text: 'iFixit kit', t: 1.2, good: true };
  if (!IC.silent) {
    const p = IC.at(z.s, z.h + z.r);
    IC.burst(p[0], p[1], 10, ['#3d9bff', '#ffffff', '#9fd0ff'], 14, [0.3, 0.7], 0.5);
  }
  IC.tone(660, 990, 0.08, 'triangle', 0.04);
  IC.tone(990, 1480, 0.12, 'triangle', 0.035, 0.07);
}

// The kit gets used up on whatever would have killed him: holes close, bills tear.
function fix(st, thing) {
  st.kit = 0; st.fixes++;
  st.popup = { text: 'Fixed it yourself', t: 1.4, good: true };
  st.sp.overHole = 0;
  if (thing.kind === 'bill') {
    thing.gone = true;
    if (!IC.silent) {
      const p = IC.at(thing.s, thing.ht * 0.5);
      IC.burst(p[0], p[1], 14, ['#ff4a3d', '#ffffff', '#ffb3ad'], 18, [0.4, 0.9], 0.6);
    }
  } else {
    thing.state = 'done';
    fxSparks(thing);
  }
  IC.tone(520, 1040, 0.1, 'square', 0.03);
  IC.tone(780, 1560, 0.14, 'triangle', 0.04, 0.08);
}

function die(st, kind, z) {
  st.dead = kind; st.deadT = 0;
  if (kind === 'bill') { st.rideId = z.id; st.why = 'Billed $1,000.'; }
  else st.why = 'Fell through a dead pixel.';
  if (kind === 'gap') IC.tone(520, 60, 0.6, 'sawtooth', 0.035);
  else IC.tone(900, 180, 0.28, 'triangle', 0.05);
  if (!IC.silent) {
    const p = IC.at(st.sp.s, st.sp.h + LEG + R);
    IC.burst(p[0], p[1], 12, ['#ecc57e', '#bf8a45', '#fff0c9'], 18, [0.3, 0.8], 0.7);
  }
}

// ---------- hazards and kits ----------
function trySpawn(st) {
  const pool = [['bill', 3]];
  if (st.t > 6) pool.push(['gap', 3.5]);
  let x = r01(st) * pool.reduce((a, p) => a + p[1], 0), kind = pool[0][0];
  for (const p of pool) { if ((x -= p[1]) < 0) { kind = p[0]; break; } }
  return kind === 'bill' ? spawnBill(st) : spawnHole(st);
}

// The repair bill for a new inner display, creeping along at a quarter of Speck's speed.
function spawnBill(st) {
  const L = IC.Lo, sp = st.sp, w = 9;
  const bills = st.hz.filter((z) => z.kind === 'bill' && live(z));
  if (bills.length >= (st.t > 40 ? 3 : 2)) return false;
  const fromA = sp.dir < 0;                          // the end he's walking away from
  const s = fromA ? L.total + w / 2 : -w / 2;
  if (Math.abs(sp.s - s) < 30 || bills.some((z) => Math.abs(z.s - s) < 32)) return false;
  st.hz.push({ id: st.nextId++, kind: 'bill', s, dir: fromA ? -1 : 1, v: speedAt(st.t) * 0.25, w, ht: 3.1, h: 0, seed: r01(st) * 10 });
  return true;
}

// A stretch of the line flickers, then dies for a few seconds.
function spawnHole(st) {
  const L = IC.Lo, sp = st.sp, v = speedAt(st.t), e = ends(), jl = v * JUMP_T;
  if (st.gaps.length >= 2) return false;
  const len = Math.min(lerp(6, 11, ramp(st.t)) * (0.8 + 0.4 * r01(st)), jl * 0.62);
  for (const side of [1, -1]) {
    const d = v * WARN + 6 + r01(st) * 20;
    const s0 = side * sp.dir > 0 ? sp.s + d : sp.s - d - len;
    if (s0 < e.lo + jl + 6 || s0 + len > e.hi - jl - 6) continue;
    if (s0 + len > L.LB - 8 && s0 < L.LB + 8) continue;
    if (st.gaps.some((g) => s0 < g.s0 + g.len + jl + 8 && s0 + len > g.s0 - jl - 8)) continue;
    if (st.hz.some((z) => z.kind === 'bill' && !(z.leave > 0) && Math.abs(z.s - (s0 + len / 2)) < len / 2 + z.w / 2 + 6)) continue;
    st.gaps.push({ s0, len, state: 'warn', t: 0, warn: WARN, open: 2.2 + r01(st) * 1.2, seed: (r01(st) * 1000) | 0 });
    IC.tone(2600, 1900, 0.03, 'square', 0.012);
    IC.tone(2200, 1500, 0.03, 'square', 0.01, 0.06);
    return true;
  }
  return false;
}

// An iFixit kit drops onto the line well ahead of Speck and bounces along it.
function spawnKit(st) {
  const sp = st.sp, v = speedAt(st.t), e = ends();
  const tl = Math.sqrt((2 * KIT_H0) / KIT_G);
  const dir = r01(st) < 0.7 ? -sp.dir : sp.dir;
  const vk = 7 + r01(st) * 6;
  const spAt = sp.s + sp.dir * v * tl;
  if (spAt < e.lo + 2 || spAt > e.hi - 2) return false;
  const land = spAt + sp.dir * (18 + r01(st) * 22);
  const s = land - dir * vk * tl;
  if (land < e.lo + 20 || land > e.hi - 20 || s < e.lo + 4 || s > e.hi - 4) return false;
  if (holeAt(st, land, -3)) return false;
  const r = 2.1;
  st.hz.push({ id: st.nextId++, kind: 'kit', s, dir, v: vk, h: KIT_H0, vh: 0, bounce: Math.sqrt(2 * KIT_G * (4 + r01(st) * 5)), r, hw: r * 1.15 });
  return true;
}

// Autopilot for tests: jump when something is about to arrive.
function botTap(st) {
  const sp = st.sp;
  if (!sp.grounded) return false;
  const v = speedAt(st.t) * sp.dir;
  for (const z of st.hz) {
    if (z.kind !== 'bill' || !live(z)) continue;
    const ds = z.s - sp.s, rv = z.dir * z.v - v;
    if (ds * rv >= 0) continue;
    const tc = (Math.abs(ds) - z.w / 2 - R * 0.6) / Math.abs(rv);
    if (tc < 0.09) return true;
  }
  for (const g of st.gaps) {
    const near = sp.dir > 0 ? g.s0 - sp.s : sp.s - (g.s0 + g.len);
    if (near > 0 && near < Math.abs(v) * 0.1) return true;
  }
  return false;
}

// ---------- effects (skipped while tests replay) ----------
function fxPuff(s) {
  if (IC.silent) return;
  const p = IC.at(s, 0), U = IC.Lo.U;
  for (let i = 0; i < 4; i++) IC.addPart(p[0], p[1], IC.rand(-8, 8) * U, IC.rand(-7, -1) * U, 0.35, IC.rand(0.35, 0.7) * U, 'rgba(236,197,126,0.7)');
}
function fxSparks(g) {
  if (IC.silent) return;
  const p = IC.at(g.s0 + g.len / 2, 0), U = IC.Lo.U;
  for (let i = 0; i < 7; i++) IC.addPart(p[0], p[1], IC.rand(-14, 14) * U, IC.rand(-16, -3) * U, 0.5, IC.rand(0.3, 0.6) * U, i % 2 ? '#7dffcf' : '#ff5cf0');
}

// ---------- drawing ----------
const ctx = IC.ctx;
const fadeOf = (z) => clamp(z.leave > 0 ? 1 - z.leave / 0.6 : z.sink > 0 ? 1 - z.sink / 0.6 : 1, 0, 1);

// Holes are cut out of the drawn line and also marked with stakes and tape,
// because software can't switch off a real stuck line.
function drawHoles() {
  const U = IC.Lo.U;
  for (const g of S.gaps) {
    const warn = g.state === 'warn';
    const on = !warn || Math.floor(IC.clock * lerp(6, 16, g.t / g.warn)) % 2 === 0;
    const a = IC.at(g.s0, 0), b = IC.at(g.s0 + g.len, 0);
    ctx.save();
    if (!warn) {
      const p = IC.base(g.s0), q = IC.base(g.s0 + g.len);
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(6,4,12,0.6)';
      ctx.lineWidth = 1.3 * U;
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      const rr = IC.mulberry(g.seed);
      for (let i = 0; i < 4; i++) {
        const c = IC.base(g.s0 + rr() * g.len), sz = 0.5 * U;
        ctx.fillStyle = ['#3dff7d', '#ff3df2', '#ffffff', '#3df6ff'][i];
        ctx.fillRect(c[0] + (rr() - 0.5) * U - sz / 2, c[1] + (rr() - 0.5) * U - sz / 2, sz, sz);
      }
    }
    if (on) {
      // stakes at each end, tape between them
      const color = warn ? '#ffb020' : '#ff4a3d';
      for (const [s, p] of [[g.s0, a], [g.s0 + g.len, b]]) {
        const top = IC.at(s, 2.6);
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.5, 0.4 * U);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(top[0], top[1]); ctx.stroke();
      }
      const ta = IC.at(g.s0, 2), tb = IC.at(g.s0 + g.len, 2);
      ctx.setLineDash([0.9 * U, 0.7 * U]);
      ctx.lineWidth = Math.max(1, 0.28 * U);
      ctx.beginPath(); ctx.moveTo(ta[0], ta[1]); ctx.lineTo(tb[0], tb[1]); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
}

// A red price tag with the string trailing behind. Drawn unmirrored so the
// price reads the right way round whichever way it's going.
function drawBill(z) {
  const U = IC.Lo.U, [x, y, a] = IC.at(z.s, z.h || 0), f = z.dir * IC.Lo.faceSign;
  const w = z.w * U, h = z.ht * U, moving = live(z);
  const hop = moving ? Math.abs(Math.sin(IC.clock * 8 + z.seed)) * 0.45 * U : 0;
  ctx.save();
  ctx.globalAlpha = fadeOf(z);
  ctx.translate(x, y);
  ctx.rotate(a + Math.PI / 2);
  if (z.sink > 0) { ctx.translate(0, z.sink * 6 * U); ctx.scale(1 - z.sink, 1 - z.sink); }
  ctx.translate(0, -hop);
  ctx.rotate(moving ? Math.sin(IC.clock * 8 + z.seed) * 0.04 * f : 0);
  const X = (u) => f * u;                         // +u is the leading end
  const tip = -w / 2, shoulder = -w / 2 + h * 0.5, hole = [X(-w / 2 + h * 0.42), -h / 2];
  // string
  const sway = Math.sin(IC.clock * 6 + z.seed) * 0.5 * U;
  ctx.beginPath();
  ctx.moveTo(hole[0], hole[1]);
  ctx.quadraticCurveTo(X(tip - 1.6 * U), -h - 0.6 * U + sway, X(tip - 2.4 * U), -h * 0.15 + sway);
  ctx.lineWidth = Math.max(1, 0.14 * U); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
  // tag
  ctx.beginPath();
  ctx.moveTo(X(tip), -h / 2);
  ctx.lineTo(X(shoulder), -h);
  ctx.arcTo(X(w / 2), -h, X(w / 2), 0, 0.35 * U);
  ctx.arcTo(X(w / 2), 0, X(shoulder), 0, 0.35 * U);
  ctx.lineTo(X(shoulder), 0);
  ctx.closePath();
  const gr = ctx.createLinearGradient(0, -h, 0, 0);
  gr.addColorStop(0, '#ff6157'); gr.addColorStop(1, '#d82a20');
  ctx.fillStyle = gr; ctx.fill();
  ctx.lineWidth = Math.max(1, 0.12 * U); ctx.strokeStyle = 'rgba(90,0,0,0.55)'; ctx.stroke();
  ctx.beginPath(); ctx.arc(hole[0], hole[1], 0.3 * U, 0, Math.PI * 2);
  ctx.fillStyle = '#2a1030'; ctx.fill();
  ctx.lineWidth = Math.max(1, 0.12 * U); ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${1.95 * U}px ${IC.FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('$1,000', X((shoulder + w / 2) / 2), -h / 2 + 0.1 * U);
  ctx.restore();
}

// A little blue repair kit with a screwdriver on the lid. (cx, cy) is its centre.
function kitShape(cx, cy, r, th) {
  const w = r * 2.3, h = r * 1.6;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(th);
  ctx.beginPath(); ctx.arc(0, -h / 2, r * 0.42, Math.PI, 0);
  ctx.lineWidth = Math.max(1, r * 0.22); ctx.strokeStyle = '#1b4f9c'; ctx.stroke();
  IC.rrect(ctx, -w / 2, -h / 2, w, h, r * 0.32);
  const gr = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  gr.addColorStop(0, '#4aa3ff'); gr.addColorStop(1, '#1a6fd6');
  ctx.fillStyle = gr; ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.1); ctx.strokeStyle = '#0d3d80'; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(-w / 2 + r * 0.2, -h * 0.06, w - r * 0.4, Math.max(1, r * 0.08));
  // screwdriver
  ctx.rotate(-0.5);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, r * 0.13);
  ctx.beginPath(); ctx.moveTo(-r * 0.1, 0); ctx.lineTo(r * 0.75, 0); ctx.stroke();
  ctx.lineWidth = Math.max(1.5, r * 0.34);
  ctx.beginPath(); ctx.moveTo(-r * 0.72, 0); ctx.lineTo(-r * 0.15, 0); ctx.stroke();
  ctx.restore();
}

function drawKit(z) {
  const U = IC.Lo.U, [x, y, a] = IC.at(z.s, z.h + z.r), r = z.r * U;
  ctx.save();
  ctx.globalAlpha = fadeOf(z);
  const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
  glow.addColorStop(0, `rgba(120,190,255,${0.35 + 0.15 * Math.sin(IC.clock * 6)})`);
  glow.addColorStop(1, 'rgba(120,190,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, Math.PI * 2); ctx.fill();
  kitShape(x, y, r, a + Math.PI / 2 + Math.sin(IC.clock * 5 + z.id) * 0.12);
  ctx.restore();
}

function drawSpeck() {
  const sp = S.sp, L = IC.Lo;
  const o = { sx: 1, sy: 1, spin: 0, scale: 1, eyes: 'open', walk: null, look: 0 };
  let s = sp.s, h = sp.h;
  if (S.dead === 'gap') {
    const k = clamp(S.deadT / 0.9, 0, 1);
    o.scale = 1 - k; o.spin = k * 9; h = -k * 3; o.eyes = 'x';
  } else if (S.dead === 'bill') {
    const z = S.hz.find((q) => q.id === S.rideId);
    if (!z) return;
    s = z.s; h = z.ht * 0.9 + (z.h || 0); o.spin = Math.sin(IC.clock * 6) * 0.3; o.eyes = 'x';
    if (z.leave > 0) o.alpha = fadeOf(z);
  } else {
    o.sx = 1 + 0.22 * sp.squash; o.sy = 1 - 0.22 * sp.squash;
    if (IC.state === 'play' && sp.grounded) o.walk = sp.walk;
    if (IC.state !== 'play') { o.sy *= 1 + 0.04 * Math.sin(IC.clock * 3); o.look = Math.sin(IC.clock * 0.9) * 1.5; }
  }
  // the kit he's carrying, on his back
  if (S.kit && !S.dead) {
    const [kx, ky, ka] = IC.at(s - sp.dir * R * 1.05, h + LEG + R * 1.1);
    kitShape(kx, ky, 1.1 * L.U, ka + Math.PI / 2 - sp.dir * L.faceSign * 0.25);
  }
  const [x, y, a] = IC.at(s, h);
  IC.drawSpeck(x, y, a + Math.PI / 2, sp.dir * L.faceSign, o);
}

function drawWords() {
  const U = IC.Lo.U, fs = clamp(U * 2.4, 12, 22);
  if (S.popup) {
    const [x, y] = IC.at(S.sp.s, S.sp.h + 11);
    IC.text(S.popup.text, x, y, fs, { weight: 800, color: S.popup.good ? '#9fd0ff' : '#ff8a8a', alpha: Math.min(1, S.popup.t * 2) });
  }
  if (IC.state === 'play' && !S.taps && !S.dead && S.t < 6) {
    const [x, y] = IC.at(S.sp.s, 12);
    IC.text(IC.FRAMED ? 'Click or press space to jump' : 'Tap to jump', x, y, fs * 0.9, { alpha: Math.min(1, (6 - S.t) * 2) * (0.6 + 0.4 * Math.sin(IC.clock * 5)) });
  }
}

// ---------- tests ----------
// Rewind to just before a death and try every tap timing (none, one or two
// taps). If nothing survives the next half second, the death was unavoidable.
function avoidable(snapJSON, deathT) {
  const t0 = JSON.parse(snapJSON).t, n = Math.ceil((deathT - t0) / STEP);
  const slots = [];
  for (let k = 0; k < n; k += 6) slots.push(k);
  const tries = [[]];
  for (const a of slots) tries.push([a]);
  for (const a of slots) for (const b of slots) if (b >= a + 24) tries.push([a, b]);
  const horizon = n + Math.round(0.5 / STEP);
  for (const taps of tries) {
    const st = JSON.parse(snapJSON);
    let ok = true;
    for (let i = 0; i < horizon; i++) {
      step(st, STEP, taps.includes(i));
      if (st.dead) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

function selftest(n) {
  IC.silent = true;
  const runs = [], deaths = {}, unfair = [];
  let bad = 0, kits = 0, fixes = 0;
  for (let i = 0; i < n; i++) {
    const st = fresh(1000 + i * 7919);
    const snaps = [];
    let k = 0;
    while (!st.dead && st.t < 240) {
      if (k % 6 === 0) { snaps.push(JSON.stringify(st)); if (snaps.length > 40) snaps.shift(); }
      step(st, STEP, botTap(st));
      k++;
      if (!Number.isFinite(st.sp.s) || !Number.isFinite(st.sp.h)) { bad++; break; }
    }
    const kind = st.dead || 'timeout';
    deaths[kind] = (deaths[kind] || 0) + 1;
    kits += st.kits; fixes += st.fixes;
    if (st.dead) {
      // from about 1.2 s before the death
      const want = st.t - 1.2;
      let snap = snaps[0];
      for (const s of snaps) if (JSON.parse(s).t <= want) snap = s;
      if (!avoidable(snap, st.t)) unfair.push({ run: i, t: +st.t.toFixed(2), kind, s: +st.sp.s.toFixed(1) });
    }
    runs.push(+st.t.toFixed(1));
  }
  IC.silent = false;
  runs.sort((a, b) => a - b);
  return { n, median: runs[runs.length >> 1], min: runs[0], max: runs[runs.length - 1], deaths, kits, fixes, unfair: unfair.length, unfairRuns: unfair.slice(0, 6), bad };
}

// ---------- the game ----------
IC.register({
  id: 'walk',
  name: 'Walk the Line',
  label: 'Walk the Line',
  unit: 'px',
  how: 'A speck of sand lives in your hinge.',
  icon(g, s) {
    IC.iconBg(g, s, '#1d1c4f', '#7a569f');
    IC.iconLine(g, [[s * 0.3, s * 1.1], [s * 0.3, s * 0.64], [s * 1.1, s * 0.64]], s * 0.035);
    IC.speckIcon(g, s * 0.58, s * 0.47, s * 0.13);
    g.strokeStyle = '#2a1a0c'; g.lineWidth = s * 0.03; g.lineCap = 'round';
    g.beginPath(); g.moveTo(s * 0.54, s * 0.585); g.lineTo(s * 0.53, s * 0.625); g.moveTo(s * 0.62, s * 0.585); g.lineTo(s * 0.63, s * 0.625); g.stroke();
  },
  reset() { S = fresh((Math.random() * 1e9) | 0); ended = false; },
  start() {
    S = fresh((Math.random() * 1e9) | 0);
    ended = false;
    jump(S);                                         // he pops out of the crack
  },
  relayout(prev) {
    if (!S) return;
    S.sp.s = IC.remapS(prev, S.sp.s);
    for (const z of S.hz) z.s = IC.remapS(prev, z.s);
    for (const g of S.gaps) g.s0 = IC.remapS(prev, g.s0);
  },
  update(dt) {
    if (!S) return;
    if (IC.state === 'play') {
      const tap = press || (IC.BOT && botTap(S));
      press = false;
      step(S, dt, tap);
      if (S.dead && !ended) {
        ended = true;
        const n = S.fixes;
        IC.end({ why: S.why, score: score(S), unit: 'px', delay: 1.1,
          extra: n ? `Fixed it yourself ${n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`}` : '',
          fine: S.dead === 'gap' ? 'A new inner display is $1,000.' : '' });
      }
    } else if (IC.state === 'over') step(S, dt, false);
    else S.sp.s = clamp(S.sp.s, ends().lo, ends().hi);
  },
  render() {
    if (!S) return;
    const cuts = S.gaps.filter((g) => g.state === 'open' || (g.state === 'warn' && Math.floor(IC.clock * lerp(8, 22, g.t / g.warn)) % 2 === 0)).map((g) => [g.s0, g.s0 + g.len]);
    IC.drawLine({ cuts });
    drawHoles();
    for (const z of S.hz) (z.kind === 'bill' ? drawBill : drawKit)(z);
    drawSpeck();
    drawWords();
  },
  down() { press = true; },
  key(k, isDown) {
    if (isDown && (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'Enter')) { press = true; return true; }
    return false;
  },
  hud() { return { main: `${fmt(score(S))} px`, sub: IC.best('walk') ? `Best ${fmt(IC.best('walk'))}` : '' }; },
  share: (r) => `Speck walked ${fmt(r.score)} px on the Green Line of Death.`,
  selftest,
});
})();
