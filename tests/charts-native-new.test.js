import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { build } from '../scripts/pptx.js';

const pages = (visuals) => ({ pages: visuals.map((visual) => ({
  type: 'evidence', claim: '核對圖表', sources: { source: '虛構測試資料' }, visual,
})) });
const charts = (zip) => Object.keys(zip.files).filter((name) => /^ppt\/charts\/chart\d+\.xml$/.test(name)).sort();
const book = async (zip, number) => {
  const rels = await zip.file(`ppt/charts/_rels/chart${number}.xml.rels`).async('string');
  const name = rels.match(/Target="\.\.\/embeddings\/([^"/]+\.xlsx)"/)?.[1];
  assert.ok(name);
  return JSZip.loadAsync(await zip.file(`ppt/embeddings/${name}`).async('nodebuffer'));
};

test('新增三種原生圖保留 0、缺值、負值與可編輯資料', async () => {
  const visuals = [
    { kind: 'grouped', x: ['甲', '乙'], series: [
      { name: '上期', values: [0, null] }, { name: '本期', values: [-3, 0] },
    ] },
    { kind: 'sharetrend', categories: ['甲', '乙'], rows: [
      { label: '上期', values: [0, 4] }, { label: '本期', values: [1, 3] },
    ] },
    { kind: 'ordered', rows: [
      { label: '低', value: 1 }, { label: '中', value: 0 }, { label: '高', value: null }, { label: '極高', value: 2 },
    ] },
  ];
  const zip = await JSZip.loadAsync((await build(pages(visuals))).buffer);
  assert.equal(charts(zip).length, 3);
  const grouped = await zip.file(charts(zip)[0]).async('string');
  assert.match(grouped, /<c:grouping val="clustered"\/>/);
  assert.match(grouped, /<c:barDir val="col"\/>/);
  assert.match(grouped, /<c:v>-3<\/c:v>/);
  assert.match(grouped, /<c:v>0<\/c:v>/);
  assert.match(await zip.file('ppt/slides/slide1.xml').async('string'), /未提供：上期／乙/);
  const groupedSheet = await (await book(zip, 1)).file('xl/worksheets/sheet1.xml').async('string');
  assert.match(groupedSheet, /<c r="B2"><v>0<\/v><\/c>/);
  assert.doesNotMatch(groupedSheet, /<c r="B3"/);

  const sharetrend = await zip.file(charts(zip)[1]).async('string');
  assert.match(sharetrend, /<c:grouping val="percentStacked"\/>/);
  assert.match(sharetrend, /<c:barDir val="col"\/>/);
  assert.match(sharetrend, /<c:f>Sheet1!\$[A-Z]+\$2:\$[A-Z]+\$3<\/c:f>/);
  const shareBook = await book(zip, 2);
  const shareSheet = await shareBook.file('xl/worksheets/sheet1.xml').async('string');
  assert.match(shareSheet, /<c r="B2"><v>0<\/v><\/c>/);
  assert.match(shareSheet, /<f>IFERROR\(B2\/SUM\(\$B2:\$C2\),0\)<\/f>/);

  const ordered = await zip.file(charts(zip)[2]).async('string');
  assert.match(ordered, /<c:barDir val="col"\/>/);
  assert.match(ordered, /<c:v>1<\/c:v>/);
  assert.match(ordered, /<c:v>0<\/c:v>/);
  assert.match(await zip.file('ppt/slides/slide3.xml').async('string'), /未提供：高/);
  for (const raw of [grouped, sharetrend, ordered]) {
    assert.match(raw, /zh-TW/);
    assert.match(raw, /<c:dLbl>/);
  }
});

test('新增原生圖的極小非零值改用 SVG', async () => {
  const visuals = [
    { kind: 'grouped', x: ['甲', '乙'], series: [
      { name: '上期', values: [1e-101, 1] }, { name: '本期', values: [2, 3] },
    ] },
    { kind: 'sharetrend', categories: ['甲', '乙'], rows: [
      { label: '上期', values: [1e-101, 1] }, { label: '本期', values: [1, 1] },
    ] },
    { kind: 'ordered', rows: [{ label: '低', value: 1e-101 }, { label: '高', value: 1 }] },
  ];
  const { buffer, warnings } = await build(pages(visuals));
  const zip = await JSZip.loadAsync(buffer);
  assert.equal(charts(zip).length, 0);
  assert.equal(warnings.filter((warning) => warning.includes('改用 SVG')).length, 3);
});
