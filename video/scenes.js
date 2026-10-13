// Stock Guard demo: 36 s, 1920x1080, 30 fps. Every frame is a pure function of time, so renders are repeatable.
const W = 1920, H = 1080, FPS = 30, DUR = 36;
const COL = { paper: '#f4f0e6', card: '#fbf8f1', ink: '#1c2a23', mute: '#6b7569', line: '#ddd6c4', pine: '#1f4d3a', deep: '#0c1511', deep2: '#121d17',
  red: '#e0533a', amber: '#e6a62a', ochre: '#b9b247', plum: '#c07ab2', mint: '#8fd4ad', cream: '#f4f0e6' };
const SERIF = '"Palatino Linotype","Book Antiqua",Palatino,Georgia,serif', SANS = '"Segoe UI",system-ui,sans-serif', MONO = 'Consolas,"Cascadia Mono",monospace';
const main = document.getElementById('c'), ctx0 = main.getContext('2d');
const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
const bufA = mk(), bufB = mk(), bufT = mk();
let META, IM = {};
const log = m => { document.getElementById('log').textContent = m; console.log(m); };

// ---------- maths
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, u) => a + (b - a) * u;
const E = { out3: t => 1 - (1 - t) ** 3, out5: t => 1 - (1 - t) ** 5, in3: t => t * t * t, inout3: t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2,
  back: t => { const c1 = 2.2, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; }, expo: t => t >= 1 ? 1 : 1 - 2 ** (-10 * t) };
const rand = n => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

// ---------- timeline (beats are 0.5 s at 120 BPM)
const SC = [[0, 'cold'], [3, 'inbox'], [6, 'logo'], [8, 'drop'], [11, 'results'], [15, 'briefing'], [18, 'verify'], [22, 'returns'], [25, 'reorder'], [27, 'proof'], [30, 'phone'], [32, 'end']];
const TR = [[3, 'glitch'], [6, 'flash'], [8, 'whip'], [11, 'zoom'], [15, 'whip'], [18, 'glitch'], [22, 'whip'], [25, 'zoom'], [27, 'glitch'], [30, 'whip'], [32, 'iris']];
const HALF = { whip: 0.2, zoom: 0.2, glitch: 0.13, flash: 0.12, iris: 0.32 };
const IMPACTS = [[2.0, 1.2], [6.0, 0.8], [9.9, 0.4], [27.0, 1], [28.0, 1], [29.0, 1], [32.0, 1.1]];
const CUE = { silent: [[5.5, 6.0]], whooshes: TR.filter(([, k]) => k !== 'flash').map(([t]) => t), impacts: IMPACTS, risers: [[4.9, 1.1]], typing: [[3.2, 4.6], [18.6, 19.8]] };

// ---------- drawing helpers
const patterns = {};
function bg(c, color, dot) {
  c.fillStyle = color; c.fillRect(0, 0, W, H);
  if (!dot) return;
  if (!patterns[dot]) { const p = document.createElement('canvas'); p.width = p.height = 28; const g = p.getContext('2d'); g.fillStyle = dot; g.beginPath(); g.arc(14, 14, 1.7, 0, 7); g.fill(); patterns[dot] = c.createPattern(p, 'repeat'); }
  c.fillStyle = patterns[dot]; c.fillRect(0, 0, W, H);
}
function vignette(c, a = 0.55) { const g = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`); c.fillStyle = g; c.fillRect(0, 0, W, H); }
function font(c, size, o = {}) { c.font = `${o.style || ''} ${o.weight || 600} ${size}px ${o.font || SERIF}`; }
function txt(c, s, x, y, o = {}) {
  c.save(); c.globalAlpha *= o.alpha ?? 1; c.translate(x, y); if (o.rot) c.rotate(o.rot); if (o.scale != null) c.scale(o.scale, o.scale);
  font(c, o.size || 80, o); c.letterSpacing = (o.ls || 0) + 'px'; c.fillStyle = o.color || COL.ink; c.textAlign = o.align || 'center'; c.textBaseline = o.base || 'middle';
  c.fillText(s, 0, 0); c.restore();
}
function pill(c, s, x, y, u, o = {}) {
  if (u <= 0) return;
  const e = E.out5(clamp(u)), size = o.size || 44;
  c.save(); font(c, size, { weight: 600, font: o.font || SANS, style: o.style });
  const tw = c.measureText(s).width, pw = tw + size * 1.4, ph = size * 1.9;
  const x0 = o.align === 'center' ? x - pw / 2 : x;
  c.globalAlpha = e; c.translate(0, (1 - e) * 36);
  c.beginPath(); c.roundRect(x0, y - ph / 2, pw * (0.25 + 0.75 * e), ph, ph / 2); c.clip();
  c.fillStyle = o.bg || COL.pine; c.fillRect(x0, y - ph / 2, pw, ph);
  c.fillStyle = o.fg || COL.cream; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText(s, x0 + size * 0.7, y + 2);
  c.restore();
}
function ring(c, x, y, w, h, u, color = COL.pine, lw = 7) {
  if (u <= 0) return;
  const e = E.out5(clamp(u)), inf = 26 * (1 - e) + 10;
  c.save(); c.globalAlpha = clamp(u * 3); c.strokeStyle = color; c.lineWidth = lw; c.shadowColor = color; c.shadowBlur = 24;
  c.beginPath(); c.roundRect(x - inf, y - inf, w + inf * 2, h + inf * 2, 16); c.stroke(); c.restore();
}
function shake(t) {
  let a = 0;
  for (const [ti, big] of IMPACTS) if (t >= ti) a += 22 * big * Math.exp(-(t - ti) * 9);
  const f = Math.floor(t * FPS);
  return [(rand(f) - 0.5) * 2 * a, (rand(f + 99) - 0.5) * 2 * a];
}
function stamp(c, s, x, y, o) {
  const g = bufT.getContext('2d'); g.clearRect(0, 0, W, H);
  g.save(); g.translate(x, y); g.rotate(o.rot || 0); g.scale(o.scale, o.scale);
  font(g, o.size, { weight: 800, font: SANS }); g.letterSpacing = o.size * 0.12 + 'px';
  const tw = g.measureText(s).width, bw = tw + o.size * 0.9, bh = o.size * 1.45;
  g.strokeStyle = g.fillStyle = o.color; g.lineWidth = o.size * 0.085;
  g.beginPath(); g.roundRect(-bw / 2, -bh / 2, bw, bh, o.size * 0.12); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, o.size * 0.06, o.size * 0.06);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 260; i++) { g.globalAlpha = 0.35 + rand(i) * 0.6; g.beginPath(); g.arc((rand(i * 3) - 0.5) * bw, (rand(i * 5) - 0.5) * bh, 1 + rand(i * 7) * 5, 0, 7); g.fill(); }
  g.restore();
  c.save(); c.globalAlpha = o.alpha ?? 1; c.drawImage(bufT, 0, 0); c.restore();
}
// screenshots: zoom 1 means the image width fills the frame
function cam(c, name, cx, cy, zoom, back = COL.paper) {
  const im = IM[name], s = zoom * W / im.width;
  c.fillStyle = back; c.fillRect(0, 0, W, H);
  c.drawImage(im, W / 2 - cx * s, H / 2 - cy * s, im.width * s, im.height * s);
  return (x, y) => [W / 2 + (x - cx) * s, H / 2 + (y - cy) * s, s];
}
function R(page, sel) { const r = META.rects[page][sel], k = META.scale; return { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k, cx: (r.x + r.w / 2) * k, cy: (r.y + r.h / 2) * k }; }
function keyCam(t, keys) { // keys: [time, cx, cy, zoom]
  if (t <= keys[0][0]) return keys[0].slice(1);
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, x0, y0, z0] = keys[i - 1], [t1, x1, y1, z1] = keys[i], u = E.inout3(seg(t, t0, t1));
      return [lerp(x0, x1, u), lerp(y0, y1, u), Math.exp(lerp(Math.log(z0), Math.log(z1), u))];
    }
  }
  return keys[keys.length - 1].slice(1);
}
function wrapMono(text, cols) {
  const lines = []; let a = 0, sp = -1;
  for (let i = 0; i <= text.length; i++) {
    const ch = text[i];
    if (ch === '\n' || i === text.length) { lines.push([a, i]); a = i + 1; sp = -1; continue; }
    if (ch === ' ') sp = i;
    if (i - a >= cols && sp > a) { lines.push([a, sp]); a = sp + 1; sp = -1; }
  }
  return lines;
}
function monoBlock(c, text, x, y, o) { // typed text with highlighted tokens
  font(c, o.size, { weight: 400, font: MONO }); const cw = c.measureText('M').width, lh = o.size * 1.5;
  const lines = wrapMono(text, Math.floor(o.width / cw)), n = o.typed ?? text.length;
  c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  for (const hl of o.hl || []) {
    const idx = text.indexOf(hl.tok); if (idx < 0 || hl.u <= 0) continue;
    const li = lines.findIndex(([a, b]) => idx >= a && idx < b), [a] = lines[li];
    c.fillStyle = hl.color; c.globalAlpha = 0.28 * clamp(hl.u * 2); c.fillRect(x + (idx - a) * cw - 6, y + li * lh - o.size * 0.95, hl.tok.length * cw * E.out5(clamp(hl.u)) + 12, o.size * 1.25);
    c.globalAlpha = 1; c.fillRect(x + (idx - a) * cw, y + li * lh + 8, hl.tok.length * cw * E.out5(clamp(hl.u)), 4);
  }
  lines.forEach(([a, b], li) => {
    const vis = text.slice(a, Math.min(b, Math.max(a, n)));
    c.fillStyle = o.color; c.fillText(vis, x, y + li * lh);
    if (n > a && n <= b && o.cursor) { c.fillStyle = COL.mint; c.fillRect(x + vis.length * cw + 2, y + li * lh - o.size * 0.8, cw * 0.6, o.size); }
  });
  return { lines, cw, lh };
}
function card(c, x, y, w, h, fill, stroke) { c.save(); c.fillStyle = fill; c.strokeStyle = stroke; c.lineWidth = 2; c.beginPath(); c.roundRect(x, y, w, h, 22); c.fill(); c.stroke(); c.restore(); }
function logo(c, x, y, size, sq, cross, u = 1) {
  const e = E.back(clamp(u)), d = E.out3(seg(u, 0.35, 1));
  c.save(); c.translate(x, y); c.rotate((1 - E.out3(clamp(u))) * -1.2); c.scale(e, e);
  c.fillStyle = sq; c.beginPath(); c.roundRect(-size / 2, -size / 2, size, size, size * 0.28); c.fill();
  c.strokeStyle = cross; c.lineWidth = size * 0.13; c.lineCap = 'round'; const a = size * 0.22 * d;
  c.beginPath(); c.moveTo(-a, 0); c.lineTo(a, 0); c.moveTo(0, -a); c.lineTo(0, a); c.stroke(); c.restore();
}
function lettersIn(c, s, x, y, t0, t, o) { // left-aligned word reveal, one letter every 30 ms
  font(c, o.size, o); let cx = x;
  [...s].forEach((ch, i) => { const u = seg(t, t0 + i * 0.03, t0 + i * 0.03 + 0.3), e = E.out5(u);
    if (u > 0) txt(c, ch, cx, y + (1 - e) * 50, { ...o, align: 'left', alpha: e }); font(c, o.size, o); cx += c.measureText(ch).width; });
}

// ---------- scenes
const S = {
  cold(c, t) {
    bg(c, COL.deep, 'rgba(244,240,230,0.05)'); vignette(c);
    const [sx, sy] = shake(t); c.save(); c.translate(sx, sy);
    const dim = 1 - 0.65 * E.out3(seg(t, 2.0, 2.15));
    [['Expired stock', 0, COL.cream, ''], ['gets written off', 0.5, COL.cream, ''], ['at full cost.', 1.0, COL.red, 'italic']].forEach(([s, at, col, st], i) => {
      const u = seg(t, at, at + 0.35), e = E.out5(u);
      if (u > 0) txt(c, s, W / 2, 360 + i * 165 + (1 - e) * 70, { size: 140, color: col, style: st, alpha: e * dim, scale: 1.15 - 0.15 * e });
    });
    const u = seg(t, 2.0, 2.15);
    if (u > 0) stamp(c, 'EXPIRED', W / 2, H / 2, { size: 170, color: COL.red, rot: -0.13, alpha: u < 1 ? 0.4 + 0.6 * u : 0.95,
      scale: u < 1 ? 3.4 - 2.4 * E.in3(u) : 1 + 0.05 * Math.exp(-(t - 2.15) * 12) * Math.cos((t - 2.15) * 42) });
    c.restore();
  },
  inbox(c, t) {
    bg(c, COL.deep2, 'rgba(244,240,230,0.04)'); vignette(c, 0.5);
    const notice = 'Dear pharmacist, the maker of Salbutamol 100mcg inhalers is withdrawing lots SAL0932 and SAL0933 after reports of a faulty dose counter. Please quarantine them. Ref RC-2026-121, issued 3 Oct 2026.';
    const ci = E.out5(seg(t, 3.0, 3.35));
    c.save(); c.globalAlpha = ci; c.translate(-(1 - ci) * 120, 0);
    card(c, 130, 250, 860, 580, '#18251e', 'rgba(143,212,173,0.25)');
    txt(c, 'INBOX  ·  RECALL NOTICE', 180, 312, { size: 26, font: MONO, weight: 600, color: COL.mint, align: 'left', ls: 3 });
    txt(c, 'from: quality@supplier   3 Oct 2026', 180, 356, { size: 24, font: MONO, weight: 400, color: 'rgba(244,240,230,0.45)', align: 'left' });
    monoBlock(c, notice, 180, 430, { size: 33, width: 760, color: COL.cream, typed: Math.floor(seg(t, 3.2, 4.6) * notice.length), cursor: t < 4.8,
      hl: [{ tok: 'SAL0932', u: seg(t, 4.6, 4.85), color: COL.plum }, { tok: 'SAL0933', u: seg(t, 4.75, 5.0), color: COL.plum }] });
    c.restore();
    [['Recalls arrive', 3.5, COL.cream, ''], ['as emails', 4.0, COL.cream, ''], ['nobody has time', 4.5, COL.cream, ''], ['to read.', 5.0, COL.mint, 'italic']].forEach(([s, at, col, st], i) => {
      const e = E.out5(seg(t, at, at + 0.3)); if (e > 0) txt(c, s, 1090, 380 + i * 112 + (1 - e) * 40, { size: 96, color: col, style: st, align: 'left', alpha: e });
    });
  },
  logo(c, t) {
    bg(c, COL.paper, 'rgba(31,77,58,0.13)');
    const u = seg(t, 6.0, 6.45);
    logo(c, W / 2 - 430, H / 2 - 30, 210, COL.pine, COL.cream, u);
    lettersIn(c, 'Stock Guard', W / 2 - 280, H / 2 - 22, 6.25, t, { size: 176, color: COL.ink, weight: 600 });
    const e = E.out5(seg(t, 7.0, 7.4));
    if (e > 0) txt(c, 'Catch the money before it expires.', W / 2 - 274, H / 2 + 110 + (1 - e) * 30, { size: 54, style: 'italic', weight: 400, color: COL.pine, align: 'left', alpha: e });
  },
  drop(c, t) {
    const d = R('empty', '#drop');
    const k = keyCam(t, [[8.0, 960, 540, 1.0], [10.9, d.cx + 380, d.cy + 230, 1.12]]);
    const at = cam(c, 'empty', ...k);
    pill(c, '①  Drop in your stock export', 70, 980, seg(t, 8.5, 8.85), { size: 46 });
    const [dx, dy, s] = at(d.x, d.y), dw = d.w * s, dh = d.h * s;
    const fu = seg(t, 9.3, 9.9), fe = E.out5(fu);
    ring(c, dx, dy, dw, dh, seg(t, 9.9, 10.2), COL.pine);
    if (fu > 0) {
      const land = t > 9.9 ? 1 + 0.08 * Math.exp(-(t - 9.9) * 10) * Math.cos((t - 9.9) * 38) : 1;
      const x = lerp(W + 300, dx + dw / 2, fe), y = lerp(dy - 260, dy + dh / 2, fe), cw = 470, ch = 128;
      c.save(); c.translate(x, y); c.rotate((1 - fe) * 0.35); c.scale(land, land);
      c.shadowColor = 'rgba(0,0,0,0.25)'; c.shadowBlur = 40; c.shadowOffsetY = 18;
      c.fillStyle = COL.card; c.beginPath(); c.roundRect(-cw / 2, -ch / 2, cw, ch, 18); c.fill(); c.shadowColor = 'transparent';
      c.strokeStyle = COL.line; c.lineWidth = 2; c.stroke();
      c.fillStyle = COL.pine; c.beginPath(); c.roundRect(-cw / 2 + 22, -40, 80, 80, 14); c.fill();
      txt(c, 'CSV', -cw / 2 + 62, 2, { size: 26, font: SANS, weight: 800, color: COL.cream });
      txt(c, 'sample-shelf.csv', -cw / 2 + 124, -16, { size: 36, align: 'left', color: COL.ink });
      txt(c, '20 batches · 7 columns', -cw / 2 + 124, 26, { size: 25, font: SANS, weight: 400, align: 'left', color: COL.mute });
      c.restore();
    }
    pill(c, '②  Paste any recall notices', 70, 980 - 120, seg(t, 10.25, 10.6), { size: 46, bg: COL.ink });
  },
  results(c, t) {
    const h = R('results', '.hero h2'), st = R('results', '.stamps');
    const k = keyCam(t, [[11.0, h.x + 330, h.cy, 2.25], [11.9, h.x + 380, h.cy + 20, 1.95], [12.4, 960 + 150, st.cy - 60, 1.12], [14.8, 960 + 150, st.cy - 40, 1.18]]);
    const at = cam(c, 'results', ...k);
    const words = ['Recalled.', 'Expired.', 'Expiring soon.', `$${META.data.at_risk.toFixed(2)} at risk.`];
    words.forEach((w, i) => {
      const r = R('results', i ? '.stamp#' + i : '.stamp'), at0 = 12.5 + i * 0.5;
      const [x, y, s] = at(r.x, r.y);
      if (i < 3) ring(c, x, y, r.w * s, r.h * s, seg(t, at0, at0 + 0.25), [COL.plum, COL.red, COL.amber][i], 8);
    });
    const cur = Math.floor((t - 12.5) / 0.5);
    if (t >= 12.5) { const i = Math.min(cur, 3), u = seg(t, 12.5 + i * 0.5, 12.5 + i * 0.5 + 0.18);
      c.save(); c.fillStyle = 'rgba(12,21,17,0.86)'; c.fillRect(0, 900, W, 180); c.restore();
      txt(c, words[i], W / 2, 990, { size: 92, color: i === 3 ? COL.mint : COL.cream, scale: 1.25 - 0.25 * E.out5(u), alpha: clamp(u * 3) }); }
  },
  briefing(c, t) {
    const n = R('results', '.note');
    c.save(); c.filter = 'blur(10px)'; cam(c, 'results', ...keyCam(t, [[15.0, n.cx, n.cy, 1.5], [18.2, n.cx, n.cy, 1.7]])); c.restore();
    c.fillStyle = 'rgba(12,21,17,0.72)'; c.fillRect(0, 0, W, H);
    const e = E.out5(seg(t, 15.0, 15.3)), x = 230, y = 170, w = W - 460, h = 640;
    c.save(); c.globalAlpha = e; c.translate(0, (1 - e) * 60);
    card(c, x, y, w, h, COL.card, COL.line); c.fillStyle = COL.pine; c.fillRect(x, y + 22, 10, h - 44);
    txt(c, 'BRIEFING  ·  WRITTEN BY LLAMA3.2 ON THIS PC', x + 70, y + 80, { size: 26, font: SANS, weight: 700, color: COL.pine, align: 'left', ls: 4 });
    const words = (META.data.ai.summary || 'AI was off for this run.').split(' '), shown = Math.floor(seg(t, 15.3, 17.0) * words.length);
    font(c, 46, { style: 'italic', weight: 400 }); c.fillStyle = COL.ink; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    let lx = x + 70, ly = y + 170;
    words.slice(0, shown).forEach(wd => { const ww = c.measureText(wd + ' ').width; if (lx + ww > x + w - 70) { lx = x + 70; ly += 66; } c.fillText(wd, lx, ly); lx += ww; });
    c.restore();
    const chips = ['llama3.2 · 3B', 'Ollama', '2-core laptop', 'no GPU · no cloud'];
    font(c, 40, { font: SANS }); const ws = chips.map(s => c.measureText(s).width + 56), gap = 26;
    let cx = W / 2 - (ws.reduce((a, b) => a + b) + gap * 3) / 2;
    chips.forEach((s, i) => { pill(c, s, cx, 920, seg(t, 16.4 + i * 0.4, 16.75 + i * 0.4), { size: 40, bg: i === 3 ? COL.red : COL.pine }); cx += ws[i] + gap; });
  },
  verify(c, t) {
    bg(c, COL.deep, 'rgba(244,240,230,0.04)'); vignette(c, 0.45);
    const a = E.out5(seg(t, 18.0, 18.3)), b = E.out5(seg(t, 18.4, 18.7));
    font(c, 92); const w1 = c.measureText('The model reads. ').width, w2 = c.measureText('Code decides.').width, x0 = W / 2 - (w1 + w2) / 2;
    txt(c, 'The model reads. ', x0, 160 + (1 - a) * 40, { size: 92, color: COL.cream, align: 'left', alpha: a });
    txt(c, 'Code decides.', x0 + w1, 160 + (1 - b) * 40, { size: 92, style: 'italic', color: COL.mint, align: 'left', alpha: b });
    const notice = 'Product: Metformin 500mg tablets\nBatch numbers: MET2611C, MET2999Z\nReason: Failed dissolution test\nRef: RC-2026-114, call 0800 555 0199';
    const l = E.out5(seg(t, 18.2, 18.5));
    c.save(); c.globalAlpha = l; c.translate(-(1 - l) * 80, 0);
    card(c, 110, 290, 820, 420, '#18251e', 'rgba(244,240,230,0.14)');
    txt(c, 'RECALL NOTICE', 160, 350, { size: 26, font: MONO, color: COL.mint, align: 'left', ls: 3 });
    monoBlock(c, notice, 160, 430, { size: 31, width: 740, color: COL.cream, hl: [{ tok: 'MET2611C', u: seg(t, 20.2, 20.45), color: COL.plum }, { tok: 'MET2999Z', u: seg(t, 20.7, 20.95), color: '#8a948a' }] });
    c.restore();
    const json = '{\n  "product": "Metformin 500mg tablets",\n  "batch_numbers": [\n    "MET2611C", "MET2999Z"\n  ],\n  "reason": "Failed dissolution test"\n}';
    const r = E.out5(seg(t, 18.4, 18.7));
    c.save(); c.globalAlpha = r; c.translate((1 - r) * 80, 0);
    card(c, 990, 290, 820, 420, '#18251e', 'rgba(143,212,173,0.3)');
    txt(c, 'LLAMA3.2  →  JSON', 1040, 350, { size: 26, font: MONO, color: COL.mint, align: 'left', ls: 3 });
    monoBlock(c, json, 1040, 420, { size: 29, width: 740, color: '#cfe8d8', typed: Math.floor(seg(t, 18.6, 19.8) * json.length), cursor: t < 20 });
    c.restore();
    const rows = [['MET2611C', 'in the notice  ✓', 'ON YOUR SHELF → RECALLED', COL.plum, 20.2], ['MET2999Z', 'in the notice  ✓', 'not in your stock', '#8a948a', 20.7],
      ['all batches?', 'decided by code, not the model', '', COL.amber, 21.2]];
    rows.forEach(([bn, chk, out, col, at0], i) => {
      const u = seg(t, at0, at0 + 0.3), e = E.out5(u); if (u <= 0) return;
      const y = 800 + i * 76;
      c.save(); c.globalAlpha = e; c.translate((1 - e) * -60, 0);
      c.fillStyle = col; c.fillRect(110, y - 26, 8, 52);
      txt(c, bn, 140, y, { size: 36, font: MONO, weight: 700, color: COL.cream, align: 'left' });
      txt(c, chk, 470, y, { size: 32, font: SANS, weight: 400, color: 'rgba(244,240,230,0.7)', align: 'left' });
      if (out) txt(c, out, 1810, y, { size: 34, font: SANS, weight: 800, color: col, align: 'right', ls: 2 });
      c.restore();
    });
  },
  returns(c, t) {
    const cd = R('returns', '.panel .card'), pre = R('returns', '.panel pre');
    cam(c, 'returns-full', ...keyCam(t, [[22.0, cd.cx + 40, cd.y + 260, 1.32], [24.7, pre.cx + 40, pre.cy + 40, 1.4]]));
    pill(c, 'A return list for every supplier', 70, 960, seg(t, 22.35, 22.7), { size: 48 });
    pill(c, 'The email is already drafted', 70, 960 - 125, seg(t, 23.5, 23.85), { size: 48, bg: COL.ink });
  },
  reorder(c, t) {
    const tb = R('reorder', '.panel table');
    cam(c, 'reorder-dark', ...keyCam(t, [[25.0, tb.cx, tb.cy, 1.55], [27.2, tb.cx, tb.cy - 10, 1.38]]), '#111915');
    const e = E.out5(seg(t, 25.3, 25.6));
    c.fillStyle = `rgba(12,21,17,${0.9 * e})`; c.fillRect(0, 880, W, 200);
    txt(c, 'Reorder list.', W / 2 - 120, 980, { size: 92, color: COL.cream, align: 'right', alpha: e });
    txt(c, 'Done.', W / 2 - 80, 980, { size: 92, style: 'italic', color: COL.mint, align: 'left', alpha: E.out5(seg(t, 25.8, 26.05)), scale: 1 });
  },
  proof(c, t) {
    bg(c, COL.deep, 'rgba(244,240,230,0.05)'); vignette(c);
    const [sx, sy] = shake(t); c.save(); c.translate(sx, sy);
    txt(c, 'MEASURED, NOT PROMISED', W / 2, 150, { size: 30, font: MONO, color: COL.mint, ls: 8, alpha: E.out5(seg(t, 27.0, 27.3)) });
    const items = [['24 / 24', 'recall notices read correctly', COL.cream], ['0', 'batch numbers invented', COL.mint], ['500mg ≠ 850mg', 'a real bug our tests caught', COL.red]];
    items.forEach(([big, small, col], i) => {
      const at0 = 27 + i, u = seg(t, at0, at0 + 0.14), out = seg(t, at0 + 0.88, at0 + 1.0);
      if (u <= 0 || (out >= 1 && i < 2)) return;
      const e = 1 - E.in3(out);
      txt(c, big, W / 2, 500 - out * 160, { size: i === 2 ? 230 : 330, color: col, scale: 1.9 - 0.9 * E.in3(u), alpha: clamp(u * 2) * e });
      txt(c, small, W / 2, 740 - out * 160, { size: 58, font: SANS, weight: 600, color: 'rgba(244,240,230,0.82)', alpha: E.out5(seg(t, at0 + 0.1, at0 + 0.35)) * e });
    });
    c.restore();
  },
  phone(c, t) {
    bg(c, COL.paper, 'rgba(31,77,58,0.13)');
    const e = E.out5(seg(t, 30.0, 30.45));
    const pw = 470, ph = 960, px = 1240, py = 60 + (1 - e) * 700;
    c.save(); c.shadowColor = 'rgba(0,0,0,0.3)'; c.shadowBlur = 60; c.shadowOffsetY = 30;
    c.fillStyle = '#10140f'; c.beginPath(); c.roundRect(px, py, pw, ph, 70); c.fill(); c.restore();
    const sw = pw - 36, sh = ph - 36, im = IM['mobile-full'], s = sw / im.width;
    const main = META.rects.mobile.main, scroll = lerp(main.y * 2 - 40, main.y * 2 + 360, E.inout3(seg(t, 30.4, 32.2)));
    c.save(); c.beginPath(); c.roundRect(px + 18, py + 18, sw, sh, 54); c.clip();
    c.fillStyle = COL.paper; c.fillRect(px + 18, py + 18, sw, sh);
    c.drawImage(im, 0, scroll, im.width, sh / s, px + 18, py + 18, sw, sh); c.restore();
    c.fillStyle = '#10140f'; c.beginPath(); c.roundRect(px + pw / 2 - 70, py + 30, 140, 30, 15); c.fill();
    const a = E.out5(seg(t, 30.2, 30.5)), b = E.out5(seg(t, 30.6, 30.9)), d = E.out5(seg(t, 31.1, 31.4));
    txt(c, 'Open it on any phone', 150, 420 + (1 - a) * 40, { size: 96, align: 'left', color: COL.ink, alpha: a });
    txt(c, 'on the shop Wi-Fi.', 150, 540 + (1 - b) * 40, { size: 96, align: 'left', style: 'italic', color: COL.pine, alpha: b });
    txt(c, 'python -m stockguard --host 0.0.0.0', 150, 680, { size: 34, font: MONO, weight: 400, align: 'left', color: COL.mute, alpha: d });
  },
  end(c, t) {
    bg(c, COL.pine, 'rgba(244,240,230,0.08)'); vignette(c, 0.35);
    logo(c, W / 2 - 430, 420, 200, COL.cream, COL.pine, seg(t, 32.0, 32.45));
    lettersIn(c, 'Stock Guard', W / 2 - 285, 428, 32.15, t, { size: 172, color: COL.cream, weight: 600 });
    const e = E.out5(seg(t, 32.8, 33.2));
    txt(c, 'Catch the money before it expires.', W / 2, 610 + (1 - e) * 30, { size: 60, style: 'italic', weight: 400, color: COL.mint, alpha: e });
    ['Open source · MIT', 'Runs offline with Ollama', 'Zero dependencies'].forEach((s, i) => {
      pill(c, s, [530, 960, 1390][i], 770, seg(t, 33.3 + i * 0.25, 33.65 + i * 0.25), { size: 38, align: 'center', bg: 'rgba(244,240,230,0.14)', fg: COL.cream });
    });
    txt(c, 'HACKTOBERFEST 2026  ·  SIDE HUSTLE', W / 2, 960, { size: 28, font: MONO, color: 'rgba(244,240,230,0.7)', ls: 6, alpha: E.out5(seg(t, 34.0, 34.4)) });
  },
};

// ---------- transitions
function sceneIndex(t) { let i = 0; SC.forEach(([a], k) => { if (t >= a) i = k; }); return i; }
function draw(c, i, t) { S[SC[i][1]](c, t); }
function frame(t) {
  const c = ctx0;
  c.save();
  const tr = TR.find(([at, k]) => Math.abs(t - at) < HALF[k]);
  if (tr) {
    const [at, kind] = tr, h = HALF[kind], i = SC.findIndex(([a]) => a === at), u = (t - (at - h)) / (2 * h);
    const A = bufA.getContext('2d'), B = bufB.getContext('2d');
    draw(A, i - 1, t); draw(B, i, t);
    if (kind === 'whip') {
      const off = E.inout3(u) * W, blur = Math.sin(Math.PI * u) * 300, k = 7;
      for (let j = 0; j < k; j++) { const d = (j / (k - 1) - 0.5) * blur; c.globalAlpha = 1 / (j + 1); c.drawImage(bufA, -off + d, 0); c.drawImage(bufB, W - off + d, 0); }
      c.globalAlpha = 1;
    } else if (kind === 'zoom') {
      const src = u < 0.5 ? bufA : bufB, e = u < 0.5 ? E.in3(u * 2) : 1 - E.out3((u - 0.5) * 2), base = u < 0.5 ? 1 + e * 1.1 : 1 + e * 0.6;
      for (let j = 0; j < 6; j++) { const s = base * (1 + j * 0.045 * e); c.globalAlpha = 1 / (j + 1); c.drawImage(src, W / 2 - W * s / 2, H / 2 - H * s / 2, W * s, H * s); }
      c.globalAlpha = 0.45 * e; c.fillStyle = '#fffaf0'; c.fillRect(0, 0, W, H); c.globalAlpha = 1;
    } else if (kind === 'glitch') {
      const cur = u < 0.5 ? bufA : bufB, other = u < 0.5 ? bufB : bufA, str = 1 - Math.abs(u - 0.5) * 2, f = Math.floor(t * FPS);
      c.drawImage(cur, 0, 0);
      for (let j = 0; j < 10; j++) { const y = rand(f * 7 + j) * H, hh = 18 + rand(f * 11 + j) * 140, dx = (rand(f * 13 + j) - 0.5) * 320 * str;
        c.drawImage(rand(f + j * 3) > 0.5 ? other : cur, 0, y, W, hh, dx, y, W, hh); }
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.3 * str; c.drawImage(cur, 18 * str, 0); c.globalCompositeOperation = 'source-over';
      for (let j = 0; j < 14; j++) { c.globalAlpha = 0.8 * str; c.fillStyle = [COL.red, COL.mint, COL.cream][j % 3]; c.fillRect(rand(f * 17 + j) * W, rand(f * 19 + j) * H, 60 + rand(f * 23 + j) * 600, 3 + rand(f * 29 + j) * 14); }
      c.globalAlpha = 1;
    } else if (kind === 'flash') {
      c.drawImage(t < at ? bufA : bufB, 0, 0);
      c.globalAlpha = (1 - Math.abs(t - at) / h) ** 1.5; c.fillStyle = '#fffaf0'; c.fillRect(0, 0, W, H); c.globalAlpha = 1;
    } else if (kind === 'iris') {
      const r = E.inout3(u) * 1200;
      c.drawImage(bufA, 0, 0); c.save(); c.beginPath(); c.arc(W / 2, H / 2, r, 0, 7); c.clip(); c.drawImage(bufB, 0, 0); c.restore();
      c.strokeStyle = COL.mint; c.lineWidth = 14; c.beginPath(); c.arc(W / 2, H / 2, r, 0, 7); c.stroke();
    }
  } else draw(c, sceneIndex(t), t);
  const fade = Math.max(seg(t, DUR - 0.6, DUR), 1 - seg(t, 0, 0.12));
  if (fade > 0) { c.globalAlpha = fade; c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
  c.restore();
}

// ---------- load, preview, render
async function load() {
  META = await (await fetch('shots/meta.json')).json();
  const names = ['empty', 'results', 'results-dark', 'returns-full', 'reorder-dark', 'mobile-full'];
  await Promise.all(names.map(n => new Promise((res, rej) => { const i = new Image(); i.onload = () => { IM[n] = i; res(); }; i.onerror = () => rej(new Error('missing shot ' + n)); i.src = 'shots/' + n + '.png'; })));
  window.ready = true; log('ready');
}
window.stillAt = t => { frame(t); return main.toDataURL('image/jpeg', 0.82); };
window.renderVideo = async () => {
  const frames = Math.round(DUR * FPS);
  log('synthesising audio');
  let audio = null;
  try { audio = await encodeAudio(await synthAudio(DUR, CUE)); } catch (e) { log('audio skipped: ' + e); }
  const video = []; let err = null;
  const enc = new VideoEncoder({ output: ch => { const d = new Uint8Array(ch.byteLength); ch.copyTo(d); video.push({ data: d, ts: ch.timestamp, key: ch.type === 'key' }); }, error: e => { err = e; } });
  const cfg = { codec: 'vp8', width: W, height: H, bitrate: 16_000_000, framerate: FPS };
  if (!(await VideoEncoder.isConfigSupported(cfg)).supported) throw new Error('VP8 encoding not supported');
  enc.configure(cfg);
  for (let f = 0; f < frames; f++) {
    frame(f / FPS);
    const vf = new VideoFrame(main, { timestamp: Math.round(f * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
    enc.encode(vf, { keyFrame: f % FPS === 0 }); vf.close();
    while (enc.encodeQueueSize > 3) await new Promise(r => setTimeout(r, 4));
    if (err) throw err;
    window.progress = (f + 1) / frames;
  }
  await enc.flush(); enc.close();
  const blob = WebM.mux({ width: W, height: H, vcodec: 'V_VP8', video, audio: audio?.packets, opusHead: audio?.head, durationMs: DUR * 1000 });
  await fetch('/save?name=stock-guard-demo.webm', { method: 'POST', body: blob });
  return { bytes: blob.size, frames: video.length, audioPackets: audio?.packets.length || 0 };
};
load().catch(e => log('load failed: ' + e));
