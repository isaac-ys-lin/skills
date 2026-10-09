import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { C } from '../scripts/core.js';
import { render } from '../scripts/svg.js';

const kinds = ['grouped', 'sharetrend', 'combo', 'bullet', 'waffle', 'mekko', 'pareto', 'tornado', 'box', 'ordered'];

test('十種新圖的範例都能畫成完整 SVG，且標籤留在圖內', () => {
  for (const kind of kinds) {
    const spec = JSON.parse(readFileSync(`examples/${kind}.json`, 'utf8'));
    const { svg, model } = render(spec);
    assert.match(svg, /^<svg /, kind);
    assert.ok(!/NaN|undefined/.test(svg), kind);
    assert.ok(!model.warnings.some((w) => w.includes('超出圖表區')), `${kind}: ${model.warnings.join('；')}`);
  }
});

test('分組長條保留 0、負值與極小非零值，缺值不畫', () => {
  const { svg, model } = render({ kind: 'grouped', x: ['甲', '乙'], series: [
    { name: '前期', values: [0, -2] }, { name: '本期', values: [0.0001, null] },
  ] });
  assert.deepEqual(model.missing, ['本期／乙']);
  assert.equal(model.series[0].texts[0], '0');
  assert.equal(model.series[1].texts[0], '<1');
  assert.match(svg, /&lt;1<\/text>/);
  assert.match(svg, /−2<\/text>/);
});

test('占比趨勢缺值整期略過，0 仍保留在比例模型', () => {
  const { svg, model } = render({ kind: 'sharetrend', categories: ['甲', '乙'], rows: [
    { label: '前期', values: [0, 4] }, { label: '中期', values: [null, 3] }, { label: '本期', values: [2, 2] },
  ] });
  assert.deepEqual(model.missing, ['中期 甲']);
  assert.equal(model.rows[0].segments[0].value, 0);
  assert.ok(!svg.includes('>中期</text>'));
});

test('組合圖使用各自數值軸，金額 0 與負比率均有標值', () => {
  const { svg, model } = render({ kind: 'combo', x: ['前期', '本期'], amounts: [0, 0.0001], rates: [-3, 2], rateUnit: '%' });
  assert.equal(model.amount.texts[0], '0');
  assert.equal(model.amount.texts[1], '<1');
  assert.equal(model.rate.texts[0], '−3');
  assert.match(svg, /−3<\/text>/);
});

test('百格圖缺值顯示空狀態，不捏造剩餘比例', () => {
  const { svg, model } = render({ kind: 'waffle', categories: ['甲', '乙'], values: [3, null] });
  assert.deepEqual(model.missing, ['乙']);
  assert.match(svg, /資料不完整，無法計算百格占比/);
  assert.ok(!svg.includes('<rect'));
});

test('Marimekko 極小非零段仍有可見記號，省略標值寫在圖內附註', () => {
  const { svg, model } = render({ kind: 'mekko', categories: ['甲', '乙'], rows: [
    { label: 'A', values: [1, 0.00000001] },
  ] });
  assert.equal(model.columns[0].segments[1].text, '<1%');
  assert.match(svg, /height="0.5"/);
  assert.match(svg, /圖內未標：A 乙/);
});

test('Marimekko 太窄的欄與區塊改列圖內附註', () => {
  const { svg, model } = render({ kind: 'mekko', categories: ['甲', '乙'], rows: [
    { label: '小', values: [1, 0] }, { label: '大', values: [100, 100] },
  ] });
  assert.match(svg, /圖內未標：.*小 總量 1/);
  assert.match(svg, /小 甲/);
  assert.ok(model.warnings.some((w) => w.includes('區塊太窄')));
});

test('帕累托只畫件數長條，累積值以文字標在上方', () => {
  const { svg, model } = render({ kind: 'pareto', rows: [
    { label: '甲', value: 8 }, { label: '乙', value: 2 }, { label: '丙', value: 0 },
  ] });
  assert.equal(model.crossing, 0);
  assert.equal(model.rows[0].color, C.focus);
  assert.equal(model.rows[1].color, C.gray);
  assert.match(svg, /累積 80%<\/text>/);
  assert.ok(!svg.includes('累積 累積'));
});

test('箱型圖的負值、極小中位數、離群點都留在 SVG', () => {
  const { svg, model } = render({ kind: 'box', groups: [
    { label: '甲', summary: [-3, -1, 0.0001, 1, 2], outliers: [-4] },
  ] });
  assert.equal(model.groups[0].texts[2], '<1');
  assert.match(svg, /&lt;1<\/text>/);
  assert.match(svg, /<circle /);
  assert.ok(!/NaN|undefined/.test(svg));
});
