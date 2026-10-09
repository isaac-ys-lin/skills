import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Explicit and environment paths follow cwd; the default follows this module.
export function loadTokens(path = process.env.CLAYPRINT_TOKENS || fileURLToPath(new URL('../design/tokens.json', import.meta.url))) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`無法載入 Clayprint 設計層 ${path}：${error instanceof SyntaxError ? 'JSON 格式錯誤' : '檔案無法讀取'}`, { cause: error });
  }
}
