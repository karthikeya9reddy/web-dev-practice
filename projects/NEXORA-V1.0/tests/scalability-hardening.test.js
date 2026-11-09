'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const pkg = require(path.join(root, 'package.json'));
const lock = require(path.join(root, 'package-lock.json'));

function makeProbeLimiter(maxJobs, maxWaiters) {
  const start = server.indexOf('async function withFfprobeSlot(task)');
  const end = server.indexOf('\nasync function withFfmpegSlot(task)', start);
  assert.ok(start >= 0 && end > start, 'FFprobe limiter must be defined before FFmpeg limiter');
  const implementation = server.slice(start, end);
  const factory = new Function('MAX_FFPROBE_JOBS', 'MAX_FFPROBE_WAITERS', `
    let activeFfprobeJobs = 0;
    const ffprobeWaiters = [];
    ${implementation}
    return {
      withFfprobeSlot,
      get active() { return activeFfprobeJobs; },
      get queued() { return ffprobeWaiters.length; }
    };
  `);
  return factory(maxJobs, maxWaiters);
}

test('FFprobe limiter never exceeds its configured active process ceiling', async () => {
  const limiter = makeProbeLimiter(2, 16);
  let active = 0;
  let observedMaximum = 0;
  const jobs = Array.from({ length: 12 }, (_, index) => limiter.withFfprobeSlot(async () => {
    active++;
    observedMaximum = Math.max(observedMaximum, active);
    await new Promise(resolve => setTimeout(resolve, 4 + (index % 3)));
    active--;
    return index;
  }));
  const results = await Promise.all(jobs);
  assert.deepEqual(results, Array.from({ length: 12 }, (_, index) => index));
  assert.equal(observedMaximum, 2);
  assert.equal(limiter.active, 0);
  assert.equal(limiter.queued, 0);
});

test('FFprobe limiter rejects work when its bounded waiting queue is full', async () => {
  const limiter = makeProbeLimiter(1, 1);
  let releaseFirst;
  const first = limiter.withFfprobeSlot(() => new Promise(resolve => { releaseFirst = resolve; }));
  await Promise.resolve();
  const second = limiter.withFfprobeSlot(async () => 'second');
  assert.equal(limiter.active, 1);
  assert.equal(limiter.queued, 1);
  await assert.rejects(
    limiter.withFfprobeSlot(async () => 'third'),
    /metadata probing is busy/i
  );
  releaseFirst('first');
  assert.equal(await first, 'first');
  assert.equal(await second, 'second');
  assert.equal(limiter.active, 0);
  assert.equal(limiter.queued, 0);
});

test('all direct FFprobe work paths are bounded by the probe semaphore', () => {
  assert.match(server, /const job = withFfprobeSlot\(\(\) => runTool\("ffprobe"/);
  assert.match(server, /const job = withFfprobeSlot\(async \(\) => \{\s+const duration = await getDuration/);
  assert.match(server, /result = await withFfprobeSlot\(\(\) => runTool\("ffprobe"/);
  assert.match(server, /const slot = command === "ffprobe" \? withFfprobeSlot : withFfmpegSlot/);
  assert.match(server, /MAX_FFPROBE_WAITERS = 64/);
});

test('large recursive library merges avoid argument-spread limits', () => {
  assert.doesNotMatch(server, /files\.push\(\.\.\.nested\.files\)/);
  assert.doesNotMatch(server, /folders\.push\(\.\.\.nested\.folders\)/);
  assert.match(server, /for \(const file of nested\.files\) files\.push\(file\)/);
  assert.match(server, /for \(const folder of nested\.folders\) folders\.push\(folder\)/);
});

test('library JSON is serialized once per refreshed snapshot and reused for visitors', () => {
  assert.match(server, /let librarySnapshotPayloadJson = null/);
  assert.match(server, /librarySnapshotPayloadJson = JSON\.stringify\(/);
  assert.match(server, /await getLibrarySnapshot\(\);\s+res\.setHeader\("Cache-Control", "no-store"\);\s+res\.type\("application\/json"\)\.send\(librarySnapshotPayloadJson\)/);
});


test('media stream file handles are released when viewers disconnect', () => {
  const start = server.indexOf('app.get("/api/stream"');
  const end = server.indexOf('/* -------------------- Download -------------------- */', start);
  const route = server.slice(start, end);
  const cleanupCount = (route.match(/res\.once\("close"/g) || []).length;
  assert.equal(cleanupCount, 2, 'both full-file and byte-range streams need disconnect cleanup');
  assert.equal((route.match(/if \(!stream\.destroyed\) stream\.destroy\(\)/g) || []).length, 2);
});


test('HEAD requests return media headers without opening or reading media files', () => {
  const streamStart = server.indexOf('app.get("/api/stream"');
  const downloadStart = server.indexOf('app.get("/api/download"');
  const listenStart = server.indexOf('app.listen(', downloadStart);
  const streamRoute = server.slice(streamStart, server.indexOf('/* -------------------- Download -------------------- */', streamStart));
  const downloadRoute = server.slice(downloadStart, listenStart);
  assert.equal((streamRoute.match(/if \(req\.method === "HEAD"\) return res\.end\(\);/g) || []).length, 2);
  assert.match(downloadRoute, /if \(req\.method === "HEAD"\) return res\.end\(\);/);
});

test('runtime diagnostics are single-flight, cached and process-gated', () => {
  assert.match(server, /const DIAGNOSTICS_CACHE_TTL_MS = 30_000/);
  assert.match(server, /if \(diagnosticsInFlight\) return diagnosticsInFlight/);
  assert.match(server, /toolCheck\("ffmpeg", \["-hide_banner", "-encoders"\], true\)/);
  assert.equal((server.match(/\["-hide_banner", "-encoders"\]/g) || []).length, 1);
  assert.match(server, /activeFfprobeJobs/);
});


test('large-library text search reuses the prebuilt per-file index while preserving folder terms', () => {
  const client = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
  assert.match(client, /state\.searchIndex = new Map\(state\.files\.map\(file => \[file\.id,[\s\S]*?partsOf\(file\)\.join\(" "\)/);
  assert.match(client, /const indexedText = state\.searchIndex\?\.get\(file\.id\)/);
  assert.match(client, /return searchable\.includes\(q\)/);
});

test('release metadata and dependency graph retain the same direct dependency', () => {
  assert.equal(pkg.version, '1.1.0');
  assert.equal(lock.version, '1.1.0');
  assert.equal(lock.packages[''].version, '1.1.0');
  assert.deepEqual(pkg.dependencies, { express: '^5.3.0' });
  assert.deepEqual(lock.packages[''].dependencies, { express: '^5.3.0' });
  assert.equal(pkg.engines.node, '>=22');
  assert.equal(lock.packages[''].engines.node, '>=22');
});
