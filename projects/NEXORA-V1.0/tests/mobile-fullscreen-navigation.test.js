const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const style = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const baselineServer = fs.readFileSync(path.join(root, 'BASELINE-V1.0.8', 'server.js'), 'utf8');

function cssBlock(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'));
  assert.ok(match, `Missing CSS selector ${selector}`);
  return match[1];
}

test('mobile fullscreen stage is pinned to the dynamic viewport and cannot crop video', () => {
  const fullscreen = style.slice(style.lastIndexOf('/* A mobile fullscreen stage is pinned'));
  assert.match(fullscreen, /\.player-stage:fullscreen[\s\S]*?position:\s*fixed\s*!important/);
  assert.match(fullscreen, /inset:\s*0\s*!important/);
  assert.match(fullscreen, /height:\s*100dvh\s*!important/);
  assert.match(fullscreen, /object-fit:\s*contain\s*!important/);
  assert.match(fullscreen, /object-position:\s*center center\s*!important/);
  assert.match(fullscreen, /env\(safe-area-inset-bottom\)/);
  assert.match(fullscreen, /-webkit-full-screen/);
  assert.doesNotMatch(fullscreen, /object-fit:\s*cover/);
});

test('fullscreen requests hide browser chrome where supported and request landscape on touch phones', () => {
  assert.match(script, /requestFullscreen\.call\(stage, \{ navigationUI: "hide" \}\)/);
  assert.match(script, /screen\.orientation\.lock\("landscape"\)/);
  assert.match(script, /screen\.orientation\?\.unlock/);
  assert.match(script, /webkitRequestFullscreen/);
  assert.match(script, /webkitfullscreenchange/);
});

test('wrapped mobile navigation indicator tracks both axes and the selected item height', () => {
  const fn = script.slice(script.indexOf('function updateNavigationIndicator()'), script.indexOf('function setNavigationOpen('));
  assert.match(fn, /--nav-indicator-x/);
  assert.match(fn, /--nav-indicator-y/);
  assert.match(fn, /active\.offsetTop/);
  assert.match(fn, /--nav-indicator-width/);
  assert.match(fn, /--nav-indicator-height/);
  assert.match(fn, /active\.offsetHeight/);
  const indicator = cssBlock(style, '.nav::before');
  assert.match(indicator, /height:\s*var\(--nav-indicator-height/);
  assert.match(indicator, /translate3d\(var\(--nav-indicator-x, 0px\),var\(--nav-indicator-y, 0px\),0\)/);
  assert.match(indicator, /height 320ms/);
  assert.match(style, /@media \(max-width: 780px\)[\s\S]*?\.nav::before\s*\{\s*border-radius:\s*13px/);
});

test('ambience uses temporal frame blending and an adaptive decoded-frame cadence', () => {
  const start = script.indexOf('function startPreviewAmbienceStream(file)');
  const end = script.indexOf('/* ---------- Shared hero / global ambience preview', start);
  const ambience = script.slice(start, end);
  assert.match(ambience, /requestVideoFrameCallback/);
  assert.match(ambience, /const historyCanvas = document\.createElement\("canvas"\)/);
  assert.match(ambience, /context\.globalAlpha = 1 - incomingFrameAlpha/);
  assert.match(ambience, /context\.globalAlpha = hasHistoryFrame \? incomingFrameAlpha : 1/);
  assert.match(ambience, /historyContext\.drawImage\(canvas/);
  assert.match(ambience, /connection\?\.saveData \? 50 : \(lowPower \? 40 : 33\)/);
  assert.match(ambience, /temporalBlendMs = lowPower \? 54 : 44/);
  assert.match(ambience, /1 - Math\.exp\(-elapsedFrameMs \/ temporalBlendMs\)/);
  assert.match(ambience, /blur\(15px\) saturate\(2\.05\)/);
  assert.doesNotMatch(ambience, /document\.createElement\("video"\)/);
});

test('God Mode backend hardening preserves the established player and access model', () => {
  assert.match(server, /function withFfprobeSlot\(task\)/);
  assert.match(server, /const MAX_FFPROBE_JOBS/);
  assert.match(server, /librarySnapshotPayloadJson/);
  assert.match(server, /DIAGNOSTICS_CACHE_TTL_MS/);
  assert.match(html, /id="preview-player"/);
  assert.match(html, /id="media"/);
  assert.match(html, /id="ambient-frame-a"/);
  assert.match(html, /id="ambient-frame-b"/);
  assert.doesNotMatch(script, /NEXORA_(?:AUTH_REQUIRED|USERNAME|PASSWORD)/);
  assert.doesNotMatch(server, /WWW-Authenticate|Authentication required/);
  assert.doesNotMatch(server, /app\.(?:post|put|delete)\(/);
  assert.ok(baselineServer.includes('app.get("/api/stream"'), 'preserved baseline includes the existing streaming contract');
});
