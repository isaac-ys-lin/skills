import { readFileSync, writeFileSync } from 'node:fs';
import { loadTokens } from './tokens.js';
import { isMain } from './main.js';

export function themeCss(tokens = loadTokens()) {
  const c = tokens.color;
  const font = [...tokens.font.latin, ...tokens.font.cjk].map((name) => `"${name}"`).join(', ');
  const body = tokens.type.body.px / 2;
  return `:root {
  --cp-paper: ${c.onDark[0]};
  --cp-ink: ${c.text};
  --cp-muted: ${c.textSecondary};
  --cp-title: ${c.title};
  --cp-line: ${c.grid};
  --cp-accent: ${c.focus};
  --cp-tint: ${c.tint};
  --cp-soft: ${c.onDark[1]};
  --cp-font: ${font}, sans-serif;
  --cp-body: ${body}px;
  --cp-small: ${tokens.type.label.px / 2}px;
  --cp-sub: ${tokens.type.sub.px / 2}px;
  --cp-title-size: ${tokens.type.title.px / 2}px;
  --cp-display: ${tokens.type.display.px / 2}px;
}
* { box-sizing: border-box; }
html { color: var(--cp-ink); background: var(--cp-paper); font-family: var(--cp-font); font-size: var(--cp-body); line-height: 1.65; }
body { margin: 0 auto; padding: 0 24px 72px; max-width: 940px; overflow-wrap: anywhere; }
main, article, section { min-width: 0; }
h1, h2, h3, p { margin-top: 0; }
h1, h2, h3 { color: var(--cp-title); line-height: 1.25; }
h1 { font-size: clamp(32px, 7vw, var(--cp-display)); letter-spacing: -.035em; }
h2 { font-size: var(--cp-title-size); letter-spacing: -.02em; }
h3 { font-size: var(--cp-sub); }
p, li { max-width: 72ch; }
a { color: var(--cp-accent); text-underline-offset: .16em; }
.report-cover { padding: 72px 0 64px; border-bottom: 3px solid var(--cp-accent); }
.eyebrow { color: var(--cp-accent); font-size: var(--cp-small); font-weight: 700; letter-spacing: .08em; }
.report-cover > p:not(:first-child) { font-size: var(--cp-sub); }
.cover-meta { display: flex; flex-wrap: wrap; gap: 10px 28px; margin-top: 40px; color: var(--cp-muted); font-size: var(--cp-small); }
.cover-meta dt { font-weight: 700; }
.cover-meta dd, .summary-metrics dd { margin: 0; }
.toc, section { margin-top: 52px; }
.toc ol { padding-left: 1.4em; }
.toc li { border-bottom: 1px solid var(--cp-line); padding: 7px 0; }
.summary { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 28px; padding: 30px; background: var(--cp-tint); }
.summary h2 { margin-bottom: 12px; }
.summary-metrics { display: grid; gap: 12px; align-content: center; }
.summary-metrics dt { color: var(--cp-muted); font-size: var(--cp-small); }
.summary-metrics dd { color: var(--cp-accent); font-size: var(--cp-title-size); font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; }
.section-heading { margin-bottom: 22px; border-top: 1px solid var(--cp-line); padding-top: 24px; }
.section-heading > p:last-child { color: var(--cp-muted); }
.callout { margin: 28px 0; padding: 20px 24px; background: var(--cp-tint); }
figure { margin: 32px 0; }
figure svg { display: block; width: 100%; height: auto; max-width: 100%; }
.chart-scroll { max-width: 100%; overflow-x: auto; }
figcaption, .sources { margin-top: 10px; color: var(--cp-muted); font-size: var(--cp-small); line-height: 1.5; }
.chart-focus { fill: var(--cp-accent); stroke: var(--cp-accent); }
.chart-muted { fill: var(--cp-soft); stroke: var(--cp-soft); }
.chart-grid { stroke: var(--cp-line); }
.chart-text { fill: var(--cp-ink); }
.chart-subtle { fill: var(--cp-muted); }
.table-scroll { max-width: 100%; overflow-x: auto; box-shadow: inset -12px 0 10px -12px var(--cp-accent); }
table { width: 100%; border-collapse: collapse; text-align: left; font-variant-numeric: tabular-nums; }
caption { text-align: left; }
th, td { padding: 11px 14px; border-bottom: 1px solid var(--cp-line); vertical-align: top; }
thead th { border-bottom: 2px solid var(--cp-ink); font-size: var(--cp-small); }
.num, td[data-type="number"], th[data-type="number"] { text-align: right; white-space: nowrap; }
tr.emphasis, tr.total { font-weight: 700; background: var(--cp-tint); }
.comparison .recommended { background: var(--cp-tint); }
.diagnosis, .flow { padding-left: 1.4em; }
.diagnosis li, .flow li { padding: 9px 0; border-bottom: 1px solid var(--cp-line); }
.flow li::marker { color: var(--cp-accent); font-weight: 700; }
.missing { display: inline-block; padding: 0 .4em; border: 1px solid var(--cp-muted); color: var(--cp-muted); font-size: var(--cp-small); }
@media (max-width: 640px) {
  body { padding: 0 18px 44px; }
  .report-cover { padding: 48px 0 42px; }
  .summary { grid-template-columns: 1fr; padding: 20px; }
  .summary-metrics { grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); }
  .chart-scroll svg { min-width: 640px; max-width: none; }
}
@page { size: A4; margin: 18mm 19mm; }
@media print {
  html { background: var(--cp-paper); print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  body { max-width: none; padding: 0; }
  .report-cover { break-after: page; }
  .section-heading { break-after: avoid; }
  /* A short section stays on one page so its heading never sits alone; Chrome breaks sections taller than a page anyway. */
  section { break-inside: avoid; }
  figure, .callout, .summary, .table-scroll, .comparison, .diagnosis, .flow, .decisions { break-inside: avoid; }
  tr { break-inside: avoid; }
  .chart-scroll, .table-scroll { overflow: visible; box-shadow: none; }
  .chart-scroll svg { min-width: 0; max-width: 100%; }
  .sources { break-before: avoid; }
  a { color: inherit; }
}`;
}

export function replaceTheme(html, css = themeCss()) {
  const pattern = /(<style\s+id=["']clayprint-theme["']\s*>)[\s\S]*?(<\/style>)/i;
  if (!pattern.test(html)) throw new Error('找不到 <style id="clayprint-theme"> 區塊');
  return html.replace(pattern, (_, open, close) => `${open}\n${css}\n${close}`);
}

if (isMain(import.meta.url)) {
  const file = process.argv[2];
  try {
    if (file) writeFileSync(file, replaceTheme(readFileSync(file, 'utf8')));
    else console.log(themeCss());
  } catch (error) {
    console.error(`設計層 CSS 失敗：${error.message}`);
    process.exitCode = 1;
  }
}
