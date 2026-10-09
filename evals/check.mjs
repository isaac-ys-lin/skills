// Validate a story against its source manuscript, then build it with the production renderer.
import { readFileSync } from 'node:fs';
import { build, validateStory } from '../scripts/pptx.js';

const normalize = (text) => String(text).normalize('NFKC').replaceAll('−', '-').replace(/百分之\s*([\d.]+)/g, '$1%');
const literal = String.raw`(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?`;
const token = (text) => {
  const value = Number(text.replace(/[,\s%]/g, ''));
  const valid = Number.isFinite(value) && !(value === 0 && /[1-9]/.test(text.split(/[eE]/)[0]));
  return { text: text.trim(), value, percent: text.includes('%'), valid };
};

function numbers(text) {
  return [...normalize(text).matchAll(new RegExp(String.raw`(?<![\d.])[+-]?${literal}\s*%?`, 'gi'))]
    .map((m) => token(m[0]));
}

// Relative tolerance preserves real tiny observations: 1e-101 must never match zero.
const equal = (a, b) => a === b || Math.abs(a - b) <= Number.EPSILON * 16 * Math.max(Math.abs(a), Math.abs(b));
const variants = (n) => n.percent ? [n.value, n.value / 100] : [n.value];
const found = (n, allowed) => n.valid && allowed.some((a) => a.valid && (n.percent && a.percent
  ? equal(n.value, a.value) : variants(n).some((v) => variants(a).some((x) => equal(v, x)))));

function calculations(page, original, pageNo) {
  const text = normalize([...(Array.isArray(page.notes) ? page.notes : [page.notes ?? '']), ...(page.sources?.more ?? [])].join('\n'));
  // shortcut: explicit sums and differences only; extend the grammar when other arithmetic is needed.
  const signed = String.raw`[+-]?\s*${literal}\s*%?`;
  const allowed = [];
  for (const match of text.matchAll(/(?:計算|算法)\s*:\s*([^\n;；。]+)/g)) {
    const expression = match[1].trim();
    const equation = expression.match(new RegExp(String.raw`^(.+?)\s*=\s*(${signed})$`, 'i'));
    const unsupported = () => { throw new Error(`第 ${pageNo} 頁算式「${expression}」格式不支援；請使用完整加減算式，例如「計算：1200 + 800 = 2000」，說明文字另以分號隔開。`); };
    if (!equation) unsupported();
    let rest = equation[1].trim(), sum = 0, first = true;
    while (rest) {
      const term = rest.match(new RegExp(first ? String.raw`^(${signed})` : String.raw`^([+-])\s*(${signed})`, 'i'));
      if (!term) unsupported();
      const operand = token(term[first ? 1 : 2]);
      if (!found(operand, original)) throw new Error(`第 ${pageNo} 頁算式「${expression}」的 ${operand.text} 不在原稿；請使用文字稿中的運算元。`);
      sum += operand.value / (operand.percent ? 100 : 1) * (!first && term[1] === '-' ? -1 : 1);
      rest = rest.slice(term[0].length).trim();
      first = false;
    }
    const result = token(equation[2]);
    if (!result.valid || !equal(sum, result.value / (result.percent ? 100 : 1))) {
      throw new Error(`第 ${pageNo} 頁算式「${expression}」結果不符；請核對加減與百分比單位。`);
    }
    allowed.push(result);
  }
  return allowed;
}

function visibleNumbers(value, path) {
  if (typeof value === 'number' || typeof value === 'string') return numbers(value).map((n) => ({ ...n, path }));
  if (Array.isArray(value)) return value.flatMap((v, i) => visibleNumbers(v, `${path}[${i}]`));
  if (!value || typeof value !== 'object') return [];
  // digits controls display precision; it is not a measured value or a visible label.
  return Object.entries(value).flatMap(([key, v]) => key === 'digits' ? [] : visibleNumbers(v, `${path}.${key}`));
}

export async function check(story, script) {
  validateStory(story);
  if (typeof script !== 'string' || !script.trim()) throw new Error('script.md 必須是非空文字稿；請提供原始內容。');
  const original = numbers(script);
  if (original.some((n) => !n.valid)) throw new Error('原稿含無法以有限數字精確表示的數值；請核對科學記號或調整單位，保留原始資料。');
  for (const field of ['title', 'date']) {
    for (const value of visibleNumbers(story[field], field)) {
      if (!found(value, original)) throw new Error(`根層 ${value.path}：原稿找不到數字 ${value.text}；請改回原稿數字，未提供日期時省略 date。`);
    }
  }
  for (const [i, page] of story.pages.entries()) {
    const n = i + 1;
    if (typeof page.sources?.source !== 'string' || !page.sources.source.trim()) {
      throw new Error(`第 ${n} 頁 sources.source 缺少資料來源；請填文字稿名稱，虛構稿也要註明。`);
    }
    if (!original.length && page.type === 'evidence' && page.visual.kind !== 'table') {
      throw new Error(`第 ${n} 頁：文字稿沒有可核對的數字，不能放量化圖表；請改用 statement、compare、close 或純文字 table。`);
    }
    const allowed = [...original, ...calculations(page, original, n)];
    const visible = [
      ...['claim', 'kicker', 'note'].map((field) => [field, page[field]]),
      ...['value', 'label', 'unit'].map((field) => [`metric.${field}`, page.metric?.[field]]),
      ['visual', page.visual],
    ].flatMap(([path, value]) => visibleNumbers(value, path));
    for (const value of visible) {
      if (!found(value, allowed)) {
        throw new Error(`第 ${n} 頁 ${value.path}：原稿找不到數字 ${value.text}；請改回原稿數字，或在當頁 notes／sources.more 寫出可核對的加減算式（如「計算：1200 + 800 = 2000」）。`);
      }
    }
  }
  const result = await build(story);
  return { ...result, pages: story.pages.length };
}

if (import.meta.main) {
  const [storyFile, scriptFile] = process.argv.slice(2);
  if (!storyFile || !scriptFile) {
    console.error('用法：node evals/check.mjs story.json script.md');
    process.exitCode = 2;
  } else {
    try {
      let story;
      try { story = JSON.parse(readFileSync(storyFile, 'utf8')); }
      catch { throw new Error(`無法讀取 ${storyFile} 為 JSON；請確認路徑、雙引號與逗號。`); }
      let script;
      try { script = readFileSync(scriptFile, 'utf8'); }
      catch { throw new Error(`無法讀取文字稿 ${scriptFile}；請確認檔案路徑。`); }
      const result = await check(story, script);
      for (const warning of result.warnings) console.error(`警告：${warning}`);
      console.log(`通過：${result.pages} 頁，PowerPoint 建檔成功；${result.warnings.length} 項警告。請再逐頁核對語意與預覽。`);
    } catch (error) {
      console.error(`驗收失敗：${error.message}`);
      process.exitCode = 1;
    }
  }
}
