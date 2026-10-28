// Buzz Wire: the carnival game where you steer a ring along a wire without
// touching it. The wire is the line. Drag anywhere to move the ring, so your
// finger never has to cover the line. Each round the ring gets smaller.
(() => {
'use strict';
const { clamp, fmt } = IC;
const ctx = IC.ctx;
const RINGS = [5, 4.2, 3.6, 3.1, 2.7, 2.4, 2.2, 2.0, 1.85, 1.7, 1.6, 1.5];

let Wg = null;    // wire: start and finish on the track
let S = null;
const drag = { id: null, x: 0, y: 0 };

function layout() {
  const L = IC.Lo, e = IC.ends(3);
  Wg = { start: e.hi, end: e.lo, len: e.hi - e.lo, corner: L.LB };
}
const rinOf = (k) => RINGS[Math.min(k - 1, RINGS.length - 1)];
const limitOf = (k) => Wg.len / (9 + 1.5 * k) + 2;

function placeRing(st, s) {
  const p = IC.base(s);
  st.x = p[0]; st.y = p[1];
}
function fresh() {
  const st = { k: 0, lives: 3, score: 0, x: 0, y: 0, phase: 'wait', t: 0, pt: 0, check: 0, minS: 0, flash: 0, ratio: 0, popup: null, rounds: 0, zap: null };
  nextRound(st);
  return st;
}
function nextRound(st) {
  st.k++;
  st.check = Wg.start;
  st.minS = Wg.start;
  st.t = 0;
  st.phase = 'wait';
  placeRing(st, Wg.start);
}

// Move the ring in small steps so a quick flick can't hop over the wire.
function moveRing(st, dx, dy) {
  if (st.phase !== 'wait' && st.phase !== 'run') return;
  const U = IC.Lo.U, rin = rinOf(st.k) * U;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (rin * 0.35)));
  for (let i = 0; i < n; i++) {
    st.x += dx / n; st.y += dy / n;
    if (st.phase === 'wait' && Math.hypot(dx, dy) > 0.5) st.phase = 'run';
    if (check(st)) return;
  }
}

function check(st) {
  const L = IC.Lo, U = L.U, rin = rinOf(st.k) * U;
  const nr = IC.nearest(st.x, st.y);
  st.ratio = clamp(nr.d / (rin - L.lineHalf * U), 0, 1);
  // past either end of the wire counts as touching it too
  const off = nr.s > Wg.start + 2.5;
  if (nr.d > rin - L.lineHalf * U || off) { buzz(st, nr.p); return true; }
  if (nr.s < st.minS) st.minS = nr.s;
  if (nr.s < Wg.corner - 3 && st.check > Wg.corner) { st.check = Wg.corner; st.popup = { text: 'Checkpoint', t: 1, good: true }; IC.tone(880, 1320, 0.1, 'triangle', 0.03); }
  if (nr.s <= Wg.end + 0.5) { clear(st); return true; }
  return false;
}

function buzz(st, p) {
  st.lives--;
  st.phase = 'buzz'; st.pt = 0; st.flash = 1;
  st.zap = p ? [p[0], p[1]] : [st.x, st.y];
  IC.hum.set(100, 0);
  IC.tone(110, 90, 0.45, 'square', 0.06);
  IC.noise(0.4, 0.06, 2200);
  if (!IC.silent) IC.burst(st.zap[0], st.zap[1], 16, ['#ffd60a', '#ffffff', '#ff9f0a'], 24, [0.25, 0.6], 0.5);
}

function clear(st) {
  const limit = limitOf(st.k), bonus = Math.max(0, Math.round((limit - st.t) * 10));
  st.score += 100 * st.k + bonus;
  st.rounds++;
  st.phase = 'clear'; st.pt = 0;
  st.popup = { text: `Round ${st.k} clear +${100 * st.k + bonus}`, t: 1.2, good: true };
  IC.hum.set(100, 0);
  IC.tone(660, 660, 0.1, 'triangle', 0.04); IC.tone(880, 880, 0.1, 'triangle', 0.04, 0.1); IC.tone(1320, 1320, 0.22, 'triangle', 0.04, 0.2);
}

function step(st, dt) {
  if (st.flash > 0) st.flash -= dt * 2.5;
  if (st.popup) { st.popup.t -= dt; if (st.popup.t <= 0) st.popup = null; }
  if (st.phase === 'run') {
    st.t += dt;
    IC.hum.set(170 + 520 * st.ratio, 0.004 + 0.022 * st.ratio * st.ratio);
    if (st.t > limitOf(st.k)) {
      st.lives--;
      st.popup = { text: 'Too slow', t: 1.2, good: false };
      IC.tone(300, 150, 0.3, 'square', 0.04);
      IC.hum.set(100, 0);
      if (st.lives <= 0) { st.phase = 'over'; return; }
      st.check = Wg.start; st.minS = Wg.start; st.t = 0;
      st.phase = 'wait';
      placeRing(st, Wg.start);
    }
  } else if (st.phase === 'buzz') {
    st.pt += dt;
    if (st.pt > 0.8) {
      if (st.lives <= 0) { st.phase = 'over'; return; }
      st.phase = 'wait';
      st.minS = Math.min(st.minS, st.check);
      placeRing(st, st.check);
    }
  } else if (st.phase === 'clear') {
    st.pt += dt;
    if (st.pt > 1.2) nextRound(st);
  }
}

// ---------- drawing ----------
function pad(s, label) {
  const L = IC.Lo, U = L.U, [x, y] = IC.base(s);
  let [lx, ly] = IC.at(s, 4.2);
  const fs = clamp(U * 1.7, 10, 15), half = label.length * fs * 0.32 + 4;
  lx = clamp(lx, L.sx + half + 4, L.sx + L.sw - half - 4);
  ly = clamp(ly, L.sy + fs, L.sy + L.sh - fs);
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath(); ctx.arc(x, y, 2.2 * U, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
  IC.text(label, lx, ly, fs, { weight: 700, alpha: 0.85 });
}

function drawRing(st) {
  const U = IC.Lo.U, rin = rinOf(st.k) * U, th = Math.max(2.5, 0.7 * U), r = rin + th / 2;
  const k = st.ratio;
  const col = k < 0.6 ? '#dfe3ee' : k < 0.85 ? '#ffd60a' : '#ff453a';
  ctx.save();
  if (st.phase === 'buzz') ctx.globalAlpha = 0.5 + 0.5 * Math.sin(st.pt * 40);
  ctx.beginPath(); ctx.arc(st.x, st.y, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = th + 2; ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = th; ctx.stroke();
  ctx.beginPath(); ctx.arc(st.x, st.y, r, Math.PI * 1.1, Math.PI * 1.6);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = th * 0.35; ctx.stroke();
  ctx.restore();
}

function selftest(n) {
  layout();
  const problems = [];
  // the exact path never buzzes, even round the corner, at the smallest ring
  const st = fresh();
  st.k = RINGS.length;
  placeRing(st, Wg.start);
  st.phase = 'run';
  const path = [];
  for (let s = Wg.start; s >= Wg.end; s -= 0.25) path.push(IC.base(s));
  let buzzed = false;
  IC.silent = true;
  for (let i = 1; i < path.length && st.phase === 'run'; i++) moveRing(st, path[i][0] - st.x, path[i][1] - st.y);
  if (st.phase === 'buzz') buzzed = true;
  if (buzzed) problems.push('exact path buzzed');
  if (st.phase !== 'clear' && !buzzed) problems.push(`exact path did not finish (${st.phase})`);
  // stepping off the wire by more than the ring buzzes
  const st2 = fresh();
  placeRing(st2, (Wg.start + Wg.corner) / 2);
  st2.phase = 'run';
  const nr = IC.Lo.nA;
  moveRing(st2, -nr[0] * (rinOf(1) + 0.5) * IC.Lo.U * 1.2, -nr[1] * (rinOf(1) + 0.5) * IC.Lo.U * 1.2);
  moveRing(st2, nr[0] * (rinOf(1) + 1) * IC.Lo.U * 2.4, nr[1] * (rinOf(1) + 1) * IC.Lo.U * 2.4);
  if (st2.phase !== 'buzz') problems.push('leaving the wire did not buzz');
  // a fast flick across the wire can't skip the check
  const st3 = fresh();
  placeRing(st3, (Wg.start + Wg.corner) / 2);
  st3.phase = 'run';
  moveRing(st3, 0, -40 * IC.Lo.U);
  if (st3.phase !== 'buzz') problems.push('flick skipped the check');
  // a steady but wobbly hand: how many rounds at a human pace
  let reached = 0;
  for (let r = 0; r < n; r++) {
    const sb = fresh();
    const rng = IC.mulberry(r + 5);
    let guard = 0;
    while (sb.phase !== 'over' && guard++ < 120 * 400 && sb.k < 14) {
      if (sb.phase === 'wait' || sb.phase === 'run') {
        const rin = rinOf(sb.k);
        const nr2 = IC.nearest(sb.x, sb.y);
        const speed = (9 + 1.5 * sb.k) * 1.25;
        const ahead = IC.base(Math.max(Wg.end, nr2.s - speed * IC.STEP * 3));
        const wob = rin * 0.45 * IC.Lo.U;
        moveRing(sb, (ahead[0] - sb.x) * 0.35 + (rng() - 0.5) * wob * 0.3, (ahead[1] - sb.y) * 0.35 + (rng() - 0.5) * wob * 0.3);
      }
      step(sb, IC.STEP);
    }
    reached += sb.k;
  }
  IC.silent = false;
  IC.hum.stop();
  return { wire: +Wg.len.toFixed(1), limits: [1, 5, 10].map((k) => +limitOf(k).toFixed(1)), botAvgRound: +(reached / n).toFixed(1), problems };
}

IC.register({
  id: 'buzz',
  name: 'Buzz Wire',
  label: 'Buzz Wire',
  unit: 'pts',
  how: 'Steer the ring along the line without touching it. (But not with your nails.)',
  icon(g, s) {
    IC.iconBg(g, s, '#ffb340', '#ff6a00');
    IC.iconLine(g, [[s * 1.1, s * 0.42], [s * 0.42, s * 0.42], [s * 0.42, s * 1.1]], s * 0.035);
    g.save();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = s * 0.075;
    g.beginPath(); g.arc(s * 0.7, s * 0.42, s * 0.14, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#eef0f6'; g.lineWidth = s * 0.055;
    g.beginPath(); g.arc(s * 0.7, s * 0.42, s * 0.14, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#fff6a8'; g.lineWidth = s * 0.02; g.lineCap = 'round';
    g.beginPath(); g.moveTo(s * 0.2, s * 0.2); g.lineTo(s * 0.27, s * 0.26); g.moveTo(s * 0.28, s * 0.14); g.lineTo(s * 0.3, s * 0.23); g.moveTo(s * 0.14, s * 0.3); g.lineTo(s * 0.24, s * 0.31); g.stroke();
    g.restore();
  },
  layout,
  relayout(prev) { layout(); if (S) { S.check = IC.remapS(prev, S.check); S.minS = IC.remapS(prev, S.minS); placeRing(S, S.phase === 'run' ? IC.remapS(prev, IC.nearest(S.x, S.y).s) : S.check); } },
  reset() { layout(); S = fresh(); },
  start() { layout(); S = fresh(); drag.id = null; },
  leave() { IC.hum.stop(); },
  update(dt) {
    if (!S || IC.state !== 'play') return;
    if (IC.BOT && (S.phase === 'wait' || S.phase === 'run')) {
      const nr = IC.nearest(S.x, S.y), ahead = IC.base(Math.max(Wg.end, nr.s - 0.5));
      moveRing(S, (ahead[0] - S.x) * 0.5, (ahead[1] - S.y) * 0.5);
    }
    step(S, dt);
    if (S.phase === 'over' && !S.sent) {
      S.sent = true;
      IC.hum.stop();
      IC.end({ why: 'That\'ll be $1,000.', score: S.score, unit: 'pts', extra: `Out in round ${S.k}, ${S.rounds} round${S.rounds === 1 ? '' : 's'} cleared`, delay: 0.5 });
    }
  },
  render() {
    IC.drawLine();
    if (!S) return;
    if (S.minS < Wg.start) IC.glowAlong(S.minS, Wg.start, 'rgba(255,214,10,0.55)', 1.5);
    pad(Wg.start, 'Start');
    pad(Wg.end, 'Finish');
    if (S.check === Wg.corner) { const [x, y] = IC.at(Wg.corner, 3.5); IC.text('✓', x, y, clamp(IC.Lo.U * 2.4, 12, 22), { color: '#7dffb8', weight: 800 }); }
    drawRing(S);
    if (S.phase === 'wait' && IC.state === 'play') {
      const [x, y] = IC.at(Wg.start - 6, 9);
      IC.text(IC.FRAMED ? 'Drag to move the ring' : 'Drag anywhere to move the ring', x, y, clamp(IC.Lo.U * 2, 11, 16), { alpha: 0.6 + 0.4 * Math.sin(IC.clock * 4), align: 'right' });
    }
    if (S.popup) {
      const [x, y] = IC.at((Wg.start + Wg.corner) / 2, 12);
      IC.text(S.popup.text, x, y, clamp(IC.Lo.U * 2.8, 14, 24), { weight: 800, color: S.popup.good ? '#7dffb8' : '#ff8a8a', alpha: Math.min(1, S.popup.t * 2) });
    }
    if (S.flash > 0) {
      const L = IC.Lo;
      ctx.fillStyle = `rgba(255,40,40,${S.flash * 0.25})`;
      ctx.fillRect(L.sx, L.sy, L.sw, L.sh);
    }
  },
  down(p) { if (drag.id === null) Object.assign(drag, { id: p.id, x: p.x, y: p.y }); },
  move(p) {
    if (p.id !== drag.id || !S) return;
    moveRing(S, p.x - drag.x, p.y - drag.y);
    drag.x = p.x; drag.y = p.y;
  },
  up(p) { if (p.id === drag.id) drag.id = null; },
  hud() {
    if (!S) return { main: '', sub: '' };
    const left = S.phase === 'run' || S.phase === 'wait' ? Math.max(0, limitOf(S.k) - S.t) : 0;
    return { main: `${fmt(S.score)} pts`, sub: `Round ${S.k}  Lives ${S.lives}  ${left.toFixed(1)} s` };
  },
  share: (r) => `I steered a ring along my Duo's green line for ${fmt(r.score)} points without touching it. Mostly.`,
  selftest,
});
})();
