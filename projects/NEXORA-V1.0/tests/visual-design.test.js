const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const designStart = css.indexOf('/* ======================================================================\n   Liquid Glass Cinema component refinement');
const designEnd = css.indexOf('@media (max-width: 900px)', designStart);
const designCss = css.slice(designStart, designEnd);

function ruleIn(source, selector) {
  const start = source.lastIndexOf(`\n${selector} {`);
  assert.notEqual(start, -1, `missing CSS rule: ${selector}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`unterminated CSS rule: ${selector}`);
}

test('frequent card interactions use short transform-based transitions', () => {
  const card = ruleIn(designCss, '.media-card');
  const art = ruleIn(designCss, '.media-card .media-art-image');
  assert.match(card, /transition:\s*transform\s+190ms/);
  assert.match(art, /transition:\s*transform\s+280ms/);
  assert.doesNotMatch(card, /will-change:\s*transform/);
});

test('large glass content surfaces use restrained backdrop diffusion and translucent fills', () => {
  for (const selector of ['.home-section', '.media-grid', '.taxonomy', '.search-results-panel']) {
    const rule = ruleIn(designCss, selector);
    assert.match(rule, /backdrop-filter:\s*blur\((?:5|7|9)px\) saturate\(/);
    assert.match(rule, /rgba\(17,23,33,\.\d+\)/);
    assert.match(rule, /inset 0 1px 0 rgba\(255,255,255,/);
  }
});

test('clear glass material rules are integrated into the main component styles', () => {
  const start = css.indexOf('/* A richer, multi-hue ambient field follows the featured artwork palette. */');
  const end = css.indexOf('@media (max-width: 900px)', start);
  const componentCss = css.slice(start, end);
  for (const selector of ['.topbar', '.home-section', '.media-grid', '.taxonomy', '.search-results-panel', '.search-overlay-card', '.row-nav-button', '.player-header', '.up-next-panel', '.player-settings,.player-info-card']) {
    const selectorRule = ruleIn(componentCss, selector);
    assert.match(selectorRule, /backdrop-filter:\s*blur\(/);
  }
  assert.match(css, /\.mini-player\s*\{[^}]*backdrop-filter: blur\(10px\) saturate\(185%\)/s);
  assert.match(css, /rgba\(14,19,29,\.47\)/);
  assert.doesNotMatch(css, /V1\.0\.6 — Fluid ambience \+ clear-glass/);
});

test('ambience and scroll optimisation is integrated with existing rules', () => {
  assert.match(css, /html \{ min-height: 100%; background: var\(--color-bg\); scroll-behavior: auto;/);
  const start = css.indexOf('/* A richer, multi-hue ambient field follows the featured artwork palette. */');
  const end = css.indexOf('@media (max-width: 900px)', start);
  const componentCss = css.slice(start, end);
  assert.match(componentCss, /body::after \{\s*display: none !important;/);
  assert.match(componentCss, /body::before \{[\s\S]*?filter: none/);
  assert.match(componentCss, /\.ambient-layer \{[\s\S]*?transition: opacity 2100ms/);
  assert.match(componentCss, /\.ambient-frame \{[\s\S]*?width: 100%;[\s\S]*?height: 100%;[\s\S]*?display: block/);
});

test('reduced-motion preference removes nonessential animation and transitions', () => {
  const rule = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  assert.ok(rule.includes('.nav::before { transition: none !important; }'));
  assert.ok(rule.includes('animation: none !important'));
  assert.ok(rule.includes('transition-duration: .01ms !important'));
});

test('reduced-transparency preference removes backdrop filters from major panels', () => {
  const start = css.lastIndexOf('@media (prefers-reduced-transparency: reduce)');
  assert.notEqual(start, -1);
  const rule = css.slice(start, css.indexOf('@media (prefers-reduced-motion: reduce)', start));
  assert.match(rule, /backdrop-filter:\s*none\s*!important/);
});

test('visual stylesheet contains no duplicated importance tokens', () => {
  assert.doesNotMatch(css, /!important\s*!important/);
});

test('mobile glass remains translucent instead of falling back to opaque panels', () => {
  const compact = css.slice(css.indexOf('@media (max-width: 620px)'), css.indexOf('@media (prefers-reduced-transparency: reduce)', css.indexOf('@media (max-width: 620px)')));
  assert.match(compact, /\.home-section[^{]*\{[^}]*backdrop-filter: blur\(3px\)/s);
  assert.match(compact, /\.media-grid[^{]*\{[^}]*backdrop-filter: blur\(3px\)/s);
});
