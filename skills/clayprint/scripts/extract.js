// 讀取 Office Open XML 的可核對內容；圖表數值來自檔內快取，不推測缺值。
// node scripts/extract.js input.pptx out.json
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { isMain } from './main.js';

const local = (name) => name.split(':').at(-1);
const decode = (s = '') => s.replace(/&(?:#x([\da-f]+)|#(\d+)|(amp|lt|gt|quot|apos));/gi,
  (_, hex, dec, named) => hex || dec ? String.fromCodePoint(parseInt(hex ?? dec, hex ? 16 : 10)) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[named]);

function parse(xml) {
  const root = { name: '', attrs: {}, children: [], value: '' }, stack = [root];
  const tokens = xml.match(/<(?:(?:"[^"]*"|'[^']*'|[^'">])*)>|[^<]+/g) ?? [];
  for (const token of tokens) {
    if (token.startsWith('<?') || token.startsWith('<!')) continue;
    if (token.startsWith('</')) {
      const closing = local(token.slice(2, -1).trim());
      if (local(stack.at(-1).name) !== closing) throw new Error(`XML 標籤不相符：${closing}`);
      stack.pop();
    } else if (token.startsWith('<')) {
      const name = token.match(/^<([^\s/>]+)/)?.[1];
      if (!name) throw new Error('XML 標籤無法辨識');
      const attrs = {};
      for (const m of token.matchAll(/([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[m[1]] = decode(m[2] ?? m[3]);
      const node = { name, attrs, children: [], value: '' };
      stack.at(-1).children.push(node);
      if (!token.endsWith('/>')) stack.push(node);
    } else stack.at(-1).value += decode(token);
  }
  if (stack.length !== 1) throw new Error('XML 結尾不完整');
  return root.children[0];
}
const children = (node, name) => node?.children.filter((n) => local(n.name) === name) ?? [];
const first = (node, name) => children(node, name)[0];
const all = (node, name) => node?.children.flatMap((n) => [ ...(local(n.name) === name ? [n] : []), ...all(n, name) ]) ?? [];
const content = (node) => node ? node.value + node.children.map(content).join('') : '';
const text = (node) => all(node, 't').map(content).join('');
const fileText = async (zip, name) => zip.file(name) ? zip.file(name).async('string') : null;
const xmlAt = async (zip, name) => { const s = await fileText(zip, name); return s === null ? null : parse(s); };
const relPath = (part) => path.posix.join(path.posix.dirname(part), '_rels', `${path.posix.basename(part)}.rels`);
const resolve = (part, target) => target.startsWith('/') ? target.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(part), target));
async function relationships(zip, part) {
  const root = await xmlAt(zip, relPath(part));
  return Object.fromEntries(children(root, 'Relationship').filter((r) => r.attrs.TargetMode !== 'External')
    .map((r) => [r.attrs.Id, { type: r.attrs.Type?.split('/').at(-1), path: resolve(part, r.attrs.Target) }]));
}
const relId = (node) => node && (node.attrs['r:id'] ?? Object.entries(node.attrs).find(([key]) => key.includes(':') && local(key) === 'id')?.[1]);
const relEmbed = (node) => node && Object.entries(node.attrs).find(([key]) => local(key) === 'embed')?.[1];
const media = (zip, prefix) => Object.keys(zip.files).filter((name) => name.startsWith(`${prefix}/media/`) && !zip.files[name].dir).sort();
const numbered = (names, re) => names.filter((name) => re.test(name)).sort((a, b) => Number(a.match(re)[1]) - Number(b.match(re)[1]));

function cache(node) {
  const holder = ['strCache', 'numCache', 'multiLvlStrCache', 'strLit', 'numLit'].map((n) => first(node, n)).find(Boolean)
    ?? all(node, 'strCache')[0] ?? all(node, 'numCache')[0] ?? all(node, 'multiLvlStrCache')[0];
  if (!holder) return null;
  const level = first(holder, 'lvl') ?? holder;
  const points = children(level, 'pt');
  const count = Number(first(holder, 'ptCount')?.attrs.val ?? (Math.max(-1, ...points.map((p) => Number(p.attrs.idx))) + 1));
  if (!Number.isSafeInteger(count) || count < 0 || count > 100000) return null;
  const values = Array(count).fill(null);
  for (const pt of points) {
    const index = Number(pt.attrs.idx), raw = content(first(pt, 'v'));
    if (index >= 0 && index < count) {
      if (local(holder.name).startsWith('num') && raw !== '' && !Number.isFinite(Number(raw))) return null;
      values[index] = local(holder.name).startsWith('num') ? (raw === '' ? null : Number(raw)) : raw;
    }
  }
  return values;
}
function chart(root, part) {
  const plot = all(root, 'plotArea')[0], kind = plot?.children.find((n) => /Chart$/.test(local(n.name)));
  if (!kind) return { part, type: '未辨識', series: [], unreadable: ['不支援的圖表類型或無 plotArea'] };
  const series = children(kind, 'ser').map((ser) => {
    const name = cache(first(ser, 'tx'))?.[0] ?? (content(first(first(ser, 'tx'), 'v')) || null);
    const categories = cache(first(ser, 'cat') ?? first(ser, 'xVal'));
    const values = cache(first(ser, 'val') ?? first(ser, 'yVal'));
    return { name, categories, values };
  });
  return { part, type: local(kind.name), series,
    unreadable: series.flatMap((s, i) => [s.categories === null && `系列 ${i + 1} 無類別快取`, s.values === null && `系列 ${i + 1} 無數值快取`].filter(Boolean)) };
}
async function chartAt(zip, part) {
  const root = await xmlAt(zip, part);
  if (!root) return { part, type: '未讀取', series: [], unreadable: ['圖表 XML 不存在'] };
  const result = chart(root, part), external = all(root, 'externalData')[0], rels = external ? await relationships(zip, part) : {};
  if (external) result.embeddedWorkbook = rels[relId(external)]?.path ?? null;
  if (external && !result.embeddedWorkbook) result.unreadable.push('內嵌活頁簿關聯不存在');
  return result;
}
const paragraph = (p) => all(p, 't').map(content).join('');
const table = (node, rowName, cellName) => children(node, rowName).map((row) => children(row, cellName).map((cell) => all(cell, 'p').map(paragraph).filter(Boolean).join('\n')));

async function pptx(zip) {
  const names = Object.keys(zip.files), presentation = await xmlAt(zip, 'ppt/presentation.xml');
  const order = all(presentation, 'sldId'), presentationRels = await relationships(zip, 'ppt/presentation.xml');
  const slideParts = order.length ? order.map((s) => presentationRels[relId(s)]?.path)
    : numbered(names, /^ppt\/slides\/slide(\d+)\.xml$/);
  if (slideParts.some((part) => !part)) throw new Error('簡報頁序關聯不完整');
  const slides = [];
  for (const [i, part] of slideParts.entries()) {
    const root = await xmlAt(zip, part), rels = await relationships(zip, part);
    const chartRefs = all(root, 'chart'), pictureRefs = all(root, 'blip');
    const charts = await Promise.all(chartRefs.map(async (ref) => {
      const target = rels[relId(ref)];
      return target ? chartAt(zip, target.path) : { type: '未讀取', series: [], unreadable: ['圖表關聯不存在'] };
    }));
    const notesPart = Object.values(rels).find((r) => r.type === 'notesSlide')?.path;
    const notes = notesPart ? all(await xmlAt(zip, notesPart), 'p').map(paragraph).filter(Boolean) : [];
    slides.push({ number: i + 1, part, text: all(root, 'sp').flatMap((shape) => all(shape, 'p').map(paragraph).filter(Boolean)),
      tables: all(root, 'tbl').map((t) => table(t, 'tr', 'tc')), charts,
      images: pictureRefs.map((ref) => rels[relEmbed(ref)]?.path ?? '未讀取：圖片關聯不存在'), notes });
  }
  return { format: 'pptx', slides, images: media(zip, 'ppt'), unreadable: [
    'SmartArt、影片與 OLE 物件內容未解析', '圖表快取可能與內嵌活頁簿不同步；重畫前請核對「編輯資料」',
  ] };
}

async function docx(zip) {
  const root = await xmlAt(zip, 'word/document.xml');
  if (!root) throw new Error('找不到 word/document.xml');
  const body = all(root, 'body')[0], rels = await relationships(zip, 'word/document.xml');
  const blocks = children(body, 'p').length || children(body, 'tbl').length ? body.children.filter((n) => ['p', 'tbl'].includes(local(n.name))).map((n) =>
    local(n.name) === 'p' ? { type: 'paragraph', text: paragraph(n) } : { type: 'table', rows: table(n, 'tr', 'tc') }) : [];
  const chartRefs = all(root, 'chart');
  const charts = await Promise.all(chartRefs.map(async (ref) => rels[relId(ref)] ? chartAt(zip, rels[relId(ref)].path)
    : { type: '未讀取', series: [], unreadable: ['圖表關聯不存在'] }));
  const extra = {};
  for (const section of ['header', 'footer']) {
    extra[`${section}s`] = await Promise.all(Object.keys(zip.files).filter((n) => new RegExp(`^word/${section}\\d+\\.xml$`).test(n)).sort()
      .map(async (part) => ({ part, text: all(await xmlAt(zip, part), 'p').map(paragraph).filter(Boolean) })));
  }
  return { format: 'docx', blocks, charts, ...extra, images: media(zip, 'word'), unreadable: ['文字方塊、批註與修訂歷程未完整解析'] };
}

function excelCell(cell, strings) {
  const kind = cell.attrs.t, v = content(first(cell, 'v'));
  const value = kind === 's' ? strings[Number(v)] ?? null : kind === 'inlineStr' ? text(first(cell, 'is'))
    : kind === 'b' ? v === '1' : v === '' ? null : kind === 'str' || kind === 'e' || !Number.isFinite(Number(v)) ? v : Number(v);
  return { ref: cell.attrs.r, value, ...(first(cell, 'f') ? { formula: content(first(cell, 'f')) } : {}) };
}
async function xlsx(zip) {
  const book = await xmlAt(zip, 'xl/workbook.xml');
  if (!book) throw new Error('找不到 xl/workbook.xml');
  const bookRels = await relationships(zip, 'xl/workbook.xml');
  const shared = await xmlAt(zip, 'xl/sharedStrings.xml');
  const strings = children(shared, 'si').map((si) => text(si));
  const sheets = [];
  for (const [i, sheet] of all(book, 'sheet').entries()) {
    const part = bookRels[relId(sheet)]?.path;
    if (!part) { sheets.push({ number: i + 1, name: sheet.attrs.name, unreadable: ['工作表關聯不存在'] }); continue; }
    const root = await xmlAt(zip, part), rels = await relationships(zip, part);
    const drawings = all(root, 'drawing');
    const chartParts = [], images = [];
    for (const drawing of drawings) {
      const drawingPart = rels[relId(drawing)]?.path;
      if (!drawingPart) continue;
      const drawingRoot = await xmlAt(zip, drawingPart), drawingRels = await relationships(zip, drawingPart);
      for (const ref of all(drawingRoot, 'chart')) chartParts.push(drawingRels[relId(ref)]?.path);
      for (const ref of all(drawingRoot, 'blip')) images.push(drawingRels[relEmbed(ref)]?.path ?? '未讀取：圖片關聯不存在');
    }
    const tables = await Promise.all(all(root, 'tablePart').map(async (ref) => {
      const tablePart = rels[relId(ref)]?.path, tableRoot = tablePart ? await xmlAt(zip, tablePart) : null;
      return tableRoot ? { part: tablePart, name: tableRoot.attrs.displayName ?? tableRoot.attrs.name,
        ref: tableRoot.attrs.ref, columns: all(tableRoot, 'tableColumn').map((column) => column.attrs.name) }
        : { part: tablePart ?? null, unreadable: ['表格定義或關聯不存在'] };
    }));
    sheets.push({ number: i + 1, name: sheet.attrs.name, part,
      rows: all(root, 'row').map((row) => ({ number: Number(row.attrs.r), cells: children(row, 'c').map((c) => excelCell(c, strings)) })),
      tables,
      charts: await Promise.all(chartParts.map((p) => p ? chartAt(zip, p) : { type: '未讀取', series: [], unreadable: ['圖表關聯不存在'] })),
      images });
  }
  return { format: 'xlsx', sheets, images: media(zip, 'xl'), unreadable: ['樞紐分析、巨集、條件格式與圖表的即時計算值未解析；公式僅保留檔內快取'] };
}

export async function extract(input) {
  const ext = path.extname(input).toLowerCase();
  if (!['.pptx', '.docx', '.xlsx'].includes(ext)) throw new Error('只支援 .pptx、.docx、.xlsx');
  const zip = await JSZip.loadAsync(readFileSync(input));
  return ext === '.pptx' ? pptx(zip) : ext === '.docx' ? docx(zip) : xlsx(zip);
}

if (isMain(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) { console.error('用法：node scripts/extract.js 檔案 out.json'); process.exit(2); }
  try { writeFileSync(output, `${JSON.stringify(await extract(input), null, 2)}\n`); }
  catch (error) { console.error(`擷取失敗：${error.message}`); process.exitCode = 1; }
}
