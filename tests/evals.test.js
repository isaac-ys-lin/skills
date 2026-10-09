import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import JSZip from 'jszip';
import { check } from '../evals/check.mjs';

const sources = { source: '虛構測試文字稿' };
const story = (visual, extra = {}) => ({ title: '驗收測試', pages: [{
  type: 'evidence', claim: '甲的需求較高', sources, visual, ...extra,
}] });
const rank = (value) => ({ kind: 'rank', rows: [{ label: '甲', value }] });
const example = JSON.parse(readFileSync(new URL('../examples/story.json', import.meta.url), 'utf8'));
const script = readFileSync(new URL('../evals/fixtures/example-script.md', import.meta.url), 'utf8');

test('範例 story 與手寫稿可驗收並產生八頁 PowerPoint', async () => {
  const result = await check(example, script);
  assert.equal(result.pages, 8);
  assert.deepEqual(result.warnings, []);
  const zip = await JSZip.loadAsync(result.buffer);
  assert.equal(Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).length, 8);
});

test('CLI 可直接使用範例與 fixture，並回報建檔成功', () => {
  const run = spawnSync(process.execPath, ['evals/check.mjs', 'examples/story.json', 'evals/fixtures/example-script.md'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /通過.*8.*PowerPoint/);
});

test('缺 claim、來源或不合法的 visual 都有頁碼與修法', async () => {
  for (const [input, message] of [
    [null, /story/],
    [{ pages: [] }, /pages/],
    [story(rank(12), { claim: ' ' }), /第 1 頁.*claim/],
    [story(rank(12), { sources: {} }), /第 1 頁.*sources.source/],
    [story(rank(12), { type: 'typo' }), /第 1 頁.*type/],
    [story({ kind: 'rank', rows: '錯誤' }), /第 1 頁.*visual/],
  ]) await assert.rejects(check(input, '甲有 12 件。'), message);
});

test('visual 的巢狀數字與數字字串須有原稿依據', async () => {
  await assert.rejects(check(story(rank(99)), '甲有 12 件。'), /visual.rows\[0\].value.*99/);
  await assert.rejects(check(story({ items: [{ label: '甲', value: 'NT$ 9,999' }] }, { type: 'numbers' }), '甲有 12 件。'), /visual.items\[0\].value.*9,999/);
  await assert.rejects(check(story({ kind: 'line', x: ['前期', '本期'], series: [{ name: '甲', values: [12, 99] }] }), '甲有 12 件。'), /visual.series\[0\].values\[1\]/);
  await assert.rejects(check(story(rank(0)), '甲有 10 件。'), /value.*0/);
  await assert.rejects(check(story(rank(1e-101)), '甲有 0 件。'), /value/);
  await assert.rejects(check(story(rank(-12)), '甲有 12 件。'), /value/);
});

test('每個畫面文字欄位的數字都須有原稿依據', async () => {
  for (const field of ['claim', 'kicker', 'note']) {
    await assert.rejects(check(story(rank(12), { [field]: '共有 999 件' }), '甲有 12 件。'), new RegExp(`第 1 頁 ${field}.*999`));
  }
  for (const field of ['value', 'label', 'unit']) {
    const metric = { value: 12, label: '數量', unit: '件', [field]: field === 'value' ? 999 : '共 999 件' };
    await assert.rejects(check(story(rank(12), { metric }), '甲有 12 件。'), new RegExp(`第 1 頁 metric\\.${field}.*999`));
  }
  for (const field of ['title', 'date']) {
    await assert.rejects(check({ ...story(rank(12)), [field]: '2029 年' }, '甲有 12 件。'), new RegExp(`根層 ${field}.*2029`));
  }
});

test('畫面文字可用原稿數字與同頁合法加減結果，講稿本身不當成數字來源', async () => {
  const input = story(rank(12), {
    claim: '合計 20 件', kicker: '合計 20 件', note: '合計 20 件',
    metric: { value: 20, label: '共 20 件', unit: '20 件' },
    notes: '計算：12 + 8 = 20',
  });
  await check({ ...input, title: '2026 年需求', date: '2026 年' }, '2026 年甲有 12 件、乙有 8 件。');
  await check(story(rank(12), { metric: { value: 20 }, sources: { ...sources, more: ['算法：12 + 8 = 20'] } }), '甲有 12 件、乙有 8 件。');
  await assert.rejects(check(story(rank(12), { metric: { value: 999 }, notes: '共有 999 件' }), '甲有 12 件。'), /metric\.value.*999/);
  await assert.rejects(check(story(rank(12), { claim: '共有 999 件', sources: { ...sources, more: ['共有 999 件'] } }), '甲有 12 件。'), /claim.*999/);
  const otherPage = story(rank(12), { metric: { value: 20 } });
  otherPage.pages.push({ type: 'statement', claim: '另一頁說明', sources, notes: '計算：12 + 8 = 20' });
  await assert.rejects(check(otherPage, '甲有 12 件、乙有 8 件。'), /第 1 頁 metric\.value.*20/);
  await assert.rejects(check({ ...input, title: '合計 20 件' }, '甲有 12 件、乙有 8 件。'), /根層 title.*20/);
});

test('圖表自動計算比例可通過，畫面填入比例仍須可核對', async () => {
  const input = story({ kind: 'funnel', steps: [{ label: '送出', value: 1800 }, { label: '確認', value: 1260 }] });
  await check(input, '送出 1,800 人、確認 1,260 人。');
  input.pages[0].metric = { value: '70%', label: '轉換率' };
  input.pages[0].notes = '轉換率以完成確認人數除以送出人數，即 1,260 除以 1,800。';
  await assert.rejects(check(input, '送出 1,800 人、確認 1,260 人。'), /metric\.value.*70%/);
  await check(input, '送出 1,800 人、確認 1,260 人，轉換率 70%。');
  input.pages[0].notes = '計算：1260 / 1800 = 70%';
  await assert.rejects(check(input, '送出 1,800 人、確認 1,260 人。'), /算式.*加減/);
});

test('千分位、全形、百分比與小數比例可對照，digits 不當成資料', async () => {
  for (const [value, source] of [[1200, '１，２００'], [0.32, '32 %'], [32, '３２％'], [-12, '−12']]) {
    await check(story({ ...rank(value), digits: 2 }), `甲：${source}。`);
  }
  await check(story({ items: [{ label: '甲', value: '32%' }] }, { type: 'numbers' }), '甲的比例為 0.32。');
  await check(story({ kind: 'rank', rows: [{ label: '甲', value: 0 }, { label: '乙', value: null }] }), '甲有 0 件；乙未提供。');
});

test('省略整數部的小數仍要查證，百分比不接受百倍差異', async () => {
  for (const value of ['.999', '-.5', '1e999', '1e-999']) {
    await assert.rejects(check(story({ items: [{ label: '甲', value }] }, { type: 'numbers' }), '原稿只有文字，沒有數據。'), /visual.items\[0\].value/);
  }
  await check(story(rank(0.5)), '甲為 .5。');
  await assert.rejects(check(story({ items: [{ label: '甲', value: '100%' }] }, { type: 'numbers' }), '甲的比例為 1%。'), /value.*100%/);
  await assert.rejects(check(story({ items: [{ label: '甲', value: '1%' }] }, { type: 'numbers' }), '甲的比例為 100%。'), /value.*1%/);
  await assert.rejects(check(story(rank(0)), '甲為 1e-999。'), /原稿.*數字|表示/);
});

test('合計與差額須有當頁算式且運算元可回到原稿', async () => {
  await check(story(rank(2000), { notes: '合計，計算：1,200 + 800 = 2,000' }), '甲 1,200，乙 800。');
  await check(story(rank(-400), { sources: { ...sources, more: ['差額，計算：800 − 1,200 = −400'] } }), '甲 1,200，乙 800。');
  await check(story(rank(0.3), { notes: ['計算：0.1 + 0.2 = 0.3'] }), '甲 0.1，乙 0.2。');
  await assert.rejects(check(story(rank(2000), { notes: '這是計算所得的 2,000。' }), '甲 1,200，乙 800。'), /找不到.*2,000|2000/);
  await assert.rejects(check(story(rank(2000), { notes: '計算：1,200 + 800 = 2,100' }), '甲 1,200，乙 800。'), /算式.*不符/);
  await assert.rejects(check(story(rank(2000), { notes: '計算：1,999 + 1 = 2,000' }), '甲 1,200，乙 800。'), /算式.*原稿/);
  const input = story(rank(2000));
  input.pages.push({ type: 'statement', claim: '備註在其他頁', sources, notes: '計算：1,200 + 800 = 2,000' });
  await assert.rejects(check(input, '甲 1,200，乙 800。'), /第 1 頁/);
});

test('算式驗完整左式，不從不支援的運算截取尾段', async () => {
  await assert.rejects(check(story(rank(1), { notes: '計算：10 + -2 + 3 = 1' }), '甲10；乙-2；丙3。'), /算式.*不符/);
  await assert.rejects(check(story(rank(5), { notes: '計算：10 × 2 + 3 = 5' }), '甲10；乙2；丙3。'), /算式.*加減/);
  await check(story(rank(17), { notes: '計算：5 - -12 = 17' }), '甲5；乙-12。');
  await check(story(rank(0.0003), { notes: '計算：1e-4 + 2e-4 = 3e-4' }), '甲1e-4；乙2e-4。');
  await check(story(rank(25), { notes: '計算：30% - 5% = 25%' }), '甲30%；乙5%。');
});

test('無數字稿允許文字版型與文字表格，拒絕量化圖表', async () => {
  const script = '先確認需求，再交接處理；服務窗口接收，承辦單位追蹤。';
  const input = { title: '交接流程', pages: [
    { type: 'statement', claim: '先確認需求，再交接處理', sources },
    { type: 'close', claim: '服務窗口接收後交承辦追蹤', sources, visual: { rows: [{ task: '確認需求', owner: '服務窗口', due: '交接前' }] } },
  ] };
  await check(input, script);
  await check(story({ kind: 'table', columns: [{ name: '工作' }], rows: [['確認需求']] }), script);
  await assert.rejects(check(story(rank(12), { notes: '計算：6 + 6 = 12' }), script), /沒有.*數字.*圖表/);
  await assert.rejects(check(story({ kind: 'matrix', points: [{ label: '甲', x: 1, y: 2 }] }), script), /沒有.*數字.*圖表/);
});

test('警告照常通過、保留訊息供看圖判斷', async () => {
  const { warnings } = await check(story({ ...rank(12), focus: '不存在' }), '甲 12 件。');
  assert.ok(warnings.some((w) => w.includes('focus')));
});
