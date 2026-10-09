import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { T } from '../scripts/core.js';

test('報告 SVG 使用英吋版心、依列數增高，並將圖說資料印到終端', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clayprint-svg-'));
  const input = join(dir, 'chart.json'), output = join(dir, 'chart.svg');
  const run = (...flags) => spawnSync(process.execPath, ['scripts/svg.js', input, output, ...flags], { encoding: 'utf8' });
  const spec = {
    kind: 'rank', unit: '件', period: '2025 年', source: '試行紀錄', note: '僅含同一館區',
    rows: [{ label: '甲', value: 8 }, { label: '乙', value: null }],
  };
  try {
    writeFileSync(input, JSON.stringify(spec));
    const short = run('--bare');
    assert.equal(short.status, 0, short.stderr);
    assert.match(short.stdout, /^單位：件\n期間：2025 年\n來源：試行紀錄\n附註：僅含同一館區；未提供：乙\n$/);
    const shortSvg = readFileSync(output, 'utf8');
    assert.match(shortSvg, new RegExp(`^<svg[^>]+width="${Math.round(6.8 * T.slide.pxPerIn)}" height="360"`));
    assert.doesNotMatch(shortSvg, /試行紀錄|僅含同一館區|未提供：乙/);

    const old = run();
    assert.equal(old.status, 0, old.stderr);
    assert.match(readFileSync(output, 'utf8'), new RegExp(`^<svg[^>]+width="${T.chartArea.evidence.width}"`));
    assert.match(readFileSync(output, 'utf8'), /資料來源：試行紀錄/);

    spec.rows.push(...Array.from({ length: 7 }, (_, i) => ({ label: `丙${i}`, value: i + 1 })));
    writeFileSync(input, JSON.stringify(spec));
    const tall = run('--bare', '--width', '4');
    assert.equal(tall.status, 0, tall.stderr);
    assert.match(readFileSync(output, 'utf8'), new RegExp(`^<svg[^>]+width="${4 * T.slide.pxPerIn}" height="624"`));
    assert.ok(run('--bare', '--width', '0').status !== 0);
    assert.ok(run('--bare', '--width', 'Infinity').status !== 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
