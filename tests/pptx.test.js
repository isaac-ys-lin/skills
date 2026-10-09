import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { build, validateStory } from '../scripts/pptx.js';
import { T, C, SLIDE_FONT, prepare, textOn, decimalsOf } from '../scripts/core.js';

const example = (kind) => JSON.parse(readFileSync(`examples/${kind}.json`, 'utf8'));

test('story validation names the page, JSON path, and repair for malformed input', () => {
  const cases = [
    [null, 'story'], [{ pages: [] }, 'pages'], [{ pages: [null] }, 'pages[0]'],
    [{ pages: [{ type: 'constructor', claim: '判斷' }] }, 'pages[0].type'],
    [{ pages: [{ type: 'statement', claim: ' ' }] }, 'pages[0].claim'],
    [{ pages: [{ type: 'evidence', claim: '判斷' }] }, 'pages[0].visual'],
    [{ pages: [{ type: 'evidence', claim: '判斷', visual: { kind: 'line', series: [null] } }] }, 'pages[0].visual'],
    [{ pages: [{ type: 'evidence', claim: '判斷', visual: { kind: 'constructor' } }] }, 'pages[0].visual.kind'],
    [{ pages: [{ type: 'statement', claim: '判斷', visual: { kind: 'line', series: '錯誤' } }] }, 'pages[0].visual'],
    [{ pages: [{ type: 'numbers', claim: '判斷', visual: { items: [{ label: '甲', value: {} }] } }] }, 'pages[0].visual.items[0].value'],
    [{ pages: [{ type: 'numbers', claim: '判斷', visual: { items: [] } }] }, 'pages[0].visual.items'],
    [{ pages: [{ type: 'compare', claim: '判斷', visual: { rows: ['成本'], options: [{ name: '甲', values: [] }] } }] }, 'pages[0].visual.options[0].values'],
    [{ pages: [{ type: 'steps', claim: '判斷', visual: { start: '2026-13', end: '2026-12', phases: [] } }] }, 'pages[0].visual.start'],
    [{ pages: [{ type: 'close', claim: '判斷', visual: { rows: [null] } }] }, 'pages[0].visual.rows[0]'],
    [{ pages: [{ type: 'statement', claim: '判斷', sources: { more: '補充' } }] }, 'pages[0].sources.more'],
  ];
  for (const [story, path] of cases) assert.throws(() => validateStory(story), (err) => {
    assert.ok(err.message.includes(path), err.message);
    assert.match(err.message, /請/);
    if (path.startsWith('pages[')) assert.match(err.message, /第 1 頁/);
    return true;
  });
});

test('build validates before collecting chart categories', async () => {
  await assert.rejects(build({ pages: [{ type: 'evidence', claim: '判斷', visual: { kind: 'line', series: [null] } }] }), /第 1 頁.*pages\[0\]\.visual.*請/);
});

test('story validation accepts examples and rejects unsafe dates and visual settings', () => {
  const valid = example('story'), before = structuredClone(valid);
  assert.doesNotThrow(() => validateStory(valid));
  assert.deepEqual(valid, before, 'validation leaves authored content untouched');
  const changes = [
    ['numbers', (p) => { p.visual.items[0].digits = -1; }, /items\[0\]\.digits/],
    ['steps', (p) => { p.visual.end = '2025-12'; }, /visual\.end/],
    ['steps', (p) => { p.visual.phases[0].to = '2027-01'; }, /phases\[0\]\.to/],
    ['evidence', (p) => { p.visual.native = 'false'; }, /visual\.native/],
    ['evidence', (p) => { p.visual = { kind: 'matrix', domain: [0, 0], points: [{ label: '甲', x: 1, y: 2 }] }; }, /visual\.domain/],
  ];
  for (const [type, change, error] of changes) {
    const story = example('story'), page = story.pages.find((p) => p.type === type);
    change(page);
    assert.throws(() => validateStory(story), error);
  }
});

test('empty visual cells and metric omit their blocks while missing numbers remain in sources', async () => {
  const pages = [
    { type: 'numbers', claim: '觀察與缺值', visual: { items: [{}, { label: '甲', value: 0 }, { label: '乙', value: null }] } },
    { type: 'compare', claim: '比較', visual: { rows: ['條件'], options: [{}, { name: '甲', values: ['可行'] }, { name: '乙', values: ['待確認'] }] } },
    { type: 'close', claim: '下一步', visual: { rows: [{}, { task: '提出草案' }] } },
    { type: 'evidence', claim: '觀察', visual: visuals[0], metric: {} },
  ];
  const omitted = structuredClone(pages);
  omitted[0].visual.items.shift();
  omitted[1].visual.options.shift();
  omitted[2].visual.rows.shift();
  delete omitted[3].metric;
  const a = await deck(pages), b = await deck(omitted);
  for (let n = 1; n <= pages.length; n++) assert.equal(await a.zip.file(`ppt/slides/slide${n}.xml`).async('string'), await b.zip.file(`ppt/slides/slide${n}.xml`).async('string'));
  const numbers = textOf(await xml(a.zip, 'ppt/slides/slide1.xml'));
  assert.ok(numbers.includes('未提供：乙'));
  assert.ok(numbers.includes('0'));
  assert.doesNotMatch(textOf(await xml(a.zip, 'ppt/slides/slide3.xml')), /負責人|期限/);
  assert.deepEqual(a.warnings, []);
});

test('renderable numbers and comparison counts are warnings rather than blockers', async () => {
  const { buffer, warnings } = await deck([
    { type: 'numbers', claim: '觀察', visual: { items: [{ label: '甲', value: 1 }] }, notes: ['講稿甲', '講稿乙'] },
    { type: 'compare', claim: '比較', visual: { rows: ['條件'], options: [{ name: '甲', values: ['可行'] }] } },
  ]);
  assert.ok(buffer.length);
  assert.ok(warnings.some((w) => /第 1 頁.*2～4/.test(w)));
  assert.ok(warnings.some((w) => /第 2 頁.*2～3/.test(w)));
});

test('a numeric zero in an evidence metric remains visible', async () => {
  const { zip } = await deck([{ type: 'evidence', claim: '觀察', visual: visuals[0], metric: { label: '新增件數', value: 0 } }]);
  assert.ok(nodes(await xml(zip, 'ppt/slides/slide1.xml'), 'a:t').some((node) => textOf(node) === '0'));
});
const hex = (color) => color.replace('#', '').toUpperCase();
const decode = (s) => s.replace(/&(?:#x([\da-f]+)|#(\d+)|(amp|lt|gt|quot|apos));/gi, (_, h, d, n) => h || d ? String.fromCodePoint(parseInt(h ?? d, h ? 16 : 10)) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[n]);

// A small structural parser: reject mismatched tags and invalid attributes without another dependency.
function parseXml(xml) {
  const root = { name: '#document', attrs: {}, children: [], text: '' }, stack = [root];
  const tokens = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[\w:.-]+(?:[^<>"']|"[^"]*"|'[^']*')*>/g;
  let at = 0;
  const append = (text) => {
    assert.ok(!text.includes('<'), 'unparsed XML markup');
    assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-f]+;)/i.test(text), 'unescaped XML entity');
    stack.at(-1).text += decode(text);
  };
  for (const match of xml.matchAll(tokens)) {
    append(xml.slice(at, match.index));
    const tag = match[0];
    at = match.index + tag.length;
    if (tag.startsWith('<?') || tag.startsWith('<!--')) continue;
    if (tag.startsWith('<![CDATA[')) { stack.at(-1).text += tag.slice(9, -3); continue; }
    if (tag.startsWith('</')) {
      assert.ok(stack.length > 1, `unexpected closing tag ${tag}`);
      assert.equal(stack.pop().name, tag.slice(2, -1).trim(), `unpaired tag ${tag}`);
      continue;
    }
    const name = tag.match(/^<([\w:.-]+)/)[1], attrs = {};
    let rest = tag.slice(name.length + 1).replace(/\/?\s*>$/, '');
    while (rest.trim()) {
      const attr = rest.match(/^\s+([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/);
      assert.ok(attr, `invalid attributes in ${tag}`);
      assert.ok(!(attr[1] in attrs), `duplicate attribute ${attr[1]}`);
      attrs[attr[1]] = decode(attr[2] ?? attr[3]);
      rest = rest.slice(attr[0].length);
    }
    const node = { name, attrs, children: [], text: '' };
    stack.at(-1).children.push(node);
    if (!tag.endsWith('/>')) stack.push(node);
  }
  append(xml.slice(at));
  assert.equal(stack.length, 1, 'unclosed XML tag');
  assert.equal(root.children.length, 1, 'XML must have one root');
  assert.equal(root.text.trim(), '', 'text outside XML root');
  return root.children[0];
}

const children = (node, name) => node.children.filter((n) => n.name === name);
const nodes = (node, name) => node.children.flatMap((n) => [...(n.name === name ? [n] : []), ...nodes(n, name)]);
const one = (node, name) => { const found = nodes(node, name); assert.ok(found.length, `missing ${name}`); return found[0]; };
const textOf = (node) => node.text + node.children.map(textOf).join('');
const value = (node, name) => one(node, name).attrs.val;
const xml = async (zip, name) => { assert.ok(zip.file(name), `missing ${name}`); return parseXml(await zip.file(name).async('string')); };
const files = (zip, re) => Object.keys(zip.files).filter((name) => re.test(name));
const partTarget = (part, target) => target.startsWith('/') ? target.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(part), target));
const relsPath = (part) => path.posix.join(path.posix.dirname(part), '_rels', `${path.posix.basename(part)}.rels`);
async function related(zip, part, id) {
  const all = nodes(await xml(zip, relsPath(part)), 'Relationship');
  const found = all.find((r) => r.attrs.Id === id);
  assert.ok(found, `${part}: missing ${id}`);
  return partTarget(part, found.attrs.Target);
}
async function chartAt(zip, n) {
  const slide = `ppt/slides/slide${n}.xml`, ref = one(await xml(zip, slide), 'c:chart');
  const name = await related(zip, slide, ref.attrs['r:id']);
  return { name, root: await xml(zip, name) };
}
async function workbook(zip, chart) {
  const ref = one(chart.root, 'c:externalData');
  const name = await related(zip, chart.name, ref.attrs['r:id']);
  assert.match(name, /^ppt\/embeddings\/.*\.xlsx$/);
  return JSZip.loadAsync(await zip.file(name).async('nodebuffer'));
}
const evidence = (visual) => ({ type: 'evidence', claim: '資料比較', visual });
const deck = async (pages, extra = {}) => { const result = await build({ title: '測試簡報', pages, ...extra }); return { ...result, zip: await JSZip.loadAsync(result.buffer) }; };

const visuals = [
  { kind: 'rank', focus: '甲', rows: [{ label: '甲', value: 30 }, { label: '乙', value: 20 }, { label: '丙', value: 10 }] },
  { kind: 'line', focus: '主線', digits: 1, x: ['一月', '二月', '三月', '四月'], series: [{ name: '主線', values: [1.2, 6.4, null, 4.1] }, { name: '副線', values: [2.3, 3.5, 4.6, null] }] },
  { kind: 'slope', periods: ['前期', '本期'], rows: [{ label: '甲', values: [10, 12] }, { label: '乙', values: [8, 9] }] },
  { kind: 'share', categories: ['甲', '乙', '其他'], rows: [{ label: '北區', values: [12, 8, 5] }, { label: '南區', values: [3, 6, 21] }] },
  { kind: 'scatter', focus: '甲', points: [{ label: '甲', x: 1, y: 8 }, { label: '乙', x: 5, y: 2 }, { label: '丙', x: 9, y: 6 }] },
  example('table'),
];
let nativePromise, storyPromise, svgPromise;
const nativeDeck = () => nativePromise ??= deck(visuals.map(evidence), { author: '測試作者' });
const storyDeck = () => storyPromise ??= (async () => { const story = example('story'); const result = await build(story); return { ...result, zip: await JSZip.loadAsync(result.buffer), story }; })();
const svgKinds = ['multiples', 'bridge', 'histogram', 'strip', 'matrix', 'dumbbell', 'funnel', 'heat'];
const svgDeck = () => svgPromise ??= deck(svgKinds.map((kind) => evidence(example(kind))));
const tokenColors = new Set();
(function collect(v) {
  if (typeof v === 'string' && /^#[\da-f]{6}$/i.test(v)) tokenColors.add(hex(v));
  else if (v && typeof v === 'object') for (const [key, entry] of Object.entries(v)) { collect(key); collect(entry); }
})(T);

function checkColors(root, name) {
  for (const color of nodes(root, 'a:srgbClr')) assert.ok(tokenColors.has(color.attrs.val.toUpperCase()), `${name}: non-token color ${color.attrs.val}`);
}
function checkText(root, name) {
  for (const tag of ['a:rPr', 'a:defRPr', 'a:endParaRPr']) for (const r of nodes(root, tag)) {
    if (r.attrs.sz) assert.ok(Number(r.attrs.sz) >= T.type.minimum / T.slide.pxPerPt * 100, `${name}: font size ${r.attrs.sz}`);
  }
  for (const tag of ['a:latin', 'a:ea']) for (const font of nodes(root, tag)) assert.equal(font.attrs.typeface, SLIDE_FONT, `${name}: ${tag}`);
}
const enabled = (node, name) => nodes(node, name).some((n) => n.attrs.val === '1');
const labelIndex = (label) => Number(value(label, 'c:idx'));
const cacheValues = (node) => nodes(node, 'c:pt').map((p) => ({ index: Number(p.attrs.idx), value: textOf(one(p, 'c:v')) }));
const formatDigits = (format) => (format.split(';')[0].match(/\.(0+)/)?.[1] ?? '').length;
const cellValue = (cells, ref) => { const cell = cells.find((c) => c.attrs.r === ref); assert.ok(cell, `missing numeric cell ${ref}`); return textOf(one(cell, 'v')); };

// These checks validate the parser too, so malformed generated XML cannot pass an empty regex scan.
test('PPTX XML parser rejects broken tags and preserves escaped text', () => {
  assert.equal(textOf(parseXml('<?xml version="1.0"?><r a="x&amp;y"><p/>甲&amp;乙</r>')), '甲&乙');
  for (const bad of ['<a><b></a>', '<a>', '<a/><b/>', '<a b=x/>', '<a>&oops;</a>']) assert.throws(() => parseXml(bad));
});

test('story: eight pages, page numbers, no warnings, and empty author metadata', async () => {
  const { zip, story, warnings } = await storyDeck();
  assert.deepEqual(warnings, []);
  assert.equal(files(zip, /^ppt\/slides\/slide\d+\.xml$/).length, story.pages.length);
  for (let n = 1; n <= story.pages.length; n++) assert.ok(textOf(await xml(zip, `ppt/slides/slide${n}.xml`)).includes(`${n} / ${story.pages.length}`));
  const core = await xml(zip, 'docProps/core.xml');
  assert.equal(textOf(one(core, 'dc:creator')), '');
  assert.equal(textOf(one(core, 'cp:lastModifiedBy')), '');
  assert.equal(textOf(one(await xml(zip, 'docProps/app.xml'), 'Company')), '');
});

test('所有版型、表格、原生圖與段落末尾都使用繁體中文換行語言', async () => {
  const seen = new Set();
  for (const { zip } of await Promise.all([storyDeck(), nativeDeck(), svgDeck()])) {
    for (const name of files(zip, /^ppt\/.*\.xml$/)) {
      const source = await zip.file(name).async('string');
      assert.doesNotMatch(source, /\blang="en-US"/, name);
      const root = parseXml(source);
      for (const tag of ['a:rPr', 'a:defRPr', 'a:endParaRPr']) for (const props of nodes(root, tag)) {
        seen.add(tag);
        assert.equal(props.attrs.lang, 'zh-TW', `${name}: ${tag}`);
      }
      for (const lang of nodes(root, 'c:lang')) assert.equal(lang.attrs.val, 'zh-TW', name);
    }
  }
  assert.deepEqual([...seen].sort(), ['a:defRPr', 'a:endParaRPr', 'a:rPr']);
});

test('所有版型的 claim 保留指定斷點並依行數配置標題高度', async () => {
  const pages = example('story').pages.map((page) => ({ ...page, claim: '交接重新\n確認後開始', ...(page.type === 'statement' ? { focus: '重新\n確認' } : {}) }));
  const single = pages.map((page) => ({ ...page, claim: '交接重新確認後開始', ...(page.type === 'statement' ? { focus: '重新確認' } : {}) }));
  const a = await deck(pages), b = await deck(single);
  for (const [i, page] of pages.entries()) {
    const shape = async (zip) => nodes(await xml(zip, `ppt/slides/slide${i + 1}.xml`), 'p:sp')
      .find((node) => textOf(node) === '交接重新確認後開始');
    const multiline = await shape(a.zip), oneline = await shape(b.zip);
    assert.ok(multiline && oneline, page.type);
    assert.deepEqual(nodes(one(multiline, 'p:txBody'), 'a:p').map(textOf), ['交接重新', '確認後開始'], page.type);
    const height = (node) => Number(one(one(node, 'a:xfrm'), 'a:ext').attrs.cy);
    assert.equal(height(multiline), height(oneline) * 2, `${page.type}: 兩行高度`);
    if (['cover', 'section', 'statement'].includes(page.type) && page.note) {
      const note = nodes(await xml(a.zip, `ppt/slides/slide${i + 1}.xml`), 'p:sp').find((node) => textOf(node) === page.note);
      const y = (node) => Number(one(one(node, 'a:xfrm'), 'a:off').attrs.y);
      assert.ok(y(note) > y(multiline) + height(multiline), `${page.type}: 副標在標題下方`);
    }
  }
});

test('一句話頁的強調片段在斷點前後或跨行都不增加換行', async () => {
  const claim = '交接重新\n確認後開始';
  const focuses = [undefined, '重新', '確認', '重新\n確認', '交接重新\n', '\n確認'];
  const { zip } = await deck(focuses.map((focus) => ({ type: 'statement', claim, focus })));
  for (const [i, focus] of focuses.entries()) {
    const shape = nodes(await xml(zip, `ppt/slides/slide${i + 1}.xml`), 'p:sp').find((node) => textOf(node) === claim.replaceAll('\n', ''));
    assert.ok(shape);
    assert.deepEqual(nodes(one(shape, 'p:txBody'), 'a:p').map(textOf), claim.split('\n'), focus);
    const highlighted = nodes(shape, 'a:r').filter((r) => nodes(r, 'a:srgbClr').some((c) => c.attrs.val === hex(C.focus))).map(textOf).join('');
    assert.equal(highlighted, (focus ?? '').replaceAll('\n', ''));
  }
});

test('empty optional fields omit their text boxes, including source units', async () => {
  const page = { type: 'cover', kicker: '單位名稱', claim: '主張', note: '備註內容', sources: { source: '來源內容', unit: '數值單位', period: '資料期間' } };
  const full = await deck([page]);
  const empty = await deck([{ ...page, kicker: '', note: '', sources: { ...page.sources, unit: '' } }]);
  const before = await xml(full.zip, 'ppt/slides/slide1.xml'), after = await xml(empty.zip, 'ppt/slides/slide1.xml');
  assert.equal(nodes(before, 'p:sp').length - nodes(after, 'p:sp').length, 3);
  for (const text of ['單位名稱', '備註內容', '數值單位', '單位：']) assert.ok(!textOf(after).includes(text));
  for (const text of ['主張', '來源內容', '資料期間', '1 / 1']) assert.ok(textOf(after).includes(text));
});

test('all native charts have embedded editable workbooks; table uses a native table', async () => {
  const { zip } = await nativeDeck();
  assert.equal(files(zip, /^ppt\/charts\/chart\d+\.xml$/).length, 5);
  assert.equal(files(zip, /^ppt\/embeddings\/.*\.xlsx$/).length, 5);
  const kinds = ['c:barChart', 'c:lineChart', 'c:lineChart', 'c:barChart', 'c:scatterChart'];
  for (let n = 1; n <= 5; n++) {
    const chart = await chartAt(zip, n);
    one(chart.root, kinds[n - 1]);
    const book = await workbook(zip, chart);
    assert.ok(files(book, /^xl\/worksheets\/sheet\d+\.xml$/).length);
  }
  const table = await xml(zip, 'ppt/slides/slide6.xml');
  one(table, 'a:tbl');
  assert.equal(nodes(table, 'c:chart').length, 0);
  assert.equal(files(zip, /^ppt\/media\/.*\.svg$/).length, 0);
});

test('all deck/chart/workbook XML is paired and metadata contains no PptxGenJS', async () => {
  for (const { zip } of [await nativeDeck(), await storyDeck()]) {
    for (const name of files(zip, /\.xml$/)) {
      const raw = await zip.file(name).async('string');
      assert.doesNotMatch(raw, /PptxGenJS/i, name);
      parseXml(raw);
    }
    for (const name of files(zip, /^ppt\/embeddings\/.*\.xlsx$/)) {
      const book = await JSZip.loadAsync(await zip.file(name).async('nodebuffer'));
      for (const part of files(book, /\.xml$/)) {
        const raw = await book.file(part).async('string');
        assert.doesNotMatch(raw, /PptxGenJS/i, `${name}: ${part}`);
        parseXml(raw);
      }
    }
  }
});

test('slide and chart text uses JhengHei, minimum 12 pt, and only token colors', async () => {
  for (const { zip } of [await nativeDeck(), await storyDeck()]) {
    for (const name of files(zip, /^ppt\/(?:slides\/slide|charts\/chart)\d+\.xml$/)) {
      const root = await xml(zip, name);
      checkText(root, name);
      checkColors(root, name);
    }
    const themeRaw = await zip.file('ppt/theme/theme1.xml').async('string');
    assert.doesNotMatch(themeRaw, /新細明體|PMingLiU/i);
    const theme = parseXml(themeRaw);
    for (const tag of ['a:majorFont', 'a:minorFont']) {
      const group = one(theme, tag);
      assert.equal(one(group, 'a:ea').attrs.typeface, SLIDE_FONT);
      assert.equal(nodes(group, 'a:font').find((f) => f.attrs.script === 'Hant')?.attrs.typeface, SLIDE_FONT);
    }
  }
});

test('rank: single series, reverse categories, external labels, one focus point and blue bold label', async () => {
  const { zip } = await nativeDeck(), { root } = await chartAt(zip, 1);
  const series = nodes(root, 'c:ser');
  assert.equal(series.length, 1);
  const points = children(series[0], 'c:dPt');
  assert.equal(points.length, visuals[0].rows.length);
  assert.equal(points.filter((p) => nodes(p, 'a:srgbClr').some((c) => c.attrs.val === hex(C.focus))).length, 1);
  assert.equal(value(one(root, 'c:catAx'), 'c:orientation'), 'maxMin');
  assert.ok(nodes(root, 'c:dLblPos').some((p) => p.attrs.val === 'outEnd'));
  const label = nodes(series[0], 'c:dLbl').find((l) => labelIndex(l) === 0);
  assert.ok(label);
  assert.ok(nodes(label, 'a:srgbClr').some((c) => c.attrs.val === hex(C.focus)));
  assert.ok([...nodes(label, 'a:defRPr'), ...nodes(label, 'a:rPr')].some((p) => p.attrs.b === '1'));
  assert.equal(nodes(label, 'c:tx').length, 0);
});

test('line: missing cache/workbook cells are absent and labels follow only tail/peak indices', async () => {
  const { zip } = await nativeDeck(), chart = await chartAt(zip, 2), series = nodes(chart.root, 'c:ser');
  const source = textOf(await xml(zip, 'ppt/slides/slide2.xml'));
  assert.ok(source.includes('未提供：主線／三月、副線／四月'));
  assert.equal(value(chart.root, 'c:dispBlanksAs'), 'gap');
  assert.equal(nodes(chart.root, 'c:legend').length, 0);
  for (let i = 0; i < series.length; i++) {
    const expected = visuals[1].series[i].values.flatMap((v, index) => v === null ? [] : [{ index, value: String(v) }]);
    assert.deepEqual(cacheValues(one(one(series[i], 'c:val'), 'c:numCache')), expected);
    const labels = nodes(series[i], 'c:dLbl');
    const visible = labels.filter((l) => enabled(l, 'c:showVal') || enabled(l, 'c:showSerName'));
    assert.deepEqual(visible.map(labelIndex).sort(), i === 0 ? [1, 3] : [2]);
    const tail = visible.find((l) => labelIndex(l) === (i === 0 ? 3 : 2));
    assert.ok(enabled(tail, 'c:showVal') && enabled(tail, 'c:showSerName'));
    assert.equal(nodes(series[i], 'c:dLbl').flatMap((l) => nodes(l, 'c:tx')).length, 0);
  }
  const book = await workbook(zip, chart), sheet = await xml(book, 'xl/worksheets/sheet1.xml');
  assert.ok(!nodes(sheet, 'c').some((c) => ['B4', 'C5'].includes(c.attrs.r)));
  for (const cell of nodes(sheet, 'c')) assert.ok(nodes(cell, 'v').every((v) => textOf(v).length), `empty cell ${cell.attrs.r}`);
  const model = prepare(visuals[1]), axis = one(chart.root, 'c:valAx');
  assert.equal(Number(value(axis, 'c:min')), model.axis.lo);
  assert.equal(nodes(axis, 'c:max').length, 0, 'maximum stays automatic after editing data');
  assert.equal(Number(value(axis, 'c:majorUnit')), model.axis.step);
  assert.equal(formatDigits(one(axis, 'c:numFmt').attrs.formatCode), decimalsOf(model.axis.ticks));
  for (const s of series) assert.ok(nodes(s, 'c:numFmt').some((f) => formatDigits(f.attrs.formatCode) === model.digits));
});

test('slope: gray series, ordered point markers, dynamic endpoint labels in OOXML order', async () => {
  const { zip } = await nativeDeck(), { root } = await chartAt(zip, 3);
  for (const series of nodes(root, 'c:ser')) {
    const line = one(one(series, 'c:spPr'), 'a:ln');
    assert.equal(one(line, 'a:srgbClr').attrs.val, hex(C.gray));
    const points = children(series, 'c:dPt');
    assert.equal(points.length, 2);
    for (const point of points) {
      const i = Number(value(point, 'c:idx'));
      assert.equal(one(one(point, 'c:marker'), 'a:srgbClr').attrs.val, hex(i ? C.ordered.at(-1) : C.ordered[0]));
    }
    const names = series.children.map((n) => n.name);
    assert.ok(names.indexOf('c:dPt') > names.indexOf('c:marker'));
    assert.ok(names.lastIndexOf('c:dPt') < names.indexOf('c:cat'));
    const labels = nodes(series, 'c:dLbl');
    for (const label of labels) {
      assert.equal(nodes(label, 'c:tx').length, 0);
      assert.ok(enabled(label, 'c:showVal'));
      assert.equal(enabled(label, 'c:showSerName'), labelIndex(label) === 0);
      const order = ['c:idx', 'c:numFmt', 'c:spPr', 'c:txPr', 'c:dLblPos', 'c:showLegendKey', 'c:showVal', 'c:showCatName', 'c:showSerName', 'c:showPercent', 'c:showBubbleSize', 'c:separator'];
      const actual = label.children.map((c) => order.indexOf(c.name));
      assert.ok(actual.every((n) => n >= 0));
      assert.deepEqual(actual, [...actual].sort((a, b) => a - b));
    }
  }
});

test('share: percent stacking keeps raw data and dynamic percentage formulas with contrast labels', async () => {
  const { zip } = await nativeDeck(), chart = await chartAt(zip, 4), model = prepare(visuals[3]);
  assert.equal(value(chart.root, 'c:grouping'), 'percentStacked');
  assert.equal(value(chart.root, 'c:barDir'), 'bar');
  assert.equal(value(one(chart.root, 'c:catAx'), 'c:orientation'), 'maxMin');
  const series = nodes(chart.root, 'c:ser');
  const book = await workbook(zip, chart), sheet = await xml(book, 'xl/worksheets/sheet1.xml');
  const cells = nodes(sheet, 'c'), raw = cells.filter((c) => !nodes(c, 'f').length).flatMap((c) => nodes(c, 'v').map(textOf));
  for (const v of visuals[3].rows.flatMap((r) => r.values)) assert.ok(raw.includes(String(v)), `raw value ${v}`);
  assert.ok(cells.some((c) => nodes(c, 'f').some((f) => /SUM\(/i.test(textOf(f)))), 'percent values must recalculate from raw data');
  const cellAt = (ref) => { const c = cells.find((cell) => cell.attrs.r === ref.replaceAll('$', '')); assert.ok(c, `missing ${ref}`); return c; };
  const calc = one(await xml(book, 'xl/workbook.xml'), 'calcPr');
  assert.equal(calc.attrs.fullCalcOnLoad, '1');
  for (let i = 0; i < series.length; i++) {
    const expected = model.categories[i].other ? T.fill.other.native.color : model.categories[i].color;
    assert.equal(one(one(series[i], 'c:spPr'), 'a:srgbClr').attrs.val, hex(expected));
    assert.ok(nodes(series[i], 'c:numFmt').some((f) => f.attrs.formatCode.includes('%')));
    assert.equal(nodes(series[i], 'c:dLbl').flatMap((l) => nodes(l, 'c:tx')).length, 0);
    const cached = cacheValues(one(one(series[i], 'c:val'), 'c:numCache'));
    for (let row = 0; row < cached.length; row++) assert.ok(Math.abs(Number(cached[row].value) - model.rows[row].segments[i].share) < 1e-12);
    const range = textOf(one(one(series[i], 'c:val'), 'c:f')).match(/!\$?([A-Z]+)\$?(\d+):\$?\1\$?(\d+)$/);
    assert.ok(range, 'chart references a worksheet column');
    for (let row = Number(range[2]); row <= Number(range[3]); row++) {
      const cell = cellAt(`${range[1]}${row}`), formula = textOf(one(cell, 'f'));
      const numerator = formula.match(/IFERROR\((\$?[A-Z]+\$?\d+)\s*\/\s*SUM\(/i)?.[1];
      assert.ok(numerator, 'chart value must use a percentage formula');
      assert.equal(Number(textOf(one(cellAt(numerator), 'v'))), model.rows[row - Number(range[2])].segments[i].value);
      assert.equal(Number(textOf(one(cell, 'v'))), Number(cached[row - Number(range[2])].value));
    }
    const labels = one(series[i], 'c:dLbls');
    assert.ok(nodes(labels, 'a:srgbClr').some((c) => c.attrs.val === hex(textOn(expected))), 'label contrast follows textOn');
    assert.ok(enabled(labels, 'c:showVal'));
  }
});

test('scatter: point labels contain names as the explicit static-text exception', async () => {
  const { zip } = await nativeDeck(), { root } = await chartAt(zip, 5);
  const labels = nodes(root, 'c:dLbl');
  assert.equal(labels.length, visuals[4].points.length);
  assert.deepEqual(labels.map((l) => textOf(one(l, 'c:tx'))), visuals[4].points.map((p) => p.label));
});

test('native table maps model cells, emphasis, alignment, text sizes, and total rule', async () => {
  const { zip } = await nativeDeck(), root = await xml(zip, 'ppt/slides/slide6.xml');
  const rows = nodes(one(root, 'a:tbl'), 'a:tr'), model = prepare(visuals[5]);
  assert.equal(rows.length, model.rows.length + 1);
  for (let r = 0; r < rows.length; r++) {
    const cells = children(rows[r], 'a:tc'), source = r ? model.rows[r - 1].cells : model.header;
    assert.deepEqual(cells.map((c) => nodes(c, 'a:t').map(textOf).join('')), source.map((c) => c.text));
    for (let c = 0; c < cells.length; c++) {
      const expectedSize = (r ? T.type.tableBody.px : T.type.tableHeader.px) / T.slide.pxPerPt * 100;
      assert.ok(nodes(cells[c], 'a:rPr').some((p) => Number(p.attrs.sz) === expectedSize));
      assert.ok(nodes(cells[c], 'a:pPr').some((p) => p.attrs.algn === (source[c].align === 'end' ? 'r' : 'l')));
      assert.ok(nodes(one(cells[c], 'a:rPr'), 'a:srgbClr').some((p) => p.attrs.val === hex(r ? source[c].color : C.textSecondary)));
      if (r && model.rows[r - 1].bold) assert.ok(nodes(cells[c], 'a:rPr').some((p) => p.attrs.b === '1'));
      if (r && model.rows[r - 1].fill) assert.ok(nodes(one(cells[c], 'a:tcPr'), 'a:srgbClr').some((p) => p.attrs.val === hex(model.rows[r - 1].fill)));
    }
  }
  assert.ok(nodes(rows.at(-1), 'a:lnT').some((line) => nodes(line, 'a:solidFill').length));
});

test('all eight SVG-only charts have real PNG fallbacks linked by their slide', async () => {
  const { zip } = await svgDeck();
  assert.equal(files(zip, /^ppt\/charts\/chart\d+\.xml$/).length, 0);
  assert.equal(files(zip, /^ppt\/media\/.*\.svg$/).length, svgKinds.length);
  for (let n = 1; n <= svgKinds.length; n++) {
    const slideName = `ppt/slides/slide${n}.xml`, slide = await xml(zip, slideName);
    const image = one(slide, 'p:pic');
    const svg = one(image, 'asvg:svgBlip'), fallback = one(image, 'a:blip');
    const svgName = await related(zip, slideName, svg.attrs['r:embed']), pngName = await related(zip, slideName, fallback.attrs['r:embed']);
    assert.match(svgName, /\.svg$/);
    assert.match(pngName, /\.png$/);
    const png = await zip.file(pngName).async('nodebuffer');
    assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.ok((await zip.file(svgName).async('string')).includes(SLIDE_FONT));
  }
});

test('tiny nonzero values fall back to SVG with a warning, including negative values', async () => {
  const specs = [
    { kind: 'rank', rows: [{ label: '甲', value: 0.001 }] },
    { kind: 'line', x: ['一', '二'], series: [{ name: '甲', values: [-0.001, 1] }] },
    { kind: 'slope', periods: ['前', '後'], rows: [{ label: '甲', values: [1, 0.001] }] },
    { kind: 'share', categories: ['甲', '乙'], rows: [{ label: '北', values: [0.001, 100] }] },
    { kind: 'scatter', points: [{ label: '甲', x: 0.001, y: 1 }, { label: '乙', x: 2, y: 2 }] },
  ];
  const { zip, warnings } = await deck(specs.map(evidence));
  assert.equal(files(zip, /^ppt\/charts\/chart\d+\.xml$/).length, 0);
  assert.equal(files(zip, /^ppt\/media\/.*\.svg$/).length, specs.length);
  for (let n = 1; n <= specs.length; n++) assert.ok(warnings.some((w) => w.includes(`第 ${n} 頁`) && /SVG/.test(w)), `page ${n}: fallback warning`);
});

test('native:false forces SVG for all five chart kinds and table', async () => {
  const { zip } = await deck(visuals.map((v) => evidence({ ...v, native: false })));
  assert.equal(files(zip, /^ppt\/charts\/chart\d+\.xml$/).length, 0);
  assert.equal(files(zip, /^ppt\/media\/.*\.svg$/).length, visuals.length);
  assert.equal(nodes(await xml(zip, 'ppt/slides/slide6.xml'), 'a:tbl').length, 0);
});

test('steps, comparison, and close warn when their rows cannot fit text', async () => {
  const many = Array.from({ length: 12 }, (_, i) => `工作項目 ${i + 1}`);
  const pages = [
    { type: 'steps', claim: '時程', visual: { start: '2026-01', end: '2026-12', phases: many.map((name) => ({ name, note: '需完成審核', from: '2026-01', to: '2026-03' })) } },
    { type: 'compare', claim: '方案', visual: { rows: many, options: [{ name: '甲', values: many }, { name: '乙', values: many }] } },
    { type: 'close', claim: '決議', visual: { rows: many.map((task) => ({ task, owner: '負責人', due: '月底' })) } },
  ];
  const { warnings } = await deck(pages);
  for (let n = 1; n <= pages.length; n++) assert.ok(warnings.some((w) => w.includes(`第 ${n} 頁`) && /列|放不下|排不下/.test(w)), `page ${n}: row height warning`);
});

test('string number tiles display verbatim and do not calculate a delta or warn about better', async () => {
  const { zip, warnings } = await deck([{ type: 'numbers', claim: '經費', visual: { items: [{ label: '方案甲', value: 'NT$ 600 萬', prev: 500 }, { label: '方案乙', value: '尚待估算', prev: 1 }] } }]);
  const root = await xml(zip, 'ppt/slides/slide1.xml'), content = textOf(root);
  assert.ok(content.includes('NT$ 600 萬'));
  assert.ok(content.includes('尚待估算'));
  assert.doesNotMatch(content, /NaN|＋100|−|±0/);
  assert.ok(!warnings.some((w) => /better|前期/.test(w)));
});

test('scatter uses each axis precision for small values instead of the default label digits', async () => {
  const spec = { kind: 'scatter', points: [{ label: '甲', x: 0.1, y: 0.3 }, { label: '乙', x: 0.2, y: 0.6 }] };
  const { zip, warnings } = await deck([evidence(spec)]), model = prepare(spec);
  assert.equal(files(zip, /^ppt\/media\/.*\.svg$/).length, 0);
  assert.ok(!warnings.some((w) => /SVG/.test(w)));
  const { root } = await chartAt(zip, 1), axes = nodes(root, 'c:valAx');
  assert.equal(axes.length, 2);
  for (const [i, axis] of [model.xAxis, model.yAxis].entries()) {
    assert.equal(formatDigits(one(axes[i], 'c:numFmt').attrs.formatCode), decimalsOf(axis.ticks));
    assert.ok(Math.abs(Number(value(axes[i], 'c:min')) - (axis.lo - axis.step)) < 1e-12);
    assert.ok(Math.abs(Number(value(axes[i], 'c:max')) - (axis.hi + axis.step)) < 1e-12);
    assert.equal(Number(value(axes[i], 'c:majorUnit')), axis.step);
  }
});

test('zero, negative, empty-series, trailing-gap and one-sided slope values preserve editable data', async () => {
  const specs = [
    { kind: 'line', focus: '主線', x: ['一', '二', '三', '四'], series: [{ name: '主線', values: [0, -4, 2, null] }, { name: '缺值', values: [null, null, null, null] }] },
    { kind: 'slope', periods: ['前', '後'], rows: [{ label: '僅前', values: [-2, null] }, { label: '僅後', values: [null, 0] }, { label: '完整', values: [0, 4] }] },
  ];
  const { zip } = await deck(specs.map(evidence)), line = await chartAt(zip, 1), series = nodes(line.root, 'c:ser');
  assert.deepEqual(cacheValues(one(one(series[0], 'c:val'), 'c:numCache')), [{ index: 0, value: '0' }, { index: 1, value: '-4' }, { index: 2, value: '2' }]);
  assert.deepEqual(cacheValues(one(one(series[1], 'c:val'), 'c:numCache')), []);
  assert.deepEqual(nodes(series[0], 'c:dLbl').filter((l) => enabled(l, 'c:showVal') || enabled(l, 'c:showSerName')).map(labelIndex), [2]);
  assert.equal(nodes(series[1], 'c:dLbl').filter((l) => enabled(l, 'c:showVal') || enabled(l, 'c:showSerName')).length, 0);
  assert.equal(children(one(series[1], 'c:dLbls'), 'c:showVal')[0]?.attrs.val, '0');
  const book = await workbook(zip, line), sheet = await xml(book, 'xl/worksheets/sheet1.xml'), cells = nodes(sheet, 'c');
  for (const [ref, val] of [['B2', '0'], ['B3', '-4'], ['B4', '2']]) assert.equal(cellValue(cells, ref), val);
  for (const ref of ['B5', 'C2', 'C3', 'C4', 'C5']) assert.ok(!cells.some((c) => c.attrs.r === ref), `missing cell ${ref}`);
  const slope = await chartAt(zip, 2), slopes = nodes(slope.root, 'c:ser');
  for (const [i, row] of specs[1].rows.entries()) {
    const expected = row.values.flatMap((v, index) => v === null ? [] : [{ index, value: String(v) }]);
    assert.deepEqual(cacheValues(one(one(slopes[i], 'c:val'), 'c:numCache')), expected);
    assert.deepEqual(children(slopes[i], 'c:dPt').map((p) => Number(value(p, 'c:idx'))), expected.map((p) => p.index));
    assert.deepEqual(nodes(slopes[i], 'c:dLbl').map(labelIndex), expected.map((p) => p.index));
  }
  const slopeSheet = await xml(await workbook(zip, slope), 'xl/worksheets/sheet1.xml'), slopeCells = nodes(slopeSheet, 'c');
  for (const ref of ['B3', 'C2']) assert.ok(!slopeCells.some((c) => c.attrs.r === ref));
  for (const [ref, val] of [['B2', '-2'], ['C3', '0'], ['D2', '0'], ['D3', '4']]) assert.equal(cellValue(slopeCells, ref), val);
});

test('author and static scatter names preserve XML characters and replacement-dollar text', async () => {
  const special = '甲 $& <乙> & "quote"';
  const spec = { kind: 'scatter', focus: special, points: [{ label: special, x: 1, y: 2 }, { label: '丙', x: 2, y: 3 }] };
  const { zip } = await deck([evidence(spec)], { author: special });
  for (const name of files(zip, /\.xml$/)) parseXml(await zip.file(name).async('string'));
  const core = await xml(zip, 'docProps/core.xml');
  assert.equal(textOf(one(core, 'dc:creator')), special);
  assert.equal(textOf(one(core, 'cp:lastModifiedBy')), special);
  const chart = await chartAt(zip, 1);
  assert.equal(textOf(one(nodes(chart.root, 'c:dLbl')[0], 'c:tx')), special);
  const book = await workbook(zip, chart);
  for (const name of files(book, /\.xml$/)) parseXml(await book.file(name).async('string'));
  const author = await xml(book, 'docProps/core.xml');
  assert.equal(textOf(one(author, 'dc:creator')), special);
  assert.equal(textOf(one(author, 'cp:lastModifiedBy')), special);
});

test('rank, share and scatter workbooks keep observed zeros, and scatter suffixes do not scale data', async () => {
  const specs = [
    { kind: 'rank', sort: false, rows: [{ label: '零', value: 0 }, { label: '負', value: -3 }] },
    { kind: 'share', categories: ['甲', '乙'], rows: [{ label: '北', values: [0, 2] }, { label: '南', values: [0, 0] }] },
    { kind: 'scatter', suffix: '%', points: [{ label: '零', x: 0, y: 0 }, { label: '一', x: 1, y: 2 }] },
  ];
  const { zip } = await deck(specs.map(evidence));
  for (const [i, refs] of [['B2'], ['B2', 'B3', 'C3'], ['A2', 'B2']].entries()) {
    const chart = await chartAt(zip, i + 1), book = await workbook(zip, chart);
    const cells = nodes(await xml(book, 'xl/worksheets/sheet1.xml'), 'c');
    for (const ref of refs) assert.equal(cellValue(cells, ref), '0');
  }
  const scatter = await chartAt(zip, 3), axes = nodes(scatter.root, 'c:valAx');
  assert.ok(!one(axes[0], 'c:numFmt').attrs.formatCode.includes('%'));
  assert.ok(one(axes[1], 'c:numFmt').attrs.formatCode.includes('"%"'));
  for (const axis of axes) assert.equal(value(axis, 'c:majorTickMark'), 'out');
});

// PowerPoint asks to repair a deck whose table cells use anchor="mid" (pptxgenjs only maps 'middle' to ctr).
test('table cells use a valid vertical anchor', async () => {
  const { buffer } = await build({ title: 't', pages: [{ type: 'evidence', claim: 'x', visual: example('table') }] });
  const zip = await JSZip.loadAsync(buffer);
  const slide = await zip.file('ppt/slides/slide1.xml').async('string');
  const anchors = [...slide.matchAll(/<a:tcPr[^>]*\banchor="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(anchors.length > 0);
  assert.ok(anchors.every((a) => ['t', 'ctr', 'b'].includes(a)), anchors.join(','));
});

test('every numeric point label has its own number format in OOXML order', async () => {
  const specs = [0, 2].flatMap((digits) => visuals.slice(0, 4).map((v) => ({ ...v, digits })));
  const { zip } = await deck(specs.map(evidence));
  for (const [i, spec] of specs.entries()) {
    const { root } = await chartAt(zip, i + 1), labels = nodes(root, 'c:dLbl');
    assert.ok(labels.length, `${spec.kind}: missing point labels`);
    const unit = spec.kind === 'share' ? '%' : '';
    const n = `${unit ? '0' : '#,##0'}${spec.digits ? '.00' : ''}${unit}`;
    for (const label of labels) {
      const formats = children(label, 'c:numFmt');
      assert.equal(formats.length, 1, `${spec.kind}: point ${labelIndex(label)} needs its own format`);
      assert.equal(formats[0].attrs.formatCode, `${n};−${n};0${unit}`);
      assert.equal(formats[0].attrs.sourceLinked, '0');
      assert.deepEqual(label.children.slice(0, 3).map((c) => c.name), ['c:idx', 'c:numFmt', 'c:txPr']);
      assert.equal(children(label, 'c:tx').length, 0, 'numeric labels remain linked to data');
    }
  }
  const scatter = await chartAt((await nativeDeck()).zip, 5);
  for (const label of nodes(scatter.root, 'c:dLbl')) {
    assert.equal(children(label, 'c:tx').length, 1);
    assert.equal(children(label, 'c:numFmt').length, 0);
  }
});

// The value axis crosses the reversed category axis at its last category, which sits at the bottom.
// (Putting crosses="max" on the category axis instead moves the categories to the right and flips the bars.)
test('rank and share keep the value axis below reversed categories', async () => {
  const { zip } = await nativeDeck();
  for (const n of [1, 4]) {
    const { root } = await chartAt(zip, n), catAxis = one(root, 'c:catAx');
    assert.equal(value(catAxis, 'c:orientation'), 'maxMin');
    assert.equal(value(catAxis, 'c:crosses'), 'autoZero');
    assert.equal(value(one(root, 'c:valAx'), 'c:crosses'), 'max');
    assert.equal(value(one(root, 'c:valAx'), 'c:tickLblPos'), 'nextTo', 'labels follow the axis instead of the low end');
  }
  for (const n of [2, 3]) {
    const { root } = await chartAt(zip, n);
    assert.equal(value(one(root, 'c:catAx'), 'c:crosses'), 'autoZero');
  }
});

test('rank, line and slope keep automatic maxima; share retains its percentage domain', async () => {
  const { zip } = await nativeDeck();
  for (const n of [1, 2, 3]) {
    const { root } = await chartAt(zip, n), axis = one(root, 'c:valAx'), model = prepare(visuals[n - 1]);
    assert.equal(nodes(axis, 'c:max').length, 0, `${model.kind}: maximum must follow edited data`);
    assert.equal(Number(value(axis, 'c:min')), model.axis.lo);
    assert.equal(Number(value(axis, 'c:majorUnit')), model.axis.step);
  }
  const axis = one((await chartAt(zip, 4)).root, 'c:valAx');
  assert.equal(Number(value(axis, 'c:min')), 0);
  assert.equal(Number(value(axis, 'c:max')), 1);
});

test('scatter pads only occupied axis boundaries by one step without changing data', async () => {
  const specs = [[0, 10], [0, 9], [1, 10], [1.2, 9.2]].map(([a, b]) => ({
    kind: 'scatter', points: [{ label: '甲', x: a, y: a }, { label: '乙', x: b, y: b }],
  }));
  const before = structuredClone(specs), { zip } = await deck(specs.map(evidence));
  for (const [n, spec] of specs.entries()) {
    const { root } = await chartAt(zip, n + 1), axes = nodes(root, 'c:valAx'), model = prepare(spec);
    for (const [i, a] of [model.xAxis, model.yAxis].entries()) {
      const key = i === 0 ? 'x' : 'y';
      const atLo = spec.points.some((p) => p[key] === a.lo), atHi = spec.points.some((p) => p[key] === a.hi);
      assert.equal(Number(value(axes[i], 'c:min')), atLo ? a.lo - a.step : a.lo);
      if (atHi) assert.equal(Number(value(axes[i], 'c:max')), a.hi + a.step);
      else assert.equal(nodes(axes[i], 'c:max').length, 0, 'unpadded upper boundary stays automatic');
      assert.equal(Number(value(axes[i], 'c:majorUnit')), a.step);
    }
    assert.deepEqual(cacheValues(one(root, 'c:xVal')).map((p) => Number(p.value)), spec.points.map((p) => p.x));
    assert.deepEqual(cacheValues(one(root, 'c:yVal')).map((p) => Number(p.value)), spec.points.map((p) => p.y));
  }
  assert.deepEqual(specs, before);
});

test('native scatter warns about omitted reference lines and points to the SVG option', async () => {
  const spec = example('scatter');
  const tiny = { ...spec, points: [{ label: '甲', x: 0.001, y: 1 }, { label: '乙', x: 2, y: 2 }] };
  const { warnings, zip } = await deck([spec, { ...spec, native: false }, { ...spec, refs: [] }, tiny].map(evidence));
  const refs = warnings.filter((w) => w.includes('參考線'));
  assert.equal(refs.length, 1);
  assert.ok(refs[0].includes('第 1 頁'));
  assert.ok(refs[0].includes('native: false'));
  assert.ok((await zip.file('ppt/slides/slide1.xml').async('string')).includes('<c:chart '));
  assert.ok((await zip.file('ppt/slides/slide2.xml').async('string')).includes('svgBlip'));
});

test('native slope hides its value axis and gridlines', async () => {
  const { zip } = await nativeDeck(), axis = one((await chartAt(zip, 3)).root, 'c:valAx');
  assert.equal(value(axis, 'c:delete'), '1');
  assert.equal(nodes(axis, 'c:majorGridlines').length, 0);
  const lineAxis = one((await chartAt(zip, 2)).root, 'c:valAx');
  assert.equal(value(lineAxis, 'c:delete'), '0');
  assert.equal(nodes(lineAxis, 'c:majorGridlines').length, 1);
});
