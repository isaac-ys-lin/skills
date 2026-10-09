// Build a PowerPoint deck from story.json: 8 layouts, every page with a source row and page number.
// node scripts/pptx.js story.json deck.pptx
import { readFileSync, writeFileSync } from 'node:fs';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import { T, C, SLIDE_FONT, delta, formatValue, textWidth, categoryColors, prepare, decimalsOf, textOn } from './core.js';
import { render } from './svg.js';
import { svgToPng } from './png.js';

// Design px → PowerPoint units. The spec is drawn at 1920×1080 = 13.333×7.5 in.
const inch = (px) => px / T.slide.pxPerIn;
const pt = (px) => px / T.slide.pxPerPt;
const hex = (c) => c.replace('#', '');
const W = T.slide.widthPx, H = T.slide.heightPx;
const M = T.margin;
const LABEL = T.type.label.px;
const LH = 1.45;
const INNER = W - 2 * M.x;

function text(slide, str, { x, y, w, h, px = LABEL, color = C.textSecondary, bold, align = 'left', valign = 'top', lineHeight = 1.2 } = {}) {
  if (str === '' || str === null || str === undefined) return;
  slide.addText(str, {
    x: inch(x), y: inch(y), w: inch(w), h: inch(h), fontFace: SLIDE_FONT, fontSize: pt(px), color: hex(color),
    bold: !!bold, align, valign, margin: 0, lineSpacingMultiple: lineHeight, fit: 'none',
  });
}

const run = (str, { px = LABEL, color = C.text, bold } = {}) => ({ text: str, options: { fontFace: SLIDE_FONT, fontSize: pt(px), color: hex(color), bold: !!bold } });

function rule(slide, x1, y1, x2, y2, color = C.gray, px = T.stroke.axis) {
  slide.addShape('line', { x: inch(x1), y: inch(y1), w: inch(x2 - x1), h: inch(y2 - y1), line: { color: hex(color), width: pt(px) } });
}

function box(slide, x, y, w, h, fill) {
  slide.addShape('rect', { x: inch(x), y: inch(y), w: inch(w), h: inch(h), fill: { color: hex(fill) }, line: { type: 'none' } });
}

// Greedy line count for wrapped text.
function lines(str, px, width) {
  let n = 0;
  for (const para of String(str).split('\n')) n += Math.max(1, Math.ceil(textWidth(para, px) / (width * 0.95)));
  return n;
}

function sourceItems(sources = {}, missing = []) {
  const items = [
    sources.source && `資料來源：${sources.source}`,
    sources.unit && `單位：${sources.unit}`,
    sources.period && `期間：${sources.period}`,
    ...(sources.more ?? []),
    missing.length && T.dataDisplay.missing.sourceField.replace('{item}', missing.join('、')),
  ];
  return items.filter(Boolean);
}

// Thin rule with 9 ticks, then source｜unit｜period on up to two lines, page number on the right.
// Returns the rule's y so the layout knows where content must stop.
function sourceRow(slide, ctx, { line = C.gray, ink = C.textSecondary } = {}) {
  const pageNo = `${ctx.n} / ${ctx.total}`;
  const avail = INNER - textWidth(pageNo, LABEL) - 40;
  const rows = [[]];
  let x = 0;
  for (const it of sourceItems(ctx.page.sources, ctx.missing)) {
    const w = textWidth(it, LABEL) * 1.1;
    if (x > 0 && x + w > avail) { rows.push([]); x = 0; }
    rows.at(-1).push({ it, x, w });
    x += w + 40;
  }
  if (rows.length > T.sourceRow.maxLines) ctx.warn(`第 ${ctx.n} 頁來源列需要 ${rows.length} 行，超過 ${T.sourceRow.maxLines} 行`);
  const rowH = LABEL * LH;
  const ruleY = H - M.bottom - rows.length * rowH - 14 - T.stroke.tickLong;
  rule(slide, M.x, ruleY, W - M.x, ruleY, line);
  for (let i = 0; i <= 8; i++) {
    const tx = M.x + (i * INNER) / 8;
    rule(slide, tx, ruleY, tx, ruleY + (i % 4 === 0 ? T.stroke.tickLong : T.stroke.tickShort), line);
  }
  const top = ruleY + T.stroke.tickLong + 14;
  rows.forEach((r, i) => r.forEach(({ it, x: ix, w }) => text(slide, it, { x: M.x + ix, y: top + i * rowH, w: w + 8, h: rowH, color: ink })));
  text(slide, pageNo, { x: W - M.x - 200, y: top, w: 200, h: rowH, color: ink, align: 'right' });
  return ruleY;
}

function header(slide, left, right, ink = C.textSecondary) {
  if (left) text(slide, left, { x: M.x, y: M.top, w: INNER / 2, h: LABEL * 1.3, color: ink });
  if (right) text(slide, right, { x: W / 2, y: M.top, w: INNER / 2, h: LABEL * 1.3, color: ink, align: 'right' });
}

const TITLE_Y = M.top + LABEL + M.titleGap;
// Microsoft JhengHei sits taller than the design font, so display lines get a little more room.
const DISPLAY_LH = 1.35;
const TITLE = T.type.title.px;

function title(slide, str) {
  const n = lines(str, TITLE, INNER);
  text(slide, str, { x: M.x, y: TITLE_Y, w: INNER, h: n * TITLE * 1.25, px: TITLE, color: C.title, bold: true, lineHeight: 1.25 });
  return TITLE_Y + n * TITLE * 1.25;
}

// ---- charts on evidence pages

const NATIVE = new Set(['rank', 'line', 'slope', 'share', 'scatter', 'table']);
const position = ({ x, y, w, h }) => ({ x: inch(x), y: inch(y), w: inch(w), h: inch(h) });
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const numberFormat = (digits, percent = false, suffix = '') => {
  const unit = percent ? '%' : suffix ? `"${suffix.replaceAll('"', '""')}"` : '';
  const n = `${percent ? '0' : '#,##0'}${digits ? `.${'0'.repeat(digits)}` : ''}${unit}`;
  return `${n};−${n};0${unit}`;
};
const axisOptions = (axis, prefix = 'val') => ({
  [`${prefix}AxisMinVal`]: axis.lo, [`${prefix}AxisMajorUnit`]: axis.step,
  [`${prefix}AxisLabelFormatCode`]: numberFormat(decimalsOf(axis.ticks)),
});

function tinyValues(m) {
  const tiny = (v, digits) => /^[<>]/.test(formatValue(v, { digits }) ?? '');
  if (m.kind === 'scatter') return m.points.some((p) => tiny(p.x, decimalsOf(m.xAxis.ticks)) || tiny(p.y, decimalsOf(m.yAxis.ticks)));
  const values = m.kind === 'rank' ? m.rows.map((r) => r.value)
    : m.kind === 'line' ? m.series.flatMap((s) => s.values)
      : m.kind === 'slope' ? m.rows.flatMap((r) => r.values)
        : m.kind === 'share' ? m.rows.flatMap((r) => r.segments.map((s) => s.share * 100)) : [];
  return values.some((v) => tiny(v, m.digits));
}

function nativeTable(slide, m, area, ctx) {
  const body = T.type.tableBody.px, head = T.type.tableHeader.px;
  const widths = m.header.map((h, j) => Math.max(textWidth(h.text, head), ...m.rows.map((r) => textWidth(r.cells[j].text, body))) * 1.1 + 32);
  const sum = widths.reduce((a, b) => a + b, 0);
  if (sum > area.w) ctx.warn(`第 ${ctx.n} 頁表格欄寬超出圖表區`);
  widths[0] += Math.max(0, area.w - sum);
  const headH = head * LH + 16, rowH = Math.min(72, (area.h - headH) / m.rows.length);
  const none = { type: 'none', color: hex(C.grid) };
  const border = (color, edge) => [0, 1, 2, 3].map((i) => i === edge ? { color: hex(color), pt: pt(T.stroke.grid) } : none);
  const rows = [m.header.map((h) => ({ text: h.text, options: {
    align: h.align === 'end' ? 'right' : 'left', color: hex(C.textSecondary), fontSize: pt(head), border: border(C.text, 2),
  } })), ...m.rows.map((r, i) => r.cells.map((c, j) => {
    if (lines(c.text, body, widths[j] - 32) * body * LH + 16 > rowH) ctx.warn(`第 ${ctx.n} 頁表格第 ${i + 1} 列列高不足，文字可能重疊`);
    return { text: c.text, options: { align: c.align === 'end' ? 'right' : 'left', color: hex(c.color), bold: r.bold,
      fill: hex(r.fill ?? C.onDark[0]), border: border(r.total ? C.text : C.grid, 0) } };
  }))];
  slide.addTable(rows, { ...position(area), colW: widths.map(inch), rowH: [headH, ...m.rows.map(() => rowH)].map(inch),
    fontFace: SLIDE_FONT, fontSize: pt(body), color: hex(C.text), margin: [pt(8), pt(12), pt(8), pt(12)],
    valign: 'middle', autoPage: false, border: none });
}

function nativeChart(slide, m, area, ctx) {
  if (m.kind === 'table') return nativeTable(slide, m, area, ctx);
  const opts = {
    ...position(area), showLegend: false, showTitle: false, showValue: false, showBorder: false,
    lang: 'zh-TW', chartColors: [hex(C.focus)],
    chartArea: { fill: { color: hex(C.onDark[0]) } },
    plotArea: { fill: { color: hex(C.onDark[0]) } },
    dataLabelFontFace: SLIDE_FONT, dataLabelFontSize: pt(LABEL), dataLabelColor: hex(C.text),
    dataLabelFormatCode: numberFormat(m.digits), displayBlanksAs: 'gap',
    catAxisLabelFontFace: SLIDE_FONT, valAxisLabelFontFace: SLIDE_FONT,
    catAxisLabelFontSize: pt(LABEL), valAxisLabelFontSize: pt(LABEL),
    catAxisLabelColor: hex(C.textSecondary), valAxisLabelColor: hex(C.textSecondary),
    catAxisTitleFontFace: SLIDE_FONT, valAxisTitleFontFace: SLIDE_FONT,
    catAxisTitleFontSize: pt(LABEL), valAxisTitleFontSize: pt(LABEL),
    catAxisTitleColor: hex(C.textSecondary), valAxisTitleColor: hex(C.textSecondary),
    catAxisLineColor: hex(C.gray), valAxisLineColor: hex(C.gray),
    catAxisLineSize: pt(T.stroke.axis), valAxisLineSize: pt(T.stroke.axis),
    catAxisLineShow: true, valAxisLineShow: true, catAxisMajorTickMark: 'none', valAxisMajorTickMark: 'out',
    catGridLine: { style: 'none' }, valGridLine: { color: hex(C.grid), size: pt(T.stroke.grid), style: 'solid' },
    lineSize: pt(T.stroke.otherLine), lineDataSymbol: 'none', lineDataSymbolSize: pt(T.stroke.axisTick),
    lineDataSymbolLineSize: pt(T.stroke.axis),
    ...(m.axis ? axisOptions(m.axis) : {}),
  };
  let type, data;
  if (m.kind === 'rank') {
    type = 'bar';
    data = [{ name: m.unit ?? '數值', labels: m.rows.map((r) => r.label), values: m.rows.map((r) => r.value) }];
    Object.assign(opts, { barDir: 'bar', catAxisOrientation: 'maxMin', catAxisCrossesAt: 'max', valAxisLabelPos: 'nextTo', chartColors: m.rows.map((r) => hex(r.color)), showValue: true, dataLabelPosition: 'outEnd' });
  } else if (m.kind === 'line' || m.kind === 'slope') {
    type = 'line';
    data = m.kind === 'line' ? m.series.map((s) => ({ name: s.name, labels: m.x, values: [...s.values] }))
      : m.rows.map((r) => ({ name: r.label, labels: m.periods, values: [...r.values] }));
    Object.assign(opts, { chartColors: m.kind === 'line' ? m.series.map((s) => hex(s.color)) : m.rows.map(() => hex(C.gray)),
      lineDataSymbol: m.kind === 'slope' ? 'circle' : 'none' });
    if (m.kind === 'slope') Object.assign(opts, { valAxisHidden: true, valGridLine: { style: 'none' } });
  } else if (m.kind === 'share') {
    type = 'bar';
    data = m.categories.map((c, i) => ({ name: c.name, labels: m.rows.map((r) => r.label), values: m.rows.map((r) => r.segments[i].value) }));
    Object.assign(opts, { barDir: 'bar', barGrouping: 'percentStacked', catAxisOrientation: 'maxMin', catAxisCrossesAt: 'max', valAxisLabelPos: 'nextTo',
      chartColors: m.categories.map((c) => hex(c.other ? T.fill.other.native.color : c.color)),
      showLegend: true, legendPos: 't', legendFontFace: SLIDE_FONT, legendFontSize: pt(LABEL), legendColor: hex(C.textSecondary),
      valAxisMinVal: 0, valAxisMaxVal: 1, valAxisMajorUnit: 0.25, valAxisLabelFormatCode: numberFormat(0, true),
      dataLabelFormatCode: numberFormat(m.digits, true), dataLabelPosition: 'ctr' });
  } else {
    type = 'scatter';
    data = [{ name: m.xLabel ?? 'X', values: m.points.map((p) => p.x) },
      { name: m.yLabel ?? 'Y', labels: m.points.map((p) => p.label), values: m.points.map((p) => p.y) }];
    Object.assign(opts, { ...axisOptions(m.xAxis, 'cat'), ...axisOptions(m.yAxis), lineSize: 0, lineDataSymbol: 'circle',
      showCatAxisTitle: !!m.xLabel, catAxisTitle: m.xLabel, showValAxisTitle: !!m.yLabel, valAxisTitle: m.yLabel });
    for (const [key, axis, prefix] of [['x', m.xAxis, 'cat'], ['y', m.yAxis, 'val']]) {
      const touches = (edge) => m.points.some((p) => Math.abs(p[key] - edge) < axis.step * 1e-9);
      if (touches(axis.lo)) opts[`${prefix}AxisMinVal`] = axis.lo - axis.step;
      // shortcut: a padded upper bound is fixed; regenerate after data edits exceed it.
      if (touches(axis.hi)) opts[`${prefix}AxisMaxVal`] = axis.hi + axis.step;
    }
    if (m.refs.length) ctx.warn(`第 ${ctx.n} 頁圖表：原生散佈圖省略參考線；若要保留，請設定 native: false`);
  }
  slide.addChart(type, data, opts);
  ctx.charts.push(m);
}

function chart(slide, spec, area, ctx) {
  let model = ctx.model;
  const native = spec.native !== false && NATIVE.has(model.kind);
  const tiny = native && tinyValues(model);
  if (tiny) ctx.warn(`第 ${ctx.n} 頁圖表：非零極小值在顯示精度下會變成 0，改用 SVG`);
  if (native && !tiny) nativeChart(slide, model, area, ctx);
  else {
    const rendered = render(spec, { width: area.w, height: area.h, font: SLIDE_FONT, categoryOrder: ctx.categoryOrder });
    model = rendered.model;
    slide.addImage({ data: `data:image/svg+xml;base64,${Buffer.from(rendered.svg).toString('base64')}`, ...position(area) });
  }
  for (const w of model.warnings) ctx.warn(`第 ${ctx.n} 頁圖表：${w}`);
}

// ---- layouts

const LAYOUT = {};

LAYOUT.cover = (slide, ctx) => {
  const { page, story } = ctx;
  slide.background = { color: hex(C.dark) };
  const [ink, muted] = C.onDark;
  header(slide, page.kicker, story.date, muted);
  const ruleY = sourceRow(slide, ctx, { line: muted, ink: muted });
  const D = T.type.display.px;
  const titleLines = String(page.claim ?? '').split('\n').length;
  const lh = D * DISPLAY_LH;
  const blockH = titleLines * lh + (page.note ? 72 + T.type.sub.px * 1.5 : 0);
  const top = (M.top + LABEL + ruleY) / 2 - blockH / 2;
  if (page.claim) text(slide, page.claim, { x: M.x, y: top, w: INNER, h: titleLines * lh, px: D, color: ink, bold: true, lineHeight: DISPLAY_LH });
  if (page.note) text(slide, page.note, { x: M.x, y: top + titleLines * lh + 72, w: INNER, h: T.type.sub.px * 1.5, px: T.type.sub.px, color: muted });
};

LAYOUT.section = (slide, ctx) => {
  const { page, story } = ctx;
  slide.background = { color: hex(C.tint) };
  header(slide, story.title);
  const ruleY = sourceRow(slide, ctx);
  const rulerY = ruleY - 64 - LABEL * LH - 16 - 4;
  const sections = ctx.sections;
  const gap = 24, segW = (INNER - gap * (sections.length - 1)) / sections.length;
  sections.forEach((name, i) => {
    const x = M.x + i * (segW + gap);
    const current = name === (page.kicker ?? page.claim);
    if (current) box(slide, x, rulerY, segW, T.stroke.focusRule, C.focus);
    else rule(slide, x, rulerY + 3, x + segW, rulerY + 3, C.gray);
    text(slide, name, { x, y: rulerY + 4 + 16, w: segW, h: LABEL * LH, color: current ? C.focus : C.textSecondary, bold: current });
  });
  const D = T.type.display.px;
  const blockH = D * DISPLAY_LH + (page.note ? 28 + T.type.sub.px * 1.5 : 0);
  const top = (M.top + LABEL + rulerY) / 2 - blockH / 2;
  if (page.claim) text(slide, page.claim, { x: M.x, y: top, w: INNER, h: D * DISPLAY_LH, px: D, color: C.title, bold: true, lineHeight: DISPLAY_LH });
  if (page.note) text(slide, page.note, { x: M.x, y: top + D * DISPLAY_LH + 28, w: INNER, h: T.type.sub.px * 1.5, px: T.type.sub.px });
};

LAYOUT.statement = (slide, ctx) => {
  const { page, story } = ctx;
  header(slide, page.kicker, story.title);
  const ruleY = sourceRow(slide, ctx);
  const S = T.type.statement.px, width = 1500;
  const claim = String(page.claim ?? '');
  const at = page.focus ? claim.indexOf(page.focus) : -1;
  if (page.focus && at < 0) ctx.warn(`第 ${ctx.n} 頁的 focus「${page.focus}」不在 claim 裡`);
  const runs = at < 0 ? [run(claim, { px: S, bold: true })] : [
    run(claim.slice(0, at), { px: S, bold: true }),
    run(page.focus, { px: S, bold: true, color: C.focus }),
    run(claim.slice(at + page.focus.length), { px: S, bold: true }),
  ].filter((r) => r.text);
  const n = lines(claim, S, width);
  const noteN = page.note ? lines(page.note, T.type.body.px, width) : 0;
  const blockH = n * S * 1.25 + (page.note ? 40 + noteN * T.type.body.px * 1.5 : 0);
  const top = (M.top + LABEL + ruleY) / 2 - blockH / 2;
  slide.addText(runs, { x: inch(M.x), y: inch(top), w: inch(width), h: inch(n * S * 1.25), margin: 0, valign: 'top', lineSpacingMultiple: 1.25 });
  if (page.note) text(slide, page.note, { x: M.x, y: top + n * S * 1.25 + 40, w: width, h: noteN * T.type.body.px * 1.5, px: T.type.body.px, lineHeight: 1.5 });
};

LAYOUT.evidence = (slide, ctx) => {
  const { page, story } = ctx;
  header(slide, page.kicker, story.title);
  const bottom = title(slide, page.claim ?? '');
  const ruleY = sourceRow(slide, ctx);
  const top = bottom + M.contentGap, end = ruleY - 48;
  const side = page.note || page.metric;
  const area = { x: M.x, y: top, w: side ? T.chartArea.evidence.width : T.chartArea.evidenceNoNote.width, h: end - top };
  if (page.visual) chart(slide, page.visual, area, ctx);
  if (!side) return;
  const x = M.x + area.w + 96, w = INNER - area.w - 96;
  let y = top;
  if (page.metric) {
    if (page.metric.label) { text(slide, page.metric.label, { x, y, w, h: LABEL * LH }); y += LABEL * LH + 8; }
    const N = T.type.conclusionNumber.px;
    slide.addText([run(page.metric.value, { px: N, color: C.focus }), run(page.metric.unit ? ` ${page.metric.unit}` : '', { px: T.type.body.px, color: C.textSecondary })].filter((r) => r.text),
      { x: inch(x), y: inch(y), w: inch(w), h: inch(N * 1.2), margin: 0, valign: 'bottom' });
    y += N * 1.2 + 32;
  }
  if (page.note) text(slide, page.note, { x, y, w, h: end - y, px: T.type.body.px, color: C.text, lineHeight: 1.5 });
};

LAYOUT.numbers = (slide, ctx) => {
  const { page, story } = ctx;
  header(slide, page.kicker, story.title);
  const bottom = title(slide, page.claim ?? '');
  const ruleY = sourceRow(slide, ctx);
  const items = page.visual?.items ?? [];
  if (items.length < 2 || items.length > 4) ctx.warn(`第 ${ctx.n} 頁數字格是 ${items.length} 格，規格是 2～4 格`);
  const gap = 56, cw = (INNER - gap * (items.length - 1)) / items.length;
  const N = T.type.number.px, B = T.type.body.px;
  const blockH = 16 + LABEL * LH + 16 + N * 1.15 + 16 + B * 1.4;
  const top = (bottom + M.contentGap + ruleY - 48) / 2 - blockH / 2;
  items.forEach((it, i) => {
    const x = M.x + i * (cw + gap);
    rule(slide, x, top, x + cw, top, C.gray);
    rule(slide, x, top, x, top + 16, C.gray);
    text(slide, it.label ?? '', { x: x + 16, y: top + 16, w: cw - 16, h: LABEL * LH });
    const value = typeof it.value === 'string' ? it.value : formatValue(it.value, { digits: it.digits ?? 0 }) ?? '';
    const unitW = it.unit ? textWidth(` ${it.unit}`, B) : 0;
    const fit = Math.max(T.type.minimum, Math.min(N, Math.floor((cw - 16 - unitW) / Math.max(1, textWidth(value, 1) * 1.12))));
    if (fit < N * 0.8) ctx.warn(`第 ${ctx.n} 頁「${it.label}」的數字太長，字級縮到 ${fit}px`);
    slide.addText([run(value, { px: fit }), run(it.unit ? ` ${it.unit}` : '', { px: B, color: C.textSecondary })].filter((r) => r.text),
      { x: inch(x + 16), y: inch(top + 16 + LABEL * LH + 16), w: inch(cw - 16), h: inch(N * 1.15), margin: 0, valign: 'bottom' });
    if (typeof it.value === 'number' && it.prev !== undefined) {
      if (!it.better) ctx.warn(`第 ${ctx.n} 頁「${it.label}」有前期值但沒寫 better，預設越高越好`);
      const d = delta(it.prev, it.value, { better: it.better ?? 'higher', mode: it.mode ?? 'abs', digits: it.digits ?? 0, suffix: it.deltaSuffix ?? '' });
      if (d) text(slide, d.text, { x: x + 16, y: top + 16 + LABEL * LH + 16 + N * 1.15 + 16, w: cw - 16, h: B * 1.4, px: B, color: d.color });
    }
  });
};

LAYOUT.compare = (slide, ctx) => {
  const { page, story } = ctx;
  header(slide, page.kicker, story.title);
  const bottom = title(slide, page.claim ?? '');
  const ruleY = sourceRow(slide, ctx);
  const { rows = [], options = [] } = page.visual ?? {};
  const labelW = 300, gap = 48, ow = (INNER - labelW - gap * options.length) / options.length;
  const top = bottom + M.contentGap, end = ruleY - 48;
  const headH = T.type.sub.px * 1.4 + LABEL * LH + 24;
  options.forEach((o, i) => {
    const x = M.x + labelW + gap + i * (ow + gap);
    if (o.recommended) box(slide, x, top, ow, T.stroke.focusRule, C.focus);
    else rule(slide, x, top + 3, x + ow, top + 3, C.gray);
    slide.addText([run(o.name ?? '', { px: T.type.sub.px, bold: true }), run(o.recommended ? '　建議' : '', { px: LABEL, color: C.focus, bold: true })].filter((r) => r.text),
      { x: inch(x), y: inch(top + 20), w: inch(ow), h: inch(T.type.sub.px * 1.4), margin: 0, valign: 'top' });
    if (o.subtitle) text(slide, o.subtitle, { x, y: top + 20 + T.type.sub.px * 1.4, w: ow, h: LABEL * LH });
  });
  const rowH = Math.min(110, (end - top - headH) / Math.max(1, rows.length));
  rows.forEach((label, r) => {
    const y = top + headH + r * rowH;
    if (lines(label, LABEL, labelW) * LABEL * LH + 16 > rowH
      || options.some((o) => lines(o.values?.[r] ?? '', T.type.body.px, ow) * T.type.body.px * LH + 12 > rowH)) {
      ctx.warn(`第 ${ctx.n} 頁比較頁第 ${r + 1} 列列高不足，文字可能重疊`);
    }
    rule(slide, M.x, y, W - M.x, y, C.grid);
    text(slide, label, { x: M.x, y: y + 16, w: labelW, h: rowH - 16 });
    options.forEach((o, i) => {
      const x = M.x + labelW + gap + i * (ow + gap);
      text(slide, o.values?.[r] ?? '', { x, y: y + 12, w: ow, h: rowH - 12, px: T.type.body.px, color: C.text });
    });
  });
};

const monthIndex = (ym) => { const [y, m] = String(ym).split('-').map(Number); return y * 12 + (m - 1); };

LAYOUT.steps = (slide, ctx) => {
  const { page, story } = ctx;
  header(slide, page.kicker, story.title);
  const bottom = title(slide, page.claim ?? '');
  const ruleY = sourceRow(slide, ctx);
  const { start, end, phases = [] } = page.visual ?? {};
  const m0 = monthIndex(start), months = monthIndex(end) - m0 + 1;
  const nameW = 520, x0 = M.x + nameW, x1 = W - M.x, mw = (x1 - x0) / months;
  const top = bottom + M.contentGap;
  for (let i = 0; i < months; i++) {
    text(slide, `${((m0 + i) % 12) + 1}月`, { x: x0 + i * mw, y: top, w: mw, h: LABEL * LH, align: 'center' });
  }
  const rulerY = top + LABEL * LH + 8;
  rule(slide, x0, rulerY, x1, rulerY, C.gray);
  for (let i = 0; i <= months; i++) {
    const quarter = (m0 + i) % 3 === 0;
    rule(slide, x0 + i * mw, rulerY, x0 + i * mw, rulerY + (quarter ? 16 : 8), C.gray);
  }
  const rowsTop = rulerY + 32, rowH = Math.min(120, (ruleY - 48 - rowsTop) / Math.max(1, phases.length));
  phases.forEach((p, i) => {
    const y = rowsTop + i * rowH;
    const needed = 12 + lines(p.name ?? '', T.type.body.px, nameW - 24) * T.type.body.px * 1.3
      + (p.note ? lines(p.note, LABEL, nameW - 24) * LABEL * LH : 0);
    if (needed > rowH) ctx.warn(`第 ${ctx.n} 頁步驟頁第 ${i + 1} 列列高不足，文字可能重疊`);
    rule(slide, M.x, y + rowH, x1, y + rowH, C.grid);
    text(slide, p.name ?? '', { x: M.x, y: y + 12, w: nameW - 24, h: T.type.body.px * 1.3, px: T.type.body.px, color: C.text });
    if (p.note) text(slide, p.note, { x: M.x, y: y + 12 + T.type.body.px * 1.3, w: nameW - 24, h: LABEL * LH });
    const shade = C.ordered[phases.length === 1 ? C.ordered.length - 1 : Math.round((i * (C.ordered.length - 1)) / (phases.length - 1))];
    const a = monthIndex(p.from) - m0, b = monthIndex(p.to) - m0 + 1;
    box(slide, x0 + a * mw, y + rowH / 2 - 16, (b - a) * mw, 32, shade);
  });
};

LAYOUT.close = (slide, ctx) => {
  const { page, story } = ctx;
  header(slide, page.kicker, story.title);
  const bottom = title(slide, page.claim ?? '');
  const ruleY = sourceRow(slide, ctx);
  const rows = page.visual?.rows ?? [];
  const ownerW = 420, dueW = 240, gap = 48;
  const taskW = INNER - ownerW - dueW - 2 * gap;
  const cols = [[M.x, taskW, '下一步', 'task'], [M.x + taskW + gap, ownerW, '負責人', 'owner'], [M.x + taskW + ownerW + 2 * gap, dueW, '期限', 'due']];
  const top = bottom + M.contentGap;
  for (const [x, w, name] of cols) text(slide, name, { x, y: top, w, h: LABEL * LH });
  const headY = top + LABEL * LH + 12;
  rule(slide, M.x, headY, W - M.x, headY, C.text);
  const rowH = Math.min(100, (ruleY - 48 - headY) / Math.max(1, rows.length));
  rows.forEach((r, i) => {
    const y = headY + i * rowH;
    if (cols.some(([, w, , key]) => lines(r[key] ?? '', T.type.body.px, w) * T.type.body.px * LH + 20 > rowH)) {
      ctx.warn(`第 ${ctx.n} 頁收尾頁第 ${i + 1} 列列高不足，文字可能重疊`);
    }
    if (i) rule(slide, M.x, y, W - M.x, y, C.grid);
    for (const [x, w, , key] of cols) text(slide, r[key] ?? '', { x, y: y + 20, w, h: rowH - 20, px: T.type.body.px, color: C.text });
  });
};

// Every category in every chart, in order of first appearance: one category keeps one color across the deck.
function deckCategories(story) {
  const seen = [];
  for (const p of story.pages) {
    const v = p.visual;
    if (!v?.kind) continue;
    const names = v.categories ?? (v.kind === 'line' && !v.focus ? v.series?.map((s) => s.name) : null) ?? [];
    for (const name of names) if (!seen.includes(name)) seen.push(name);
  }
  return seen;
}

export async function build(story) {
  const warnings = [];
  const charts = [];
  const pres = new PptxGenJS();
  pres.defineLayout({ name: 'BLUEPRINT', width: T.slide.widthIn, height: T.slide.heightIn });
  pres.layout = 'BLUEPRINT';
  pres.title = story.title ?? '';
  pres.author = story.author ?? '';
  pres.company = '';
  pres.subject = '';
  pres.theme = { headFontFace: SLIDE_FONT, bodyFontFace: SLIDE_FONT, lang: 'zh-TW' };
  // The section ruler lists every kicker in page order (the cover's kicker is the organisation, not a section).
  const sections = [...new Set(story.pages.filter((p) => p.type !== 'cover' && p.kicker).map((p) => p.kicker))];
  const categoryOrder = deckCategories(story);
  const folded = categoryColors(categoryOrder, { order: categoryOrder }).folded;
  if (folded.length) warnings.push(`整份簡報超過 ${T.categoryRules.maxCategorical} 個類別，「${folded.join('、')}」在每張圖都併入「其他」`);
  story.pages.forEach((page, i) => {
    const fn = LAYOUT[page.type];
    if (!fn) throw new Error(`第 ${i + 1} 頁：不認得的版型 ${page.type}`);
    const slide = pres.addSlide();
    slide.background = { color: hex(C.onDark[0]) };
    const ctx = { story, page, n: i + 1, total: story.pages.length, sections, categoryOrder, charts, missing: [], warn: (w) => warnings.push(w) };
    // The source row is laid out before the chart (it decides the chart's height), so collect missing values first.
    if (page.type === 'evidence' && page.visual) {
      ctx.model = prepare(page.visual, { categoryOrder });
      ctx.missing.push(...ctx.model.missing);
    }
    fn(slide, ctx);
    if (page.notes) slide.addNotes(page.notes);
  });
  const buf = await pres.write({ outputType: 'nodebuffer' });
  return { buffer: await finish(buf, story, charts), warnings };
}

function labelStyle(color, bold = false) {
  return `<a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${pt(LABEL) * 100}" b="${bold ? 1 : 0}"><a:solidFill><a:srgbClr val="${hex(color)}"/></a:solidFill><a:latin typeface="${SLIDE_FONT}"/></a:defRPr></a:pPr></a:p>`;
}

function pointLabel(i, { color = C.text, bold = false, name = false, value = true, pos = 'r', label, formatCode } = {}) {
  const tx = label === undefined ? '' : `<c:tx><c:rich>${labelStyle(color, bold).replace('</a:p>', () => `<a:r><a:t>${xml(label)}</a:t></a:r></a:p>`)}</c:rich></c:tx>`;
  const numFmt = formatCode === undefined ? '' : `<c:numFmt formatCode="${xml(formatCode)}" sourceLinked="0"/>`;
  return `<c:dLbl><c:idx val="${i}"/>${tx}${numFmt}<c:txPr>${labelStyle(color, bold)}</c:txPr><c:dLblPos val="${pos}"/>`
    + `<c:showLegendKey val="0"/><c:showVal val="${value ? 1 : 0}"/><c:showCatName val="0"/><c:showSerName val="${name ? 1 : 0}"/>`
    + '<c:showPercent val="0"/><c:showBubbleSize val="0"/><c:separator> </c:separator></c:dLbl>';
}

function pointMarker(i, color) {
  return `<c:dPt><c:idx val="${i}"/><c:marker><c:symbol val="circle"/><c:size val="${pt(T.stroke.axisTick)}"/>`
    + `<c:spPr><a:solidFill><a:srgbClr val="${hex(color)}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:marker></c:dPt>`;
}

const excelCol = (n) => n > 26 ? excelCol(Math.floor((n - 1) / 26)) + excelCol((n - 1) % 26 + 1) : String.fromCharCode(64 + n);

function patchChart(s, m) {
  const formatCode = numberFormat(m.digits, m.kind === 'share');
  let si = 0;
  s = s.replace(/<c:ser>[\s\S]*?<\/c:ser>/g, (ser) => {
    const i = si++;
    let labels = '', points = '';
    if (m.kind === 'rank') {
      labels = m.rows.map((r, j) => pointLabel(j, { color: r.focus ? C.focus : C.text, bold: r.focus, pos: 'outEnd', formatCode })).join('');
    } else if (m.kind === 'line') {
      const row = m.series[i];
      if (row.last >= 0) labels += pointLabel(row.last, { color: row.color, bold: row.focus, name: true, formatCode });
      if (row.peak >= 0) labels += pointLabel(row.peak, { color: row.color, bold: true, pos: 't', formatCode });
    } else if (m.kind === 'slope') {
      m.rows[i].values.forEach((v, j) => {
        if (v === null) return;
        labels += pointLabel(j, { name: j === 0, pos: j === 0 ? 'l' : 'r', formatCode });
        points += pointMarker(j, m.colors[j]);
      });
    } else if (m.kind === 'share') {
      const cat = m.categories[i];
      const ink = textOn(cat.other ? T.fill.other.native.color : cat.color);
      labels = m.rows.map((_, j) => pointLabel(j, { color: ink, pos: 'ctr', formatCode })).join('');
      const col = excelCol(m.categories.length + 2 + i);
      ser = ser.replace(/<c:val>[\s\S]*?<\/c:val>/, (val) => val
        .replace(/<c:f>[^<]*<\/c:f>/, `<c:f>Sheet1!$${col}$2:$${col}$${m.rows.length + 1}</c:f>`)
        .replace(/<c:pt idx="(\d+)"><c:v>[^<]*<\/c:v><\/c:pt>/g, (_, j) => `<c:pt idx="${j}"><c:v>${m.rows[Number(j)].segments[i].share}</c:v></c:pt>`));
    } else if (m.kind === 'scatter') {
      labels = m.points.map((p, j) => pointLabel(j, { label: p.label, value: false, color: p.focus ? C.focus : C.text, bold: p.focus })).join('');
      points = m.points.map((p, j) => pointMarker(j, p.color)).join('');
    }
    let defaults = ser.match(/<c:dLbls>([\s\S]*?)<\/c:dLbls>/)?.[1];
    if (defaults === undefined) defaults = `<c:numFmt formatCode="${xml(numberFormat(m.digits))}" sourceLinked="0"/><c:txPr>${labelStyle(C.text)}</c:txPr><c:showVal val="0"/><c:showSerName val="0"/>`;
    ser = ser.replace(/<c:dLbls>[\s\S]*?<\/c:dLbls>/g, '');
    // pptxgenjs writes dLbls before marker/dPt; OOXML requires marker, dPt, then dLbls.
    ser = ser.replace(/<c:dPt>[\s\S]*?<\/c:dPt>/g, (p) => { points += p; return ''; });
    if (m.kind === 'line' || m.kind === 'slope') ser = ser.replace(/<c:invertIfNegative[^>]*\/>/, '');
    return ser.replace(/<c:(?:cat|xVal)>/, (tag) => `${points}<c:dLbls>${labels}${defaults}</c:dLbls>${tag}`);
  });
  if (m.kind === 'scatter') {
    let axis = 0;
    s = s.replace(/<c:valAx>[\s\S]*?<\/c:valAx>/g, (ax) => {
      const x = axis++ === 0, a = x ? m.xAxis : m.yAxis;
      return ax.replace(/<c:numFmt[^>]*\/>/, `<c:numFmt formatCode="${xml(numberFormat(decimalsOf(a.ticks), false, x ? '' : m.suffix))}" sourceLinked="0"/>`)
        .replace(/<c:majorTickMark[^>]*\/>/, '<c:majorTickMark val="out"/>');
    });
  }
  return s.replace(/<c:numCache>[\s\S]*?<\/c:numCache>/g, (cache) => cache.replace(/<c:pt idx="\d+">\s*<c:v>\s*<\/c:v>\s*<\/c:pt>/g, ''))
    .replace(/<a:latin typeface="[^"]*"\/>/g, `<a:latin typeface="${SLIDE_FONT}"/><a:ea typeface="${SLIDE_FONT}"/>`);
}

async function shareWorkbook(inner, m) {
  const count = m.categories.length;
  const last = excelCol(2 * count + 1);
  await patch(inner, 'xl/worksheets/sheet1.xml', (s) => s
    .replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:${last}${m.rows.length + 1}"/>`)
    .replace(/<row\b([^>]*)>([\s\S]*?)<\/row>/g, (row, attrs, cells) => {
      const r = Number(attrs.match(/\br="(\d+)"/)?.[1]);
      if (!r || r > m.rows.length + 1) return row;
      const extra = m.categories.map((c, i) => {
        const addr = `${excelCol(count + 2 + i)}${r}`;
        if (r === 1) return `<c r="${addr}" t="inlineStr"><is><t>${xml(`${c.name}（比例，自動計算）`)}</t></is></c>`;
        const formula = `IFERROR(${excelCol(i + 2)}${r}/SUM($B${r}:$${excelCol(count + 1)}${r}),0)`;
        return `<c r="${addr}"><f>${formula}</f><v>${m.rows[r - 2].segments[i].share}</v></c>`;
      }).join('');
      return `<row${attrs.replace(/\bspans="[^"]*"/, `spans="1:${count * 2 + 1}"`)}>${cells}${extra}</row>`;
    }));
  await patch(inner, 'xl/workbook.xml', (s) => s.replace(/<calcPr\b[^>]*\/>/g, '').replace('</workbook>', '<calcPr fullCalcOnLoad="1" forceFullCalc="1"/></workbook>'));
}

function workbookNumbers(s, m) {
  const cols = m.kind === 'rank' ? [m.rows.map((r) => r.value)]
    : m.kind === 'line' ? m.series.map((r) => r.values)
      : m.kind === 'slope' ? m.rows.map((r) => r.values)
        : m.kind === 'share' ? m.categories.map((_, i) => m.rows.map((r) => r.segments[i].value))
          : [m.points.map((p) => p.x), m.points.map((p) => p.y)];
  const cells = new Map();
  cols.forEach((col, i) => col.forEach((v, j) => cells.set(`${excelCol(i + (m.kind === 'scatter' ? 1 : 2))}${j + 2}`, v)));
  // pptxgenjs 4.0.1 writes zero as an empty cell in category charts; restore from the model before removing gaps.
  return s.replace(/<c\b[^>]*\br="([A-Z]+\d+)"[^>]*>[\s\S]*?<\/c>/g, (cell, ref) => {
    if (!cells.has(ref)) return cell;
    const v = cells.get(ref);
    return v === null ? '' : `<c r="${ref}"><v>${v}</v></c>`;
  });
}

// After pptxgenjs: editable point labels, missing data, fonts, PNG fallbacks and metadata.
async function finish(buf, story, charts) {
  const zip = await JSZip.loadAsync(buf);
  const chartNames = Object.keys(zip.files).filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/chart(\d+)/)[1]) - Number(b.match(/chart(\d+)/)[1]));
  if (chartNames.length !== charts.length) throw new Error('原生圖表數量與修補資料不符');
  const bookModels = new Map();
  for (const [i, name] of chartNames.entries()) {
    await patch(zip, name, (s) => patchChart(s, charts[i]));
    const rels = await zip.file(name.replace('charts/', 'charts/_rels/') + '.rels').async('string');
    const target = rels.match(/Target="\.\.\/embeddings\/([^"]+\.xlsx)"/)?.[1];
    if (!target) throw new Error('原生圖表找不到內嵌活頁簿');
    bookModels.set(`ppt/embeddings/${target}`, charts[i]);
  }
  await patch(zip, 'ppt/theme/theme1.xml', (s) => s
    .replace(/<a:font script="Hant" typeface="[^"]*"\/>/g, `<a:font script="Hant" typeface="${SLIDE_FONT}"/>`)
    .replace(/<a:ea typeface="[^"]*"\/>/g, `<a:ea typeface="${SLIDE_FONT}"/>`));
  for (const name of Object.keys(zip.files)) {
    const m = name.match(/^ppt\/media\/image-(\d+)-(\d+)\.svg$/);
    if (!m) continue;
    const png = `ppt/media/image-${m[1]}-${Number(m[2]) - 1}.png`;
    if (zip.files[png]) zip.file(png, svgToPng(await zip.file(name).async('string'), { scale: 2 }));
  }
  const author = xml(story.author ?? '');
  await patch(zip, 'docProps/core.xml', (s) => s
    .replace(/<dc:creator>[^<]*<\/dc:creator>/, () => `<dc:creator>${author}</dc:creator>`)
    .replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/, () => `<cp:lastModifiedBy>${author}</cp:lastModifiedBy>`)
    .replace(/<dc:subject>[^<]*<\/dc:subject>/, '<dc:subject></dc:subject>'));
  await patch(zip, 'docProps/app.xml', (s) => s.replace(/<Company>[^<]*<\/Company>/, '<Company></Company>'));
  for (const name of Object.keys(zip.files).filter((n) => /^ppt\/embeddings\/.+\.xlsx$/.test(n))) {
    const inner = await JSZip.loadAsync(await zip.file(name).async('nodebuffer'));
    const model = bookModels.get(name);
    if (model) await patch(inner, 'xl/worksheets/sheet1.xml', (s) => workbookNumbers(s, model));
    if (model?.kind === 'share') await shareWorkbook(inner, model);
    for (const sheet of Object.keys(inner.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))) {
      await patch(inner, sheet, (s) => s.replace(/<c\b[^>]*>\s*<v>\s*<\/v>\s*<\/c>/g, ''));
    }
    await patch(inner, 'docProps/core.xml', (s) => s.replace(/PptxGenJS/g, () => author));
    await patch(inner, 'docProps/app.xml', (s) => s.replace(/PptxGenJS/g, () => author));
    zip.file(name, await inner.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function patch(zip, name, fn) {
  const f = zip.file(name);
  if (f) zip.file(name, fn(await f.async('string')));
}

if (import.meta.main) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('用法：node scripts/pptx.js story.json deck.pptx');
    process.exit(2);
  }
  try {
    const { buffer, warnings } = await build(JSON.parse(readFileSync(input, 'utf8')));
    writeFileSync(output, buffer);
    for (const w of warnings) console.error(`警告：${w}`);
  } catch (e) {
    console.error(`錯誤：${e.message}`);
    process.exit(1);
  }
}
