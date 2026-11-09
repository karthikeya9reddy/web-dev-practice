'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const style = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

function routeSection(marker, nextMarker) {
  const start = server.indexOf(marker);
  assert.notEqual(start, -1, `missing route marker: ${marker}`);
  const end = server.indexOf(nextMarker, start + marker.length);
  assert.notEqual(end, -1, `missing end marker: ${nextMarker}`);
  return server.slice(start, end);
}

test('all media-consuming API routes verify and then use the canonical media path', () => {
  const routes = [
    routeSection('app.get("/api/subtitles"', 'app.get("/api/subtitle"'),
    routeSection('app.get("/api/subtitle"', 'app.get("/api/thumbnail"'),
    routeSection('app.get("/api/thumbnail"', '/* -------------------- Source-aware'),
    routeSection('app.get("/api/preview"', '/* -------------------- Runtime diagnostics'),
    routeSection('app.get("/api/stream"', '/* -------------------- Download'),
    routeSection('app.get("/api/download"', 'app.listen(')
  ];
  for (const route of routes) {
    assert.match(route, /await verifyMedia\(filePath\)/);
    assert.match(route, /filePath = verified\.canonicalPath/);
  }
});

test('media path and scanner checks use real paths, lstat and strict root containment', () => {
  assert.doesNotMatch(server, /require\(\"\.\/lib\/media-security\"\)/);
  assert.match(server, /function isPathInside\(/);
  assert.match(server, /function resolveMediaPath\(/);
  assert.match(server, /async function verifyMediaPath\(/);
  assert.match(server, /function parseSingleByteRange\(/);
  assert.match(server, /fs\.realpathSync\(MEDIA_ROOT\)/);
  assert.match(server, /scanDirectory\(MEDIA_ROOT_REAL\)/);
  assert.match(server, /fs\.promises\.lstat\(directory\)/);
  assert.match(server, /fs\.promises\.realpath\(absolute\)/);
});

test('subtitle sidecars are size-limited and client errors do not expose raw internals', () => {
  assert.match(server, /MAX_SUBTITLE_BYTES\s*=\s*32\s*\*\s*1024\s*\*\s*1024/);
  assert.match(server, /stat\.size\s*>\s*MAX_SUBTITLE_BYTES/);
  assert.doesNotMatch(server, /detail:\s*error\.message/);
  assert.doesNotMatch(server, /send\(`[^`]*\$\{error\.message\}/);
});

test('all invalid byte-range requests return an unsatisfied Content-Range header', () => {
  const route = routeSection('app.get("/api/stream"', '/* -------------------- Download');
  assert.match(route, /parseSingleByteRange\(req\.headers\.range, size\)/);
  assert.match(route, /if \(!range\)\s*\{\s*res\.setHeader\("Content-Range", `bytes \*\/\$\{size\}`\);\s*return res\.status\(416\)\.end\(\);/);
});

test('FFmpeg work stays off a shell and is protected by bounded active and queued work', () => {
  assert.match(server, /promisify\(execFile\)/);
  assert.match(server, /const ffmpegWaiters = \[\]/);
  assert.match(server, /ffmpegWaiters\.length >= 96/);
  assert.match(server, /MAX_FFMPEG_JOBS/);
});

test('NEXORA has no built-in sign-in, credentials, or HTTP authentication challenge', () => {
  const baselineServer = fs.readFileSync(path.join(root, 'BASELINE-V1.0', 'server.js'), 'utf8');
  for (const source of [server, baselineServer, html, script, style]) {
    assert.doesNotMatch(source, /NEXORA_(?:AUTH_REQUIRED|USERNAME|PASSWORD)/);
    assert.doesNotMatch(source, /WWW-Authenticate|Authentication required|authFailureBuckets/);
  }
  assert.doesNotMatch(server, /req\.headers\.authorization/);
  assert.match(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), /no built-in sign-in/i);
});

test('visible interface identity and feature code are retained', () => {
  assert.match(html, /NEXORA/);
  assert.match(html, /Liquid Glass Cinema/);
  assert.doesNotMatch(style, /V8\.3\.2 — isolate the Discover shelves/);
  assert.doesNotMatch(script, /const notify = toast/);
  assert.match(html, /style\.css\?v=1\.1\.0/);
  assert.match(html, /script\.js\?v=1\.1\.0/);
});
