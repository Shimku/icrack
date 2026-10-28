// iCrack core: layout, the line, calibration, menus, input, sound.
// Track positions run along the L: s = 0 at the far end of the hinge line,
// s = LB at the corner, s = total at the far end. Units are U, 1% of the short side.
(() => {
'use strict';

const IC = (window.IC = { games: [], byId: {} });
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
Object.assign(IC, { canvas, ctx, $, params });

// Test switches only work on this machine, so a shared link can't run them.
const LOCAL = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const hook = (k) => (LOCAL ? params.get(k) : null);
IC.SHOT = hook('shot');                  // 'og' | 'icon': stills for the share card and icon
IC.SELFTEST = hook('selftest');          // headless fairness and logic tests
IC.SIM = hook('sim');                    // play N seconds on autopilot, then freeze
IC.BOT = (LOCAL && params.has('bot')) || !!IC.SELFTEST;
IC.TEST = !!(IC.SHOT || IC.SELFTEST || IC.SIM);
IC.FRAMED = params.has('frame') ? params.get('frame') !== '0'
  : IC.SHOT === 'og' ? true : IC.SHOT === 'icon' ? false
  : !matchMedia('(any-pointer: coarse)').matches;      // desktop: draw a Duo round the game

// Inner display, unfolded and held landscape: 2670 x 1878 px (apple.com/iphone-duo/specs).
const DUO_ASPECT = 2670 / 1878;
IC.DUO_PX_PER_U = 18.78;

// Corner of the L as fractions of the screen. Landscape is measured off owner
// photos; portrait is a stand-in for phones that aren't a Duo.
const DEFAULT_CAL = {
  landscape: { jx: 0.49, jy: 0.60, rot: 0, hide: false, double: true },
  portrait: { jx: 0.5, jy: 0.58, rot: 0, hide: false, double: true },
};
// A = long arm (corner to the side of the screen), B = hinge arm. Each step turns 90deg clockwise.
const ROTS = [
  { A: [1, 0], B: [0, 1] },
  { A: [0, 1], B: [-1, 0] },
  { A: [-1, 0], B: [0, -1] },
  { A: [0, -1], B: [1, 0] },
];

// ---------- utils ----------
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const rand = (a, b) => a + Math.random() * (b - a);
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Seeded generator whose state is a plain object, so game state can be cloned and replayed.
function rnd(st) {
  st.s = (st.s + 0x6d2b79f5) | 0;
  let t = Math.imul(st.s ^ (st.s >>> 15), 1 | st.s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const mulberry = (seed) => { const st = { s: seed }; return () => rnd(st); };
function angLerp(a, b, t) {
  const d = ((((b - a) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}
function rrect(g, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function makeCanvas(w, h, scale = IC.DPR) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  return c;
}
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif';
Object.assign(IC, { clamp, lerp, smooth, rand, fmt, esc, rnd, mulberry, angLerp, rrect, makeCanvas, FONT });

// ---------- settings ----------
const STORE_KEY = 'icrack.v1';
const store = (() => {
  if (IC.TEST) return { best: {} };
  let s = {};
  try { s = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { /* private mode */ }
  if (typeof s.best !== 'object' || s.best === null) s.best = typeof s.best === 'number' ? { walk: s.best } : {};
  return s;
})();
function save() {
  if (IC.TEST) return;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* private mode */ }
}
IC.store = store;
IC.save = save;
IC.best = (id) => store.best[id] || 0;

// In a Safari tab on the unfolded Duo the toolbars sit across the top and push
// the page down, so the default is moved up to land on the panel's real line.
function defaultCal(orient) {
  const c = Object.assign({}, DEFAULT_CAL[orient]);
  if (!IC.FRAMED && !IC.TEST && orient === 'landscape') {
    const ow = window.outerWidth, oh = window.outerHeight, top = oh - IC.H;
    const duo = ow > 0 && oh > 0 && Math.abs(ow / oh - DUO_ASPECT) < 0.05 && Math.abs(ow - IC.W) < 4;
    if (duo && top > 8 && top < oh * 0.4) c.jy = clamp((c.jy * oh - top) / IC.H, 0.05, 0.95);
  }
  return c;
}
function calFor(orient) {
  if (IC.TEST) return Object.assign({}, DEFAULT_CAL[orient]);
  return Object.assign(defaultCal(orient), (store.cal || {})[orient]);
}
function setCal(patch, persist = true) {
  store.cal = store.cal || {};
  store.cal[IC.Lo.orient] = Object.assign({}, (store.cal || {})[IC.Lo.orient], calFor(IC.Lo.orient), patch);
  if (persist) save();
  geometry();
}

// ---------- layout ----------
const safe = { t: 0, r: 0, b: 0, l: 0 };
IC.safe = safe;
let wall = null, frameBack = null, frameFront = null;

function readSafe() {
  const cs = getComputedStyle($('safe'));
  safe.t = parseFloat(cs.paddingTop) || 0;
  safe.r = parseFloat(cs.paddingRight) || 0;
  safe.b = parseFloat(cs.paddingBottom) || 0;
  safe.l = parseFloat(cs.paddingLeft) || 0;
}

function layout() {
  IC.W = innerWidth; IC.H = innerHeight;
  IC.DPR = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(IC.W * IC.DPR);
  canvas.height = Math.round(IC.H * IC.DPR);
  document.body.classList.toggle('bleed', !IC.FRAMED);
  readSafe();
  geometry();
  buildWallpaper();
  buildFrame();
}

function geometry() {
  const W = IC.W, H = IC.H;
  let sx = 0, sy = 0, sw = W, sh = H, sr = 0;
  if (IC.FRAMED) {
    sh = Math.min((H * 0.8) / 1.06, (W * 0.88) / (DUO_ASPECT + 0.06));
    sw = sh * DUO_ASPECT;
    sx = (W - sw) / 2; sy = (H - sh) / 2; sr = sh * 0.05;
  }
  const orient = sw >= sh ? 'landscape' : 'portrait';
  const cal = calFor(orient);
  let U = Math.min(sw, sh) / 100;
  if (IC.SHOT === 'icon') { Object.assign(cal, { jx: 0.3, jy: 0.62 }); U *= 2.4; }
  const { A, B } = ROTS[cal.rot & 3];
  const J = [sx + cal.jx * sw, sy + cal.jy * sh];
  const reach = (d) => (d[0] > 0 ? sx + sw - J[0] : d[0] < 0 ? J[0] - sx : d[1] > 0 ? sy + sh - J[1] : J[1] - sy);
  const LA = reach(A) / U, LB = reach(B) / U;
  // Things stand on top of whichever arm is horizontal and keep to that side round the corner.
  const aFlat = A[1] === 0;
  const Hd = aFlat ? A : B, Vd = aFlat ? B : A;
  const nH = [0, -1];
  const nV = Vd[1] > 0 ? [-Hd[0], -Hd[1]] : [Hd[0], Hd[1]];
  const nA = aFlat ? nH : nV, nB = aFlat ? nV : nH;
  const angA = Math.atan2(nA[1], nA[0]), angB = Math.atan2(nB[1], nB[0]);
  const thB = angB + Math.PI / 2;
  const faceSign = Math.sign(-B[0] * Math.cos(thB) - B[1] * Math.sin(thB)) || 1;
  const inset = (d) => (IC.FRAMED ? 0 : d[0] > 0 ? safe.r : d[0] < 0 ? safe.l : d[1] > 0 ? safe.b : safe.t);
  const prev = IC.Lo;
  IC.Lo = {
    sx, sy, sw, sh, sr, orient, cal, U, A, B, J, LA, LB, total: LA + LB, nA, nB, angA, angB, faceSign,
    insetA: inset(A) / U, insetB: inset(B) / U,
    aEnd: [J[0] + A[0] * LA * U, J[1] + A[1] * LA * U],
    bEnd: [J[0] + B[0] * LB * U, J[1] + B[1] * LB * U],
    lineHalf: 0.22, dbl: 1.9, corner: 2.16, std: (cal.rot & 3) === 0,
  };
  if (prev && IC.game) { if (IC.game.relayout) IC.game.relayout(prev); else if (IC.game.layout) IC.game.layout(); }
}

// Usable track between two margins (in U), clear of notches and the home bar.
IC.ends = (m) => ({ lo: m + IC.Lo.insetB, hi: IC.Lo.total - m - IC.Lo.insetA });
// Map s from an old layout to the same arm and fraction in the current one.
IC.remapS = (prev, s) => {
  const L = IC.Lo;
  return s < prev.LB ? (s * L.LB) / prev.LB : L.LB + ((s - prev.LB) * L.LA) / prev.LA;
};

// ---------- track ----------
function base(s) {
  const L = IC.Lo, U = L.U;
  if (s < L.LB) { const d = (L.LB - s) * U; return [L.J[0] + L.B[0] * d, L.J[1] + L.B[1] * d]; }
  const d = (s - L.LB) * U;
  return [L.J[0] + L.A[0] * d, L.J[1] + L.A[1] * d];
}
function nAng(s) {
  const L = IC.Lo, c = L.corner;
  if (s <= L.LB - c) return L.angB;
  if (s >= L.LB + c) return L.angA;
  return angLerp(L.angB, L.angA, smooth((s - (L.LB - c)) / (2 * c)));
}
// Screen point h U above the walking surface at s, plus the surface normal angle.
function at(s, h) {
  const b = base(s), a = nAng(s), d = (h + IC.Lo.lineHalf) * IC.Lo.U;
  return [b[0] + Math.cos(a) * d, b[1] + Math.sin(a) * d, a];
}
// Track position nearest to a screen point, and the distance to the line in px.
function nearest(x, y) {
  const L = IC.Lo, U = L.U;
  const proj = (p, d, len) => clamp((x - p[0]) * d[0] + (y - p[1]) * d[1], 0, len * U);
  const ta = proj(L.J, L.A, L.LA), tb = proj(L.J, L.B, L.LB);
  const pa = [L.J[0] + L.A[0] * ta, L.J[1] + L.A[1] * ta], pb = [L.J[0] + L.B[0] * tb, L.J[1] + L.B[1] * tb];
  const da = Math.hypot(x - pa[0], y - pa[1]), db = Math.hypot(x - pb[0], y - pb[1]);
  return da <= db ? { s: L.LB + ta / U, d: da, p: pa } : { s: L.LB - tb / U, d: db, p: pb };
}
Object.assign(IC, { base, nAng, at, nearest });

// ---------- particles (screen space) ----------
IC.parts = [];
IC.silent = false;                         // set while tests replay a run
IC.addPart = (x, y, vx, vy, life, size, color, grav = 60) => {
  if (!IC.silent) IC.parts.push({ x, y, vx, vy, life, t: 0, size, color, grav });
};
function stepParts(dt) {
  const U = IC.Lo.U;
  for (const p of IC.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * U * dt; }
  IC.parts = IC.parts.filter((p) => p.t < p.life);
}
function drawParts() {
  for (const p of IC.parts) {
    ctx.globalAlpha = 1 - p.t / p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}
IC.burst = (x, y, n, colors, speed = 16, size = [0.3, 0.8], life = 0.6) => {
  const U = IC.Lo.U;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = rand(0.3, 1) * speed * U;
    IC.addPart(x, y, Math.cos(a) * v, Math.sin(a) * v - speed * 0.3 * U, life, rand(size[0], size[1]) * U, colors[i % colors.length]);
  }
};

// ---------- sound ----------
let AC = null, noiseBuf = null;
function unlockAudio() {
  if (store.muted) return;
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
  } catch (e) { AC = null; }
}
IC.tone = (f0, f1, dur, type = 'square', vol = 0.03, delay = 0) => {
  if (!AC || store.muted || IC.silent) return;
  const t0 = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(AC.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
};
IC.noise = (dur, vol = 0.05, freq = 1200, delay = 0) => {
  if (!AC || store.muted || IC.silent) return;
  if (!noiseBuf) {
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = AC.currentTime + delay, src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  src.buffer = noiseBuf;
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(AC.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
};
// A held tone whose pitch and level can follow the game (the metro motor).
IC.hum = (() => {
  let o = null, g = null;
  return {
    set(freq, vol) {
      if (!AC || store.muted || IC.silent) { this.stop(); return; }
      if (!o) {
        o = AC.createOscillator(); g = AC.createGain();
        o.type = 'sawtooth'; g.gain.value = 0;
        const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
        o.connect(f).connect(g).connect(AC.destination);
        o.start();
      }
      o.frequency.setTargetAtTime(freq, AC.currentTime, 0.05);
      g.gain.setTargetAtTime(vol, AC.currentTime, 0.05);
    },
    stop() {
      if (o) { try { g.gain.setTargetAtTime(0, AC.currentTime, 0.03); o.stop(AC.currentTime + 0.2); } catch (e) { /* already stopped */ } }
      o = g = null;
    },
  };
})();

// ---------- static layers ----------
function buildWallpaper() {
  const { sw: w, sh: h } = IC.Lo;
  wall = makeCanvas(w, h);
  const g = wall.getContext('2d');
  g.scale(IC.DPR, IC.DPR);
  const rr = mulberry(5);
  // night sky over a desert, after the Duo's default wallpaper
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#0d0e2b');
  sky.addColorStop(0.3, '#1f1f55');
  sky.addColorStop(0.5, '#45367e');
  sky.addColorStop(0.64, '#7a569f');
  sky.addColorStop(0.74, '#956aab');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 160; i++) {
    const y = rr() * h * 0.55;
    g.fillStyle = `rgba(255,255,255,${(0.15 + rr() * 0.7) * (1 - y / (h * 0.6))})`;
    const r = 0.4 + rr() * 0.9;
    g.fillRect(rr() * w, y, r, r);
  }
  const ridge = (y0, amp, f, seed, top, bot) => {
    const r2 = mulberry(seed), p1 = r2() * 9, p2 = r2() * 9, p3 = r2() * 9;
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w + 4; x += 4) {
      const u = x / w;
      g.lineTo(x, h * (y0 - amp * (0.6 * Math.sin(u * f + p1) + 0.3 * Math.sin(u * f * 2.7 + p2) + 0.12 * Math.sin(u * f * 7.3 + p3))));
    }
    g.lineTo(w, h);
    g.closePath();
    const gr = g.createLinearGradient(0, h * (y0 - amp), 0, h);
    gr.addColorStop(0, top);
    gr.addColorStop(1, bot);
    g.fillStyle = gr;
    g.fill();
  };
  ridge(0.69, 0.05, 9, 2, '#3b2c5e', '#21193b');
  ridge(0.77, 0.025, 3.2, 3, '#6a4b8e', '#4e3a75');
  ridge(0.86, 0.02, 2.4, 4, '#83609f', '#644a88');
  ridge(0.94, 0.015, 2, 5, '#9a74b3', '#7a5b9d');
  g.strokeStyle = 'rgba(255,255,255,0.045)';
  g.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    const y = h * (0.79 + rr() * 0.2), x = rr() * w, len = w * (0.08 + rr() * 0.2);
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + len / 2, y - h * 0.012, x + len, y + h * 0.004);
    g.stroke();
  }
}

function buildFrame() {
  frameBack = frameFront = null;
  if (!IC.FRAMED) return;
  const { sx, sy, sw, sh, sr } = IC.Lo, b = sh * 0.03;
  frameBack = makeCanvas(IC.W, IC.H);
  const g = frameBack.getContext('2d');
  g.scale(IC.DPR, IC.DPR);
  // buttons and hinge cap on the top edge, behind the body
  g.fillStyle = '#b9b9bf';
  rrect(g, sx + sw * 0.72, sy - b - sh * 0.009, sw * 0.055, sh * 0.02, sh * 0.006); g.fill();
  rrect(g, sx + sw * 0.8, sy - b - sh * 0.009, sw * 0.04, sh * 0.02, sh * 0.006); g.fill();
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.28)';
  g.shadowBlur = sh * 0.08;
  g.shadowOffsetY = sh * 0.035;
  rrect(g, sx - b, sy - b, sw + 2 * b, sh + 2 * b, sr + b);
  g.fillStyle = '#1a1a1d';
  g.fill();
  g.restore();
  const edge = g.createLinearGradient(0, sy - b, 0, sy + sh + b);
  edge.addColorStop(0, '#dcdce1');
  edge.addColorStop(0.5, '#9a9aa1');
  edge.addColorStop(1, '#c6c6cc');
  g.lineWidth = Math.max(1.5, sh * 0.006);
  g.strokeStyle = edge;
  rrect(g, sx - b, sy - b, sw + 2 * b, sh + 2 * b, sr + b);
  g.stroke();
  g.fillStyle = '#2e2e33';
  rrect(g, sx + sw / 2 - sw * 0.035, sy - b - sh * 0.006, sw * 0.07, sh * 0.012, sh * 0.004);
  g.fill();
  rrect(g, sx, sy, sw, sh, sr);
  g.fillStyle = '#000';
  g.fill();
  frameFront = makeCanvas(IC.W, IC.H);
  const f = frameFront.getContext('2d');
  f.scale(IC.DPR, IC.DPR);
  const cx = sx + sw * 0.875, cy = sy + sh * 0.075, cr = sh * 0.022;
  f.beginPath(); f.arc(cx, cy, cr, 0, Math.PI * 2);
  f.fillStyle = '#050506'; f.fill();
  f.lineWidth = 1; f.strokeStyle = 'rgba(255,255,255,0.1)'; f.stroke();
}

// ---------- the line ----------
IC.lineHidden = () => !IC.FRAMED && !!IC.Lo.cal.hide;
IC.glitch = 0;

function trace(segs, dx = 0, dy = 0) {
  for (const [a, b] of segs) {
    const p = base(a), q = base(b);
    ctx.moveTo(p[0] + dx, p[1] + dy);
    ctx.lineTo(q[0] + dx, q[1] + dy);
  }
}
function stroke(lw, style, fn) {
  ctx.beginPath(); fn(); ctx.lineWidth = lw; ctx.strokeStyle = style; ctx.stroke();
}
// Track intervals [a, b] minus cut-outs. Only Walk the Line cuts the drawn line,
// and it marks its holes separately so they still show on a real line.
function cutSegs(a, b, cuts) {
  let segs = [[a, b]];
  for (const [g0, g1] of cuts) {
    const next = [];
    for (const [x, y] of segs) {
      if (g1 <= x || g0 >= y) { next.push([x, y]); continue; }
      if (g0 > x) next.push([x, g0]);
      if (g1 < y) next.push([g1, y]);
    }
    segs = next;
  }
  return segs;
}

IC.drawLine = (opts = {}) => {
  if (IC.lineHidden()) return;
  const L = IC.Lo, U = L.U, cuts = opts.cuts || [];
  // the crease, faintly, the whole way across
  const far = Math.max(IC.W, IC.H) * 2, [jx, jy] = L.J;
  ctx.beginPath();
  ctx.moveTo(jx - L.B[0] * far, jy - L.B[1] * far);
  ctx.lineTo(jx + L.B[0] * far, jy + L.B[1] * far);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.stroke();
  const segA = cutSegs(L.LB, L.total, cuts), segB = cutSegs(0, L.LB, cuts);
  const ox = L.B[0] * L.dbl * U, oy = L.B[1] * L.dbl * U, dbl = L.cal.double;
  const armA = () => { trace(segA); if (dbl) trace(segA, ox, oy); };
  const armB = () => trace(segB);
  ctx.save();
  ctx.globalAlpha = (IC.glitch > 0 ? 0.3 : 0.94 + 0.06 * Math.sin(IC.clock * 37) * Math.sin(IC.clock * 11)) * (opts.alpha ?? 1);
  ctx.lineCap = 'butt';
  ctx.globalCompositeOperation = 'lighter';
  stroke(3.0 * U, 'rgba(50,255,150,0.13)', armA);
  stroke(2.2 * U, 'rgba(90,255,140,0.10)', armB);
  ctx.globalCompositeOperation = 'source-over';
  stroke(0.95 * U, 'rgba(40,255,140,0.8)', () => trace(segA));
  if (dbl) stroke(0.8 * U, 'rgba(40,240,200,0.75)', () => trace(segA, ox, oy));
  stroke(0.75 * U, 'rgba(120,255,120,0.7)', armB);
  stroke(0.44 * U, '#f2fff6', () => trace(segA));
  if (dbl) stroke(0.34 * U, '#ecfffa', () => trace(segA, ox, oy));
  stroke(0.3 * U, '#f6ffec', armB);
  // hot spot where the two lines meet
  const r = 2.2 * U, gr = ctx.createRadialGradient(jx, jy, 0, jx, jy, r);
  gr.addColorStop(0, 'rgba(245,255,248,0.95)');
  gr.addColorStop(0.3, 'rgba(90,255,170,0.45)');
  gr.addColorStop(1, 'rgba(60,255,160,0)');
  ctx.fillStyle = gr;
  ctx.beginPath(); ctx.arc(jx, jy, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
};

// Extra light along part of the track. Shows on a real line too, since it is
// drawn round the line rather than instead of it.
IC.glowAlong = (s0, s1, color, width, alpha = 1) => {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  const segs = [];
  const L = IC.Lo;
  if (s0 < L.LB) segs.push([s0, Math.min(s1, L.LB)]);
  if (s1 > L.LB) segs.push([Math.max(s0, L.LB), s1]);
  stroke(width * L.U, color, () => trace(segs));
  ctx.restore();
};

// Calibration guide: same geometry in pink, so it's easy to tell from the real line.
function drawGuide() {
  const L = IC.Lo, U = L.U, ox = L.B[0] * L.dbl * U, oy = L.B[1] * L.dbl * U;
  const segA = [[L.LB, L.total]], segB = [[0, L.LB]];
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.globalAlpha = L.cal.hide ? 0.35 : 0.9;
  stroke(1.1 * U, 'rgba(255,70,200,0.25)', () => { trace(segA); trace(segB); });
  stroke(0.3 * U, '#ff5ad2', () => { trace(segA); trace(segB); });
  if (L.cal.double) stroke(0.24 * U, '#ff5ad2', () => trace(segA, ox, oy));
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(L.J[0], L.J[1], 4 * U, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// ---------- Speck ----------
// A grain of sand.
const SPECK_R = 2.4, SPECK_LEG = 0.9;
IC.SPECK_R = SPECK_R; IC.SPECK_LEG = SPECK_LEG;
const GRAIN = [[-2.62, 1.0], [-1.78, 1.05], [-0.88, 0.97], [0.02, 1.06], [0.86, 0.95], [1.7, 1.03], [2.5, 0.98]];
const GRIT = [[-0.6, 0.38, 0.05, 0.75], [0.62, 0.52, 0.05, 0.75], [0.12, 0.74, 0.04, 0.7], [-0.8, -0.2, 0.045, 0.9], [0.78, -0.3, 0.04, 0.6], [-0.3, 0.66, 0.035, 0.5]];
const SAND_DARK = [196, 138, 62], SAND_LIGHT = [255, 233, 168];
function sandShade(t) {
  const c = SAND_DARK.map((d, k) => Math.round(d + (SAND_LIGHT[k] - d) * clamp(t, 0, 1)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
// Body and face, centred on (0, 0), facing +x.
function paintSpeck(g, r, eyes, look) {
  const P = GRAIN.map(([a, k]) => [Math.cos(a) * r * k * 1.06, Math.sin(a) * r * k * 0.97]);
  const mix = (p, q, k) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
  const body = () => {
    g.beginPath();
    P.forEach((p, i) => {
      const a = mix(p, P[(i + P.length - 1) % P.length], 0.26), b = mix(p, P[(i + 1) % P.length], 0.26);
      if (i) g.lineTo(a[0], a[1]); else g.moveTo(a[0], a[1]);
      g.quadraticCurveTo(p[0], p[1], b[0], b[1]);
    });
    g.closePath();
  };
  // facets: one per edge, shaded by which way it faces
  body();
  g.save();
  g.clip();
  const c = [-0.18 * r, -0.24 * r];
  P.forEach((p, i) => {
    const q = P[(i + 1) % P.length], ex = q[0] - p[0], ey = q[1] - p[1], len = Math.hypot(ex, ey);
    const lit = (ey / len) * -0.6 + (-ex / len) * -0.8;
    g.beginPath(); g.moveTo(c[0], c[1]); g.lineTo(p[0] * 1.3, p[1] * 1.3); g.lineTo(q[0] * 1.3, q[1] * 1.3); g.closePath();
    g.fillStyle = sandShade(0.5 + 0.5 * lit);
    g.fill();
  });
  const sheen = g.createRadialGradient(c[0], c[1], 0, c[0], c[1], r * 0.9);
  sheen.addColorStop(0, 'rgba(255,250,225,0.55)'); sheen.addColorStop(1, 'rgba(255,250,225,0)');
  g.fillStyle = sheen;
  g.fillRect(-r * 1.3, -r * 1.3, r * 2.6, r * 2.6);
  for (const [gx, gy, gs, al] of GRIT) { g.fillStyle = `rgba(255,252,236,${al})`; g.beginPath(); g.arc(gx * r, gy * r, gs * r, 0, Math.PI * 2); g.fill(); }
  g.restore();
  body();
  g.lineWidth = Math.max(0.8, 0.07 * r);
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(110,68,24,0.9)';
  g.stroke();
  // sparkle, the way sand catches the light
  const tw = 0.55 + 0.45 * Math.sin(IC.clock * 2.3), sx = -0.52 * r, sy = -0.56 * r, sl = 0.26 * r * tw, sw = 0.06 * r * tw;
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  g.moveTo(sx, sy - sl); g.lineTo(sx + sw, sy - sw); g.lineTo(sx + sl, sy); g.lineTo(sx + sw, sy + sw);
  g.lineTo(sx, sy + sl); g.lineTo(sx - sw, sy + sw); g.lineTo(sx - sl, sy); g.lineTo(sx - sw, sy - sw);
  g.closePath();
  g.fill();
  const ink = '#2a1a0c', ey = -0.08 * r, lx = (look || 0) * 0.04 * r;
  g.fillStyle = 'rgba(255,120,110,0.35)';
  for (const ex of [-0.2 * r, 0.54 * r]) { g.beginPath(); g.ellipse(ex, ey + 0.27 * r, 0.12 * r, 0.07 * r, 0, 0, Math.PI * 2); g.fill(); }
  for (const ex of [-0.1 * r + lx, 0.44 * r + lx]) {
    if (eyes === 'x') {
      const q = 0.13 * r;
      g.strokeStyle = ink; g.lineWidth = Math.max(1, 0.1 * r); g.lineCap = 'round';
      g.beginPath(); g.moveTo(ex - q, ey - q); g.lineTo(ex + q, ey + q); g.moveTo(ex + q, ey - q); g.lineTo(ex - q, ey + q); g.stroke();
    } else if (eyes === 'blink') {
      g.fillStyle = ink;
      g.fillRect(ex - 0.13 * r, ey - 0.02 * r, 0.26 * r, Math.max(1, 0.06 * r));
    } else {
      const big = eyes === 'wide' ? 1.25 : 1;
      g.fillStyle = ink;
      g.beginPath(); g.ellipse(ex, ey, 0.13 * r * big, 0.18 * r * big, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(ex - 0.04 * r + lx * 0.5, ey - 0.07 * r, 0.05 * r * big, 0, Math.PI * 2); g.fill();
    }
  }
  // mouth
  g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = Math.max(0.8, 0.06 * r); g.lineCap = 'round';
  const mx = 0.17 * r + lx, my = 0.2 * r;
  g.beginPath();
  if (eyes === 'wide') { g.ellipse(mx, my + 0.04 * r, 0.06 * r, 0.08 * r, 0, 0, Math.PI * 2); g.fill(); }
  else if (eyes === 'x') { g.moveTo(mx - 0.1 * r, my + 0.05 * r); g.lineTo(mx + 0.1 * r, my + 0.05 * r); g.stroke(); }
  else { g.arc(mx, my - 0.04 * r, 0.1 * r, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke(); }
}

// (x, y) is where his feet touch, th turns his "up" onto the surface normal.
IC.drawSpeck = (x, y, th, face, o = {}) => {
  const U = IC.Lo.U * (o.size || 1), r = SPECK_R * U, leg = SPECK_LEG * U, legTop = -leg - 0.25 * r;
  const sc = o.scale ?? 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(th);
  ctx.scale(face, 1);
  ctx.scale(o.sx ?? 1, o.sy ?? 1);
  ctx.globalAlpha = o.alpha ?? 1;
  if (sc > 0.4 && !o.noLegs) {
    const sw = o.walk == null ? 0 : Math.sin(o.walk * 0.9) * 0.45 * r;
    ctx.strokeStyle = '#2a1a0c';
    ctx.lineWidth = Math.max(1, 0.28 * r);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-0.32 * r, legTop); ctx.lineTo(-0.32 * r + sw, 0);
    ctx.moveTo(0.32 * r, legTop); ctx.lineTo(0.32 * r - sw, 0);
    ctx.stroke();
  }
  ctx.translate(0, -(leg + r));
  ctx.rotate(o.spin || 0);
  ctx.scale(sc, sc);
  let eyes = o.eyes || 'open';
  if (eyes === 'open' && IC.clock % 3.7 > 3.58) eyes = 'blink';
  paintSpeck(ctx, r, eyes, o.look);
  ctx.restore();
};

// A still Speck for icons, drawn into any context. (x, y) is his centre.
IC.speckIcon = (g, x, y, r, look = 1) => {
  g.save();
  g.translate(x, y);
  if (look < 0) g.scale(-1, 1);
  paintSpeck(g, r, 'open', 0);
  g.restore();
};
// The defect as drawn on an icon: white core, green glow.
IC.iconLine = (g, pts, w) => {
  g.save();
  g.lineCap = 'butt'; g.lineJoin = 'miter';
  const path = () => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); };
  g.shadowColor = '#28ff8c'; g.shadowBlur = w * 3;
  path(); g.strokeStyle = 'rgba(40,255,140,0.9)'; g.lineWidth = w * 2.2; g.stroke();
  g.shadowBlur = 0;
  path(); g.strokeStyle = '#f2fff6'; g.lineWidth = w; g.stroke();
  g.restore();
};
// Icon background: a vertical gradient.
IC.iconBg = (g, s, top, bot) => {
  const gr = g.createLinearGradient(0, 0, 0, s);
  gr.addColorStop(0, top); gr.addColorStop(1, bot);
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
};

// ---------- text helper ----------
IC.text = (str, x, y, size, o = {}) => {
  ctx.save();
  ctx.font = `${o.weight || 600} ${size}px ${FONT}`;
  ctx.textAlign = o.align || 'center';
  ctx.textBaseline = o.base || 'middle';
  ctx.globalAlpha = o.alpha ?? 1;
  if (o.shadow !== false) { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = size * 0.5; }
  ctx.fillStyle = o.color || '#fff';
  ctx.fillText(str, x, y);
  ctx.restore();
};

// ---------- games and screens ----------
IC.state = 'hub';
IC.game = null;
IC.clock = 0;
let overT = 0, result = null, shareFile = null, endTimer = null;

IC.register = (g) => {
  g.unit = g.unit || 'pts';
  IC.games.push(g);
  IC.byId[g.id] = g;
};

function setState(s) {
  IC.state = s;
  document.body.dataset.state = s;
  $('hub').classList.toggle('hidden', s !== 'hub');
}

IC.open = (id) => {
  const g = IC.byId[id];
  if (!g) return;
  IC.game = g;
  IC.parts = [];
  IC.hum.stop();
  if (g.layout) g.layout();
  if (g.reset) g.reset();
  setState('title');
  showTitle();
};

IC.home = () => {
  if (IC.game && IC.game.leave) IC.game.leave();
  clearTimeout(endTimer);
  IC.hum.stop();
  IC.game = null;
  IC.parts = [];
  setState('hub');
  showPanel(null);
  placeHub();
};

IC.play = () => {
  const g = IC.game;
  clearTimeout(endTimer);
  IC.parts = [];
  result = null; shareFile = null;
  setState('play');
  showPanel(null);
  g.start();
};

// Games call this when a run is over. The panel comes up after `delay` seconds
// so the last moment can play out.
IC.end = (r) => {
  if (IC.state !== 'play') return;
  const g = IC.game;
  setState('over');
  overT = -(r.delay || 0);
  const lowWins = g.lowerIsBetter;
  const key = bestKey(g), prev = IC.best(key);
  r.newBest = r.score > 0 && (!prev || (lowWins ? r.score < prev : r.score > prev));
  if (r.newBest) { store.best[key] = r.score; save(); }
  result = r;
  IC.hum.stop();
  if (IC.SELFTEST) return;
  clearTimeout(endTimer);
  endTimer = setTimeout(showOver, (r.delay || 0) * 1000);
};

// ---------- DOM: panels, HUD, hub ----------
const panel = $('panel'), card = $('card');
function showPanel(html) {
  panel.classList.toggle('hidden', html == null);
  if (html != null) { card.innerHTML = html; placePanel(); }
}

function howText(g) { return IC.FRAMED && g.howKeys ? g.howKeys : g.how; }
function bestText(g, v) {
  if (!v) return '';
  return g.bestText ? g.bestText(v) : `Best ${fmt(v)} ${g.unit}`;
}

// A game with several tables (Pinball) keeps a best score per table.
function bestKey(g) { return g.bestKey ? g.bestKey() : g.id; }

function showTitle() {
  const g = IC.game;
  showPanel(`<h2>${esc(g.name)}</h2><p class="how">${esc(howText(g))}</p>`
    + (g.titleExtra ? g.titleExtra() : '')
    + `<p class="cta">${IC.FRAMED ? 'Click to play' : 'Tap to play'}</p><p class="sub">${esc(bestText(g, IC.best(bestKey(g))))}</p>`);
}

function showOver() {
  const g = IC.game, r = result;
  if (!g || !r || IC.state !== 'over') return;
  showPanel(`<p class="why">${esc(r.why)}</p>`
    + `<p class="big">${esc(r.scoreText || fmt(r.score))}<small> ${esc(r.unit || g.unit)}</small></p>`
    + `<p class="sub">${esc(r.newBest ? 'New best' : bestText(g, IC.best(bestKey(g))))}</p>`
    + (r.extra ? `<p class="sub">${esc(r.extra)}</p>` : '')
    + '<div class="row"><button class="solid" data-act="again">Play again</button><button data-act="share">Share</button></div>'
    + (r.fine ? `<p class="fine">${esc(r.fine)}</p>` : ''));
  prepareShare();
}

function showSettings() {
  setState('settings');
  showPanel('<button class="info" data-act="info" aria-label="About">i</button><h2>Settings</h2>'
    + `<div class="row">${IC.FRAMED ? '' : '<button data-act="calib">I have the real line</button>'}`
    + `<button data-act="sound">Sound: ${store.muted ? 'off' : 'on'}</button></div>`
    + (IC.canInstall() ? '<div class="row"><button data-act="install">Add to Home Screen</button></div>' : '')
    + `<p class="fine">${IC.FRAMED ? 'Got a Duo with the line? Open this page on it and line the game up.' : 'Got a Duo with the line? You can line the game up with it.'}</p>`
    + '<div class="row"><button class="solid" data-act="done">Done</button></div>');
}

function showInfo() {
  setState('info');
  showPanel('<h2>About</h2>'
    + '<p class="note">Btw, I love Apple but this had to be done.</p>'
    + '<p class="legal">Not affiliated with Apple, iFixit or JerryRigEverything. Apple says it is "aware of an issue impacting the inner display on a small number of iPhone Duo units."</p>'
    + '<div class="row"><a class="link x" href="https://x.com/nikitashimkus" target="_blank" rel="noopener" aria-label="Nikita on X"><svg viewBox="0 0 1200 1227" aria-hidden="true"><path fill="currentColor" d="M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.163 519.284ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.828Z"/></svg></a>'
    + '<button class="solid" data-act="back">Back</button></div>');
}

// ---------- add to Home Screen ----------
// iOS has no install prompt, so Safari tabs get a button with the steps.
// Chrome and Edge get their real prompt.
const STANDALONE = navigator.standalone === true || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
const IOS_TAB = hook('install') === 'ios' || ('standalone' in navigator && !navigator.standalone);
let installEvt = null, installFrom = 'hub';
IC.canInstall = () => !IC.SHOT && !IC.SELFTEST && !IC.FRAMED && !STANDALONE && (IOS_TAB || !!installEvt);
function refreshInstall() {
  const on = IC.canInstall();
  $('b-install').classList.toggle('hidden', !on);
}
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; refreshInstall(); });
addEventListener('appinstalled', () => { installEvt = null; refreshInstall(); });
function install(from) {
  if (installEvt) {
    const e = installEvt;
    e.prompt();
    e.userChoice.then((c) => { if (c && c.outcome === 'accepted') installEvt = null; refreshInstall(); }, () => {});
    return;
  }
  showInstall(from);
}
function showInstall(from) {
  installFrom = from;
  setState('install');
  showPanel('<h2>Add to Home Screen</h2>'
    + '<p class="how">It opens full screen, with no Safari bars on top.</p>'
    + '<ol class="steps"><li><span class="n">1</span>Tap <svg class="glyph" viewBox="0 0 20 24" aria-hidden="true"><path d="M10 15V2.8M5.6 7.2 10 2.8l4.4 4.4M6.8 10.5H3.5V21.5h13V10.5h-3.3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg> Share</li><li><span class="n">2</span>Tap <svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg> Add to Home Screen</li></ol>'
    + '<p class="fine">No Share button? It\'s in the menu next to the address. Came here from X or another app? Open the page in Safari first.</p>'
    + '<div class="row"><button class="solid" data-act="done">Got it</button></div>');
}
$('b-install').addEventListener('click', (e) => { e.currentTarget.blur(); unlockAudio(); install('hub'); });

function showCalib() {
  setState('calib');
  IC.calSpeck = IC.Lo.LB + 4;
  showPanel('<h2>Line it up</h2><p class="how">Drag anywhere until the pink line sits on your green one. Then switch the drawn line off.</p>'
    + `<div class="row"><button data-act="rot">Rotate</button><button data-act="dbl">${IC.Lo.cal.double ? 'Double line' : 'Single line'}</button>`
    + `<button data-act="hide">Drawn line: ${IC.Lo.cal.hide ? 'off' : 'on'}</button></div>`
    + '<div class="row"><button data-act="reset">Reset</button><button class="solid" data-act="done">Done</button></div>'
    + (IC.canInstall() ? '<p class="fine">Most accurate from the Home Screen. Settings has the two taps for adding it.</p>' : ''));
}

card.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  b.blur();
  unlockAudio();
  const act = b.dataset.act;
  if (act === 'again') IC.play();
  else if (act === 'share') share(b);
  else if (act === 'sound') { store.muted = !store.muted; save(); if (store.muted) IC.hum.stop(); else unlockAudio(); b.textContent = `Sound: ${store.muted ? 'off' : 'on'}`; }
  else if (act === 'calib') showCalib();
  else if (act === 'info') showInfo();
  else if (act === 'opt' && IC.game && IC.game.option) { IC.game.option(b.dataset.v); showTitle(); }
  else if (act === 'back') showSettings();
  else if (act === 'install') install('settings');
  else if (act === 'done') { if (IC.state === 'calib' || (IC.state === 'install' && installFrom === 'settings')) showSettings(); else IC.home(); }
  else if (act === 'rot') { setCal({ rot: (IC.Lo.cal.rot + 1) % 4 }); placePanel(); }
  else if (act === 'dbl') { setCal({ double: !IC.Lo.cal.double }); b.textContent = IC.Lo.cal.double ? 'Double line' : 'Single line'; }
  else if (act === 'hide') { setCal({ hide: !IC.Lo.cal.hide }); b.textContent = `Drawn line: ${IC.Lo.cal.hide ? 'off' : 'on'}`; }
  else if (act === 'reset') { if (store.cal) delete store.cal[IC.Lo.orient]; save(); geometry(); showCalib(); }
});

// Biggest clear area off the line, scored by how well a ~360x260 card fits.
IC.freeRects = () => {
  const L = IC.Lo, m = 3 * L.U, p = L.bEnd, q = L.aEnd, j = L.J;
  const x0 = Math.min(p[0], q[0], j[0]) - m, x1 = Math.max(p[0], q[0], j[0]) + m;
  const y0 = Math.min(p[1], q[1], j[1]) - m, y1 = Math.max(p[1], q[1], j[1]) + m;
  const e = IC.FRAMED ? { t: 0, r: 0, b: 0, l: 0 } : safe;
  const S = { x: L.sx + e.l, y: L.sy + e.t, r: L.sx + L.sw - e.r, b: L.sy + L.sh - e.b };
  return [
    { x: S.x, y: S.y, w: x0 - S.x, h: S.b - S.y, side: 'left' },
    { x: x1, y: S.y, w: S.r - x1, h: S.b - S.y, side: 'right' },
    { x: S.x, y: S.y, w: S.r - S.x, h: y0 - S.y, side: 'top' },
    { x: S.x, y: y1, w: S.r - S.x, h: S.b - y1, side: 'bottom' },
  ].filter((r) => r.w > 40 && r.h > 40);
};
IC.freeRect = () => {
  const fit = (r) => Math.min(r.w / 360, r.h / 260);
  const c = IC.freeRects().sort((a, b) => fit(b) - fit(a));
  const L = IC.Lo;
  return c[0] || { x: L.sx, y: L.sy, w: L.sw, h: L.sh };
};

function placePanel() {
  if (panel.classList.contains('hidden')) return;
  const g = IC.game;
  const r = (g && g.panelRect && g.panelRect(IC.state)) || IC.freeRect();
  const k = clamp(Math.min(r.w / 380, r.h / 270), 0.7, 1.5);
  Object.assign(panel.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
  panel.style.setProperty('--k', k);
  panel.classList.toggle('tight', r.h < 230 || r.w < 280);
}

const hud = $('hud'), hudMain = $('hud-main'), hudSub = $('hud-sub');
let hudCache = '';
function updateHud() {
  const g = IC.game;
  const show = !!g && (IC.state === 'title' || IC.state === 'play' || IC.state === 'over');
  hud.classList.toggle('hidden', !show);
  if (!show) return;
  const e = IC.FRAMED ? { t: 0, l: 0 } : safe, L = IC.Lo;
  hud.style.left = `${L.sx + e.l + L.U * 2.5}px`;
  hud.style.top = `${L.sy + e.t + L.U * 2.2}px`;
  hud.style.setProperty('--hs', `${clamp(L.U * 3.6, 13, 26)}px`);
  hud.classList.toggle('dark', !!(g.hudDark && g.hudDark()));
  const h = IC.state === 'title' ? { main: '', sub: '' } : (g.hud ? g.hud() : { main: '', sub: '' });
  const key = `${h.main}|${h.sub}`;
  if (key !== hudCache) { hudCache = key; hudMain.textContent = h.main || ''; hudSub.textContent = h.sub || ''; }
}
$('b-home').addEventListener('click', (e) => { e.currentTarget.blur(); IC.home(); });

// Home screen: the games as app icons, kept clear of the line.
const hub = $('hub'), apps = $('apps'), brand = $('brand');
let iconPx = 0;
function buildIcons(size) {
  if (size === iconPx) return;
  iconPx = size;
  apps.innerHTML = '';
  const list = IC.games.concat([{ id: 'settings', label: 'Settings', icon: settingsIcon }]);
  for (const g of list) {
    const c = makeCanvas(size, size, IC.DPR);
    const gx = c.getContext('2d');
    gx.scale(IC.DPR, IC.DPR);
    gx.save();
    rrect(gx, 0, 0, size, size, size * 0.225);
    gx.clip();
    g.icon(gx, size);
    gx.restore();
    const b = document.createElement('button');
    b.className = 'app';
    b.dataset.id = g.id;
    const img = new Image();
    img.src = c.toDataURL();
    img.alt = '';
    img.width = img.height = size;
    const label = document.createElement('span');
    label.textContent = g.label || g.name;
    b.append(img, label);
    apps.append(b);
  }
}
apps.addEventListener('click', (e) => {
  const b = e.target.closest('.app');
  if (!b) return;
  unlockAudio();
  if (b.dataset.id === 'settings') showSettings();
  else IC.open(b.dataset.id);
});

function settingsIcon(g, s) {
  const gr = g.createLinearGradient(0, 0, 0, s);
  gr.addColorStop(0, '#9a9aa2'); gr.addColorStop(1, '#5d5d66');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  g.translate(s / 2, s / 2);
  g.fillStyle = '#2b2b31';
  g.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, r = i % 2 ? s * 0.33 : s * 0.39;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath(); g.fill();
  g.fillStyle = '#8c8c95';
  g.beginPath(); g.arc(0, 0, s * 0.25, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2b2b31';
  g.beginPath(); g.arc(0, 0, s * 0.11, 0, Math.PI * 2); g.fill();
  // the line, of course
  g.strokeStyle = '#eafff2'; g.lineWidth = s * 0.03;
  g.shadowColor = '#28ff8c'; g.shadowBlur = s * 0.06;
  g.beginPath(); g.moveTo(0, s * 0.08); g.lineTo(s * 0.5, s * 0.08); g.moveTo(0, s * 0.08); g.lineTo(0, s * 0.5); g.stroke();
}

function placeHub() {
  const L = IC.Lo, n = IC.games.length + 1;
  // leave Speck room to walk the line under the icons
  // and keep the top row clear of the camera hole in the top corner
  const cam = L.sy + L.sh * 0.11;
  const rects = IC.freeRects().map((r) => {
    if (r.side !== 'top') return r;
    const y = Math.max(r.y, cam);
    return Object.assign({}, r, { y, h: r.h - (y - r.y) - 8 * L.U });
  });
  // icons go in the band that fits a grid best; the name goes in whatever corner is left
  let best = null;
  for (const r of rects) {
    for (const [cols, rows] of [[4, 2], [7, 1], [2, 4], [3, 3]]) {
      if (cols * rows < n) continue;
      const cw = r.w / cols, ch = r.h / rows;
      const size = Math.floor(Math.min(cw * 0.64, (ch - 22 - 14) * 0.86, 84));
      // a row of icons across the top, like a real home screen, wins unless it's much smaller
      const score = size * (r.side === 'top' && cols >= 4 ? 1.35 : 1);
      if (size >= 34 && (!best || score > best.score)) best = { r, cols, rows, size, score };
    }
  }
  if (!best) best = { r: { x: L.sx, y: L.sy, w: L.sw, h: L.sh * 0.5 }, cols: 4, rows: 2, size: 40 };
  buildIcons(best.size);
  const { r, cols, rows, size } = best;
  const gh = rows * (size + 30) + (rows - 1) * 14;
  Object.assign(apps.style, {
    left: `${r.x}px`, top: `${r.y + Math.max(0, (r.h - gh) / 2)}px`, width: `${r.w}px`,
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  });
  apps.style.setProperty('--icon', `${size}px`);
  // the leftover corner: the area left of the hinge line and below the band, in the usual layout
  const j = L.J, e = IC.FRAMED ? { t: 0, r: 0, b: 0, l: 0 } : safe;
  const corners = [
    { x: L.sx + e.l, y: j[1], w: j[0] - L.sx - e.l, h: L.sy + L.sh - e.b - j[1] },
    { x: j[0], y: j[1], w: L.sx + L.sw - e.r - j[0], h: L.sy + L.sh - e.b - j[1] },
    { x: L.sx + e.l, y: L.sy + e.t, w: j[0] - L.sx - e.l, h: j[1] - L.sy - e.t },
    { x: j[0], y: L.sy + e.t, w: L.sx + L.sw - e.r - j[0], h: j[1] - L.sy - e.t },
  ].filter((c) => {
    const lineIn = (p) => p[0] > c.x + 2 && p[0] < c.x + c.w - 2 && p[1] > c.y + 2 && p[1] < c.y + c.h - 2;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const overlapsBand = !(c.x + c.w <= r.x + 1 || c.x >= r.x + r.w - 1 || c.y + c.h <= r.y + 1 || c.y >= r.y + r.h - 1);
    return c.w > 120 && c.h > 80 && !lineIn(mid(j, L.aEnd)) && !lineIn(mid(j, L.bEnd)) && !overlapsBand;
  }).sort((a, b) => b.w * b.h - a.w * a.h);
  const c = corners[0];
  brand.classList.toggle('hidden', !c);
  if (c) {
    Object.assign(brand.style, { left: `${c.x}px`, top: `${c.y}px`, width: `${c.w}px`, height: `${c.h}px` });
    brand.style.setProperty('--k', clamp(Math.min(c.w / 340, c.h / 170), 0.6, 1.4));
  }
}

function placeUI() {
  placeHub();
  placePanel();
}

// ---------- share ----------
function shareUrl() {
  const local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
  const origin = /^https?:$/.test(location.protocol) && !local ? location.origin : 'https://icrack.io';
  return `${origin}/?g=${IC.game.id}`;
}
// iOS wants share() inside the tap, so the image is made as the panel opens.
function prepareShare() {
  const g = IC.game, r = result;
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const x = c.getContext('2d');
  x.drawImage(canvas, 0, 0);
  x.scale(IC.DPR, IC.DPR);
  const f = (g.panelRect && g.panelRect('over')) || IC.freeRect();
  const k = clamp(Math.min(f.w / 380, f.h / 270), 0.7, 1.5), cx = f.x + f.w / 2, cy = f.y + f.h / 2;
  x.fillStyle = 'rgba(18,16,40,0.55)';
  rrect(x, cx - 170 * k, cy - 92 * k, 340 * k, 184 * k, 22 * k);
  x.fill();
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = '#fff';
  x.font = `600 ${15 * k}px ${FONT}`;
  x.globalAlpha = 0.75;
  x.fillText(`iCrack: ${g.name}`, cx, cy - 64 * k);
  x.globalAlpha = 1;
  x.font = `600 ${16 * k}px ${FONT}`;
  x.fillText(r.why, cx, cy - 36 * k);
  x.font = `700 ${44 * k}px ${FONT}`;
  x.fillText(`${r.scoreText || fmt(r.score)} ${r.unit || g.unit}`, cx, cy + 8 * k);
  x.font = `600 ${13 * k}px ${FONT}`;
  x.globalAlpha = 0.7;
  x.fillText(shareUrl().replace(/^https?:\/\//, '').replace(/\/\?g=.*$/, ''), cx, cy + 56 * k);
  c.toBlob((b) => { if (b) shareFile = new File([b], 'icrack.png', { type: 'image/png' }); }, 'image/png');
}
async function share(btn) {
  const g = IC.game, r = result, url = shareUrl();
  const text = g.share ? g.share(r) : `I scored ${fmt(r.score)} in ${g.name}.`;
  try {
    if (shareFile && navigator.canShare && navigator.canShare({ files: [shareFile] })) {
      await navigator.share({ files: [shareFile], text: `${text} ${url}` });
    } else if (navigator.share) {
      await navigator.share({ text, url });
    } else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      btn.textContent = 'Copied';
    }
  } catch (e) { /* share sheet dismissed */ }
}

// ---------- input ----------
const pointers = new Map();
let drag = null;
function pt(e) { return { x: e.clientX, y: e.clientY, id: e.pointerId, t: performance.now() }; }

addEventListener('pointerdown', (e) => {
  if (e.target.closest && e.target.closest('button, a')) return;
  e.preventDefault();
  unlockAudio();
  const p = pt(e);
  pointers.set(e.pointerId, p);
  const st = IC.state;
  if (st === 'calib') { drag = { id: e.pointerId, x: p.x, y: p.y, jx: IC.Lo.cal.jx, jy: IC.Lo.cal.jy }; return; }
  if (st === 'title') { IC.play(); return; }
  if (st === 'over') { if (overT > 0.45 && !(IC.game.noTapRestart)) IC.play(); return; }
  if (st === 'play' && IC.game.down) IC.game.down(p);
}, { passive: false });
addEventListener('pointermove', (e) => {
  const p = pt(e);
  if (drag && e.pointerId === drag.id) {
    setCal({ jx: clamp(drag.jx + (p.x - drag.x) / IC.Lo.sw, 0.04, 0.96), jy: clamp(drag.jy + (p.y - drag.y) / IC.Lo.sh, 0.04, 0.96) }, false);
    IC.calSpeck = IC.Lo.LB + 4;
    return;
  }
  if (IC.state === 'play' && IC.game.move) IC.game.move(p, pointers.has(e.pointerId));
  if (IC.state === 'hub' && e.pointerType === 'mouse') {
    canvas.style.cursor = onSpeck(p) || (asking() && inBox(p, helloBox, 8)) ? 'pointer' : '';
  }
});
function up(e) {
  pointers.delete(e.pointerId);
  if (drag && e.pointerId === drag.id) { drag = null; save(); placePanel(); return; }
  // on the way up, so opening the link counts as a tap in iOS Safari
  if (IC.state === 'hub' && !(e.target.closest && e.target.closest('button, a'))) hubTap(pt(e));
  if (IC.state === 'play' && IC.game.up) IC.game.up(pt(e));
}
addEventListener('pointerup', up);
addEventListener('pointercancel', up);
addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const st = IC.state;
  if (e.key === 'Escape') { if (st === 'calib' || st === 'info' || (st === 'install' && installFrom === 'settings')) showSettings(); else if (st !== 'hub') IC.home(); return; }
  if (st === 'play') { if (IC.game.key && IC.game.key(e.key, true, e) !== false) e.preventDefault(); return; }
  if (e.repeat) return;
  if ((st === 'title' || (st === 'over' && overT > 0.45)) && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    unlockAudio();
    IC.play();
  }
});
addEventListener('keyup', (e) => {
  if (IC.state === 'play' && IC.game.key) IC.game.key(e.key, false, e);
});
document.addEventListener('gesturestart', (e) => e.preventDefault());

let resizeQueued = false;
addEventListener('resize', () => {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => { resizeQueued = false; layout(); placeUI(); });
});

// ---------- loop ----------
const STEP = 1 / 120;
IC.STEP = STEP;
// Speck wanders the line on the home screen. Tap him and he stops to say
// something, then walks on. The first line is always the $1,000 one; after
// that they come in a shuffled order. With PAY_URL set, the $1,000 bubble opens it.
const PAY_URL = '';
const payUrl = hook('pay') ? 'https://example.com/' : PAY_URL;
const LINES = [
  'Give me $1,000 instead.',
  'iCrack or Green Line of Death?',
  'Makes you miss the Bendgate.',
];
const SAY_T = 4;
const idle = { s: 0, dir: 1, h: 0, vh: 0, pause: 1, walk: 0, say: 0, line: -1, bag: [] };
function nextLine() {
  if (idle.line < 0) return 0;
  if (!idle.bag.length) {
    idle.bag = LINES.map((_, i) => i).filter((i) => i !== idle.line);
    for (let i = idle.bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idle.bag[i], idle.bag[j]] = [idle.bag[j], idle.bag[i]]; }
  }
  return idle.bag.pop();
}
let helloBox = null;
const inBox = (p, b, pad) => !!b && p.x > b.x - pad && p.x < b.x + b.w + pad && p.y > b.y - pad && p.y < b.y + b.h + pad;
function onSpeck(p) {
  const [cx, cy] = at(idle.s, idle.h + SPECK_LEG + SPECK_R);
  return Math.hypot(p.x - cx, p.y - cy) < Math.max(SPECK_R * IC.Lo.U * 1.8, 26);
}
const asking = () => idle.say > 0 && idle.line === 0 && !!payUrl;
function hubTap(p) {
  if (asking() && inBox(p, helloBox, 8)) { window.open(payUrl, '_blank', 'noopener'); return; }
  if (!onSpeck(p)) return;
  idle.line = nextLine();
  idle.say = SAY_T;
  idle.pause = SAY_T;                      // stands still while he talks, then walks on
  if (idle.h === 0) idle.vh = 30;
  IC.tone(1568, 1568, 0.07, 'square', 0.03);
  IC.tone(2093, 2093, 0.2, 'triangle', 0.04, 0.07);
}

function update(dt) {
  IC.clock += dt;
  if (IC.glitch > 0) IC.glitch -= dt;
  else if (Math.random() < dt * 0.08) IC.glitch = 0.05 + Math.random() * 0.05;
  if (IC.state === 'over') overT += dt;
  if (IC.game) IC.game.update(dt);
  else stepIdle(dt);
  stepParts(dt);
}

function stepIdle(dt) {
  const L = IC.Lo, e = IC.ends(SPECK_R * 1.2);
  if (!idle.s) idle.s = L.LB + L.LA * 0.62;
  if (idle.say > 0) idle.say -= dt;
  if (idle.pause > 0) idle.pause -= dt;
  else {
    idle.s += idle.dir * 9 * dt;
    idle.walk += 9 * dt;
    if (idle.s > e.hi || idle.s < Math.max(e.lo, L.LB + 3)) { idle.dir *= -1; idle.s = clamp(idle.s, Math.max(e.lo, L.LB + 3), e.hi); }
    if (Math.random() < dt * 0.25) idle.pause = 1 + Math.random() * 2;
    if (idle.h === 0 && Math.random() < dt * 0.12) idle.vh = 30;
  }
  if (idle.vh || idle.h > 0) { idle.vh -= 180 * dt; idle.h = Math.max(0, idle.h + idle.vh * dt); if (idle.h === 0) idle.vh = 0; }
}

// Speck says hello from the home screen, in a bubble beside his head.
function drawHello(s, h) {
  const L = IC.Lo, U = L.U, fs = clamp(U * 2.1, 11, 17);
  const link = asking(), text = idle.say > 0 ? LINES[idle.line] : 'Hi, I\'m sand.';
  ctx.save();
  ctx.font = `${link ? 700 : 600} ${fs}px ${FONT}`;
  const w = ctx.measureText(text).width + fs * 1.3, bh = fs * 1.9, tail = fs * 0.8, R = SPECK_R * U;
  const [bx, by, na] = at(s, h + SPECK_LEG + SPECK_R);
  const n = [Math.cos(na), Math.sin(na)], t = [-n[1], n[0]];
  const along = Math.abs(t[0]) * (w / 2) + Math.abs(t[1]) * (bh / 2);
  const place = (side) => [bx + n[0] * R * 0.9 + t[0] * side * (R * 1.3 + tail + along), by + n[1] * R * 0.9 + t[1] * side * (R * 1.3 + tail + along)];
  const fits = (c) => c[0] - w / 2 > L.sx + 6 && c[0] + w / 2 < L.sx + L.sw - 6 && c[1] - bh / 2 > L.sy + 6 && c[1] + bh / 2 < L.sy + L.sh - 6;
  let side = t[0] < 0 || (t[0] === 0 && t[1] < 0) ? -1 : 1;
  let c = place(side);
  if (!fits(c)) { side = -side; c = place(side); }
  // too wide for either side (long line, narrow screen): keep it on screen
  if (!fits(c)) c = [clamp(c[0], L.sx + w / 2 + 6, L.sx + L.sw - w / 2 - 6), clamp(c[1], L.sy + bh / 2 + 6, L.sy + L.sh - bh / 2 - 6)];
  const x0 = c[0] - w / 2, y0 = c[1] - bh / 2, rad = bh / 2;
  // tail starts inside the bubble so it meets the round end; one fill for both
  const tip = [bx + n[0] * R * 0.5 + t[0] * side * R * 1.2, by + n[1] * R * 0.5 + t[1] * side * R * 1.2], bw = fs * 0.42;
  let b1, b2;
  if (tip[0] <= x0 || tip[0] >= x0 + w) {
    const ex = tip[0] <= x0 ? x0 + rad * 0.8 : x0 + w - rad * 0.8, yy = clamp(tip[1], y0 + bw, y0 + bh - bw);
    b1 = [ex, yy - bw]; b2 = [ex, yy + bw];
  } else {
    const ey = tip[1] >= y0 + bh ? y0 + bh - bw : y0 + bw, xx = clamp(tip[0], x0 + rad, x0 + w - rad);
    b1 = [xx - bw, ey]; b2 = [xx + bw, ey];
  }
  // wind the tail the same way as the rounded rect, so the fill is their union
  const tri = [b1, tip, b2];
  if ((tri[1][0] - tri[0][0]) * (tri[2][1] - tri[0][1]) - (tri[2][0] - tri[0][0]) * (tri[1][1] - tri[0][1]) < 0) tri.reverse();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = fs * 0.8;
  ctx.fillStyle = link ? '#30d158' : 'rgba(255,255,255,0.96)';
  rrect(ctx, x0, y0, w, bh, rad);
  ctx.moveTo(tri[0][0], tri[0][1]); ctx.lineTo(tri[1][0], tri[1][1]); ctx.lineTo(tri[2][0], tri[2][1]); ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  helloBox = { x: x0, y: y0, w, h: bh };
  ctx.fillStyle = link ? '#fff' : '#1d1636';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c[0], c[1] + fs * 0.04);
  ctx.restore();
}

function render() {
  const L = IC.Lo;
  ctx.setTransform(IC.DPR, 0, 0, IC.DPR, 0, 0);
  ctx.clearRect(0, 0, IC.W, IC.H);
  if (frameBack) ctx.drawImage(frameBack, 0, 0, IC.W, IC.H);
  ctx.save();
  if (IC.FRAMED) { rrect(ctx, L.sx, L.sy, L.sw, L.sh, L.sr); ctx.clip(); }
  if (IC.state === 'calib') {
    ctx.fillStyle = '#000';
    ctx.fillRect(L.sx, L.sy, L.sw, L.sh);
    drawGuide();
    const [x, y, a] = at(IC.calSpeck || L.LB + 4, 0);
    IC.drawSpeck(x, y, a + Math.PI / 2, L.faceSign, {});
  } else {
    ctx.drawImage(wall, L.sx, L.sy, L.sw, L.sh);
    if (IC.game) IC.game.render();
    else {
      IC.drawLine();
      if (!idle.s) idle.s = L.LB + L.LA * 0.62;
      const [x, y, a] = at(idle.s, idle.h);
      IC.drawSpeck(x, y, a + Math.PI / 2, idle.dir * L.faceSign, { walk: idle.pause > 0 ? null : idle.walk, look: Math.sin(IC.clock * 0.9) * 1.5 });
      if (IC.SHOT !== 'icon') drawHello(idle.s, idle.h);
    }
  }
  drawParts();
  ctx.restore();
  if (frameFront) ctx.drawImage(frameFront, 0, 0, IC.W, IC.H);
  updateHud();
}

IC.render = render;
IC.update = update;
IC.layout = layout;

// ---------- boot ----------
IC.boot = () => {
  layout();
  if (!IC.SHOT) setState('hub');
  placeHub();
  if (IC.SHOT === 'og') { setState('hub'); placeHub(); }
  const want = params.get('game') || params.get('g');
  if (want && IC.byId[want]) IC.open(want);
  else if (params.get('screen') === 'settings') showSettings();
  else if (params.get('screen') === 'calib') showCalib();
  else if (params.get('screen') === 'info') showInfo();
  else if (params.get('screen') === 'install') showInstall('hub');
  refreshInstall();

  if (IC.SELFTEST) {
    const g = IC.game;
    let out;
    try { out = g && g.selftest ? g.selftest(+IC.SELFTEST || 20) : { error: 'no selftest' }; } catch (err) { out = { error: String(err && err.stack || err) }; }
    out.viewport = `${IC.W}x${IC.H}`;
    document.title = `SELFTEST ${JSON.stringify(out)}`;
    const pre = document.createElement('pre');
    pre.id = 'selftest';
    pre.textContent = JSON.stringify(out);
    document.body.appendChild(pre);
    return;
  }
  if (IC.SIM && IC.game) {
    IC.play();
    for (let i = 0, n = +IC.SIM / STEP; i < n && IC.state === 'play'; i++) update(STEP);
    if (IC.state === 'over') { overT = 1; showOver(); }
    still();
    return;
  }
  if (IC.SHOT) { if (IC.SHOT === 'icon') hub.classList.add('hidden'); still(); return; }
  if (hook('tap')) { idle.line = +hook('tap') || 0; idle.say = 1e6; idle.pause = 1e6; }

  let last = performance.now(), acc = 0;
  function frame(now) {
    acc += Math.min(0.05, (now - last) / 1000);
    last = now;
    while (acc >= STEP) { update(STEP); acc -= STEP; }
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
};

// Frozen frame for screenshots, redrawn so a late resize can't leave it blank.
function still() {
  render();
  requestAnimationFrame(still);
}
})();
