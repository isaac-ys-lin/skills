import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.resolve('pptxgenjs'));
const imageSizePath = require.resolve('image-size');
const { imageSize } = require('image-size');

test('the image parser installed for pptxgenjs still reads valid PNG and ICNS buffers', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1cAAAAASUVORK5CYII=', 'base64');
  const icon = Buffer.from('69636e73000000106963703400000008', 'hex');
  assert.deepEqual(imageSize(png), { width: 1, height: 1, type: 'png' });
  const { width, height } = imageSize(icon);
  assert.deepEqual({ width, height }, { width: 16, height: 16 });
});

// GHSA-w3rx-r6r6-pgpr and GHSA-5p2g-fcmc-qvqq: zero lengths must not stall the parser.
for (const [format, hex] of [
  ['ICNS', '69636e73000000106963703400000000'],
  ['HEIF', '000000106674797068656963000000000000000066726565'],
  ['JXL', '0000000c4a584c200d0a870a00000014667479706a786c20000000006a786c20000000006a786c70'],
]) {
  test(`the image parser installed for pptxgenjs rejects a zero-length ${format} entry`, () => {
    const run = spawnSync(process.execPath, ['--max-old-space-size=64', '-e', `
      const assert = require('node:assert/strict');
      const { imageSize } = require(process.argv[1]);
      assert.throws(() => imageSize(Buffer.from(process.argv[2], 'hex')));
    `, imageSizePath, hex], { encoding: 'utf8', timeout: 2000 });
    assert.equal(run.error, undefined, run.error?.message);
    assert.equal(run.status, 0, run.stderr);
  });
}
