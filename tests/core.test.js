import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  C, formatValue, delta, niceTicks, categoryColors, shares, textOn, heatBins, textWidth, contrast,
} from '../scripts/core.js';
import { measureText, pingFang, hasJhengHei } from '../scripts/png.js';

test('formatValue: zero is a value, missing is not', () => {
  assert.equal(formatValue(0), '0');
  assert.equal(formatValue(0, { digits: 1 }), '0');
  assert.equal(formatValue(null), null);
  assert.equal(formatValue(undefined), null);
  assert.equal(formatValue(Number.NaN), null);
});

test('formatValue: non-zero values never round to 0', () => {
  assert.equal(formatValue(1e-101, { digits: 1 }), '<0.1');
  assert.equal(formatValue(0.04, { digits: 1 }), '<0.1');
  assert.equal(formatValue(-0.04, { digits: 1 }), '>−0.1');
  assert.equal(formatValue(0.4, { digits: 0 }), '<1');
  assert.equal(formatValue(-0.4, { digits: 0 }), '>−1');
});

test('formatValue: thousands separators, minus sign, suffix', () => {
  assert.equal(formatValue(1420), '1,420');
  assert.equal(formatValue(1234567.891, { digits: 2 }), '1,234,567.89');
  assert.equal(formatValue(-260), '−260');
  assert.equal(formatValue(26, { suffix: '%' }), '26%');
});

test('delta: sign is literal, color follows better', () => {
  const up = delta(312, 398, { better: 'higher' });
  assert.deepEqual(up, { text: '＋86', color: C.better });
  const wait = delta(12.4, 7.8, { better: 'lower', digits: 1 });
  assert.deepEqual(wait, { text: '−4.6', color: C.better });
  const ratio = delta(0.9, 0.86, { better: 'higher', digits: 2 });
  assert.deepEqual(ratio, { text: '−0.04', color: C.worse });
});

test('delta: edge cases', () => {
  assert.equal(delta(null, 5), null, 'no previous value: omit');
  assert.deepEqual(delta(0, 5, { mode: 'pct' }), { text: '＋5', color: C.better }, 'previous 0: absolute only');
  assert.deepEqual(delta(5, 5), { text: '±0', color: C.unchanged }, 'no change');
  assert.deepEqual(delta(66, 68.1, { mode: 'pp', digits: 1 }), { text: '＋2.1 個百分點', color: C.better });
  assert.deepEqual(delta(100, 128, { mode: 'pct' }), { text: '＋28%', color: C.better });
  assert.deepEqual(delta(10, 10.04, { digits: 1 }), { text: '＋<0.1', color: C.better }, 'tiny change keeps its sign');
});

test('niceTicks: positive, mixed and all-negative ranges', () => {
  assert.deepEqual(niceTicks(0, 1420, 4).ticks, [0, 500, 1000, 1500]);
  assert.deepEqual(niceTicks(0, 40, 4).ticks, [0, 10, 20, 30, 40]);
  const mixed = niceTicks(-260, 900, 5);
  assert.ok(mixed.ticks.includes(0));
  assert.ok(mixed.lo <= -260 && mixed.hi >= 900);
  const neg = niceTicks(-140, -20, 4);
  assert.ok(neg.lo <= -140 && neg.hi >= -20 && neg.hi <= 0);
  assert.deepEqual(niceTicks(0, 0.3, 3).ticks, [0, 0.1, 0.2, 0.3], 'no floating-point noise');
  assert.equal(niceTicks(0, 4100, 4).hi, 5000, 'top tick stays close to the data');
  for (const [lo, hi, c] of [[0, 4100, 4], [0, 26, 3], [35, 92, 3], [-260, 900, 5], [0, 1, 2], [3, 997, 4]]) {
    assert.ok(niceTicks(lo, hi, c).ticks.length <= c + 2, `${lo}–${hi} asked ${c}`);
  }
});

test('categoryColors: same category, same color across charts', () => {
  const order = ['通勤', '購物', '休閒', '接駁'];
  const a = categoryColors(['通勤', '購物', '休閒', '接駁'], { order });
  const b = categoryColors(['休閒', '接駁', '通勤'], { order });
  for (const name of ['通勤', '休閒', '接駁']) assert.equal(a.colors.get(name), b.colors.get(name));
  assert.equal(a.colors.get('通勤'), C.categorical[0]);
});

test('categoryColors: "其他" is decided by name, not position', () => {
  const r = categoryColors(['通勤', '其他', '購物']);
  assert.equal(r.colors.get('其他'), C.other);
  assert.equal(r.colors.get('購物'), C.categorical[1]);
});

test('categoryColors: beyond 4 categories fold into 其他, chosen by shared order not size', () => {
  const order = ['通勤', '購物', '休閒', '接駁', '觀光', '運動'];
  const r = categoryColors(['運動', '通勤', '觀光', '購物', '休閒', '接駁'], { order });
  assert.deepEqual(r.folded, ['觀光', '運動']);
  assert.equal(r.colors.get('其他'), C.other);
  assert.equal(r.colors.has('觀光'), false);
});

test('shares keep exact proportions', () => {
  const s = shares([1, 999999]);
  assert.equal(s[0], 1 / 1000000);
  assert.ok(s[0] > 0);
  assert.equal(formatValue(s[0] * 100, { digits: 1, suffix: '%' }), '<0.1%');
  assert.throws(() => shares([3, -1]));
  assert.throws(() => shares([0, 0]));
});

test('textOn follows the spec table and every pair passes 4.5:1', () => {
  for (const [ink, fills] of Object.entries({ '#FFFFFF': ['#2F6DAA', '#125A98', '#9B482F', '#023560'], '#111111': ['#8AAFD6', '#6898C9', '#4B83BB', '#B58A26', '#976DA9', '#B3B3B3', '#E8EFF7'] })) {
    for (const fill of fills) {
      assert.equal(textOn(fill), ink, fill);
      assert.ok(contrast(fill, ink) >= 4.5, `${ink} on ${fill}`);
    }
  }
  assert.throws(() => textOn('#FF00FF'), 'fills outside the tokens are a bug');
});

test('heatBins: equal width from 0 to max, upper edge inclusive', () => {
  const b = heatBins([1.0, 2.0, 4.8, 9.99, 10.0]);
  assert.deepEqual(b.edges, [0, 2, 4, 6, 8, 10]);
  assert.equal(b.binOf(0), 0);
  assert.equal(b.binOf(2.0), 1, '2.0 belongs to 2–4');
  assert.equal(b.binOf(10.0), 4, 'max belongs to the top bin');
  const f = heatBins([0.2, 0.6, 1.0]);
  assert.equal(f.binOf(0.6), 3, 'no floating-point drift at edges');
  assert.equal(heatBins([0, 0]).binOf(0), 0, 'all zero stays in the first bin');
  assert.throws(() => heatBins([3, -1]));
});

const samples = ['河港市共享單車', '1,420', '0123456789', 'ABCxyz', '＋28%', '−4.6 分鐘', '未提供：北岸區 3 月', '2026 預估', '30 天內再騎', 'minimum', 'mwmw', 'MW Bike'];

test('textWidth estimate stays within 1.00–1.15× of measured ink width', { skip: !pingFang() && 'PingFang not found' }, () => {
  for (const s of samples) {
    const est = textWidth(s, 24);
    const real = measureText(s, 24);
    const ratio = est / real;
    assert.ok(ratio >= 1.0 && ratio <= 1.15, `${s}: estimate ${est.toFixed(1)} / measured ${real.toFixed(1)} = ${ratio.toFixed(3)}`);
  }
});

// One estimator serves both fonts; slides use Microsoft JhengHei, which runs a few percent wider or narrower.
test('textWidth estimate stays within 0.95–1.20× of Microsoft JhengHei', { skip: !hasJhengHei() && 'Office fonts not found' }, () => {
  for (const s of samples) {
    const ratio = textWidth(s, 24) / measureText(s, 24, 'Microsoft JhengHei');
    assert.ok(ratio >= 0.95 && ratio <= 1.2, `${s}: ${ratio.toFixed(3)}`);
  }
});
