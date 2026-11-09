'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const serverSource = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8');
const helperStart = serverSource.indexOf('function isPathInside(');
const helperEnd = serverSource.indexOf('\nif (!fs.existsSync(MEDIA_ROOT)) {', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'self-contained helpers must exist in server.js');
const helperSource = serverSource.slice(helperStart, helperEnd);
const { isPathInside, resolveMediaPath, verifyMediaPath, parseSingleByteRange } =
  new Function('fs', 'path', `${helperSource}\nreturn { isPathInside, resolveMediaPath, verifyMediaPath, parseSingleByteRange };`)(fs, path);

const VIDEO = new Set(['mp4', 'mkv']);
const AUDIO = new Set(['mp3']);

 test('path containment distinguishes parent traversal from names beginning with dots', () => {
  const root = path.resolve('/tmp/nexora-media');
  assert.equal(isPathInside(root, path.join(root, '..hidden', 'film.mp4')), true);
  assert.equal(isPathInside(root, path.resolve(root, '..', 'outside.mp4')), false);
  assert.equal(isPathInside(root, root), true);
});

test('media resolver rejects traversal, absolute paths, empty segments and NUL', () => {
  const root = path.resolve('/tmp/nexora-media');
  for (const invalid of ['', '../outside.mp4', 'folder/../outside.mp4', '/etc/passwd', 'folder//movie.mp4', './movie.mp4', 'movie\0.mp4']) {
    assert.equal(resolveMediaPath(root, invalid), null, `reject ${JSON.stringify(invalid)}`);
  }
  assert.equal(resolveMediaPath(root, 'Movies/..hidden.mp4'), path.join(root, 'Movies', '..hidden.mp4'));
  assert.equal(resolveMediaPath(root, 'Movies\\film.mp4'), path.join(root, 'Movies', 'film.mp4'));
  assert.equal(resolveMediaPath(root, 'x'.repeat(2049)), null);
});

test('media verifier accepts a regular supported file and rejects unsupported files and symlinks', async t => {
  const base = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nexora-media-security-'));
  const root = path.join(base, 'media');
  const outside = path.join(base, 'outside.mp4');
  await fs.promises.mkdir(path.join(root, 'Movies'), { recursive: true });
  const valid = path.join(root, 'Movies', '..hidden.mp4');
  const unsupported = path.join(root, 'Movies', 'notes.txt');
  await fs.promises.writeFile(valid, 'test-media');
  await fs.promises.writeFile(unsupported, 'text');
  await fs.promises.writeFile(outside, 'outside');

  try {
    await fs.promises.symlink(outside, path.join(root, 'Movies', 'linked.mp4'));
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) t.skip('symlink creation is unavailable in this environment');
    else throw error;
  }

  const result = await verifyMediaPath(root, valid, VIDEO, AUDIO);
  assert.equal(result.extension, 'mp4');
  assert.equal(result.stats.size, 10);
  assert.equal(result.canonicalPath, await fs.promises.realpath(valid));
  await assert.rejects(() => verifyMediaPath(root, unsupported, VIDEO, AUDIO), /Unsupported media format/);
  await assert.rejects(() => verifyMediaPath(root, path.join(root, 'Movies', 'linked.mp4'), VIDEO, AUDIO), /Symbolic links/);
  await assert.rejects(() => verifyMediaPath(root, outside, VIDEO, AUDIO), /outside the media directory/);
  await fs.promises.rm(base, { recursive: true, force: true });
});

test('byte-range parser supports normal, open-ended and suffix ranges', () => {
  assert.deepEqual(parseSingleByteRange('bytes=0-99', 1000), { start: 0, end: 99 });
  assert.deepEqual(parseSingleByteRange('bytes=100-', 1000), { start: 100, end: 999 });
  assert.deepEqual(parseSingleByteRange('bytes=-100', 1000), { start: 900, end: 999 });
  assert.deepEqual(parseSingleByteRange('bytes=-5000', 1000), { start: 0, end: 999 });
  assert.deepEqual(parseSingleByteRange('bytes=950-2000', 1000), { start: 950, end: 999 });
});

test('byte-range parser rejects malformed and unsatisfiable ranges', () => {
  for (const range of [null, '', 'items=0-2', 'bytes=1-2,4-6', 'bytes=-0', 'bytes=-x', 'bytes=x-2', 'bytes=10-9', 'bytes=1000-', 'bytes=0-NaN']) {
    assert.equal(parseSingleByteRange(range, 1000), null, `reject ${String(range)}`);
  }
  assert.equal(parseSingleByteRange('bytes=0-1', 0), null);
});
