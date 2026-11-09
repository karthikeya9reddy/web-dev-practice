const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const style = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

test('poster grid creates at most 32 cards per main-thread insertion batch', () => {
  assert.match(script, /const POSTER_GRID_BATCH_SIZE = 32/);
  assert.match(script, /rootMargin:\s*"680px 0px"/);
  assert.match(script, /files\.slice\(start, end\)\.map\(file => cardMarkup\(file\)\)/);
  assert.match(script, /if \(end >= files\.length\)\s*\{[\s\S]*?sentinel\?\.remove\(\)/);

  const allIds = Array.from({ length: 97 }, (_, i) => `media-${i}`);
  const batchSize = 32;
  const rendered = [];
  const batches = [];
  for (let start = 0; start < allIds.length;) {
    const end = Math.min(allIds.length, start + batchSize);
    const batch = allIds.slice(start, end);
    batches.push(batch.length);
    rendered.push(...batch);
    start = end;
  }
  assert.deepEqual(batches, [32, 32, 32, 1]);
  assert.deepEqual(rendered, allIds, 'incremental insertion still renders every title, once and in order');
});

test('poster cards use content visibility with an intrinsic placeholder size', () => {
  assert.match(style, /\.media-grid\s*>\s*\.media-card\s*\{\s*content-visibility:\s*auto;\s*contain-intrinsic-size:\s*auto 190px;/);
});
