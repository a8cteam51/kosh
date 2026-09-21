const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SKILL = path.join(__dirname, '../skills/functional-design/SKILL.md');

const script = fs.readFileSync(SKILL, 'utf8')
  .split('```javascript')
  .slice(1)
  .map((chunk) => chunk.split('```')[0])
  .find((code) => code.includes('resolutionRatio:'));

// A 100x50 source in a 200x100 slot at 2x DPR is flagged unless the SVG guard skips it.
const lowResImg = (src) => ({
  currentSrc: src,
  alt: '',
  complete: true,
  naturalWidth: 100,
  naturalHeight: 50,
  getBoundingClientRect: () => ({ width: 200, height: 100 }),
  getAttribute: () => null,
  parentElement: null,
});

// trim() matters: a newline straight after `return` would end the statement.
const isFlagged = (src) => Array.isArray(
  new Function('window', 'document', 'getComputedStyle', `return ${script.trim()}`)(
    { devicePixelRatio: 2 },
    { querySelectorAll: () => [lowResImg(src)] },
    () => ({ objectFit: 'fill' })
  )
);

test('the image-resolution script is still in the skill', () => {
  assert.ok(script, 'no javascript block containing "resolutionRatio:" in functional-design/SKILL.md');
});

for (const src of [
  'https://example.com/logo.svg',
  'https://example.com/header-logo.svg?ver=1.3.0',
  'https://example.com/sprite.svg#icon',
  'https://example.com/LOGO.SVG?ver=2',
  'data:image/svg+xml;base64,AAAA',
]) {
  test(`skips SVG: ${src}`, () => assert.equal(isFlagged(src), false));
}

for (const src of [
  'https://example.com/photo.png',
  'https://example.com/photo.png?fallback=logo.svg',
]) {
  test(`still flags raster: ${src}`, () => assert.equal(isFlagged(src), true));
}
