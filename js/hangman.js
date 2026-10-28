// Hangman. The L is the gallows.
(() => {
'use strict';
const { clamp, fmt } = IC;
const ctx = IC.ctx;

const WORDS = [
  ['HINGE', 'The part holding it together'],
  ['CREASE', 'Every foldable has one'],
  ['DEAD PIXEL', 'Never lights up again'],
  ['GREEN LINE', 'You are looking at it'],
  ['POLISHING CLOTH', '$19, sold separately'],
  ['WARRANTY', 'Read the small print'],
  ['APPLECARE', 'Worth it this time'],
  ['GENIUS BAR', 'Book an appointment'],
  ['TEARDOWN', 'Screws out, photos up'],
  ['SAND', 'Coarse, rough, and it gets everywhere'],
  ['PREORDER', 'You were first in line'],
  ['EARLY ADOPTER', 'You, probably'],
  ['REPLACEMENT', 'Three to five business days'],
  ['BACKORDER', 'Ships in six weeks'],
  ['REFUND', 'Fourteen days to ask'],
  ['SOFTWARE UPDATE', 'Restart required'],
  ['ONE MORE THING', 'Said on stage, near the end'],
  ['KEYNOTE', 'September, every year'],
  ['UNBOXING', 'Peel the film off'],
  ['SCREEN PROTECTOR', 'Too late now'],
  ['BEND TEST', 'Do not try this at home'],
  ['FOLDABLE', 'Opens like a book'],
  ['INNER DISPLAY', 'The big screen'],
  ['TITANIUM', 'What the frame is made of'],
  ['DYNAMIC ISLAND', 'Lives at the top of the screen'],
  ['LIQUID GLASS', 'The new look'],
  ['CHARGER', 'Not in the box'],
  ['FACE ID', 'Look at it to unlock'],
  ['SMALL NUMBER', 'How many units, according to Apple'],
  ['SUPPLY CHAIN', 'Where it all comes from'],
  ['FIRMWARE', 'Lower down than software'],
  ['CUSTOMER SUPPORT', 'Please hold'],
  ['HOLD MUSIC', 'Your call is important to us'],
  ['SERIAL NUMBER', 'Settings, General, About'],
  ['RESTART', 'Have you tried turning it off'],
  ['FACTORY RESET', 'Back to day one'],
  ['BACKUP', 'You did make one, right'],
  ['FLAGSHIP', 'The expensive one'],
  ['PROTOTYPE', 'Before the real thing'],
  ['CAMERA BUMP', 'Wobbles on a table'],
  ['HEADPHONE JACK', 'Removed with courage'],
  ['NOTCH', 'Before the island'],
  ['HOME SCREEN', 'Where the apps live'],
  ['WALLPAPER', 'Behind the apps'],
  ['AIRDROP', 'Accept or decline'],
  ['FIND MY', 'Where did I leave it'],
  ['STATUS BAR', 'Battery, signal and time'],
  ['LOCK SCREEN', 'Before Face ID lets you in'],
  ['IFIXIT', 'Repairability, scored out of ten'],
  ['JERRYRIG', '___Everything, on YouTube'],
  ['SCRATCHES', 'At a level six'],
  ['DEEPER GROOVES', 'At a level seven'],
  ['RAZOR BLADE', 'Where the durability test starts'],
  ['SPUDGER', 'Pries it open'],
  ['PENTALOBE', 'The screws with five points'],
  ['THOUSAND DOLLARS', 'One new inner screen'],
  ['FINGERNAIL', 'Not on this screen'],
  ['REPAIR KIT', 'Comes with a screwdriver'],
  ['CUPERTINO', 'Apple\'s home town'],
  ['INFINITE LOOP', 'The old address'],
  ['APPLE PARK', 'A very round office'],
  ['STEVE JOBS', 'Black turtleneck, blue jeans'],
  ['WOZNIAK', 'The other Steve'],
  ['TIM COOK', 'Runs the place now'],
  ['MACINTOSH', 'Said hello in 1984'],
  ['LIGHTNING', 'The cable before USB-C'],
  ['MAGSAFE', 'Snaps on the back'],
  ['AIRPODS', 'Easy to lose one'],
  ['APPLE WATCH', 'Reminds you to stand up'],
  ['VISION PRO', 'A Mac you wear on your face'],
  ['MACBOOK', 'Folds like the Duo, but older'],
  ['SIRI', 'Sorry, I didn\'t get that'],
  ['ICLOUD', 'Storage almost full'],
  ['APP STORE', 'There\'s an app for that'],
  ['ITUNES', 'Terms and conditions, skipped'],
  ['IPOD', 'A thousand songs in your pocket'],
  ['CLICK WHEEL', 'Spin to scroll'],
  ['RETINA', 'Too many pixels to see one'],
  ['ACTION BUTTON', 'Used to be the mute switch'],
  ['CAMERA CONTROL', 'The button you press by accident'],
  ['NIGHT MODE', 'Hold still for three seconds'],
  ['PORTRAIT MODE', 'Blurs the background, and your ears'],
  ['FACETIME', 'Can you hear me now'],
  ['IMESSAGE', 'Blue bubbles'],
  ['GREEN BUBBLE', 'Texting from Android'],
  ['READ RECEIPT', 'They know you saw it'],
  ['CRASH DETECTION', 'Rollercoasters set it off'],
  ['LOW POWER MODE', 'The battery icon turns yellow'],
  ['BATTERYGATE', 'Slowed down for your own good'],
  ['ANTENNAGATE', 'Signal drops when you hold it'],
  ['BENDGATE', 'Too thin for tight jeans'],
  ['COURAGE', 'What it took to drop the jack'],
  ['DONGLE', 'An adapter for the adapter'],
  ['TOUCH BAR', 'A tiny screen above the keys'],
  ['BUTTERFLY KEYS', 'One crumb and they stick'],
  ['CHEESE GRATER', 'The Mac Pro with holes'],
  ['THINK DIFFERENT', 'Grammar optional'],
  ['SHOT ON IPHONE', 'Billboard credit'],
  ['SLIDE TO UNLOCK', 'Before Face ID and Touch ID'],
  ['HOME BUTTON', 'Pressed it, once upon a time'],
  ['MAGIC MOUSE', 'Charges upside down'],
  ['APPLE PENCIL', 'Charged sticking out of an iPad'],
  ['FINEWOVEN', 'Scratches if you look at it'],
  ['RIGHT TO REPAIR', 'What iFixit keeps asking for'],
  ['PARTS PAIRING', 'Why a new screen says unknown part'],
  ['WWDC', 'Every June, for developers'],
  ['JAILBREAK', 'Freed the iPhone, voided the warranty'],
  ['CALIFORNIA', 'Designed by Apple in'],
];
// The App Store build leaves out Apple's names, products and people,
// rewords hints that mention them, and has its own words instead.
const WEB_ONLY = new Set([
  'APPLECARE', 'GENIUS BAR', 'IFIXIT', 'JERRYRIG', 'CUPERTINO', 'INFINITE LOOP', 'APPLE PARK', 'STEVE JOBS',
  'WOZNIAK', 'TIM COOK', 'MACINTOSH', 'LIGHTNING', 'MAGSAFE', 'AIRPODS', 'APPLE WATCH', 'VISION PRO', 'MACBOOK',
  'SIRI', 'ICLOUD', 'APP STORE', 'ITUNES', 'IPOD', 'CLICK WHEEL', 'RETINA', 'ACTION BUTTON', 'CAMERA CONTROL',
  'FACETIME', 'IMESSAGE', 'GREEN BUBBLE', 'BATTERYGATE', 'ANTENNAGATE', 'BENDGATE', 'TOUCH BAR', 'BUTTERFLY KEYS',
  'CHEESE GRATER', 'THINK DIFFERENT', 'SHOT ON IPHONE', 'SLIDE TO UNLOCK', 'MAGIC MOUSE', 'APPLE PENCIL',
  'FINEWOVEN', 'WWDC', 'CALIFORNIA', 'DYNAMIC ISLAND', 'LIQUID GLASS', 'FACE ID', 'AIRDROP', 'FIND MY', 'KEYNOTE',
]);
const APP_HINTS = {
  'SMALL NUMBER': 'How many units, they said',
  'LOCK SCREEN': 'Swipe up to get past it',
  'NOTCH': 'The black bit at the top',
  'RIGHT TO REPAIR': 'What repair shops keep asking for',
  'JAILBREAK': 'Voids the warranty',
  'SERIAL NUMBER': 'Printed on the box',
};
const APP_WORDS = [
  ['CRACKED SCREEN', 'Spiderweb in one corner'],
  ['TEMPERED GLASS', 'Breaks so the screen does not'],
  ['STUCK PIXEL', 'Always on, always green'],
  ['SUBPIXEL', 'Red, green or blue'],
  ['BURN IN', 'The keyboard, forever, faintly'],
  ['GHOST TOUCH', 'Taps nobody made'],
  ['BACKLIGHT', 'Behind the pixels'],
  ['REFRESH RATE', 'A hundred and twenty times a second'],
  ['DIGITIZER', 'The part that feels your finger'],
  ['RIBBON CABLE', 'Usually the culprit'],
  ['LOGIC BOARD', 'Where the chips live'],
  ['ADHESIVE', 'Heat it up first'],
  ['HEAT GUN', 'Softens the glue'],
  ['SUCTION CUP', 'Lifts the screen off'],
  ['TWEEZERS', 'For the tiny screws'],
  ['SCREWDRIVER', 'Comes in the kit'],
  ['SPARE PARTS', 'In a drawer somewhere'],
  ['REPAIR SHOP', 'Closed on Sundays'],
  ['TECHNICIAN', 'Has seen worse'],
  ['OUT OF WARRANTY', 'Last thing you want to hear'],
  ['FINE PRINT', 'Read it this time'],
  ['RETURN POLICY', 'Fourteen days, no questions'],
  ['RECEIPT', 'Keep it somewhere safe'],
  ['INSURANCE', 'The excess still applies'],
  ['WATER DAMAGE', 'The sticker inside turned red'],
  ['BAG OF RICE', 'Does not actually work'],
  ['POCKET LINT', 'Lives in the charging port'],
  ['TOOTHPICK', 'Cleans out the port'],
  ['DROP TEST', 'Waist height, onto concrete'],
  ['BUTTERFINGERS', 'How it happened'],
  ['PHONE CASE', 'Would have helped'],
  ['SCREEN TIME', 'Up forty percent this week'],
  ['DO NOT DISTURB', 'The moon icon'],
  ['AIRPLANE MODE', 'Seat backs upright'],
  ['AUTOCORRECT', 'Ducking annoying'],
  ['GROUP CHAT', 'Muted, obviously'],
  ['VOICEMAIL', 'Nobody listens to it'],
  ['POWER BANK', 'Charged, unlike the phone'],
  ['DARK MODE', 'Easier on the eyes'],
  ['SCREENSHOT', 'Proof'],
  ['GREEN SCREEN', 'Film crews want one'],
  ['SANDCASTLE', 'Speck\'s dream house'],
  ['HOURGLASS', 'Speck\'s commute'],
  ['SAND DUNE', 'A big pile of Speck\'s relatives'],
  ['SANDPAPER', 'Speck\'s cousins, glued down'],
  ['SILICON', 'Sand, after a lot of work'],
  ['GLASS', 'Sand, after a lot of heat'],
  ['BEACH', 'Where Speck grew up'],
];
const LIST = IC.APP
  ? WORDS.filter(([w]) => !WEB_ONLY.has(w)).map(([w, h]) => [w, APP_HINTS[w] || h]).concat(APP_WORDS)
  : WORDS;
const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const MISSES = 7;

let S = null;
let G = null;           // layout: gallows, word area, keys
let bag = [];

function nextWord() {
  if (!bag.length) bag = LIST.map((w, i) => i).sort(() => Math.random() - 0.5);
  return LIST[bag.pop()];
}

function newRound(st) {
  const [word, hint] = nextWord();
  Object.assign(st, { word, hint, guessed: [], misses: 0, partT: [], phase: 'guess', phaseT: 0, shake: 0, shakeKey: '' });
}

// ---------- layout ----------
function layout() {
  const L = IC.Lo, U = L.U, e = IC.FRAMED ? { t: 0, r: 0, b: 0, l: 0 } : IC.safe;
  const scr = { x: L.sx + e.l, y: L.sy + e.t, r: L.sx + L.sw - e.r, b: L.sy + L.sh - e.b };
  // the beam is whichever arm runs across the screen; the figure hangs off it
  const aFlat = L.A[1] === 0;
  const beamEnd = aFlat ? L.aEnd : L.bEnd, beamLen = Math.abs(beamEnd[0] - L.J[0]);
  const dir = Math.sign(beamEnd[0] - L.J[0]) || 1;
  const below = scr.b - L.J[1];
  const bh = clamp(below - 2 * U, 60, Math.max(60, beamLen * 1.1));
  const ax = L.J[0] + dir * clamp(beamLen * 0.45, bh * 0.35, beamLen - bh * 0.3), ay = L.J[1] + L.lineHalf * U;
  const hr = bh * 0.1;
  const fig = { ax, ay, rope: bh * 0.14, hr, body: bh * 0.3, arm: bh * 0.2, leg: bh * 0.24, w: Math.max(1.5, bh * 0.018) };

  // word goes above the line, letters below it on the left, away from the figure
  const top = { x: scr.x, y: scr.y + 44, w: scr.r - scr.x, h: L.J[1] - 2 * U - (scr.y + 44) };
  const left = dir > 0
    ? { x: scr.x + 2 * U, y: L.J[1] + 3 * U, w: L.J[0] - 4 * U - (scr.x + 2 * U), h: scr.b - (L.J[1] + 3 * U) - U }
    : { x: L.J[0] + 4 * U, y: L.J[1] + 3 * U, w: scr.r - 2 * U - (L.J[0] + 4 * U), h: scr.b - (L.J[1] + 3 * U) - U };
  const gap = Math.max(4, U * 0.9);
  const fitKeys = (r) => {
    const kw = Math.min((r.w - 9 * gap) / 10, 64), kh = Math.min((r.h - 2 * gap) / 3, kw * 1.3);
    return { kw, kh, ok: kw >= 24 && kh >= 30 };
  };
  let kr = left, kf = fitKeys(left), word = top;
  if (!kf.ok || L.orient === 'portrait') {
    // not enough room beside the post: word on top, keyboard under it, both above the line
    const wordH = Math.min(top.h * 0.42, 150);
    word = { x: top.x, y: top.y, w: top.w, h: wordH };
    kr = { x: top.x + 2 * U, y: top.y + wordH, w: top.w - 4 * U, h: top.h - wordH };
    kf = fitKeys(kr);
  }
  const keys = [];
  const kh = Math.max(26, kf.kh), kw = Math.max(20, kf.kw);
  const totalH = 3 * kh + 2 * gap;
  ROWS.forEach((row, ri) => {
    const rw = row.length * kw + (row.length - 1) * gap;
    const x0 = kr.x + (kr.w - rw) / 2, y = kr.y + (kr.h - totalH) / 2 + ri * (kh + gap);
    [...row].forEach((ch, ci) => keys.push({ ch, x: x0 + ci * (kw + gap), y, w: kw, h: kh }));
  });
  G = { fig, word, keys, kh, kw, scr, kr };
}

// ---------- play ----------
function guess(ch) {
  if (!S || S.phase !== 'guess') return;
  if (S.guessed.includes(ch)) { S.shake = 0.3; S.shakeKey = ch; return; }
  S.guessed.push(ch);
  if (S.word.includes(ch)) {
    IC.haptic('select');
    IC.tone(660, 990, 0.08, 'triangle', 0.04);
    if ([...S.word].every((c) => c === ' ' || S.guessed.includes(c))) {
      S.phase = 'won'; S.phaseT = 0; S.streak++;
      IC.haptic('success');
      IC.tone(660, 660, 0.1, 'triangle', 0.04); IC.tone(880, 880, 0.1, 'triangle', 0.04, 0.1); IC.tone(1320, 1320, 0.2, 'triangle', 0.04, 0.2);
    }
  } else {
    S.misses++;
    S.partT.push(IC.clock);
    IC.haptic('medium');
    IC.tone(2600, 1900, 0.03, 'square', 0.015);
    IC.noise(0.12, 0.03, 3000);
    if (S.misses >= MISSES) {
      S.phase = 'lost'; S.phaseT = 0;
      IC.tone(440, 110, 0.7, 'sawtooth', 0.03, 0.15);
    }
  }
}

// ---------- drawing ----------
function glow(path, w, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  path(); ctx.strokeStyle = 'rgba(40,255,140,0.22)'; ctx.lineWidth = w * 5; ctx.stroke();
  path(); ctx.strokeStyle = 'rgba(40,255,140,0.85)'; ctx.lineWidth = w * 2; ctx.stroke();
  path(); ctx.strokeStyle = '#f2fff6'; ctx.lineWidth = w; ctx.stroke();
  ctx.restore();
}

function drawFigure() {
  const f = G.fig, lost = S.phase === 'lost';
  const sway = Math.sin(IC.clock * 1.6) * (0.015 + S.misses * 0.004) + (lost ? Math.sin(IC.clock * 2.4) * 0.03 : 0);
  ctx.save();
  ctx.translate(f.ax, f.ay);
  ctx.rotate(sway);
  const neck = f.rope + 2 * f.hr, hip = neck + f.body, sh = neck + f.body * 0.18;
  const parts = [
    (k) => { ctx.moveTo(0, 0); ctx.lineTo(0, f.rope * k); },
    (k) => { ctx.arc(0, f.rope + f.hr, f.hr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); },
    (k) => { ctx.moveTo(0, neck); ctx.lineTo(0, neck + f.body * k); },
    (k) => { ctx.moveTo(0, sh); ctx.lineTo(-f.arm * 0.8 * k, sh + f.arm * 0.65 * k); },
    (k) => { ctx.moveTo(0, sh); ctx.lineTo(f.arm * 0.8 * k, sh + f.arm * 0.65 * k); },
    (k) => { ctx.moveTo(0, hip); ctx.lineTo(-f.leg * 0.5 * k, hip + f.leg * k); },
    (k) => { ctx.moveTo(0, hip); ctx.lineTo(f.leg * 0.5 * k, hip + f.leg * k); },
  ];
  for (let i = 0; i < S.misses; i++) {
    const k = clamp((IC.clock - S.partT[i]) / 0.25, 0, 1);
    glow(() => { ctx.beginPath(); parts[i](k); }, f.w);
  }
  if (lost) {
    const ey = f.rope + f.hr * 0.85, q = f.hr * 0.2;
    glow(() => {
      ctx.beginPath();
      for (const ex of [-f.hr * 0.38, f.hr * 0.38]) {
        ctx.moveTo(ex - q, ey - q); ctx.lineTo(ex + q, ey + q);
        ctx.moveTo(ex + q, ey - q); ctx.lineTo(ex - q, ey + q);
      }
    }, f.w * 0.7);
  }
  ctx.restore();
}

function drawWord() {
  const r = G.word, U = IC.Lo.U;
  const words = S.word.split(' ');
  // one line if it fits, otherwise break at a space
  const maxSize = Math.min(r.h * 0.42, 56);
  const lineFor = (ws) => ws.join(' ');
  let lines = [S.word];
  const fit = (str) => Math.min(maxSize, (r.w * 0.92) / (str.length * 0.82));
  let size = fit(S.word);
  if (size < 22 && words.length > 1) {
    let bestSplit = 1, bestLen = Infinity;
    for (let i = 1; i < words.length; i++) {
      const m = Math.max(lineFor(words.slice(0, i)).length, lineFor(words.slice(i)).length);
      if (m < bestLen) { bestLen = m; bestSplit = i; }
    }
    lines = [lineFor(words.slice(0, bestSplit)), lineFor(words.slice(bestSplit))];
    size = Math.min(fit(lines[0].length > lines[1].length ? lines[0] : lines[1]), (r.h * 0.7) / 2.4);
  }
  const cw = size * 0.82, lh = size * 1.35;
  const hintSize = clamp(size * 0.36, 11, 16);
  const blockH = lines.length * lh + hintSize * 2;
  let y = r.y + (r.h - blockH) / 2 + lh * 0.5;
  const t = IC.clock;
  lines.forEach((line) => {
    const x0 = r.x + r.w / 2 - (line.length * cw) / 2 + cw / 2;
    [...line].forEach((ch, i) => {
      if (ch === ' ') return;
      const x = x0 + i * cw;
      const shown = S.guessed.includes(ch);
      const bounce = S.phase === 'won' ? -Math.abs(Math.sin(t * 9 + i * 0.6)) * size * 0.12 : 0;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(x - cw * 0.36, y + size * 0.42, cw * 0.72, Math.max(2, size * 0.06));
      if (shown) IC.text(ch, x, y + bounce, size, { weight: 700 });
      else if (S.phase === 'lost') IC.text(ch, x, y, size, { weight: 700, color: '#ff6b8a' });
    });
    y += lh;
  });
  IC.text(`Hint: ${S.hint}`, r.x + r.w / 2, y - lh * 0.5 + hintSize * 1.3, hintSize, { weight: 500, alpha: 0.75 });
  if (S.phase === 'won') IC.text('Saved.', r.x + r.w / 2, r.y + Math.max(14, size * 0.3), clamp(size * 0.45, 13, 20), { weight: 700, color: '#7dffb8' });
}

function drawKeys() {
  const sz = clamp(G.kh * 0.46, 12, 24);
  for (const k of G.keys) {
    const used = S.guessed.includes(k.ch), hit = used && S.word.includes(k.ch);
    let dx = 0;
    if (S.shake > 0 && S.shakeKey === k.ch) dx = Math.sin(S.shake * 60) * 3;
    ctx.save();
    ctx.translate(dx, 0);
    IC.rrect(ctx, k.x, k.y, k.w, k.h, Math.min(10, k.w * 0.22));
    ctx.fillStyle = !used ? 'rgba(255,255,255,0.17)' : hit ? 'rgba(40,220,120,0.35)' : 'rgba(0,0,0,0.25)';
    ctx.fill();
    ctx.strokeStyle = !used ? 'rgba(255,255,255,0.22)' : hit ? 'rgba(90,255,160,0.6)' : 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    IC.text(k.ch, k.x + k.w / 2 + dx, k.y + k.h / 2 + 1, sz, { weight: 600, alpha: used && !hit ? 0.3 : 1, shadow: false });
  }
}

// ---------- tests ----------
function selftest(n) {
  const problems = [];
  const seen = new Set();
  for (const [w, h] of LIST) {
    if (!/^[A-Z]+( [A-Z]+)*$/.test(w)) problems.push(`bad word ${w}`);
    if (w.length > 16) problems.push(`long word ${w}`);
    if (!h || /[\u2013\u2014]/.test(h + w)) problems.push(`bad hint ${w}`);
    if (seen.has(w)) problems.push(`duplicate ${w}`);
    seen.add(w);
    if (IC.APP && /apple|iphone|ipad|\bmac|\bduo\b|ifixit|jerry|siri|face id|android/i.test(`${w} ${h}`)) problems.push(`brand in ${w}`);
  }
  for (const w of WEB_ONLY) if (!WORDS.some(([x]) => x === w)) problems.push(`web-only ${w} is not in the list`);
  layout();
  const L = IC.Lo;
  for (const k of G.keys) {
    if (k.x < G.scr.x - 0.5 || k.x + k.w > G.scr.r + 0.5 || k.y < G.scr.y - 0.5 || k.y + k.h > G.scr.b + 0.5) problems.push(`key ${k.ch} off screen`);
    // keys must stay off the line
    const n2 = IC.nearest(k.x + k.w / 2, k.y + k.h / 2);
    if (n2.d < Math.min(k.w, k.h) / 2) problems.push(`key ${k.ch} on the line`);
  }
  const f = G.fig;
  if (f.ay + f.rope + 2 * f.hr + f.body + f.leg > G.scr.b + 1) problems.push('figure off screen');
  // a bot that guesses by letter frequency, to walk the round logic
  const freq = 'EAIRTONSLCUDPMHGBFYWKVXZJQ';
  let wins = 0, losses = 0;
  S = { streak: 0 };
  for (let i = 0; i < n; i++) {
    newRound(S);
    for (const ch of freq) { if (S.phase !== 'guess') break; guess(ch); }
    if (S.phase === 'won') wins++; else if (S.phase === 'lost') losses++; else problems.push(`stuck on ${S.word}`);
  }
  return { n, words: LIST.length, wins, losses, keys: G.keys.length, keySize: `${G.kw.toFixed(0)}x${G.kh.toFixed(0)}`, problems };
}

IC.register({
  id: 'hangman',
  name: 'Hangman',
  label: 'Hangman',
  unit: 'in a row',
  noTapRestart: true,
  // the result card goes where the keyboard was, so the answer stays readable
  panelRect: (state) => (state === 'over' && G ? G.kr : null),
  how: IC.APP ? 'Your screen already drew the gallows.' : 'The Duo already drew the gallows.',
  bestText: (v) => `Best ${fmt(v)} in a row`,
  icon(g, s) {
    IC.iconBg(g, s, '#25304a', '#0f1424');
    IC.iconLine(g, [[s * 0.28, s * 1.1], [s * 0.28, s * 0.3], [s * 1.1, s * 0.3]], s * 0.035);
    g.save();
    g.strokeStyle = '#f2fff6'; g.lineWidth = s * 0.03; g.lineCap = 'round';
    g.shadowColor = '#28ff8c'; g.shadowBlur = s * 0.05;
    const x = s * 0.62;
    g.beginPath();
    g.moveTo(x, s * 0.3); g.lineTo(x, s * 0.4);
    g.moveTo(x + s * 0.075, s * 0.475); g.arc(x, s * 0.475, s * 0.075, 0, Math.PI * 2);
    g.moveTo(x, s * 0.55); g.lineTo(x, s * 0.72);
    g.moveTo(x, s * 0.59); g.lineTo(x - s * 0.1, s * 0.67);
    g.moveTo(x, s * 0.59); g.lineTo(x + s * 0.1, s * 0.67);
    g.moveTo(x, s * 0.72); g.lineTo(x - s * 0.08, s * 0.86);
    g.moveTo(x, s * 0.72); g.lineTo(x + s * 0.08, s * 0.86);
    g.stroke();
    g.restore();
  },
  layout,
  relayout: layout,
  reset() { layout(); S = { streak: 0 }; newRound(S); S.guessed = []; },
  start() { layout(); S = { streak: 0 }; newRound(S); },
  update(dt) {
    if (!S) return;
    if (S.shake > 0) S.shake -= dt;
    if (IC.state !== 'play') return;
    S.phaseT += dt;
    // autopilot for screenshots: common letters first, one every quarter second
    if (IC.BOT && S.phase === 'guess') {
      S.botT = (S.botT || 0) + dt;
      if (S.botT > 0.25) { S.botT = 0; const ch = [...'ETAOINSRHLDCUMFPGWYBVKXJQZ'].find((c) => !S.guessed.includes(c)); if (ch) guess(ch); }
    }
    if (S.phase === 'won' && S.phaseT > 1.3) newRound(S);
    else if (S.phase === 'lost' && S.phaseT > 1.6 && !S.sent) {
      S.sent = true;
      IC.end({ why: `Hung up on ${S.word}.`, score: S.streak, unit: 'in a row' });
    }
  },
  render() {
    IC.drawLine();
    if (!S || !G) return;
    if (IC.state === 'title') { drawFigureTitle(); return; }
    drawFigure();
    drawWord();
    if (IC.state === 'play') drawKeys();
  },
  down(p) {
    for (const k of G.keys) if (p.x >= k.x - 2 && p.x <= k.x + k.w + 2 && p.y >= k.y - 2 && p.y <= k.y + k.h + 2) { guess(k.ch); return; }
  },
  key(k, isDown) {
    if (!isDown || k.length !== 1) return false;
    const ch = k.toUpperCase();
    if (ch >= 'A' && ch <= 'Z') { guess(ch); return true; }
    return false;
  },
  hud() { return { main: `${fmt(S.streak)} in a row`, sub: S.phase === 'guess' ? `${MISSES - S.misses} wrong letters left` : '' }; },
  share: (r) => `I got ${fmt(r.score)} in a row before my ${IC.APP ? 'screen' : 'Duo'} finished drawing the gallows.`,
  selftest,
});

// On the title card, show a finished figure as a preview.
function drawFigureTitle() {
  const keep = S.misses, keepT = S.partT;
  S.misses = MISSES;
  S.partT = new Array(MISSES).fill(-10);
  drawFigure();
  S.misses = keep;
  S.partT = keepT;
}
})();
