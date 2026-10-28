// Green Line: the defect is a metro line now. Hold to go, let go to brake, and
// stop with the doors at the yellow mark. Out to the end of the line and back
// again is a shift.
//
// One hold, one release per stop. Letting go commits to the brake, and where
// the train comes to rest is where it stopped, so creeping up on the mark with
// lots of little taps doesn't work. The one exception: a first go that was only
// a tap (it never got going) is forgiven once per stop.
(() => {
'use strict';
const { clamp, fmt } = IC;
const ctx = IC.ctx;
const VMAX = 30, ACC = 11, BRAKE = 24;
const TAP_V = 6;          // a go that never got faster than this was just a tap
const NAMES = ['Home Bar', 'Hinge', 'Genius Bar', 'Infinite Loop', 'JerryRigEverything'];
const ROUTE = [1, 2, 3, 4, 3, 2, 1, 0];

let M = null;     // line layout: stations, train size
let S = null;     // run
let holding = false;

function layout() {
  const L = IC.Lo, end0 = IC.ends(0);
  const usable = end0.hi - end0.lo;
  const spacing0 = usable / 4.6;
  const car = clamp(spacing0 * 0.22, 4.2, 7), gap = 0.6, train = 2 * car + gap;
  const slack = clamp(train * 0.2, 1.4, 3), plat = train + 2 * slack;
  const lo = end0.lo + 1 + plat / 2, hi = end0.hi - 4 - plat / 2;
  const st = NAMES.map((name, i) => ({ name, s: lo + ((hi - lo) * i) / 4, len: plat, wait: 2 + ((i * 7) % 4) }));
  // keep platforms off the corner, then push apart any that now overlap
  const zLo = L.LB - 2 - plat / 2, zHi = L.LB + 2 + plat / 2, room = plat + 1.5;
  const off = (c, up) => (c > zLo && c < zHi ? (up ? zHi : zLo) : c);
  for (const p of st) p.s = off(p.s, p.s >= L.LB);
  for (let i = 1; i < st.length; i++) st[i].s = off(Math.max(st[i].s, st[i - 1].s + room), true);
  st[st.length - 1].s = Math.min(st[st.length - 1].s, hi);
  for (let i = st.length - 2; i >= 0; i--) st[i].s = off(Math.min(st[i].s, st[i + 1].s - room), false);
  M = { car, gap, train, slack, plat, st, lo: end0.lo + train / 2, hi: end0.hi - train / 2 };
}

function fresh() {
  const s0 = M.st[0].s;
  return { s: s0, v: 0, dir: 1, k: 0, score: 0, phase: 'drive', phaseT: 0, legT: 0, legFrom: s0, mode: 'rest', goes: 0, peak: 0, popup: null, boarding: [], results: [], missed: 0, perfect: 0, crashed: false };
}
const target = (st) => M.st[ROUTE[st.k]];
const perfectWithin = () => Math.max(0.6, M.slack * 0.25);
// Fastest a leg can be driven, flat out then braking hard, plus a little.
function parTime(d) {
  const v = Math.min(VMAX, Math.sqrt((2 * d * ACC * BRAKE) / (ACC + BRAKE)));
  const cruise = Math.max(0, d - v * v / (2 * ACC) - v * v / (2 * BRAKE)) / VMAX;
  return v / ACC + v / BRAKE + cruise + 1.2;
}
function newLeg(st) {
  st.legFrom = st.s; st.legT = 0; st.goes = 0; st.peak = 0;
}
function miss(st, name) {
  st.results.push('miss');
  st.missed++;
  st.popup = { text: name, t: 1.6, good: false };
  IC.tone(300, 200, 0.25, 'square', 0.03);
}

function arrive(st) {
  const tg = target(st), err = (st.s - tg.s) * st.dir;
  if (Math.abs(err) > M.slack) return false;
  const acc = Math.abs(err), pw = perfectWithin();
  const pts = acc <= pw ? 100 : Math.round(20 + 80 * Math.pow(1 - (acc - pw) / (M.slack - pw), 0.8));
  const par = parTime(Math.abs(tg.s - st.legFrom));
  const bonus = Math.max(0, Math.round((par - st.legT) * 15));
  st.score += pts + bonus;
  if (pts === 100) st.perfect++;
  st.popup = { text: `${pts === 100 ? 'Perfect' : pts >= 70 ? 'Good' : 'OK'} +${pts + bonus}`, t: 1.4, good: pts >= 70 };
  st.phase = 'doors'; st.phaseT = 0;
  // waiting passengers head for the doors
  st.boarding = Array.from({ length: tg.wait }, (_, i) => ({ off: (i - (tg.wait - 1) / 2) * 1.6, t: Math.random() * 0.2 }));
  IC.tone(659, 659, 0.22, 'sine', 0.05); IC.tone(523, 523, 0.3, 'sine', 0.05, 0.22);
  IC.hum.set(60, 0);
  return true;
}

function step(st, dt) {
  if (st.popup) { st.popup.t -= dt; if (st.popup.t <= 0) st.popup = null; }
  if (st.phase === 'doors') {
    st.phaseT += dt;
    if (st.phaseT > 1.3) {
      st.k++;
      st.boarding = [];
      if (st.k >= ROUTE.length) { st.phase = 'done'; return; }
      const tg = target(st);
      st.dir = tg.s > st.s ? 1 : -1;
      st.phase = 'drive'; st.mode = 'rest';
      newLeg(st);
    }
    return;
  }
  if (st.phase !== 'drive') return;
  st.legT += dt;
  // at rest, a press starts a go; letting go commits to the brake until it stops
  if (st.mode === 'rest' && holding) { st.mode = 'power'; st.goes++; st.peak = 0; }
  if (st.mode === 'power' && !holding) st.mode = 'brake';
  if (st.mode === 'power') { st.v = Math.min(VMAX, st.v + ACC * dt); st.peak = Math.max(st.peak, st.v); }
  else if (st.mode === 'brake') st.v = Math.max(0, st.v - BRAKE * dt);
  st.s += st.dir * st.v * dt;
  IC.hum.set(55 + st.v * 5, st.v > 0.2 ? 0.012 + (st.v / VMAX) * 0.02 : 0);
  const tg = target(st), err = (st.s - tg.s) * st.dir;
  // ran past the platform: missed it, carry on to the next one
  if (err > M.slack + M.train * 0.5) {
    const last = st.k === ROUTE.length - 1 || ROUTE[st.k] === 4 || ROUTE[st.k] === 0;
    if (!last) {
      miss(st, `Missed ${tg.name}`);
      st.k++;
      newLeg(st);
    }
  }
  // the buffers at either end
  if (st.s > M.hi || st.s < M.lo) {
    st.s = clamp(st.s, M.lo, M.hi);
    if (st.v > 3) { st.phase = 'crash'; st.crashed = true; IC.noise(0.5, 0.08, 400); IC.tone(150, 40, 0.5, 'sawtooth', 0.05); IC.hum.set(50, 0); return; }
    st.v = 0;
  }
  if (st.mode !== 'rest' && st.v === 0 && !(st.mode === 'power' && holding)) {
    st.mode = 'rest';
    if (arrive(st)) return;
    const tgn = target(st), e2 = (st.s - tgn.s) * st.dir;
    if (e2 > M.slack) {
      // stopped past the end platform: counts as a miss, the train turns round
      miss(st, `Missed ${tgn.name}`);
      st.k++;
      if (st.k >= ROUTE.length) { st.phase = 'done'; return; }
      st.dir = target(st).s > st.s ? 1 : -1;
      newLeg(st);
    } else if (st.goes === 0) {
      // still rolling from a missed stop; this one hasn't started yet
    } else if (st.goes === 1 && st.peak < TAP_V) {
      st.popup = { text: 'Hold to go', t: 1.4, good: true };
    } else {
      // stopped short, and that was the go for this stop
      miss(st, `Stopped short of ${tgn.name}`);
      st.k++;
      if (st.k >= ROUTE.length) { st.phase = 'done'; return; }
      st.dir = target(st).s > st.s ? 1 : -1;
      newLeg(st);
    }
  }
}

// Autopilot: let go when the braking distance covers what's left.
function bot(st) {
  if (st.phase !== 'drive') return false;
  const tg = target(st), left = (tg.s - st.s) * st.dir;
  return left > (st.v * st.v) / (2 * BRAKE) + 0.15;
}

// ---------- drawing ----------
function strip(s0, s1, h0, h1, color) {
  const L = IC.Lo;
  const pts = [];
  const pushRange = (a, b) => { pts.push([a, b]); };
  if (s0 < L.LB && s1 > L.LB) { pushRange(s0, L.LB); pushRange(L.LB, s1); } else pushRange(s0, s1);
  ctx.fillStyle = color;
  for (const [a, b] of pts) {
    const p0 = IC.at(a, h0), p1 = IC.at(b, h0), p2 = IC.at(b, h1), p3 = IC.at(a, h1);
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.closePath(); ctx.fill();
  }
}

function drawStations(st) {
  const U = IC.Lo.U, cur = st && (st.phase === 'drive' || st.phase === 'doors') ? target(st) : null;
  for (const p of M.st) {
    strip(p.s - p.len / 2, p.s + p.len / 2, 0.15, 1.3, 'rgba(210,214,228,0.55)');
    strip(p.s - p.len / 2, p.s + p.len / 2, 1.15, 1.3, 'rgba(255,214,10,0.65)');
    // station sign, kept upright: above a flat track, beside an upright one
    const fs = clamp(U * 1.9, 10, 17);
    ctx.font = `700 ${fs}px ${IC.FONT}`;
    const w = ctx.measureText(p.name).width + fs * 1.2;
    const na = IC.nAng(p.s), beside = Math.abs(Math.cos(na)) > 0.5;
    let x, y;
    if (beside) { const b = IC.base(p.s), d = 7.5 * U + w / 2; x = b[0] + Math.cos(na) * d; y = b[1]; }
    else [x, y] = IC.at(p.s, 9.5);
    const Lo = IC.Lo;
    x = clamp(x, Lo.sx + w / 2 + 6, Lo.sx + Lo.sw - w / 2 - 6);
    const isNext = cur === p;
    ctx.save();
    ctx.globalAlpha = isNext ? 1 : 0.7;
    IC.rrect(ctx, x - w / 2, y - fs * 0.85, w, fs * 1.7, fs * 0.5);
    ctx.fillStyle = isNext ? '#1db954' : 'rgba(20,90,55,0.85)';
    ctx.fill();
    ctx.restore();
    IC.text(p.name, x, y + 1, fs, { weight: 700, shadow: false, alpha: isNext ? 1 : 0.8 });
    // waiting passengers
    if (!(st && st.phase === 'doors' && cur === p)) {
      for (let i = 0; i < p.wait; i++) {
        const [px, py] = IC.at(p.s + (i - (p.wait - 1) / 2) * 1.6, 1.3 + 0.9);
        ctx.beginPath(); ctx.arc(px, py, U * 0.6, 0, Math.PI * 2); ctx.fillStyle = ['#ffd60a', '#ff9f0a', '#64d2ff', '#ff6482'][i % 4]; ctx.fill();
      }
    }
  }
  // the stop mark for the next station
  if (cur) {
    const a = IC.at(cur.s, 0), b = IC.at(cur.s, 5.4);
    ctx.save();
    ctx.strokeStyle = '#ffd60a';
    ctx.lineWidth = Math.max(2, U * 0.45);
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(IC.clock * 6);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    const t = IC.at(cur.s, 6.4);
    ctx.beginPath(); ctx.arc(t[0], t[1], U * 0.9, 0, Math.PI * 2); ctx.fillStyle = '#ffd60a'; ctx.fill();
    ctx.restore();
  }
}

function drawTrain(st) {
  const L = IC.Lo, U = L.U, s0 = st ? st.s : M.st[0].s, dir = st ? st.dir : 1;
  const half = M.car / 2 + M.gap / 2;
  const doorsOpen = st && st.phase === 'doors' ? clamp(Math.min(st.phaseT, 1.3 - st.phaseT) * 5, 0, 1) : 0;
  [-1, 1].forEach((side) => {
    const cs = s0 + side * half;
    const [x, y, a] = IC.at(cs, 0.35);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2);
    const w = M.car * U, h = 4.4 * U;
    // body
    IC.rrect(ctx, -w / 2, -h, w, h, U * 1.1);
    ctx.fillStyle = '#f4f5f8'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#d5d8e0';
    ctx.fillRect(-w / 2 + U * 0.6, -h + 0.25 * U, w - 1.2 * U, h * 0.08);
    // green stripe
    ctx.fillStyle = '#1db954';
    ctx.fillRect(-w / 2 + 0.15 * U, -h * 0.3, w - 0.3 * U, h * 0.11);
    // windows between and either side of the doors
    ctx.fillStyle = '#26304a';
    for (const wx of [-0.41, 0, 0.41]) { IC.rrect(ctx, wx * w - w * 0.075, -h * 0.82, w * 0.15, h * 0.34, U * 0.35); ctx.fill(); }
    // doors, which slide open at a stop
    for (const dx of [-0.22, 0.22]) {
      const dw = w * 0.15, open = doorsOpen * dw * 0.45;
      if (doorsOpen > 0) { ctx.fillStyle = 'rgba(255,240,180,0.85)'; ctx.fillRect(dx * w - dw / 2, -h * 0.9, dw, h * 0.84); }
      for (const [x0, ww] of [[dx * w - dw / 2 - open, dw / 2], [dx * w + open, dw / 2]]) {
        ctx.fillStyle = '#c9ccd6'; ctx.fillRect(x0, -h * 0.9, ww, h * 0.84);
        ctx.fillStyle = '#26304a'; ctx.fillRect(x0 + ww * 0.18, -h * 0.82, ww * 0.64, h * 0.34);
      }
    }
    // head and tail lights
    const front = side === dir;
    ctx.fillStyle = front ? '#fff7c2' : '#ff453a';
    const lx = side * L.faceSign * (w / 2 - 0.45 * U);
    ctx.beginPath(); ctx.arc(lx, -h * 0.22, U * 0.32, 0, Math.PI * 2); ctx.fill();
    if (front) {
      const gr = ctx.createRadialGradient(lx, -h * 0.22, 0, lx, -h * 0.22, U * 3);
      gr.addColorStop(0, 'rgba(255,247,194,0.45)'); gr.addColorStop(1, 'rgba(255,247,194,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(lx, -h * 0.22, U * 3, 0, Math.PI * 2); ctx.fill();
    }
    // wheels
    ctx.fillStyle = '#2c2c34';
    for (const wx of [-0.33, 0.33]) { ctx.beginPath(); ctx.arc(wx * w, 0, U * 0.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  });
  // the notch that has to line up with the yellow mark
  const [nx, ny] = IC.at(s0, 5.4);
  ctx.beginPath(); ctx.arc(nx, ny, U * 0.45, 0, Math.PI * 2); ctx.fillStyle = '#ffd60a'; ctx.fill();
  // boarding passengers
  if (st && st.phase === 'doors') {
    const tg = target(st);
    for (const b of st.boarding) {
      const k = clamp((st.phaseT - 0.25 - b.t) / 0.6, 0, 1);
      const from = tg.s + b.off, to = s0 + (b.off < 0 ? -half : half) * 0.5;
      const [px, py] = IC.at(from + (to - from) * k, 2.2 + Math.sin(k * Math.PI) * 1.5);
      if (k < 1) { ctx.beginPath(); ctx.arc(px, py, U * 0.6, 0, Math.PI * 2); ctx.fillStyle = '#ffd60a'; ctx.fill(); }
    }
  }
}

function drive(policy) {
  const st = fresh();
  let t = 0;
  while (st.phase !== 'done' && st.phase !== 'crash' && t < 300) {
    holding = policy(st);
    step(st, IC.STEP);
    t += IC.STEP;
  }
  holding = false;
  return st;
}

function selftest(n) {
  layout();
  const problems = [], L0 = IC.ends(0);
  const scores = [];
  IC.silent = true;
  for (let i = 0; i < n; i++) {
    const st = drive(bot);
    if (st.phase !== 'done') problems.push(`run ${i} ended ${st.phase}`);
    if (st.missed) problems.push(`bot missed ${st.missed}`);
    scores.push(st.score);
  }
  // a nervous start: a quick tap first, then a proper go. The tap is forgiven.
  let tapT = 0, leg = -1, stage = '';
  const nervous = drive((st) => {
    if (st.phase !== 'drive') return false;
    if (st.k !== leg) { leg = st.k; stage = 'tap'; tapT = 0.08; }
    if (stage === 'tap') { if (tapT > 0) { tapT -= IC.STEP; return true; } stage = 'wait'; return false; }
    if (stage === 'wait') { if (st.mode !== 'rest') return false; stage = 'go'; }
    return bot(st);
  });
  if (nervous.missed) problems.push(`a forgiven tap still cost ${nervous.missed} stops`);
  // nudging: lots of little taps. Has to lose to one hold and one release.
  let held = 0;
  const nudger = drive((st) => {
    if (st.mode === 'rest' && st.phase === 'drive' && held <= 0) held = 0.15;
    if (held > 0) { held -= IC.STEP; return true; }
    return false;
  });
  if (nudger.score >= scores[0] * 0.3) problems.push(`nudging scored ${nudger.score} against ${scores[0]}`);
  IC.silent = false;
  // platforms must not overlap each other or the corner, and fit on the line
  for (let i = 1; i < M.st.length; i++) if (M.st[i].s - M.st[i].len / 2 < M.st[i - 1].s + M.st[i - 1].len / 2 + 1) problems.push(`platforms ${i - 1}/${i} overlap`);
  for (const p of M.st) if (p.s - p.len / 2 < L0.lo - 0.01 || p.s + p.len / 2 > L0.hi + 0.01) problems.push(`${p.name} is off the line`);
  for (const p of M.st) if (p.s + p.len / 2 > IC.Lo.LB - 2 && p.s - p.len / 2 < IC.Lo.LB + 2) problems.push(`${p.name} is on the corner`);
  const legs = M.st.slice(1).map((p, i) => +(p.s - M.st[i].s).toFixed(1));
  return { runs: n, botScore: scores[0], nervousScore: nervous.score, nudgeScore: nudger.score, nudgeMissed: nudger.missed, maxPossible: ROUTE.length * 100, train: +M.train.toFixed(1), platform: +M.plat.toFixed(1), slack: +M.slack.toFixed(2), legs, problems };
}

IC.register({
  id: 'metro',
  name: 'Green Line',
  label: 'Green Line',
  unit: 'pts',
  how: 'Your screen has a metro line now. Hold to go, let go to brake. Stop with the yellow dot on the yellow mark.',
  howKeys: 'Your screen has a metro line now. Hold space to go, let go to brake. Stop with the yellow dot on the yellow mark.',
  icon(g, s) {
    IC.iconBg(g, s, '#f4f5f8', '#d9dbe3');
    g.fillStyle = '#1db954';
    g.beginPath(); g.arc(s * 0.5, s * 0.42, s * 0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(s * 0.5, s * 0.42, s * 0.19, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1db954';
    g.fillRect(s * 0.12, s * 0.37, s * 0.76, s * 0.1);
    g.fillStyle = '#fff';
    g.font = `800 ${s * 0.075}px ${IC.FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('GREEN LINE', s * 0.5, s * 0.425);
    IC.iconLine(g, [[s * 0.18, s * 1.1], [s * 0.18, s * 0.84], [s * 1.1, s * 0.84]], s * 0.03);
    g.fillStyle = '#20263a';
    IC.rrect(g, s * 0.4, s * 0.72, s * 0.42, s * 0.11, s * 0.03); g.fill();
  },
  layout,
  relayout(prev) { layout(); if (S) S.s = IC.remapS(prev, S.s); },
  reset() { layout(); S = null; holding = false; },
  start() { layout(); S = fresh(); holding = false; },
  leave() { IC.hum.stop(); holding = false; },
  update(dt) {
    if (!S || IC.state !== 'play') return;
    if (IC.BOT) holding = bot(S);
    step(S, dt);
    if ((S.phase === 'done' || S.phase === 'crash') && !S.sent) {
      S.sent = true;
      IC.hum.stop();
      const why = S.crashed ? 'Hit the buffers.' : S.missed ? 'Shift complete.' : S.perfect === ROUTE.length ? 'Perfect shift.' : 'Shift complete.';
      IC.end({ why, score: S.score, unit: 'pts', extra: `${S.perfect} perfect stop${S.perfect === 1 ? '' : 's'}${S.missed ? `, ${S.missed} missed` : ''}`, delay: S.crashed ? 0.8 : 0.3 });
    }
  },
  render() {
    if (!M) layout();
    drawStations(S);
    IC.drawLine();
    drawTrain(S);
    if (S && S.popup) {
      const [x, y] = IC.at(S.s, 11.5);
      IC.text(S.popup.text, x, y, clamp(IC.Lo.U * 2.6, 13, 24), { weight: 800, color: S.popup.good ? '#7dffb8' : '#ff8a8a', alpha: Math.min(1, S.popup.t * 2) });
    }
  },
  down() { holding = true; },
  up() { holding = false; },
  key(k, isDown) {
    if (k === ' ' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'Enter') { holding = isDown; return true; }
    return false;
  },
  hud() {
    if (!S) return { main: '', sub: '' };
    const nxt = S.k < ROUTE.length ? target(S).name : '';
    return { main: `${fmt(S.score)} pts`, sub: `Stop ${Math.min(S.k + 1, ROUTE.length)} of ${ROUTE.length}${nxt ? `: ${nxt}` : ''}` };
  },
  share: (r) => `I drove the Green Line on my Duo's screen and scored ${fmt(r.score)}.`,
  selftest,
});
})();
