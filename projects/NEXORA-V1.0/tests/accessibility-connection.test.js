"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const style = fs.readFileSync(path.join(root, "style.css"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

test("document exposes one dynamic page H1 and section-level H2 headings", () => {
  assert.equal((html.match(/<h1\b/gi) || []).length, 1);
  assert.match(html, /<h1 class="sr-only" id="page-heading">Discover<\/h1>/);
  assert.match(html, /<h2 class="hero-title" id="hero-title"/);
  assert.match(html, /<h2 id="collection-title">/);
  assert.match(script, /pageHeading\.textContent = page === "discover" \? "Discover" : "Your collection"/);
  assert.match(style, /\.sr-only\s*\{/);
});

test("playback setting toggles expose accessible names and pressed state", () => {
  assert.match(html, /id="autoplay"[^>]*aria-label="Autoplay next"[^>]*aria-pressed=/);
  assert.match(html, /id="shuffle"[^>]*aria-label="Shuffle playback"[^>]*aria-pressed=/);
  assert.match(html, /id="repeat"[^>]*aria-label="Repeat current title"[^>]*aria-pressed=/);
});

test("media cards use independent native buttons instead of nested interactive roles", () => {
  assert.match(script, /<article class="media-card" data-file-id=/);
  assert.match(script, /<button class="media-card-open" type="button" aria-label="Play /);
  assert.match(script, /<button class="card-bookmark" data-action="bookmark" type="button" aria-label=/);
  assert.doesNotMatch(script, /<article class="media-card"[^>]*role="button"/);
  assert.doesNotMatch(script, /media-card\[role="button"/);
});

test("library page has separate loading and offline/retry states", () => {
  assert.match(html, /id="library-status" role="status" aria-live="polite"/);
  assert.match(html, /id="recent-row" aria-busy="true"/);
  assert.match(html, /id="library-connection-error" role="alert" aria-live="assertive" hidden/);
  assert.match(html, /id="library-retry" type="button"/);
  assert.match(script, /fetchWithTimeout\("\/api\/health", 5000\)/);
  assert.match(script, /fetchWithTimeout\("\/api\/library", 20000\)/);
  assert.match(script, /function showLibraryOffline\(/);
  assert.match(script, /library-retry.*addEventListener\("click"/s);
  assert.match(script, /state\.libraryLoaded = true/);
});

test("subtitle discovery waits until selected video metadata is ready", () => {
  assert.match(html, /id="subtitle-status" role="status" aria-live="polite">Not checked/);
  assert.match(script, /if \(!isAudio\) void discoverSubtitles\(file\);/);
  assert.doesNotMatch(script, /media\.src = `\/api\/stream[\s\S]{0,220}discoverSubtitles\(file\);/);
  assert.match(script, /video\.readyState < HTMLMediaElement\.HAVE_METADATA/);
});

test("keyboard focus is visible without relying only on :has", () => {
  assert.match(style, /button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible/);
  assert.match(style, /\.section-search-wrap:focus-within,[\s\S]{0,80}\.overlay-search-field:focus-within/);
  assert.match(style, /outline:\s*2px solid/);
});

test("release contains no authentication feature and no custom text selection colour", () => {
  for (const source of [html, script, style, server]) {
    assert.doesNotMatch(source, /NEXORA_(?:AUTH_REQUIRED|USERNAME|PASSWORD)/);
    assert.doesNotMatch(source, /WWW-Authenticate|Authentication required|authFailureBuckets/);
  }
  assert.doesNotMatch(style, /::selection\s*\{/);
});
