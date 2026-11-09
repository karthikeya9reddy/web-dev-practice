const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const style = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source end marker: ${endMarker}`);
  return source.slice(start, end);
}


test('live preview frames drive a dual-layer ambience handoff', () => {
  const ambience = section(script, 'function startPreviewAmbienceStream(file)', '/* ---------- Shared hero / global ambience preview');
  assert.match(html, /id="ambient-frame-a"/);
  assert.match(html, /id="ambient-frame-b"/);
  assert.match(ambience, /previewVideo\.requestVideoFrameCallback/);
  assert.match(ambience, /context\.drawImage\(previewVideo/);
  assert.match(ambience, /incomingLayer\.classList\.add\("active"\)/);
  assert.match(ambience, /outgoingLayer\?\.classList\.remove\("active"\)/);
  assert.match(ambience, /requestAnimationFrame\(/);
  assert.match(ambience, /ambientFrameCallbackId/);
  assert.match(script, /startPreviewAmbienceStream\(file\)/);
  assert.doesNotMatch(ambience, /createObjectURL|toBlob|backgroundImage/);
});

test('live ambience is sampled at a bounded rate with a smoothed vivid palette', () => {
  const ambience = section(script, 'function startPreviewAmbienceStream(file)', '/* ---------- Shared hero / global ambience preview');
  assert.match(ambience, /const width = 480/);
  assert.match(ambience, /const height = 270/);
  assert.match(ambience, /sampler\.width = 24/);
  assert.match(ambience, /sampler\.height = 14/);
  assert.match(ambience, /blur\(15px\) saturate\(2\.05\)/);
  assert.match(ambience, /Math\.exp\(-elapsed \/ 1350\)/);
  assert.match(ambience, /connection\?\.saveData \? 50 : \(lowPower \? 40 : 33\)/);
  assert.match(ambience, /lastPaletteSampleAt/);
  const ambientRule = style.slice(style.indexOf('/* A richer, multi-hue ambient field follows the featured artwork palette. */'), style.indexOf('@media (max-width: 900px)', style.indexOf('/* A richer, multi-hue ambient field follows the featured artwork palette. */')));
  assert.match(ambientRule, /transition: opacity 2100ms/);
  assert.match(ambientRule, /\.ambient-frame\s*\{/);
  assert.match(ambientRule, /filter: none !important/);
});

test('ambience frame callbacks and timers are cancelled without clearing the last rendered frame', () => {
  const cleanup = section(script, 'function stopPreviewAmbienceFrames()', 'function startPreviewAmbienceStream(file)');
  const stop = section(script, 'function stopActivePreview()', 'function resetCardPreviewElement()');
  assert.match(cleanup, /cancelVideoFrameCallback/);
  assert.match(cleanup, /clearTimeout\(state\.ambientFrameTimer\)/);
  assert.match(stop, /stopPreviewAmbienceFrames\(\)/);
  assert.match(stop, /state\.ambientCaptureToken \+= 1/);
  assert.doesNotMatch(cleanup, /\.classList\.remove\("active"\)|clearRect|\.width\s*=/);
});

test('live ambience renderer samples the current hero video and hands off only after drawing', () => {
  const ambience = section(script, 'function rgbToHsl(rgb)', '/* ---------- Shared hero / global ambience preview');
  const drawnSources = [];
  const historyDraws = [];
  const callbacks = new Map();
  let nextCallbackId = 1;
  let cancelledCallbackId = null;
  const makeContext = (isSampler = false) => ({
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    filter: 'none',
    save() {}, restore() {}, clearRect() {}, fillRect() {},
    drawImage(source) { if (!isSampler) drawnSources.push(source); else historyDraws.push(source); },
    createRadialGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; },
    getImageData() {
      const data = new Uint8ClampedArray(24 * 14 * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 44; data[i + 1] = 132; data[i + 2] = 218; data[i + 3] = 255;
      }
      return { data };
    }
  });
  const canvasA = { width: 480, height: 270, getContext: () => makeContext() };
  const canvasB = { width: 480, height: 270, getContext: () => makeContext() };
  const makeLayer = () => {
    const classes = new Set();
    return { classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); }
    }};
  };
  const layerA = makeLayer();
  const layerB = makeLayer();
  const previewVideo = {
    isConnected: true, readyState: 2, videoWidth: 1920, videoHeight: 1080,
    currentTime: .5,
    requestVideoFrameCallback(callback) {
      const id = nextCallbackId++;
      callbacks.set(id, callback);
      return id;
    },
    cancelVideoFrameCallback(id) { cancelledCallbackId = id; callbacks.delete(id); }
  };
  const state = {
    ambientBackIndex: 0, ambientCaptureToken: 0, ambientFrameCallbackId: null,
    ambientFrameTimer: null, ambientPaletteRgb: [88, 114, 153],
    activePreviewKind: 'hero', activePreviewFile: { id: 'feature-42' }
  };
  const sandbox = {
    state, previewVideo,
    byId(id) {
      return ({
        'ambient-a': layerA, 'ambient-b': layerB,
        'ambient-frame-a': canvasA, 'ambient-frame-b': canvasB
      })[id] || null;
    },
    document: { createElement(tag) {
      assert.equal(tag, 'canvas');
      return { width: 0, height: 0, getContext: () => makeContext(true) };
    }},
    navigator: { deviceMemory: 8, hardwareConcurrency: 8 },
    window: { matchMedia: () => ({ matches: false }), setTimeout, clearTimeout },
    HTMLMediaElement: { HAVE_CURRENT_DATA: 2 },
    performance: { now: () => 600 },
    requestAnimationFrame(callback) { callback(600); return 1; },
    clearTimeout
  };
  vm.runInNewContext(`${ambience}\nstartPreviewAmbienceStream({ id: 'feature-42' });`, sandbox);
  assert.equal(state.ambientFrameCallbackId, 1, 'first video-frame callback is registered');
  callbacks.get(1)(600, {});
  assert.ok(drawnSources.includes(previewVideo), 'ambience is sampled from the current hero video');
  assert.ok(drawnSources.includes(canvasB) || historyDraws.includes(canvasB), 'ambience history is copied for temporal blending');
  assert.ok(historyDraws.some(source => source && source.width === 480 && source.height === 270), 'one low-resolution history surface is maintained');
  assert.equal(layerB.classList.contains('active'), true, 'incoming layer activates after drawing');
  assert.equal(layerA.classList.contains('active'), false, 'outgoing layer is retired at handoff');
  assert.equal(state.ambientBackIndex, 1, 'background layer index changes after handoff');
  assert.equal(state.ambientFrameCallbackId, 2, 'sampling continues with the next presented frame');
  assert.notDeepEqual(state.ambientPaletteRgb, [88, 114, 153], 'palette responds to sampled preview colours');
  vm.runInNewContext('stopPreviewAmbienceFrames();', sandbox);
  assert.equal(cancelledCallbackId, 2, 'the active video-frame callback is cancelled on stop');
  assert.equal(layerB.classList.contains('active'), true, 'the last ambience frame remains visible during cleanup');
});

test('card hover uses its own decoder and does not stop the hero/global preview', () => {
  const startCard = section(script, 'function startCardPreview(card)', 'document.addEventListener("pointerover"');
  const stopCard = section(script, 'function stopCardPreview(card = null)', 'function releaseHeroPreviewHold');
  assert.match(startCard, /cardPreviewVideo/);
  assert.doesNotMatch(startCard, /stopActivePreview\s*\(/);
  assert.doesNotMatch(startCard, /cardPreviewResume/);
  assert.doesNotMatch(stopCard, /startHeroPreview|stopActivePreview|cardPreviewResume/);
});


test('card hover previews remain enabled while the player is minimized', () => {
  const startCard = section(script, 'function startCardPreview(card)', 'document.addEventListener("pointerover"');
  assert.match(startCard, /if \(isFullPlayerPresented\(\)\) return;/,
    'expanded playback should continue to suppress card hover previews');
  assert.doesNotMatch(startCard, /!miniPlayer\.hidden/,
    'the floating mini-player must not suppress independent card hover previews');
  assert.match(startCard, /cardPreviewVideo\.play\(\)/,
    'the dedicated card preview decoder should still start playback');
  assert.match(startCard, /playerLayer\.hidden/,
    'card preview lifecycle should only depend on expanded-player visibility');
});

test('hero progression is not held by an active card hover', () => {
  const advance = section(script, 'function advanceHero()', 'function captureHeroTransitionBridge()');
  assert.doesNotMatch(advance, /activeHoverCard/);
  assert.match(advance, /showFeatured\(featured\)/);
});

test('preview timing requests reverse typing before the clip ends', () => {
  const preview = section(script, 'function startHeroPreview(file, options = {})', 'function previewQuality(');
  assert.match(preview, /const synchronizeHeroTitleExit\s*=\s*\(\)\s*=>/);
  assert.match(preview, /remainingMs\s*<=\s*eraseBudgetMs/);
  assert.match(preview, /synchronizeHeroTitleExit\(\);[\s\S]*?const now = Date\.now\(\)/);
  assert.match(preview, /addEventListener\("timeupdate"[\s\S]*?synchronizeHeroTitleExit\(\)/);
  assert.match(preview, /else markHeroPreviewFinished\(file\.id\)/);
  const finish = section(preview, 'const finishPreview = () =>', 'const markPlaybackStarted = () =>');
  assert.match(finish, /previewVideo\.pause\(\)/);
  assert.match(finish, /markHeroPreviewFinished\(file\.id\)/);
});

test('reverse typing does not pause or reset the active hero video', () => {
  const requestExit = section(script, 'function requestHeroTitleExit(fileId)', 'function maybeAdvanceCompletedHero');
  const typeTitle = section(script, 'function typeHeroTitle(text', 'function setHeroActions(');
  assert.doesNotMatch(requestExit, /previewVideo\.(pause|load|removeAttribute|remove)\s*\(/);
  assert.doesNotMatch(typeTitle, /previewVideo\.(pause|load|removeAttribute|remove)\s*\(/);
  const preview = section(script, 'function startHeroPreview(file, options = {})', 'function previewQuality(');
  const finish = section(preview, 'const finishPreview = () =>', 'const markPlaybackStarted = () =>');
  assert.match(finish, /previewVideo\.pause\(\)[\s\S]*?markHeroPreviewFinished/);
});

test('hero does not advance until both the outgoing clip and reverse typing finish', () => {
  const helper = section(script, 'function maybeAdvanceCompletedHero(fileId)', 'function markHeroPreviewFinished');
  let advances = 0;
  const sandbox = {
    state: {
      heroFeaturedId: 'feature-1', page: 'discover', heroPreviewFinished: false,
      heroTitleFinished: false, heroAdvanceTriggered: false
    },
    document: { hidden: false },
    advanceHero: () => { advances += 1; }
  };
  vm.runInNewContext(`${helper}\nmaybeAdvanceCompletedHero('feature-1');`, sandbox);
  assert.equal(advances, 0, 'neither lifecycle leg is complete');
  sandbox.state.heroTitleFinished = true;
  vm.runInNewContext(`${helper}\nmaybeAdvanceCompletedHero('feature-1');`, sandbox);
  assert.equal(advances, 0, 'title completion alone must not stop a still-playing preview');
  sandbox.state.heroPreviewFinished = true;
  vm.runInNewContext(`${helper}\nmaybeAdvanceCompletedHero('feature-1');`, sandbox);
  vm.runInNewContext(`${helper}\nmaybeAdvanceCompletedHero('feature-1');`, sandbox);
  assert.equal(advances, 1, 'both completion signals advance exactly once');
});

test('title exit is idempotent and bypasses the post-title hold when needed', () => {
  const requestExit = section(script, 'function requestHeroTitleExit(fileId)', 'function startHeroPreview(');
  const typeTitle = section(script, 'function typeHeroTitle(text', 'function setHeroActions(');
  assert.match(requestExit, /if \(state\.heroExitRequested\) return/);
  assert.match(requestExit, /releaseHeroPreviewHold\(fileId\)/);
  assert.match(requestExit, /state\.heroEraseNow\(\)/);
  assert.match(typeTitle, /state\.heroExitRequested \? 0 : 2200/);
  assert.match(typeTitle, /state\.heroEraseNow = erase/);
});


test('title erasure marks only title completion and no longer advances immediately', () => {
  const show = section(script, 'function showFeatured(file)', 'function initHero()');
  assert.match(show, /typeHeroTitle\(titleOf\(file\), \(\) => markHeroTitleFinished\(file\.id\), true\)/);
  assert.doesNotMatch(show, /typeHeroTitle\(titleOf\(file\), advanceHero/);
});

test('outgoing hero frame remains as a bridge until the incoming preview plays', () => {
  const bridge = section(script, 'function captureHeroTransitionBridge()', 'function showEmptyHero()');
  const playback = section(script, 'const markPlaybackStarted = () =>', 'const handlePlayError = error =>');
  assert.match(bridge, /context\.drawImage\(previewVideo/);
  assert.match(bridge, /hero-preview-bridge/);
  assert.match(playback, /revealHeroTransitionBridge\(\)/);
  assert.match(style, /\.hero \.hero-preview-bridge/);
});

test('Discover shelf and card fixes are integrated into component styles, not a release-tail patch', () => {
  assert.doesNotMatch(style, /V8\.3\.2 — isolate the Discover shelves/);
  assert.match(style, /\.home-section\s*\{[\s\S]{0,1200}?overflow:\s*clip\s*!important/);
  assert.match(style, /\.home-section \.media-row-shell\s*\{[^}]*isolation:\s*isolate/s);
  assert.match(style, /\.media-card:hover,[\s\S]*?filter:\s*none\s*!important/);
  assert.match(style, /transform-style:\s*flat\s*!important/);
  assert.doesNotMatch(style.slice(style.lastIndexOf('/* Low-power and compact-device profile')), /V8\.3\.2/);
});

test('Continue Watching remains visible on Discover, including its empty state', () => {
  const continueRenderer = section(script, 'function renderContinueWatching()', 'function renderHome()');
  const navigate = section(script, 'function navigate(page)', 'window.scrollTo({ top: 0');
  assert.match(continueRenderer, /Your in-progress titles will appear here/);
  assert.match(continueRenderer, /continue-section"\)\.hidden = false/);
  assert.match(navigate, /continue-section"\)\.hidden = !discover/);
});

test('active release markers match V1.1.0 across package, app and server metadata', () => {
  assert.equal(pkg.version, '1.1.0');
  assert.equal(lock.version, '1.1.0');
  assert.equal(lock.packages[''].version, '1.1.0');
  assert.match(html, /style\.css\?v=1\.1\.0/);
  assert.match(html, /script\.js\?v=1\.1\.0/);
  assert.match(server, /version: "1\.1\.0"/);
});
