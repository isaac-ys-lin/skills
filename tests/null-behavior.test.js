import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { render, framed } from '../scripts/svg.js';
import { build } from '../scripts/pptx.js';

const pairs = { periods: ['前', '後'], rows: [{ label: '有效', values: [8, 6] }, { label: '缺值', values: [null, 4] }, { label: '全缺', values: [null, null] }] };
const series = { x: ['甲', '乙', '丙', '丁', '戊'], series: [{ name: '系列', values: [2, 4, null, 6, 8] }, { name: '全缺', values: [null, null, null, null, null] }] };
const points = [{ label: '有效', x: 2, y: 8 }, { label: '缺值', x: null, y: 4 }, { label: '全缺', x: null, y: null }];
const specs = [
  { kind: 'rank', rows: [{ label: '有效', value: 8 }, { label: '缺值', value: null }] },
  { kind: 'dumbbell', ...pairs },
  { kind: 'line', ...series },
  { kind: 'multiples', ...series },
  { kind: 'slope', ...pairs },
  { kind: 'share', categories: ['甲', '乙'], rows: [{ label: '有效', values: [8, 6] }, { label: '缺值', values: [null, 4] }] },
  { kind: 'bridge', steps: [{ label: '期初', value: 8, total: true }, { label: '缺值', value: null }, { label: '增加', value: 2 }, { label: '期末', value: 10, total: true }] },
  { kind: 'histogram', bins: [{ from: 0, to: 1, value: 8 }, { from: 1, to: 2, value: null }, { from: 2, to: null, value: 4 }] },
  { kind: 'strip', groups: [{ label: '有效', values: [2, null, 8] }, { label: '全缺', values: [null, null] }] },
  { kind: 'heat', rowLabels: ['有效', '全缺'], colLabels: ['甲', '乙'], values: [[8, null], [null, null]] },
  { kind: 'scatter', points },
  { kind: 'matrix', domain: [0, 10], points },
  { kind: 'funnel', steps: [{ label: '期初', value: 8 }, { label: '缺值', value: null }, { label: '期末', value: 4 }] },
  { kind: 'table', columns: [{ name: '項目', type: 'text' }, { name: '說明', type: 'text' }, { name: '件數', type: 'number' }], rows: [['有效', '已知', 8], ['缺值', null, null]] },
];
const count = (s, re) => [...s.matchAll(re)].length;
const hasLabel = (svg, label) => svg.includes(`>${label}</text>`);

for (const spec of specs) test(`${spec.kind}：SVG 缺值行為與文件一致`, () => {
  const { svg, model: m } = render(spec);
  assert.doesNotMatch(svg, /NaN|Infinity|>null<|>undefined</);
  assert.ok(m.missing.length);
  assert.ok(framed(spec).svg.includes(`未提供：${m.missing.join('、')}`));
  switch (spec.kind) {
    case 'rank':
    case 'share':
      assert.deepEqual(m.rows.map((r) => r.label), ['有效']);
      assert.ok(!hasLabel(svg, '缺值'));
      break;
    case 'slope':
    case 'dumbbell':
      assert.deepEqual(m.rows.map((r) => r.label), ['有效', '缺值']);
      assert.equal(m.rows[1].delta, null);
      assert.equal(count(svg, /<circle /g), 5, '三個有效端點加兩個圖例點');
      assert.ok(!hasLabel(svg, '全缺'));
      assert.equal(hasLabel(svg, '缺值'), spec.kind === 'dumbbell', 'slope 前期缺值時不畫列名');
      break;
    case 'line':
    case 'multiples':
      assert.deepEqual(m.x, series.x);
      assert.deepEqual(m.series[0].values, series.series[0].values);
      assert.equal(count(svg, /<path /g), 2, '缺值兩側各畫一段，不跨缺值連線');
      assert.equal(hasLabel(svg, '全缺'), spec.kind === 'multiples');
      assert.equal(m.missing[0], '系列／丙');
      break;
    case 'bridge':
      assert.deepEqual(m.steps.map((s) => s.label), ['期初', '增加', '期末']);
      assert.equal(m.steps[1].end, 10);
      assert.ok(!hasLabel(svg, '缺值'));
      assert.ok(m.warnings.some((w) => w.includes('累計可能不對')));
      break;
    case 'histogram':
      assert.equal(m.bins.length, 3);
      assert.equal(m.bins[1].value, null);
      assert.equal(count(svg, /<rect /g), 2);
      for (const edge of ['0', '1', '2']) assert.ok(hasLabel(svg, edge));
      break;
    case 'strip':
      assert.deepEqual(m.groups.map((g) => [g.label, g.values, g.median]), [['有效', [2, 8], 5]]);
      assert.equal(count(svg, /<circle /g), 2);
      assert.ok(!hasLabel(svg, '全缺'));
      break;
    case 'heat':
      assert.equal(m.cells[0][1], null);
      assert.deepEqual(m.cells[1], [null, null]);
      assert.equal(count(svg, /<rect /g), 6, '一個有效格加五個圖例色塊');
      for (const label of [...spec.rowLabels, ...spec.colLabels]) assert.ok(hasLabel(svg, label));
      break;
    case 'scatter':
    case 'matrix':
      assert.deepEqual(m.points.map((p) => p.label), ['有效']);
      assert.equal(count(svg, /<circle /g), 1);
      assert.ok(!hasLabel(svg, '缺值') && !hasLabel(svg, '全缺'));
      break;
    case 'funnel':
      assert.equal(m.steps.length, 3);
      assert.ok(hasLabel(svg, '缺值'));
      assert.equal(count(svg, /<rect /g), 2);
      assert.ok(m.steps.every((s) => s.conversion === null), '不跨缺值步驟計算轉換率');
      break;
    case 'table':
      assert.deepEqual(m.rows[1].cells.map((c) => c.text), ['缺值', '', '']);
      assert.deepEqual(m.missing, ['缺值／說明', '缺值／件數']);
      assert.ok(hasLabel(svg, '缺值'));
      break;
  }
});

test('五種原生圖與原生表格保留相同缺值語意及來源列', async () => {
  const native = specs.filter((s) => ['rank', 'line', 'slope', 'share', 'scatter', 'table'].includes(s.kind));
  const { buffer } = await build({ title: '缺值實測', pages: native.map((visual) => ({ type: 'evidence', claim: '核對缺值顯示', visual })) });
  const zip = await JSZip.loadAsync(buffer);
  const expected = { rank: [[0]], line: [[0, 1, 3, 4], []], slope: [[0, 1], [1]], share: [[0], [0]], scatter: [[0], [0]] };
  let chartIndex = 0;
  for (const [i, spec] of native.entries()) {
    const slide = await zip.file(`ppt/slides/slide${i + 1}.xml`).async('string');
    assert.ok(slide.includes(`未提供：${render(spec).model.missing.join('、')}`), spec.kind);
    if (spec.kind === 'table') {
      const table = slide.match(/<a:tbl>[\s\S]*?<\/a:tbl>/)[0];
      const cells = [...table.matchAll(/<a:tc>([\s\S]*?)<\/a:tc>/g)].map((m) => [...m[1].matchAll(/<a:t>(.*?)<\/a:t>/g)].map((m) => m[1]).join(''));
      assert.deepEqual(cells, ['項目', '說明', '件數', '有效', '已知', '8', '缺值', '', '']);
      continue;
    }
    const chart = await zip.file(`ppt/charts/chart${++chartIndex}.xml`).async('string');
    const caches = [...chart.matchAll(/<c:numCache>[\s\S]*?<\/c:numCache>/g)];
    assert.deepEqual(caches.map((cache) => [...cache[0].matchAll(/<c:pt idx="(\d+)"/g)].map((m) => Number(m[1]))), expected[spec.kind], spec.kind);
    if (spec.kind === 'line' || spec.kind === 'slope') assert.match(chart, /<c:dispBlanksAs val="gap"\/>/);
    if (['rank', 'share', 'scatter'].includes(spec.kind)) assert.doesNotMatch(chart, />缺值<|>全缺</);
    if (spec.kind === 'slope') assert.doesNotMatch(chart, />全缺</);
  }
});
