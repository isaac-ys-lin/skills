import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { build, validateStory } from '../scripts/pptx.js';

const story = (type, visual, extra = {}) => ({ pages: [{ type, claim: '稿', sources: { source: '稿' }, visual, ...extra }] });
async function slideText(input) {
  const { buffer } = await build(input);
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('ppt/slides/slide1.xml').async('string');
  return [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
}

test('compare renders the supplied numeric zero in PPTX XML', async () => {
  const text = await slideText(story('compare', { rows: ['值'], options: [{ name: '甲', values: [0] }] }));
  assert.deepEqual(text, ['稿', '資料來源：稿', '1 / 1', '甲', '值', '0']);
});

test('compare shows explicit null as missing and leaves empty strings blank', async () => {
  const text = await slideText(story('compare', {
    rows: ['零', '負零', '文字零', '正值', '負值', '缺值', '空字串'],
    options: [{ name: '甲', values: [0, -0, '0', 1, -1, null, ''] }],
  }));
  assert.ok(text.includes('未提供：甲／缺值'));
  assert.deepEqual(text.slice(5), ['零', '0', '負零', '0', '文字零', '0', '正值', '1', '負值', '−1', '缺值', '未提供', '空字串']);
});

test('numbers keeps zero visible and distinguishes it from a missing value', async () => {
  const text = await slideText(story('numbers', { items: [{ label: '值', value: 0, prev: 0, better: 'higher' }, { label: '缺值', value: null }] }));
  assert.equal(text.filter((value) => value === '0').length, 1);
  assert.ok(text.includes('未提供：缺值'));
  assert.ok(!text.includes('未提供：值'));
});

for (const [type, visual, field] of [
  ['close', { rows: [{ task: '0', owner: '0', due: '0' }] }, 'task'],
  ['steps', { start: '2026-01', end: '2026-01', phases: [{ name: '0', note: '0', from: '2026-01', to: '2026-01' }] }, 'name'],
]) test(`${type} preserves zero text and rejects numeric text fields before rendering`, async () => {
  const input = story(type, visual);
  const text = await slideText(input);
  assert.equal(text.filter((value) => value === '0').length, type === 'close' ? 3 : 2);
  const row = type === 'close' ? input.pages[0].visual.rows[0] : input.pages[0].visual.phases[0];
  row[field] = 0;
  assert.throws(() => validateStory(input), /改成文字字串|填入非空白文字/);
});

test('evidence table cells and metric preserve numeric zero', async () => {
  const text = await slideText(story('evidence', {
    kind: 'table', columns: [{ name: '項目', type: 'text' }, { name: '值', type: 'number' }], rows: [['觀察', 0], ['缺值', null]],
  }, { metric: { value: 0 } }));
  assert.equal(text.filter((value) => value === '0').length, 2);
  assert.ok(text.includes('未提供：缺值／值'));
});
