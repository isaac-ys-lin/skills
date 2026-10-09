// Shared numeric provenance rules for slide stories and HTML reports.
export const normalize = (text) => String(text).normalize('NFKC').replaceAll('−', '-').replace(/百分之\s*([\d.]+)/g, '$1%');
const literal = String.raw`(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?`;
export const calculationPattern = /(?:計算|算法)\s*:\s*([^\n;；。]+)/g;
const token = (text) => {
  const value = Number(text.replace(/[,\s%]/g, ''));
  const valid = Number.isFinite(value) && !(value === 0 && /[1-9]/.test(text.split(/[eE]/)[0]));
  return { text: text.trim(), value, percent: text.includes('%'), valid };
};

export function numbers(text) {
  return [...normalize(text).matchAll(new RegExp(String.raw`(?<![\d.])[+-]?${literal}\s*%?`, 'gi'))]
    .map((m) => token(m[0]));
}

// Relative tolerance preserves real tiny observations: 1e-101 must never match zero.
const equal = (a, b) => Number.isFinite(a) && Number.isFinite(b)
  && (a === b || Math.abs(a - b) <= Number.EPSILON * 16 * Math.max(Math.abs(a), Math.abs(b)));
const variants = (n) => n.percent ? [n.value, n.value / 100] : [n.value];
const matches = (n, a) => n.valid && a.valid && (n.percent && a.percent
  ? equal(n.value, a.value) : variants(n).some((v) => variants(a).some((x) => equal(v, x))));
export const found = (n, allowed) => allowed.some((a) => matches(n, a));

export function calculations(page, original, pageNo) {
  const text = normalize([...(Array.isArray(page.notes) ? page.notes : [page.notes ?? '']), ...(page.sources?.more ?? [])].join('\n'));
  // shortcut: explicit sums and differences only; extend the grammar when other arithmetic is needed.
  const signed = String.raw`[+-]?\s*${literal}\s*%?`;
  const allowed = [];
  for (const match of text.matchAll(calculationPattern)) {
    const expression = match[1].trim();
    const nonfinite = () => { throw new Error(`第 ${pageNo} 頁算式「${expression}」的運算元、累加和與結果都必須是有限數字；請核對數值大小與單位。`); };
    const equation = expression.match(new RegExp(String.raw`^(.+?)\s*=\s*(${signed})$`, 'i'));
    const unsupported = () => { throw new Error(`第 ${pageNo} 頁算式「${expression}」格式不支援；請使用完整加減算式，例如「計算：1200 + 800 = 2000」，說明文字另以分號隔開。`); };
    if (!equation) unsupported();
    let rest = equation[1].trim(), sum = 0, first = true;
    while (rest) {
      const term = rest.match(new RegExp(first ? String.raw`^(${signed})` : String.raw`^([+-])\s*(${signed})`, 'i'));
      if (!term) unsupported();
      const operand = token(term[first ? 1 : 2]);
      if (!operand.valid) nonfinite();
      if (!found(operand, original)) throw new Error(`第 ${pageNo} 頁算式「${expression}」的 ${operand.text} 不在原稿；請使用文字稿中的運算元。`);
      const percentage = original.find((a) => a.percent && matches(operand, a));
      const value = operand.percent ? operand.value / 100 : percentage ? percentage.value / 100 : operand.value;
      sum += value * (!first && term[1] === '-' ? -1 : 1);
      if (!Number.isFinite(sum)) nonfinite();
      rest = rest.slice(term[0].length).trim();
      first = false;
    }
    const result = token(equation[2]);
    if (!result.valid) nonfinite();
    if (!equal(sum, result.value / (result.percent ? 100 : 1))) {
      throw new Error(`第 ${pageNo} 頁算式「${expression}」結果不符；請核對加減與百分比單位。`);
    }
    allowed.push(result);
  }
  return allowed;
}
