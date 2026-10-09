import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, prepare } from '../scripts/core.js';

test('grouped：保留序列與類別順序、0、缺值、極小值、負值', () => {
  const m = prepare({ kind: 'grouped', x: ['甲', '乙'], series: [
    { name: '前', values: [0, null] }, { name: '後', values: [-2, 1e-8] },
  ] });
  assert.deepEqual(m.missing, ['前／乙']);
  assert.deepEqual(m.rows.map((r) => r.values), [[0, -2], [null, 1e-8]]);
  assert.equal(m.series[1].texts[1], '<1');
  assert.equal(m.series[0].color, C.ordered[0]);
  assert.throws(() => prepare({ kind: 'grouped', x: ['甲'], series: [{ name: '只一條', values: [1] }] }), /2～4/);
});

test('sharetrend：以原值計算各期百分比，缺值整期略去', () => {
  const m = prepare({ kind: 'sharetrend', categories: ['甲', '乙'], rows: [
    { label: '前期', values: [0, 10] }, { label: '缺期', values: [null, 4] },
    { label: '本期', values: [1e-8, 1] },
  ] });
  assert.deepEqual(m.x, ['前期', '本期']);
  assert.deepEqual(m.missing, ['缺期 甲']);
  assert.deepEqual(m.rows[0].segments.map((s) => s.value), [0, 10]);
  assert.equal(m.rows[1].segments[0].share, 1e-8 / (1 + 1e-8));
  assert.notEqual(m.rows[1].segments[0].text, '0%');
  assert.throws(() => prepare({ kind: 'sharetrend', categories: ['甲'], rows: [{ label: '前', values: [-1] }, { label: '後', values: [2] }] }), /sharetrend 不能有負值/);
});

test('combo：上下圖的金額、比率各有數值軸', () => {
  const m = prepare({ kind: 'combo', x: ['前', '後'], amounts: [0, -1e-8], rates: [null, 2], amountUnit: '萬元', rateUnit: '%' });
  assert.deepEqual(m.missing, ['前／比率']);
  assert.equal(m.amount.unit, '萬元');
  assert.equal(m.rate.unit, '%');
  assert.equal(m.amount.texts[1], '>−1');
  assert.ok(m.amount.axis.lo <= -1e-8);
  assert.throws(() => prepare({ kind: 'combo', x: ['前', '後'], amounts: [1], rates: [1, 2] }), /長度或數值不對/);
});

test('bullet：0 目標和負值差距都可表達，缺值不當 0', () => {
  const m = prepare({ kind: 'bullet', better: 'lower', rows: [
    { label: '甲', value: -1e-8, target: 0, ranges: [0, 5, 10] },
    { label: '乙', value: null, target: 2 },
  ] });
  assert.deepEqual(m.missing, ['乙／實際']);
  assert.equal(m.rows[0].actualText, '>−1');
  assert.equal(m.rows[0].delta.color, C.better);
  assert.throws(() => prepare({ kind: 'bullet', rows: [{ label: '甲', value: 1, target: 2, ranges: [5, 4, 6] }] }), /ranges/);
});

test('waffle：最大餘數法恰好 100 格，缺值不誤算，負值拒絕', () => {
  const m = prepare({ kind: 'waffle', categories: ['甲', '乙', '丙'], values: [1, 1, 1] });
  assert.deepEqual(m.categories.map((c) => c.cells), [34, 33, 33]);
  assert.equal(m.categories.reduce((a, c) => a + c.cells, 0), 100);
  const tiny = prepare({ kind: 'waffle', categories: ['甲', '乙'], values: [1e-8, 1] });
  assert.notEqual(tiny.categories[0].text, '0%');
  const missing = prepare({ kind: 'waffle', categories: ['甲', '乙'], values: [null, 0] });
  assert.deepEqual(missing.missing, ['甲']);
  assert.deepEqual(missing.categories, []);
  assert.throws(() => prepare({ kind: 'waffle', categories: ['甲', '乙'], values: [-1, 2] }), /負值/);
});

test('mekko：總量決定欄寬，內部分配合計 100%，缺列不誤算', () => {
  const m = prepare({ kind: 'mekko', categories: ['甲', '乙'], rows: [
    { label: '一', values: [0, 1] }, { label: '缺', values: [null, 2] },
    { label: '二', values: [1e-8, 2] },
  ] });
  assert.equal(m.columns.length, 2);
  assert.deepEqual(m.missing, ['缺 甲']);
  assert.equal(m.columns.reduce((a, c) => a + c.width, 0), 1);
  assert.notEqual(m.columns[1].segments[0].text, '0%');
  assert.throws(() => prepare({ kind: 'mekko', categories: ['甲'], rows: [{ label: '一', values: [-1] }] }), /負值/);
});

test('pareto：單一數值軸，排序與累積門檻', () => {
  const m = prepare({ kind: 'pareto', rows: [
    { label: '小', value: 1e-8 }, { label: '大', value: 8 }, { label: '缺', value: null }, { label: '零', value: 0 },
  ] });
  assert.deepEqual(m.rows.map((r) => r.label), ['大', '小', '零']);
  assert.equal(m.crossing, 0);
  assert.equal(m.rows[0].color, C.focus);
  assert.equal(m.rows[1].color, C.gray);
  assert.deepEqual(m.missing, ['缺']);
  assert.notEqual(m.rows[1].text, '0');
  assert.throws(() => prepare({ kind: 'pareto', rows: [{ label: '負', value: -1 }] }), /非負/);
});

test('tornado：依結果範圍排序，改善色由 better 判斷', () => {
  const m = prepare({ kind: 'tornado', baseline: 0, better: 'lower', rows: [
    { label: '窄', low: -1e-8, high: 0 }, { label: '缺', low: null, high: 2 }, { label: '寬', low: -2, high: 3 },
  ] });
  assert.deepEqual(m.rows.map((r) => r.label), ['寬', '窄']);
  assert.deepEqual(m.missing, ['缺／低情境']);
  assert.equal(m.rows[0].lowColor, C.better);
  assert.equal(m.rows[0].highColor, C.worse);
  assert.equal(m.rows[1].lowText, '>−1');
});

test('box：Tukey 四分位、1.5 IQR 鬚和離群點；五數摘要可含負值', () => {
  const m = prepare({ kind: 'box', groups: [
    { label: '觀察', values: [-2, 0, 1, 2, 3, 30, null] },
    { label: '摘要', summary: [-5, -2, 0, 2, 5] },
    { label: '少量', values: [1e-8] },
  ] });
  assert.deepEqual(m.groups[0].outliers, [30]);
  assert.equal(m.groups[0].max, 3);
  assert.deepEqual(m.groups[1].texts, ['−5', '−2', '0', '2', '5']);
  assert.equal(m.groups[2].median, 1e-8);
  assert.notEqual(m.groups[2].texts[2], '0');
  assert.deepEqual(m.missing, ['觀察 1 筆']);
  assert.ok(m.warnings.some((w) => w.includes('少於 5 筆')));
  assert.throws(() => prepare({ kind: 'box', groups: [{ label: '錯', summary: [0, 2, 1, 3, 4] }] }), /由小到大/);
});

test('ordered：按輸入等級順序、不排序；0 保留、缺值記錄、負數拒絕', () => {
  const m = prepare({ kind: 'ordered', focus: '低', rows: [
    { label: '高', value: 1e-8 }, { label: '中', value: null }, { label: '低', value: 0 },
  ] });
  assert.deepEqual(m.rows.map((r) => r.label), ['高', '低']);
  assert.equal(m.rows[0].text, '<1');
  assert.equal(m.rows[1].text, '0');
  assert.equal(m.rows[1].focus, true);
  assert.deepEqual(m.missing, ['中']);
  assert.throws(() => prepare({ kind: 'ordered', rows: [{ label: '負', value: -1 }] }), /不能是負值/);
});

test('新圖種的資料列為 null 時提供中文錯誤', () => {
  const cases = [
    { kind: 'grouped', x: ['甲'], series: [null, { name: '乙', values: [1] }] },
    { kind: 'sharetrend', categories: ['甲'], rows: [null, { label: '後', values: [1] }] },
    { kind: 'bullet', rows: [null] },
    { kind: 'mekko', categories: ['甲'], rows: [null] },
    { kind: 'pareto', rows: [null] },
    { kind: 'tornado', baseline: 0, rows: [null] },
    { kind: 'box', groups: [null] },
    { kind: 'ordered', rows: [null] },
  ];
  for (const spec of cases) assert.throws(() => prepare(spec), /[\u4e00-\u9fff]/, spec.kind);
});

test('tornado：未指定 better 時用 focus／gray', () => {
  const m = prepare({ kind: 'tornado', baseline: 10, rows: [{ label: '甲', low: 8, high: 12 }] });
  assert.equal(m.rows[0].lowColor, C.gray);
  assert.equal(m.rows[0].highColor, C.focus);
});
