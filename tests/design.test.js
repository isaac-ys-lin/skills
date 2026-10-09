import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const check = (file) => spawnSync(process.execPath, ['scripts/check-design.js', file], { cwd: root, encoding: 'utf8' });

test('clay 與 B′ 設計層都通過命令列檢查', () => {
  for (const file of ['design/tokens.json', 'design/tokens.blue.json']) {
    const child = check(file);
    assert.equal(child.status, 0, `${file}: ${child.stdout}${child.stderr}`);
    assert.match(child.stdout, /通過.*0 項失敗/);
  }
});

test('壞設計層指出焦點與灰色太近、標籤低對比、類別色在色盲下太近', () => {
  const child = check('tests/fixtures/tokens.bad.json');
  const output = `${child.stdout}${child.stderr}`;
  assert.equal(child.status, 1, output);
  assert.match(output, /color\.focus.*標籤字色.*對比.*門檻 ≥ 4\.5/);
  assert.match(output, /color\.focus.*gray.*色差.*門檻 ≥ 15/);
  assert.match(output, /categorical\[1\].*categorical\[2\].*色盲.*色差.*門檻 ≥ 6/);
});
