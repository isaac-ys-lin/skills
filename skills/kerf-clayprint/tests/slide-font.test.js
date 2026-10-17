import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('PowerPoint font follows font.slide in the active design layer', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clayprint-font-'));
  const tokens = JSON.parse(readFileSync(new URL('../design/tokens.json', import.meta.url), 'utf8'));
  tokens.font.slide = 'Noto Sans TC';
  const file = join(dir, 'tokens.json');
  writeFileSync(file, JSON.stringify(tokens));
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', "import { SLIDE_FONT } from './scripts/core.js'; console.log(SLIDE_FONT)"],
    { cwd: new URL('..', import.meta.url), env: { ...process.env, CLAYPRINT_TOKENS: file }, encoding: 'utf8' });
  assert.equal(out.trim(), 'Noto Sans TC');
});
