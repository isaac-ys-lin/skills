// Validate a story against its source manuscript, then build it with the production renderer.
import { readFileSync } from 'node:fs';
import { build, validateStory } from '../scripts/pptx.js';
import { normalize, numbers, found, calculations, calculationPattern } from './numbers.mjs';
import { isMain } from '../scripts/main.js';

function visibleText(value, path) {
  if (typeof value === 'number' || typeof value === 'string') return [{ text: String(value), path }];
  if (Array.isArray(value)) return value.flatMap((v, i) => visibleText(v, `${path}[${i}]`));
  if (!value || typeof value !== 'object') return [];
  // digits and numeric focus indices control rendering; neither is a visible measurement.
  return Object.entries(value).flatMap(([key, v]) => key === 'digits' || key === 'focus' && typeof v === 'number' ? [] : visibleText(v, `${path}.${key}`));
}

export async function check(story, script) {
  validateStory(story);
  if (typeof script !== 'string' || !script.trim()) throw new Error('script.md 必須是非空文字稿；請提供原始內容。');
  const original = numbers(script);
  if (original.some((n) => !n.valid)) throw new Error('原稿含無法以有限數字精確表示的數值；請核對科學記號或調整單位，保留原始資料。');
  for (const field of ['title', 'date']) {
    for (const { text, path } of visibleText(story[field], field)) {
      for (const value of numbers(text)) {
        if (!found(value, original)) throw new Error(`根層 ${path}：原稿找不到數字 ${value.text}；請改回原稿數字，未提供日期時省略 date。`);
      }
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
      ...['claim', 'kicker', 'lede', 'note'].map((field) => [field, page[field]]),
      ...['value', 'label', 'unit'].map((field) => [`metric.${field}`, page.metric?.[field]]),
      // period holds date ranges such as 2025.01–2025.12; dates are reviewed by hand, not as measured values.
      ...['source', 'unit', 'more'].map((field) => [`sources.${field}`, page.sources[field]]),
      ['visual', page.visual],
    ].flatMap(([path, value]) => visibleText(value, path));
    for (const { text, path } of visible) {
      // 已驗算的片段由算式語法處理正負號，避免將減號誤認為原稿負數。
      const unverified = path.startsWith('sources.more[') ? normalize(text).replace(calculationPattern, '') : text;
      for (const value of numbers(unverified)) {
        if (!found(value, allowed)) {
          throw new Error(`第 ${n} 頁 ${path}：原稿找不到數字 ${value.text}；請改回原稿數字，或在當頁 notes／sources.more 寫出可核對的加減算式（如「計算：1200 + 800 = 2000」）。`);
        }
      }
    }
  }
  const result = await build(story);
  return { ...result, pages: story.pages.length };
}

if (isMain(import.meta.url)) {
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
