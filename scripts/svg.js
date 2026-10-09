// Draw a prepared chart model as SVG. Only plain shapes and text: no <pattern>, clipPath,
// dominant-baseline or CSS, so PowerPoint's SVG renderer and resvg agree.
// node scripts/svg.js chart.json out.svg [--no-frame] [--width N] [--height N]
import { readFileSync, writeFileSync } from 'node:fs';
import { T, C, FONT_FAMILY, prepare, formatValue, tickText, textWidth } from './core.js';

const PX = T.type.label.px; // 24, the smallest text anywhere
const LINE = Math.round(PX * 1.45);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = (v) => Math.round(v * 100) / 100;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Baseline that visually centers 24px text on y (cap height ≈ 0.7 em).
const mid = (y, px = PX) => y + px * 0.35;

// ponytail: module-level collector, fine because drawing is synchronous; pass a context if that changes.
let BOXES = null;
const boxOf = (x, y, str, size, anchor) => {
  const w = textWidth(str, size);
  const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  return { x0, x1: x0 + w, y0: y - size * 0.8, y1: y + size * 0.2, str };
};

function text(x, y, str, { size = PX, fill = C.textSecondary, weight, anchor, on } = {}) {
  if (BOXES) BOXES.push(boxOf(x, y, str, size, anchor));
  const attrs = [`x="${n(x)}"`, `y="${n(y)}"`, `font-size="${size}"`, `fill="${fill}"`];
  if (weight) attrs.push(`font-weight="${weight}"`);
  if (anchor && anchor !== 'start') attrs.push(`text-anchor="${anchor}"`);
  if (on) attrs.push(`data-on="${on}"`);
  return `<text ${attrs.join(' ')}>${esc(str)}</text>`;
}

function line(x1, y1, x2, y2, { stroke = C.gray, width = T.stroke.axis, dash } = {}) {
  return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

function rect(x, y, w, h, { fill, stroke } = {}) {
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(Math.max(0, w))}" height="${n(Math.max(0, h))}" fill="${fill ?? 'none'}"${stroke ? ` stroke="${stroke}" stroke-width="1"` : ''}/>`;
}

function circle(cx, cy, r, { fill, stroke } = {}) {
  return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${r}" fill="${fill ?? C.onDark[0]}"${stroke ? ` stroke="${stroke}" stroke-width="1.5"` : ''}/>`;
}

function path(points, { stroke, width }) {
  const d = points.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join(' ');
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
}

// 45° hatch ("/") drawn as segments already clipped to the box, instead of an SVG <pattern>.
function hatch(x, y, w, h, kind) {
  const f = T.fill[kind].svg;
  const parts = [rect(x, y, w, h, { fill: C.onDark[0], stroke: f.outline })];
  const step = f.spacing * Math.SQRT2;
  for (let c = x + y + step / 2; c < x + w + y + h; c += step) {
    const xa = Math.max(x, c - (y + h));
    const xb = Math.min(x + w, c - y);
    if (xb > xa) parts.push(line(xa, c - xa, xb, c - xb, { stroke: f.stroke, width: f.width }));
  }
  return parts.join('');
}

const scale = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);

// Spread labels vertically so neighbours keep at least `gap` px apart, staying inside [lo, hi].
function spread(items, gap, lo, hi, warn) {
  if (warn && items.length > 1 && (items.length - 1) * gap > hi - lo) warn(`${items.length} 個標籤排不下，會互相重疊`);
  const s = [...items].sort((a, b) => a.y - b.y);
  for (let i = 1; i < s.length; i++) s[i].y = Math.max(s[i].y, s[i - 1].y + gap);
  const over = s.length ? s.at(-1).y - hi : 0;
  if (over > 0) for (const it of s) it.y -= over;
  for (let i = s.length - 2; i >= 0; i--) s[i].y = Math.min(s[i].y, s[i + 1].y - gap);
  if (s.length && s[0].y < lo) s.forEach((it) => { it.y += lo - s[0].y; });
  return s;
}

function bottomAxis(axis, sx, y, x0, x1, P, { grid = true, top = 0, suffix = '' } = {}) {
  for (const t of axis.ticks) {
    const x = sx(t);
    if (grid) P.push(line(x, top, x, y, { stroke: C.grid, width: T.stroke.grid }));
    P.push(line(x, y, x, y + T.stroke.axisTick));
    P.push(text(x, y + T.stroke.axisTick + LINE * 0.8, tickText(axis, t, suffix), { anchor: 'middle' }));
  }
  P.push(line(x0, y, x1, y));
}

const DRAW = {};

DRAW.rank = (m, W, H, warn) => {
  const P = [];
  const labelW = Math.max(...m.rows.map((r) => textWidth(r.label, PX))) + 20;
  const valueW = Math.max(...m.rows.map((r) => textWidth(r.text, PX))) + 18;
  if (labelW > W * 0.35) warn('rank 的標籤太長，長條區被壓縮');
  const neg = m.axis.lo < 0;
  const x0 = labelW + (neg ? valueW : 0), x1 = W - valueW, y1 = H - LINE - 16;
  const sx = scale(m.axis.lo, m.axis.hi, x0, x1);
  bottomAxis(m.axis, sx, y1, x0, x1, P);
  const band = y1 / m.rows.length;
  const bh = clamp(band * 0.5, 12, 44);
  m.rows.forEach((r, i) => {
    const cy = band * (i + 0.5);
    const xa = sx(Math.min(0, r.value)), xb = sx(Math.max(0, r.value));
    P.push(rect(xa, cy - bh / 2, xb - xa, bh, { fill: r.color }));
    P.push(text(0, mid(cy), r.label, { fill: C.text }));
    const right = r.value >= 0;
    P.push(text(right ? xb + 10 : xa - 10, mid(cy), r.text, {
      fill: r.focus ? C.focus : C.text, weight: r.focus ? 600 : undefined, anchor: right ? 'start' : 'end',
    }));
  });
  P.push(line(sx(0), 0, sx(0), y1));
  return P.join('');
};

function yAxis(axis, sy, x0, x1, P, suffix = '') {
  for (const t of axis.ticks) {
    const y = sy(t);
    P.push(line(x0, y, x1, y, { stroke: C.grid, width: T.stroke.grid }));
    P.push(text(x0 - 12, mid(y), tickText(axis, t, suffix), { anchor: 'end' }));
  }
}

const yLabelWidth = (axis, suffix = '') => Math.max(...axis.ticks.map((t) => textWidth(tickText(axis, t, suffix), PX))) + 12;
const overlaps = (a, b, pad = 2) => a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;

// Put each point's label right, left, above or below — the first spot that stays inside the area and clear of
// every text and point drawn so far. Scatter and matrix share this.
function placeLabels(items, W, H, P, warn) {
  const dots = items.map((it) => ({ x0: it.x - it.r, x1: it.x + it.r, y0: it.y - it.r, y1: it.y + it.r }));
  for (const it of [...items].sort((a, b) => b.focus - a.focus)) {
    const gap = it.r + 8;
    const spots = [
      [it.x + gap, mid(it.y), 'start'], [it.x - gap, mid(it.y), 'end'],
      [it.x, it.y - gap, 'middle'], [it.x, it.y + gap + PX * 0.8, 'middle'],
    ];
    const fits = ([x, y, anchor]) => {
      const b = boxOf(x, y, it.text, PX, anchor);
      return b.x0 >= 0 && b.x1 <= W && b.y0 >= 0 && b.y1 <= H && ![...BOXES, ...dots].some((o) => overlaps(b, o));
    };
    const spot = spots.find(fits);
    if (!spot) warn(`標籤「${it.text}」放不下，可能和別的字重疊`);
    const [x, y, anchor] = spot ?? spots[0];
    P.push(text(x, y, it.text, { fill: it.focus ? C.focus : C.textSecondary, weight: it.focus ? 600 : undefined, anchor }));
  }
}

function xLabels(labels, xs, y, P, every) {
  labels.forEach((l, i) => {
    if (i % every && i !== labels.length - 1) return;
    P.push(line(xs[i], y, xs[i], y + T.stroke.axisTick));
    P.push(text(xs[i], y + T.stroke.axisTick + LINE * 0.8, l, { anchor: 'middle' }));
  });
}

function runs(values, toPoint) {
  const out = [];
  let cur = [];
  values.forEach((v, i) => {
    if (v === null) { if (cur.length) out.push(cur); cur = []; } else cur.push(toPoint(v, i));
  });
  if (cur.length) out.push(cur);
  return out;
}

DRAW.line = (m, W, H, warn) => {
  const P = [];
  const yLabW = yLabelWidth(m.axis);
  const ends = m.series.filter((s) => s.last >= 0);
  const endW = Math.max(...ends.map((s) => textWidth(`${s.name}  ${s.texts[s.last]}`, PX))) + 16;
  const x0 = yLabW + 8, x1 = W - endW - 8, y0 = LINE + 8, y1 = H - LINE - 16;
  if (x1 - x0 < W * 0.5) warn('折線的線尾標籤太長，繪圖區被壓縮');
  const xs = m.x.map((_, i) => x0 + (i * (x1 - x0)) / (m.x.length - 1));
  const sy = scale(m.axis.lo, m.axis.hi, y1, y0);
  yAxis(m.axis, sy, x0, x1, P);
  P.push(line(x0, y1, x1, y1));
  const widest = Math.max(...m.x.map((l) => textWidth(l, PX))) + 12;
  xLabels(m.x, xs, y1, P, Math.max(1, Math.ceil(widest / ((x1 - x0) / (m.x.length - 1)))));
  const order = [...m.series].sort((a, b) => a.focus - b.focus);
  for (const s of order) {
    for (const r of runs(s.values, (v, i) => [xs[i], sy(v)])) {
      if (r.length === 1) P.push(circle(r[0][0], r[0][1], 3, { fill: s.color }));
      else P.push(path(r, { stroke: s.color, width: s.width }));
    }
    if (s.peak >= 0) {
      const [px, py] = [xs[s.peak], sy(s.values[s.peak])];
      P.push(circle(px, py, 5, { fill: s.color }));
      P.push(text(px, py - 14, s.texts[s.peak], { fill: C.focus, weight: 600, anchor: 'middle' }));
    }
  }
  const labels = spread(ends.map((s) => ({ s, y: sy(s.values[s.last]) })), LINE * 0.9, y0, y1, warn);
  for (const { s, y } of labels) {
    const fill = s.focus ? C.focus : C.textSecondary;
    const weight = s.focus ? 600 : undefined;
    P.push(text(x1 + 14, mid(y), s.name, { fill, weight }));
    P.push(text(x1 + 14 + textWidth(s.name, PX) + textWidth('  ', PX), mid(y), s.texts[s.last], { fill, weight }));
  }
  return P.join('');
};

DRAW.multiples = (m, W, H) => {
  const P = [];
  const k = m.series.length, gap = 24;
  const pw = (W - gap * (k - 1)) / k;
  const y0 = LINE + 16, y1 = H - LINE * 2 - 24;
  const sy = scale(m.axis.lo, m.axis.hi, y1, y0);
  m.series.forEach((s, i) => {
    const x0 = i * (pw + gap), x1 = x0 + pw;
    P.push(text(x0, LINE * 0.8, s.name, { fill: C.text, weight: 600 }));
    if (s.last >= 0) P.push(text(x1, LINE * 0.8, s.texts[s.last], { fill: C.focus, weight: 600, anchor: 'end' }));
    for (const t of m.axis.ticks) P.push(line(x0, sy(t), x1, sy(t), { stroke: t === m.axis.lo ? C.gray : C.grid }));
    const xs = m.x.map((_, j) => x0 + 4 + (j * (pw - 8)) / (m.x.length - 1));
    for (const r of runs(s.values, (v, j) => [xs[j], sy(v)])) {
      P.push(r.length === 1 ? circle(r[0][0], r[0][1], 3, { fill: s.color }) : path(r, { stroke: s.color, width: s.width }));
    }
    if (s.last >= 0) P.push(circle(xs[s.last], sy(s.values[s.last]), 4, { fill: s.color }));
    P.push(text(x0, y1 + LINE * 0.9, m.x[0], {}));
    P.push(text(x1, y1 + LINE * 0.9, m.x.at(-1), { anchor: 'end' }));
  });
  const ticks = m.axis.ticks.map((t) => tickText(m.axis, t)).join('、');
  P.push(text(0, H - 8, `縱軸各格相同：${ticks}${m.unit ? ` ${m.unit}` : ''}；右上為最後一期的值`, {}));
  return P.join('');
};

DRAW.slope = (m, W, H, warn) => {
  const P = [];
  const leftW = Math.max(...m.rows.map((r) => textWidth(`${r.label}  ${r.texts[0] ?? ''}`, PX))) + 20;
  const rightW = Math.max(...m.rows.map((r) => textWidth(`${r.texts[1] ?? ''}  ${r.delta?.text ?? ''}`, PX))) + 20;
  const xa = Math.max(W * 0.3, leftW + 16), xb = Math.min(W * 0.72, W - rightW - 16);
  const y0 = LINE * 2 + 16, y1 = H - 16;
  const sy = scale(m.axis.lo, m.axis.hi, y1, y0);
  [xa, xb].forEach((x, i) => {
    P.push(line(x, y0 - 16, x, y1, { stroke: C.grid }));
    P.push(circle(x - 10 - textWidth(m.periods[i], PX) / 2, LINE * 0.8 - 8, 6, { fill: m.colors[i] }));
    P.push(text(x, LINE * 0.8, m.periods[i], { anchor: 'middle' }));
  });
  for (const r of m.rows) {
    if (r.values.every((v) => v !== null)) P.push(line(xa, sy(r.values[0]), xb, sy(r.values[1]), { stroke: C.gray, width: T.stroke.otherLine }));
  }
  const left = spread(m.rows.filter((r) => r.values[0] !== null).map((r) => ({ r, y: sy(r.values[0]) })), LINE * 0.85, y0, y1, warn);
  for (const { r, y } of left) {
    P.push(circle(xa, sy(r.values[0]), 6, { fill: m.colors[0] }));
    P.push(text(xa - 16, mid(y), r.texts[0], { anchor: 'end' }));
    P.push(text(xa - 16 - textWidth(r.texts[0], PX) - 16, mid(y), r.label, { fill: C.text, anchor: 'end' }));
  }
  const right = spread(m.rows.filter((r) => r.values[1] !== null).map((r) => ({ r, y: sy(r.values[1]) })), LINE * 0.85, y0, y1);
  for (const { r, y } of right) {
    P.push(circle(xb, sy(r.values[1]), 6, { fill: m.colors[1] }));
    P.push(text(xb + 16, mid(y), r.texts[1], { fill: C.text, weight: 600 }));
    if (r.delta) P.push(text(xb + 16 + textWidth(r.texts[1], PX) + 14, mid(y), r.delta.text, { fill: r.delta.color }));
  }
  return P.join('');
};

DRAW.share = (m, W, H, warn) => {
  const P = [];
  let lx = 0;
  const ly = LINE * 0.6;
  const labelW = Math.max(...m.rows.map((r) => textWidth(r.label, PX))) + 20;
  lx = labelW;
  for (const c of m.categories) {
    P.push(c.other ? hatch(lx, ly - 10, 20, 20, 'other') : rect(lx, ly - 10, 20, 20, { fill: c.color }));
    P.push(text(lx + 28, mid(ly), c.name, {}));
    lx += 28 + textWidth(c.name, PX) + 28;
  }
  if (lx > W) warn('share 的圖例超出寬度');
  const y0 = LINE * 1.6, band = (H - y0) / m.rows.length;
  const bh = clamp(band * 0.62, 20, 60);
  const sx = scale(0, 1, labelW, W);
  const unlabeled = [];
  m.rows.forEach((r, i) => {
    const cy = y0 + band * (i + 0.5);
    P.push(text(0, mid(cy), r.label, { fill: C.text }));
    let acc = 0;
    r.segments.forEach((s, j) => {
      const xa = sx(acc), xb = sx(acc + s.share);
      acc += s.share;
      const w = xb - xa - (j < r.segments.length - 1 ? 2 : 0);
      if (s.share <= 0) return;
      P.push(s.other ? hatch(xa, cy - bh / 2, w, bh, 'other') : rect(xa, cy - bh / 2, w, bh, { fill: s.color }));
      if (s.other) return;
      if (textWidth(s.text, PX) + 12 <= w) P.push(text(xa + w / 2, mid(cy), s.text, { fill: s.ink, anchor: 'middle', on: s.color }));
      else unlabeled.push(`${r.label} ${s.name}`);
    });
  });
  if (unlabeled.length) warn(`太窄沒有標數字：${unlabeled.join('、')}，請在結論欄補充`);
  return P.join('');
};

DRAW.bridge = (m, W, H) => {
  const P = [];
  const x0 = yLabelWidth(m.axis) + 8, x1 = W, y0 = LINE + 8, y1 = H - LINE - 16;
  const sy = scale(m.axis.lo, m.axis.hi, y1, y0);
  yAxis(m.axis, sy, x0, x1, P);
  const band = (x1 - x0) / m.steps.length;
  const bw = clamp(band * 0.6, 24, 120);
  m.steps.forEach((s, i) => {
    const cx = x0 + band * (i + 0.5);
    const ya = sy(Math.max(s.start, s.end)), yb = sy(Math.min(s.start, s.end));
    P.push(s.estimate ? hatch(cx - bw / 2, ya, bw, yb - ya, 'estimate') : rect(cx - bw / 2, ya, bw, yb - ya, { fill: s.color }));
    P.push(text(cx, ya - 10, s.text, { fill: s.textColor, weight: 600, anchor: 'middle' }));
    P.push(text(cx, y1 + 8 + LINE * 0.8, s.label, { anchor: 'middle' }));
    const next = m.steps[i + 1];
    if (next && (next.start === s.end || next.end === s.end) && !next.estimate) {
      P.push(line(cx + bw / 2, sy(s.end), cx + band - bw / 2, sy(s.end), { stroke: C.gray, dash: '4 3' }));
    }
  });
  P.push(line(x0, sy(0), x1, sy(0)));
  return P.join('');
};

DRAW.histogram = (m, W, H) => {
  const P = [];
  const endW = m.xLabel ? textWidth(m.xLabel, PX) + 16 : 0;
  const x0 = yLabelWidth(m.axis) + 8, x1 = W - endW, y0 = LINE + 8, y1 = H - LINE - 16;
  const k = m.bins.length, bw = (x1 - x0) / k;
  const sy = scale(0, m.axis.hi, y1, y0);
  yAxis(m.axis, sy, x0, x1, P);
  m.bins.forEach((b, i) => {
    if (b.value === null) return;
    const x = x0 + i * bw;
    P.push(rect(x, sy(b.value), bw - 2, y1 - sy(b.value), { fill: b.color }));
    P.push(text(x + (bw - 2) / 2, sy(b.value) - 10, b.text, { fill: b.focus ? C.focus : C.text, weight: b.focus ? 600 : undefined, anchor: 'middle' }));
  });
  P.push(line(x0, y1, x1, y1));
  for (let i = 0; i <= k; i++) {
    const edge = i < k ? m.bins[i].from : m.bins[k - 1].to;
    if (edge === null) continue;
    P.push(line(x0 + i * bw, y1, x0 + i * bw, y1 + T.stroke.axisTick));
    P.push(text(x0 + i * bw, y1 + T.stroke.axisTick + LINE * 0.8, formatValue(edge, { digits: m.edgeDigits }), { anchor: 'middle' }));
  }
  if (m.xLabel) P.push(text(W, y1 + T.stroke.axisTick + LINE * 0.8, m.xLabel, { anchor: 'end' }));
  for (const r of m.refs) {
    const i = m.bins.findIndex((b) => r.x >= b.from && (b.to === null || r.x <= b.to));
    if (i < 0) continue;
    const b = m.bins[i];
    const x = x0 + (i + (b.to === null ? 0 : (r.x - b.from) / (b.to - b.from))) * bw;
    P.push(line(x, y0 - 16, x, y1, { stroke: C.gray, dash: '6 4' }));
    P.push(text(x + 8, mid(y0 - 24), r.label, { fill: C.text }));
  }
  return P.join('');
};

DRAW.strip = (m, W, H) => {
  const P = [];
  const labelW = Math.max(...m.groups.map((g) => textWidth(g.label, PX))) + 20;
  const medW = Math.max(textWidth('中位數', PX), ...m.groups.map((g) => textWidth(g.medianText, PX))) + 24;
  const x0 = labelW, x1 = W - medW, y0 = LINE + 8, y1 = H - LINE - 16;
  const sx = scale(m.axis.lo, m.axis.hi, x0, x1);
  bottomAxis(m.axis, sx, y1, x0, x1, P, { top: y0 });
  P.push(line(sx(0), y0, sx(0), y1));
  P.push(text(W, LINE * 0.8, '中位數', { anchor: 'end' }));
  const band = (y1 - y0) / m.groups.length;
  m.groups.forEach((g, i) => {
    const cy = y0 + band * (i + 0.5);
    P.push(line(x0, cy, x1, cy, { stroke: C.grid }));
    P.push(text(0, mid(cy), g.label, { fill: C.text }));
    for (const v of g.values) P.push(circle(sx(v), cy, 7, { stroke: C.gray }));
    P.push(line(sx(g.median), cy - 16, sx(g.median), cy + 16, { stroke: g.focus ? C.focus : C.text, width: 3 }));
    P.push(text(W, mid(cy), g.medianText, { fill: g.focus ? C.focus : C.text, weight: g.focus ? 600 : undefined, anchor: 'end' }));
  });
  return P.join('');
};

DRAW.scatter = (m, W, H, warn) => {
  const P = [];
  const x0 = yLabelWidth(m.yAxis, m.suffix) + 8, x1 = W - 16, y0 = 16, y1 = H - LINE - 16;
  const sx = scale(m.xAxis.lo, m.xAxis.hi, x0, x1), sy = scale(m.yAxis.lo, m.yAxis.hi, y1, y0);
  yAxis(m.yAxis, sy, x0, x1, P, m.suffix);
  bottomAxis(m.xAxis, sx, y1, x0, x1, P, { grid: false });
  if (m.xLabel) P.push(text(x1, y1 - 12, m.xLabel, { anchor: 'end' }));
  for (const r of m.refs) {
    if (r.y !== null) {
      P.push(line(x0, sy(r.y), x1, sy(r.y), { stroke: C.gray, dash: '6 4' }));
      P.push(text(x1, sy(r.y) - 10, r.label, { anchor: 'end' }));
    } else if (r.x !== null) {
      P.push(line(sx(r.x), y0, sx(r.x), y1, { stroke: C.gray, dash: '6 4' }));
      P.push(text(sx(r.x) + 8, y0 + PX, r.label, {}));
    }
  }
  const items = m.points.map((p) => ({ x: sx(p.x), y: sy(p.y), r: p.focus ? 8 : 6, text: p.label, focus: p.focus, color: p.color }));
  for (const it of [...items].sort((a, b) => a.focus - b.focus)) P.push(circle(it.x, it.y, it.r, { fill: it.color }));
  placeLabels(items, W, H, P, warn);
  return P.join('');
};

DRAW.matrix = (m, W, H, warn) => {
  const P = [];
  const sideW = Math.max(textWidth(m.yLabel ?? '', PX), textWidth('高', PX)) + 16;
  const x0 = sideW, x1 = W - 8, y0 = 8, y1 = H - LINE - 16;
  const sx = scale(m.xAxis.lo, m.xAxis.hi, x0, x1), sy = scale(m.yAxis.lo, m.yAxis.hi, y1, y0);
  const xs = sx(m.split.x), ys = sy(m.split.y);
  const box = { topLeft: [x0, y0, xs, ys], topRight: [xs, y0, x1, ys], bottomLeft: [x0, ys, xs, y1], bottomRight: [xs, ys, x1, y1] };
  if (m.priority) { const [a, b, c, d] = box[m.priority]; P.push(rect(a, b, c - a, d - b, { fill: C.tint })); }
  P.push(line(xs, y0, xs, y1), line(x0, ys, x1, ys), line(x0, y0, x0, y1), line(x0, y1, x1, y1));
  if (m.quadrants) {
    for (const [q, [a, b, c, d]] of Object.entries(box)) {
      if (!m.quadrants[q]) continue;
      const right = q.endsWith('Right'), top = q.startsWith('top');
      P.push(text(right ? c - 12 : a + 12, top ? b + 12 + PX * 0.8 : d - 12, m.quadrants[q], {
        fill: q === m.priority ? C.text : C.textSecondary, weight: q === m.priority ? 600 : undefined, anchor: right ? 'end' : 'start',
      }));
    }
  }
  if (m.yLabel) P.push(text(x0 - 12, y0 + PX * 0.8, m.yLabel, { anchor: 'end' }));
  P.push(text(x0 - 12, y0 + PX * 0.8 + LINE, '高', { anchor: 'end' }), text(x0 - 12, y1, '低', { anchor: 'end' }));
  const xl = y1 + T.stroke.axisTick + LINE * 0.8;
  P.push(text(x0, xl, `${m.xLabel ? `${m.xLabel}  ` : ''}低`, {}), text(x1, xl, '高', { anchor: 'end' }));
  const items = m.points.map((p) => ({ x: sx(p.x), y: sy(p.y), r: 6, text: p.label, focus: p.focus, color: p.color }));
  for (const it of items) P.push(circle(it.x, it.y, it.r, { fill: it.color }));
  placeLabels(items, W, H, P, warn);
  return P.join('');
};

function legendDots(entries, x, y, P) {
  for (const [label, color] of entries) {
    P.push(circle(x + 6, y - 8, 6, { fill: color }));
    P.push(text(x + 18, y, label, {}));
    x += 18 + textWidth(label, PX) + 32;
  }
}

DRAW.dumbbell = (m, W, H) => {
  const P = [];
  const labelW = Math.max(...m.rows.map((r) => textWidth(r.label, PX))) + 20;
  const valW = Math.max(...m.rows.flatMap((r) => r.texts.filter(Boolean).map((t) => textWidth(t, PX)))) + 16;
  const endW = m.xLabel ? textWidth(m.xLabel, PX) + 16 : 0;
  const x0 = labelW + valW, x1 = W - Math.max(endW, valW), y0 = LINE * 1.8, y1 = H - LINE - 16;
  legendDots(m.periods.map((p, i) => [p, m.colors[i]]), x0, LINE * 0.8, P);
  const sx = scale(m.axis.lo, m.axis.hi, x0, x1);
  bottomAxis(m.axis, sx, y1, x0, x1, P, { top: y0 });
  P.push(line(sx(m.axis.lo), y0, sx(m.axis.lo), y1));
  if (m.xLabel) P.push(text(W, y1 + T.stroke.axisTick + LINE * 0.8, m.xLabel, { anchor: 'end' }));
  const band = (y1 - y0) / m.rows.length;
  m.rows.forEach((r, i) => {
    const cy = y0 + band * (i + 0.5);
    P.push(text(0, mid(cy), r.label, { fill: C.text }));
    const pts = r.values.map((v, j) => (v === null ? null : { x: sx(v), j }));
    const [a, b] = pts;
    if (a && b && Math.abs(b.x - a.x) >= 12) P.push(line(a.x, cy, b.x, cy, { stroke: C.gray, width: T.stroke.otherLine }));
    const live = pts.filter(Boolean).sort((p, q) => p.x - q.x);
    live.forEach((p, k) => {
      P.push(circle(p.x, cy, 7, { fill: m.colors[p.j] }));
      const outward = live.length === 1 || k === 0 ? 'end' : 'start';
      const newer = p.j === 1;
      P.push(text(p.x + (outward === 'end' ? -14 : 14), mid(cy), r.texts[p.j], {
        fill: newer ? C.focus : C.textSecondary, weight: newer ? 600 : undefined, anchor: outward,
      }));
    });
    if (a && b && r.delta) P.push(text((a.x + b.x) / 2, cy - 16, r.delta.text, { fill: r.delta.color, weight: 600, anchor: 'middle' }));
  });
  return P.join('');
};

DRAW.funnel = (m, W, H) => {
  const P = [];
  const labelW = Math.max(...m.steps.map((s) => textWidth(s.label, PX))) + 20;
  const convW = Math.max(textWidth('較上一步', PX), ...m.steps.map((s) => textWidth(s.convText ?? '', PX))) + 8;
  const valW = Math.max(...m.steps.map((s) => textWidth(s.text ?? '', PX))) + 32;
  const x0 = labelW, x1 = W - convW - valW;
  const cx = (x0 + x1) / 2;
  P.push(text(W, LINE * 0.8, '較上一步', { anchor: 'end' }));
  const y0 = LINE * 1.4, band = (H - y0) / m.steps.length;
  const bh = clamp(band * 0.62, 20, 64);
  m.steps.forEach((s, i) => {
    const cy = y0 + band * (i + 0.5);
    P.push(text(0, mid(cy), s.label, { fill: C.text }));
    if (s.value === null) return;
    const w = m.max > 0 ? (s.value / m.max) * (x1 - x0) : 0;
    P.push(rect(cx - w / 2, cy - bh / 2, w, bh, { fill: s.color }));
    const style = { fill: s.focus ? C.focus : C.text, weight: s.focus ? 600 : undefined };
    P.push(text(x1 + 16, mid(cy), s.text, style));
    if (s.convText) P.push(text(W, mid(cy), s.convText, { ...style, anchor: 'end' }));
  });
  return P.join('');
};

DRAW.heat = (m, W, H, warn) => {
  const P = [];
  const rowW = Math.max(...m.rowLabels.map((l) => textWidth(l, PX))) + 16;
  const x0 = rowW, y0 = LINE + 8, y1 = H - LINE - 32;
  const cw = (W - x0) / m.colLabels.length, ch = (y1 - y0) / m.rowLabels.length;
  m.colLabels.forEach((l, j) => P.push(text(x0 + cw * (j + 0.5), LINE * 0.8, l, { anchor: 'middle' })));
  if (m.colLabels.some((l) => textWidth(l, PX) + 8 > cw)) warn('熱度格的欄標籤太擠，會互相重疊');
  let tight = false;
  m.rowLabels.forEach((l, i) => {
    const cy = y0 + ch * (i + 0.5);
    P.push(text(0, mid(cy), l, {}));
    m.cells[i].forEach((c, j) => {
      if (!c) return;
      const x = x0 + cw * j, y = y0 + ch * i;
      P.push(rect(x, y, cw - 2, ch - 2, { fill: c.color }));
      if (textWidth(c.text, PX) + 8 > cw - 2) tight = true;
      P.push(text(x + (cw - 2) / 2, mid(y + (ch - 2) / 2), c.text, { fill: c.ink, anchor: 'middle', on: c.color }));
    });
  });
  if (tight) warn('熱度格太窄，格內數字可能擠在一起');
  let x = 0;
  const ly = H - 12;
  if (m.legendUnit) { P.push(text(0, ly, m.legendUnit, {})); x = textWidth(m.legendUnit, PX) + 16; }
  for (const it of m.legend) {
    P.push(rect(x, ly - 20, 32, 20, { fill: it.color }));
    P.push(text(x + 40, ly, it.text, {}));
    x += 40 + textWidth(it.text, PX) + 32;
  }
  return P.join('');
};

DRAW.table = (m, W, H, warn) => {
  const P = [];
  const bodyPx = T.type.tableBody.px, headPx = T.type.tableHeader.px;
  const widths = m.header.map((h, j) => Math.max(textWidth(h.text, headPx), ...m.rows.map((r) => textWidth(r.cells[j].text, bodyPx))) + 32);
  const sum = widths.reduce((a, b) => a + b, 0);
  if (sum > W) warn('表格欄寬加總超出圖表區');
  widths[0] += Math.max(0, W - sum);
  const xs = widths.reduce((acc, w, j) => [...acc, acc[j] + w], [0]);
  const cellX = (j, align) => (align === 'end' ? xs[j + 1] - 12 : xs[j] + 12);
  const headH = headPx * 1.45 + 16;
  m.header.forEach((h, j) => P.push(text(cellX(j, h.align), headH - 16, h.text, { size: headPx, anchor: h.align })));
  P.push(line(0, headH, W, headH, { stroke: C.text }));
  const rowH = clamp((H - headH) / m.rows.length, 48, 72 * 1.8);
  if (headH + rowH * m.rows.length > H + 1) warn('表格列數太多，超出圖表區');
  m.rows.forEach((r, i) => {
    const y = headH + rowH * i;
    if (r.fill) P.push(rect(0, y, W, rowH, { fill: r.fill }));
    P.push(line(0, y, W, y, { stroke: r.total ? C.text : C.grid }));
    r.cells.forEach((c, j) => {
      if (!c.text) return;
      P.push(text(cellX(j, c.align), mid(y + rowH / 2, bodyPx), c.text, {
        size: bodyPx, fill: c.color, weight: r.bold ? 600 : undefined, anchor: c.align, on: r.fill ?? undefined,
      }));
    });
  });
  return P.join('');
};

function doc(width, height, body, font = FONT_FAMILY) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${font}">${body}</svg>`;
}

// Chart area only — what a slide embeds. Size defaults to the evidence slot.
export function draw(model, { width = T.chartArea.evidence.width, height = T.chartArea.evidence.height } = {}) {
  const fn = DRAW[model.kind];
  if (!fn) throw new Error(`還沒有 ${model.kind} 的畫法`);
  BOXES = [];
  try {
    const body = fn(model, width, height, (msg) => model.warnings.push(msg));
    for (const b of BOXES) {
      if (b.x0 < -1 || b.x1 > width + 1 || b.y0 < -1 || b.y1 > height + 1) model.warnings.push(`標籤「${b.str}」超出圖表區`);
    }
    return body;
  } finally {
    BOXES = null;
  }
}

export function render(spec, opts = {}) {
  const model = prepare(spec, opts);
  const width = opts.width ?? T.chartArea.evidence.width;
  const height = opts.height ?? T.chartArea.evidence.height;
  const body = draw(model, { width, height });
  return { svg: doc(width, height, body, opts.font), body, model, width, height };
}

// Source row under the chart for standalone output: thin rule with 9 ticks, then source｜unit｜period｜missing.
export function framed(spec, opts = {}) {
  const r = render(spec, opts);
  const { model, width: W, height: H } = r;
  const items = [
    model.source && `資料來源：${model.source}`,
    model.unit && `單位：${model.unit}`,
    model.period && `期間：${model.period}`,
    model.missing.length && T.dataDisplay.missing.sourceField.replace('{item}', model.missing.join('、')),
  ].filter(Boolean);
  const top = H + 32;
  const P = [line(0, top, W, top)];
  for (let i = 0; i <= 8; i++) {
    const long = i % 4 === 0;
    P.push(line((i * W) / 8, top, (i * W) / 8, top + (long ? T.stroke.tickLong : T.stroke.tickShort)));
  }
  let x = 0, row = 0;
  const placed = [];
  for (const it of items) {
    const w = textWidth(it, PX);
    if (x > 0 && x + w > W) { x = 0; row += 1; }
    placed.push(text(x, top + T.stroke.tickLong + 14 + PX * 0.85 + row * LINE, it, {}));
    x += w + 40;
  }
  if (row + 1 > T.sourceRow.maxLines) model.warnings.push(`來源列需要 ${row + 1} 行，超過 ${T.sourceRow.maxLines} 行`);
  const height = top + T.stroke.tickLong + 14 + (row + 1) * LINE + 8;
  const body = r.body + P.join('') + placed.join('');
  return { ...r, svg: doc(W, height, body, opts.font), body, height };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args.splice(i, 2)[1]; };
  const noFrame = args.includes('--no-frame') && args.splice(args.indexOf('--no-frame'), 1);
  const width = flag('--width'), height = flag('--height');
  const [input, output] = args;
  if (!input || !output) {
    console.error('用法：node scripts/svg.js chart.json out.svg [--no-frame] [--width N] [--height N]');
    process.exit(2);
  }
  try {
    const spec = JSON.parse(readFileSync(input, 'utf8'));
    const opts = { width: width && Number(width), height: height && Number(height) };
    const out = noFrame ? render(spec, opts) : framed(spec, opts);
    writeFileSync(output, out.svg);
    for (const w of out.model.warnings) console.error(`警告：${w}`);
  } catch (e) {
    console.error(`錯誤：${e.message}`);
    process.exit(1);
  }
}
